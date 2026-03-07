import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  addNode,
  applyBulkFromFile,
  createSnapshot,
  deleteNode,
  findNodesInternal,
  getNode,
  initTree,
  listChildren,
  moveNode,
  parseSetPairs,
  parseSparkExpression,
  restoreSnapshot,
  updateNode,
  upsertNode,
  validateTree
} from './core.js';
import type {
  AddInput,
  BulkInput,
  DeleteInput,
  FindInput,
  InitOptions,
  MutateOptions,
  SnapshotInfo,
  UpdateInput
} from './core.js';

export { initTree, addNode, getNode, listChildren, updateNode, deleteNode, moveNode, validateTree, upsertNode, createSnapshot, restoreSnapshot, parseSetPairs, parseSparkExpression };

export type { InitOptions, AddInput, UpdateInput, DeleteInput, FindInput, BulkInput, SnapshotInfo, MutateOptions };

export async function findNodes(
  filePath: string | undefined,
  query: string,
  options: Omit<FindInput, 'query'> = {}
): Promise<Array<Record<string, unknown>>> {
  return findNodesInternal(filePath, {
    query,
    ...options
  });
}

export async function applyBulk(
  filePath: string | undefined,
  ops: Array<Record<string, unknown>>,
  options: Omit<MutateOptions, 'autoSnapshot'> & { atomic?: boolean } = {}
): Promise<{ applied: number; results: Array<Record<string, unknown>> }> {
  const tempOpsFile = join(tmpdir(), `.nis-bulk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  await writeFile(tempOpsFile, JSON.stringify(ops), 'utf-8');
  try {
    return await applyBulkFromFile(
      filePath,
      {
        opsFile: tempOpsFile,
        atomic: options.atomic
      },
      {
        snapshotKeep: options.snapshotKeep
      }
    );
  } finally {
    await rm(tempOpsFile, { force: true });
  }
}

export async function applyBulkFromOpsFile(
  filePath: string | undefined,
  input: BulkInput,
  options: MutateOptions = {}
): Promise<{ applied: number; results: Array<Record<string, unknown>> }> {
  return applyBulkFromFile(filePath, input, options);
}
