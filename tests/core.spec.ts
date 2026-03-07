import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  initTree,
  addNode,
  deleteNode,
  validateTree,
  applyBulk,
  restoreSnapshot,
  createSnapshot
} from '../src/api.js';

describe('core tree api', () => {
  it('initializes with fixed root node', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-'));
    const filePath = join(dir, '.treejson', 'tree.json');

    await initTree(filePath, { force: true });

    const raw = JSON.parse(await readFile(filePath, 'utf-8'));
    expect(raw.root.id).toBe('root');
    expect(raw.root.parent).toBeNull();
  });

  it('supports add and delete preview/confirm cascade', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-'));
    const filePath = join(dir, '.treejson', 'tree.json');

    await initTree(filePath, { force: true });
    const a = await addNode(filePath, { parent: 'root', set: { summary: 'A' } });
    const b = await addNode(filePath, { parent: a.id, set: { summary: 'B' } });

    const preview = await deleteNode(filePath, a.id, { cascade: true, yes: false });
    expect(preview.requires_confirmation).toBe(true);
    expect(preview.count).toBe(2);

    const executed = await deleteNode(filePath, a.id, { cascade: true, yes: true });
    expect(executed.deleted_ids.sort()).toEqual([a.id, b.id].sort());

    const report = await validateTree(filePath);
    expect(report.valid).toBe(true);
  });

  it('bulk atomic rolls back on failure', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-'));
    const filePath = join(dir, '.treejson', 'tree.json');

    await initTree(filePath, { force: true });
    await expect(
      applyBulk(filePath, [
        { action: 'add', parent: 'root', set: { summary: 'ok' } },
        { action: 'move', id: 'not-exist', to: 'root' }
      ], { atomic: true })
    ).rejects.toThrow();

    const raw = JSON.parse(await readFile(filePath, 'utf-8'));
    expect(Object.keys(raw)).toEqual(['root']);
  });

  it('creates and restores snapshot', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-'));
    const filePath = join(dir, '.treejson', 'tree.json');

    await initTree(filePath, { force: true });
    const first = await addNode(filePath, { parent: 'root', set: { summary: 'V1' } });
    const snap = await createSnapshot(filePath, 'before-change');

    await deleteNode(filePath, first.id, { cascade: true, yes: true });
    await restoreSnapshot(filePath, snap.snapshot_id);

    const raw = JSON.parse(await readFile(filePath, 'utf-8'));
    expect(raw[first.id]).toBeDefined();
  });
});
