import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  addNode,
  addManyNodes,
  applyAddManyFromFile,
  applyBulkFromFile,
  createSnapshot,
  deleteNode,
  findNodesInternal,
  getNode,
  initTree,
  listChildren,
  moveNode,
  parseSetPairs,
  restoreSnapshot,
  updateNode,
  upsertNode,
  validateTree
} from './core.js';
import type {
  AddInput,
  AddManyInput,
  AddManyNodeInput,
  BulkInput,
  DeleteInput,
  FindInput,
  InitOptions,
  MutateOptions,
  SnapshotInfo,
  UpdateInput
} from './core.js';

export {
  initTree,
  addNode,
  addManyNodes,
  getNode,
  listChildren,
  updateNode,
  deleteNode,
  moveNode,
  validateTree,
  upsertNode,
  createSnapshot,
  restoreSnapshot,
  parseSetPairs
};

export type { InitOptions, AddInput, AddManyInput, AddManyNodeInput, UpdateInput, DeleteInput, FindInput, BulkInput, SnapshotInfo, MutateOptions };

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
  const tempOpsFile = join(tmpdir(), `.treejson-bulk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
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

export async function applyAddMany(
  filePath: string | undefined,
  nodes: AddManyNodeInput[],
  options: Omit<MutateOptions, 'autoSnapshot'> & { atomic?: boolean } = {}
): Promise<{ added: number; results: Array<{ id: string; parent: string }> }> {
  return addManyNodes(filePath, nodes, options);
}

export async function applyAddManyFromNodesFile(
  filePath: string | undefined,
  input: AddManyInput,
  options: MutateOptions = {}
): Promise<{ added: number; results: Array<{ id: string; parent: string }> }> {
  return applyAddManyFromFile(filePath, input, options);
}
