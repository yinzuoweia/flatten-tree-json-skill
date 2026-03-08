import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, parse } from 'node:path';
import { CliError } from './errors.js';
import { generateNodeId } from './id.js';
import { withFileLock } from './lock.js';
import { matchesNode, parseQuery } from './query.js';
import {
  createInitialTree,
  fileExists,
  getLockPath,
  readTree,
  resolveTreePath,
  snapshotDir,
  writeTreeAtomic
} from './storage.js';
import { RESERVED_FIELDS, ROOT_ID, type TreeFile, type TreeNode } from './types.js';

export type MutateOptions = {
  autoSnapshot?: boolean;
  snapshotKeep?: number;
};

export type InitOptions = {
  force?: boolean;
};

export type AddInput = {
  parent?: string;
  id?: string;
  set: Record<string, unknown>;
};

export type UpdateInput = {
  set?: Record<string, unknown>;
  unset?: string[];
};

export type DeleteInput = {
  cascade?: boolean;
  yes?: boolean;
};

export type FindInput = {
  query: string;
  max?: number;
  sort?: string;
  fields?: string[];
};

export type BulkInput = {
  opsFile: string;
  atomic?: boolean;
};

export type SnapshotInfo = {
  snapshot_id: string;
  path: string;
};

function defaultSnapshotKeep(): number {
  const raw = process.env.TREEJSON_SNAPSHOT_KEEP;
  if (!raw) {
    return 20;
  }
  const parsed = Number(raw);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 20;
  }
  return Math.floor(parsed);
}

function nowTs(): number {
  return Date.now() / 1000;
}

function ensureMutableField(key: string): void {
  if (RESERVED_FIELDS.has(key)) {
    throw new CliError('SCHEMA_INVALID', `field '${key}' is reserved and cannot be modified directly`);
  }
}

function assertNodeExists(tree: TreeFile, nodeId: string): TreeNode {
  const node = tree[nodeId];
  if (!node) {
    throw new CliError('NODE_NOT_FOUND', `node '${nodeId}' not found`, `use find with id:${nodeId}`);
  }
  return node;
}

function assertNodeIdAvailable(tree: TreeFile, nodeId: string): void {
  if (tree[nodeId]) {
    throw new CliError('NODE_ID_CONFLICT', `node id '${nodeId}' already exists`);
  }
  if (nodeId === ROOT_ID) {
    throw new CliError('NODE_ID_CONFLICT', `node id '${ROOT_ID}' is reserved`);
  }
}

function collectSubtreeIds(tree: TreeFile, nodeId: string): string[] {
  const result: string[] = [];
  const stack = [nodeId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    result.push(current);
    const node = assertNodeExists(tree, current);
    for (const childId of node.children) {
      stack.push(childId);
    }
  }
  return result;
}

function removeFromParent(tree: TreeFile, nodeId: string): void {
  const node = assertNodeExists(tree, nodeId);
  if (!node.parent) {
    return;
  }
  const parent = assertNodeExists(tree, node.parent);
  parent.children = parent.children.filter((id) => id !== nodeId);
}

function addToParent(tree: TreeFile, nodeId: string, parentId: string): void {
  const parent = assertNodeExists(tree, parentId);
  if (!parent.children.includes(nodeId)) {
    parent.children.push(nodeId);
  }
}

function isDescendant(tree: TreeFile, ancestorId: string, maybeDescendant: string): boolean {
  if (ancestorId === maybeDescendant) {
    return true;
  }
  const stack = [ancestorId];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) {
      continue;
    }
    visited.add(id);

    const node = assertNodeExists(tree, id);
    for (const childId of node.children) {
      if (childId === maybeDescendant) {
        return true;
      }
      stack.push(childId);
    }
  }

  return false;
}

function parseSort(sortRaw?: string): { field: string; direction: 'asc' | 'desc' } | null {
  if (!sortRaw) {
    return null;
  }
  const [field, directionRaw] = sortRaw.split(':');
  const direction = directionRaw?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  if (!field) {
    return null;
  }
  return { field, direction };
}

function valueForSort(value: unknown): number | string {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const date = Date.parse(value);
    if (!Number.isNaN(date)) {
      return date;
    }
    const num = Number(value);
    if (!Number.isNaN(num)) {
      return num;
    }
    return value.toLowerCase();
  }
  return String(value).toLowerCase();
}

async function createSnapshotInternal(filePath: string, name?: string): Promise<SnapshotInfo> {
  const snapDir = snapshotDir(filePath);
  await mkdir(snapDir, { recursive: true });

  const base = name && name.trim().length > 0 ? name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'snapshot';
  const snapshotId = `${Date.now()}-${base}.json`;
  const snapPath = join(snapDir, snapshotId);
  await copyFile(filePath, snapPath);

  return {
    snapshot_id: snapshotId,
    path: snapPath
  };
}

async function pruneSnapshots(filePath: string, keep: number): Promise<void> {
  if (keep <= 0) {
    return;
  }
  const snapDir = snapshotDir(filePath);
  const entries = await readdir(snapDir, { withFileTypes: true }).catch(() => []);
  const files = entries.filter((entry) => entry.isFile()).map((entry) => join(snapDir, entry.name));

  if (files.length <= keep) {
    return;
  }

  const withTime = await Promise.all(
    files.map(async (file) => {
      const info = await stat(file);
      return { file, mtimeMs: info.mtimeMs };
    })
  );
  withTime.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const toDelete = withTime.slice(keep);
  await Promise.all(toDelete.map(async (item) => rm(item.file, { force: true })));
}

async function mutateWithLock<T>(
  filePathRaw: string | undefined,
  mutator: (tree: TreeFile) => Promise<T> | T,
  options: MutateOptions = {}
): Promise<T> {
  const filePath = resolveTreePath({ filePath: filePathRaw });
  const lockPath = getLockPath(filePath);

  return withFileLock(lockPath, async () => {
    const tree = await readTree(filePath);

    if (options.autoSnapshot !== false) {
      await createSnapshotInternal(filePath, 'autosave');
      await pruneSnapshots(filePath, options.snapshotKeep ?? defaultSnapshotKeep());
    }

    const out = await mutator(tree);
    await writeTreeAtomic(filePath, tree);
    return out;
  });
}

function addNodeOnTree(tree: TreeFile, input: AddInput): { id: string; parent: string } {
  const parentId = input.parent ?? ROOT_ID;
  assertNodeExists(tree, parentId);

  const nodeId = input.id ?? generateNodeId(new Set(Object.keys(tree)));
  assertNodeIdAvailable(tree, nodeId);

  const ts = nowTs();
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.set ?? {})) {
    ensureMutableField(key);
    extra[key] = value;
  }

  tree[nodeId] = {
    id: nodeId,
    parent: parentId,
    children: [],
    created_at: ts,
    ...extra
  };
  addToParent(tree, nodeId, parentId);
  return { id: nodeId, parent: parentId };
}

function updateNodeOnTree(tree: TreeFile, nodeId: string, patch: UpdateInput): TreeNode {
  const node = assertNodeExists(tree, nodeId);

  for (const key of Object.keys(patch.set ?? {})) {
    ensureMutableField(key);
  }
  for (const key of patch.unset ?? []) {
    ensureMutableField(key);
  }

  for (const [key, value] of Object.entries(patch.set ?? {})) {
    node[key] = value;
  }
  for (const key of patch.unset ?? []) {
    delete node[key];
  }

  return node;
}

function deleteNodeOnTree(tree: TreeFile, nodeId: string, input: DeleteInput): { deleted_ids: string[] } {
  if (nodeId === ROOT_ID) {
    throw new CliError('ROOT_IMMUTABLE', 'root node cannot be deleted');
  }

  const node = assertNodeExists(tree, nodeId);
  if (!input.cascade && node.children.length > 0) {
    throw new CliError('DELETE_CONFIRM_REQUIRED', 'node has children, use --cascade to delete subtree');
  }

  const ids = collectSubtreeIds(tree, nodeId);
  removeFromParent(tree, nodeId);
  for (const id of ids) {
    delete tree[id];
  }

  return { deleted_ids: ids };
}

function moveNodeOnTree(tree: TreeFile, nodeId: string, targetParentId: string): { id: string; from: string | null; to: string } {
  if (nodeId === ROOT_ID) {
    throw new CliError('ROOT_IMMUTABLE', 'root node cannot be moved');
  }

  const node = assertNodeExists(tree, nodeId);
  assertNodeExists(tree, targetParentId);

  if (isDescendant(tree, nodeId, targetParentId)) {
    throw new CliError('CYCLE_DETECTED', `cannot move '${nodeId}' under '${targetParentId}'`);
  }

  const oldParent = node.parent;
  removeFromParent(tree, nodeId);
  node.parent = targetParentId;
  addToParent(tree, nodeId, targetParentId);

  return {
    id: nodeId,
    from: oldParent,
    to: targetParentId
  };
}

function validateTreeObject(tree: TreeFile): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const root = tree[ROOT_ID];
  if (!root) {
    errors.push('root node missing');
  } else {
    if (root.parent !== null) {
      errors.push('root.parent must be null');
    }
  }

  for (const [id, node] of Object.entries(tree)) {
    if (node.id !== id) {
      errors.push(`node key '${id}' != node.id '${node.id}'`);
    }

    if (id !== ROOT_ID && node.parent === null) {
      errors.push(`node '${id}' parent cannot be null`);
    }

    if (node.parent) {
      const parent = tree[node.parent];
      if (!parent) {
        errors.push(`node '${id}' parent '${node.parent}' not found`);
      } else if (!parent.children.includes(id)) {
        errors.push(`node '${id}' missing in parent '${node.parent}' children`);
      }
    }

    for (const childId of node.children) {
      const child = tree[childId];
      if (!child) {
        errors.push(`node '${id}' child '${childId}' not found`);
        continue;
      }
      if (child.parent !== id) {
        errors.push(`node '${childId}' parent mismatch, expected '${id}' got '${child.parent}'`);
      }
    }
  }

  const visited = new Set<string>();
  const stack = new Set<string>();
  function dfs(id: string): void {
    if (stack.has(id)) {
      errors.push(`cycle detected at '${id}'`);
      return;
    }
    if (visited.has(id)) {
      return;
    }
    visited.add(id);
    stack.add(id);

    const node = tree[id];
    for (const childId of node.children) {
      if (tree[childId]) {
        dfs(childId);
      }
    }

    stack.delete(id);
  }

  if (tree[ROOT_ID]) {
    dfs(ROOT_ID);
  }

  for (const id of Object.keys(tree)) {
    if (!visited.has(id)) {
      warnings.push(`node '${id}' is disconnected from root`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function normalizeOps(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) {
    return raw as Array<Record<string, unknown>>;
  }
  if (raw && typeof raw === 'object' && Array.isArray((raw as { ops?: unknown }).ops)) {
    return (raw as { ops: Array<Record<string, unknown>> }).ops;
  }
  throw new CliError('SCHEMA_INVALID', 'bulk ops file must be an array or {ops: []}');
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CliError('SCHEMA_INVALID', 'expected object value in bulk operation');
  }
  return value as Record<string, unknown>;
}

function applyOneBulkOp(tree: TreeFile, op: Record<string, unknown>): Record<string, unknown> {
  const action = String(op.action ?? '');
  switch (action) {
    case 'add': {
      return addNodeOnTree(tree, {
        parent: typeof op.parent === 'string' ? op.parent : ROOT_ID,
        id: typeof op.id === 'string' ? op.id : undefined,
        set: asRecord(op.set ?? {})
      });
    }
    case 'update': {
      if (typeof op.id !== 'string') {
        throw new CliError('SCHEMA_INVALID', 'update operation requires id');
      }
      return updateNodeOnTree(tree, op.id, {
        set: asRecord(op.set ?? {}),
        unset: Array.isArray(op.unset) ? op.unset.map(String) : []
      });
    }
    case 'delete': {
      if (typeof op.id !== 'string') {
        throw new CliError('SCHEMA_INVALID', 'delete operation requires id');
      }
      if (op.yes !== true) {
        throw new CliError('DELETE_CONFIRM_REQUIRED', 'bulk delete requires yes=true');
      }
      return deleteNodeOnTree(tree, op.id, { cascade: op.cascade !== false, yes: true });
    }
    case 'move': {
      if (typeof op.id !== 'string' || typeof op.to !== 'string') {
        throw new CliError('SCHEMA_INVALID', 'move operation requires id and to');
      }
      return moveNodeOnTree(tree, op.id, op.to);
    }
    case 'upsert': {
      if (typeof op.id !== 'string') {
        throw new CliError('SCHEMA_INVALID', 'upsert operation requires id');
      }
      const set = asRecord(op.set ?? {});
      if (tree[op.id]) {
        const updated = updateNodeOnTree(tree, op.id, { set });
        if (typeof op.parent === 'string' && updated.parent !== op.parent) {
          moveNodeOnTree(tree, op.id, op.parent);
        }
        return { id: op.id, created: false };
      }
      addNodeOnTree(tree, {
        id: op.id,
        parent: typeof op.parent === 'string' ? op.parent : ROOT_ID,
        set
      });
      return { id: op.id, created: true };
    }
    default:
      throw new CliError('SCHEMA_INVALID', `unsupported bulk action '${action}'`);
  }
}

export async function initTree(filePathRaw?: string, options: InitOptions = {}): Promise<{ file: string; root_id: string }> {
  const file = resolveTreePath({ filePath: filePathRaw });
  const lockPath = getLockPath(file);

  return withFileLock(lockPath, async () => {
    const exists = await fileExists(file);
    if (exists && !options.force) {
      throw new CliError('SCHEMA_INVALID', `tree file already exists: ${file}`, 'use --force to overwrite');
    }

    await mkdir(dirname(file), { recursive: true });
    const tree = createInitialTree();
    await writeTreeAtomic(file, tree);

    return {
      file,
      root_id: ROOT_ID
    };
  });
}

export async function addNode(filePathRaw: string | undefined, input: AddInput, options: MutateOptions = {}): Promise<{ id: string; parent: string }> {
  return mutateWithLock(filePathRaw, (tree) => addNodeOnTree(tree, input), options);
}

export async function getNode(filePathRaw: string | undefined, nodeId: string): Promise<TreeNode> {
  const file = resolveTreePath({ filePath: filePathRaw });
  const tree = await readTree(file);
  return assertNodeExists(tree, nodeId);
}

export async function listChildren(filePathRaw: string | undefined, parentId: string = ROOT_ID, max?: number): Promise<TreeNode[]> {
  const file = resolveTreePath({ filePath: filePathRaw });
  const tree = await readTree(file);
  const parent = assertNodeExists(tree, parentId);
  const children = parent.children.map((childId) => assertNodeExists(tree, childId));
  return typeof max === 'number' ? children.slice(0, max) : children;
}

export async function updateNode(filePathRaw: string | undefined, nodeId: string, input: UpdateInput, options: MutateOptions = {}): Promise<TreeNode> {
  return mutateWithLock(filePathRaw, (tree) => updateNodeOnTree(tree, nodeId, input), options);
}

export async function deleteNode(
  filePathRaw: string | undefined,
  nodeId: string,
  input: DeleteInput,
  options: MutateOptions = {}
): Promise<{ requires_confirmation?: boolean; count?: number; ids?: string[]; deleted_ids?: string[] }> {
  if (!input.yes) {
    const file = resolveTreePath({ filePath: filePathRaw });
    const tree = await readTree(file);
    if (nodeId === ROOT_ID) {
      throw new CliError('ROOT_IMMUTABLE', 'root node cannot be deleted');
    }
    assertNodeExists(tree, nodeId);
    const ids = collectSubtreeIds(tree, nodeId);
    return {
      requires_confirmation: true,
      count: ids.length,
      ids
    };
  }

  return mutateWithLock(filePathRaw, (tree) => deleteNodeOnTree(tree, nodeId, { cascade: input.cascade !== false, yes: true }), options);
}

export async function moveNode(
  filePathRaw: string | undefined,
  nodeId: string,
  newParentId: string,
  options: MutateOptions = {}
): Promise<{ id: string; from: string | null; to: string }> {
  return mutateWithLock(filePathRaw, (tree) => moveNodeOnTree(tree, nodeId, newParentId), options);
}

export async function findNodesInternal(
  filePathRaw: string | undefined,
  input: FindInput
): Promise<Array<Record<string, unknown>>> {
  const file = resolveTreePath({ filePath: filePathRaw });
  const tree = await readTree(file);
  const parsed = parseQuery(input.query ?? '');

  let nodes = Object.values(tree).filter((node) => matchesNode(node, parsed, new Date()));

  const sort = parseSort(input.sort);
  if (sort) {
    nodes = nodes.sort((a, b) => {
      const av = valueForSort(a[sort.field]);
      const bv = valueForSort(b[sort.field]);
      if (av < bv) {
        return sort.direction === 'asc' ? -1 : 1;
      }
      if (av > bv) {
        return sort.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  if (typeof input.max === 'number') {
    nodes = nodes.slice(0, input.max);
  }

  if (input.fields && input.fields.length > 0) {
    return nodes.map((node) => {
      const picked: Record<string, unknown> = {};
      for (const field of input.fields ?? []) {
        picked[field] = node[field];
      }
      return picked;
    });
  }

  return nodes;
}

export async function validateTree(filePathRaw?: string): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  const file = resolveTreePath({ filePath: filePathRaw });
  const tree = await readTree(file);
  return validateTreeObject(tree);
}

export async function upsertNode(
  filePathRaw: string | undefined,
  input: { id: string; parent?: string; set: Record<string, unknown> },
  options: MutateOptions = {}
): Promise<{ id: string; created: boolean; parent: string }> {
  return mutateWithLock(
    filePathRaw,
    (tree) => {
      const parent = input.parent ?? ROOT_ID;
      if (tree[input.id]) {
        updateNodeOnTree(tree, input.id, { set: input.set });
        const current = tree[input.id];
        if (current.parent !== parent) {
          moveNodeOnTree(tree, input.id, parent);
        }
        return { id: input.id, created: false, parent };
      }
      addNodeOnTree(tree, { id: input.id, parent, set: input.set });
      return { id: input.id, created: true, parent };
    },
    options
  );
}

export async function applyBulkFromFile(
  filePathRaw: string | undefined,
  input: BulkInput,
  options: MutateOptions = {}
): Promise<{ applied: number; results: Array<Record<string, unknown>> }> {
  const file = resolveTreePath({ filePath: filePathRaw });
  const lockPath = getLockPath(file);

  return withFileLock(lockPath, async () => {
    const tree = await readTree(file);
    const opsRaw = JSON.parse(await readFile(input.opsFile, 'utf-8'));
    const ops = normalizeOps(opsRaw);

    let atomicSnapshot: SnapshotInfo | null = null;
    if (input.atomic !== false) {
      atomicSnapshot = await createSnapshotInternal(file, 'bulk-atomic');
    } else if (options.autoSnapshot !== false) {
      await createSnapshotInternal(file, 'autosave');
    }

    const results: Array<Record<string, unknown>> = [];

    try {
      for (const op of ops) {
        const result = applyOneBulkOp(tree, op);
        results.push(result);
      }
      await writeTreeAtomic(file, tree);
      await pruneSnapshots(file, options.snapshotKeep ?? defaultSnapshotKeep());
      return {
        applied: ops.length,
        results
      };
    } catch (err) {
      if (atomicSnapshot) {
        await copyFile(atomicSnapshot.path, file);
      }
      throw err;
    }
  });
}

export async function createSnapshot(filePathRaw?: string, name?: string): Promise<SnapshotInfo> {
  const file = resolveTreePath({ filePath: filePathRaw });
  const lockPath = getLockPath(file);

  return withFileLock(lockPath, async () => {
    await readTree(file);
    const info = await createSnapshotInternal(file, name);
    await pruneSnapshots(file, defaultSnapshotKeep());
    return info;
  });
}

export async function restoreSnapshot(filePathRaw: string | undefined, snapshotId: string): Promise<{ restored: string }> {
  const file = resolveTreePath({ filePath: filePathRaw });
  const lockPath = getLockPath(file);

  return withFileLock(lockPath, async () => {
    const snapPath = join(snapshotDir(file), snapshotId);
    const exists = await fileExists(snapPath);
    if (!exists) {
      throw new CliError('FILE_NOT_FOUND', `snapshot '${snapshotId}' not found`);
    }
    await mkdir(dirname(file), { recursive: true });
    await copyFile(snapPath, file);
    return { restored: snapshotId };
  });
}

export async function listSnapshots(filePathRaw?: string): Promise<string[]> {
  const file = resolveTreePath({ filePath: filePathRaw });
  const dir = snapshotDir(file);
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
}

export function parseSetPairs(pairs: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const pair of pairs) {
    const index = pair.indexOf('=');
    if (index <= 0) {
      throw new CliError('SCHEMA_INVALID', `invalid --set pair '${pair}', expected key=value`);
    }
    const key = pair.slice(0, index).trim();
    const valueRaw = pair.slice(index + 1).trim();
    if (!key) {
      throw new CliError('SCHEMA_INVALID', `invalid --set pair '${pair}', missing key`);
    }

    let value: unknown = valueRaw;
    if (valueRaw === 'null') {
      value = null;
    } else if (valueRaw === 'true') {
      value = true;
    } else if (valueRaw === 'false') {
      value = false;
    } else if (!Number.isNaN(Number(valueRaw)) && valueRaw.length > 0) {
      value = Number(valueRaw);
    } else {
      try {
        if ((valueRaw.startsWith('{') && valueRaw.endsWith('}')) || (valueRaw.startsWith('[') && valueRaw.endsWith(']'))) {
          value = JSON.parse(valueRaw);
        }
      } catch {
        value = valueRaw;
      }
    }

    out[key] = value;
  }
  return out;
}

export function parseSparkExpression(expression: string): Record<string, unknown> {
  const pairs = expression.match(/"[^"]+"|'[^']+'|\S+/g) ?? [];
  const normalized = pairs.map((part) => {
    const token = part.startsWith('"') || part.startsWith("'") ? part.slice(1, -1) : part;
    const idx = token.indexOf(':');
    if (idx <= 0) {
      throw new CliError('SCHEMA_INVALID', `invalid spark token '${token}', expected key:value`);
    }
    return `${token.slice(0, idx)}=${token.slice(idx + 1)}`;
  });
  return parseSetPairs(normalized);
}

export function snapshotIdFromPath(pathValue: string): string {
  return parse(pathValue).base;
}
