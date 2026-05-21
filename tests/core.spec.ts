import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
  createSnapshot,
  updateNode
} from '../src/api.js';

describe('core tree api', () => {
  it('initializes with novix root fields', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-'));
    const filePath = join(dir, 'novix-idea-tree.json');

    await initTree(filePath, { force: true });

    const raw = JSON.parse(await readFile(filePath, 'utf-8'));
    expect(raw.root.id).toBe('root');
    expect(raw.root.parent).toBeNull();
    expect(typeof raw.root.summary).toBe('string');
    expect(raw.root.summary.length).toBeGreaterThan(0);
    expect(typeof raw.root.description).toBe('string');
    expect(raw.root.description.length).toBeGreaterThan(0);
    expect(raw.root.references).toEqual([]);
  });

  it('supports add and delete preview/confirm cascade', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-'));
    const filePath = join(dir, 'novix-idea-tree.json');

    await initTree(filePath, { force: true });
    const a = await addNode(filePath, {
      parent: 'root',
      set: {
        summary: 'A',
        description: 'A description',
        references: ['https://example.com/a']
      }
    });
    const b = await addNode(filePath, {
      parent: a.id,
      set: {
        summary: 'B',
        description: 'B description',
        references: ['https://example.com/b']
      }
    });

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
    const filePath = join(dir, 'novix-idea-tree.json');

    await initTree(filePath, { force: true });
    await expect(
      applyBulk(filePath, [
        {
          action: 'add',
          parent: 'root',
          set: {
            summary: 'ok',
            description: 'ok description',
            references: ['https://example.com/ok']
          }
        },
        { action: 'move', id: 'not-exist', to: 'root' }
      ], { atomic: true })
    ).rejects.toThrow();

    const raw = JSON.parse(await readFile(filePath, 'utf-8'));
    expect(Object.keys(raw)).toEqual(['root']);
  });

  it('creates and restores snapshot', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-'));
    const filePath = join(dir, 'novix-idea-tree.json');

    await initTree(filePath, { force: true });
    const first = await addNode(filePath, {
      parent: 'root',
      set: {
        summary: 'V1',
        description: 'V1 description',
        references: ['https://example.com/v1']
      }
    });
    const snap = await createSnapshot(filePath, 'before-change');
    expect(snap.path).toContain('/.snapshot/');

    await deleteNode(filePath, first.id, { cascade: true, yes: true });
    await restoreSnapshot(filePath, snap.snapshot_id);

    const raw = JSON.parse(await readFile(filePath, 'utf-8'));
    expect(raw[first.id]).toBeDefined();
  });

  it('rejects extra non-novix fields on add', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-'));
    const filePath = join(dir, 'novix-idea-tree.json');

    await initTree(filePath, { force: true });

    await expect(
      addNode(filePath, {
        parent: 'root',
        set: {
          summary: 'A',
          description: 'A description',
          references: ['https://example.com/a'],
          type: 'idea'
        }
      })
    ).rejects.toMatchObject({ code: 'SCHEMA_INVALID' });
  });

  it('fills missing novix fields with defaults and reports incomplete content as warnings', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-'));
    const filePath = join(dir, 'novix-idea-tree.json');

    await initTree(filePath, { force: true });
    const added = await addNode(filePath, {
      parent: 'root',
      set: {
        summary: 'Draft idea'
      }
    });

    const raw = JSON.parse(await readFile(filePath, 'utf-8'));
    expect(raw[added.id].summary).toBe('Draft idea');
    expect(raw[added.id].description).toBe('');
    expect(raw[added.id].references).toEqual([]);

    const initialReport = await validateTree(filePath);
    expect(initialReport.valid).toBe(true);
    expect(initialReport.errors).toEqual([]);
    expect(initialReport.warnings.join('\n')).toContain(`node '${added.id}' has empty description`);
    expect(initialReport.warnings.join('\n')).toContain(`node '${added.id}' has no references`);

    await updateNode(filePath, added.id, {
      set: {
        description: 'Expanded description',
        references: ['https://example.com/draft']
      }
    });

    const completedReport = await validateTree(filePath);
    expect(completedReport.valid).toBe(true);
    expect(completedReport.errors).toEqual([]);
    expect(completedReport.warnings).toEqual([]);
  });

  it('rejects unsetting required novix fields', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-'));
    const filePath = join(dir, 'novix-idea-tree.json');

    await initTree(filePath, { force: true });
    const node = await addNode(filePath, {
      parent: 'root',
      set: {
        summary: 'A',
        description: 'A description',
        references: ['https://example.com/a']
      }
    });

    await expect(updateNode(filePath, node.id, { unset: ['summary'] })).rejects.toMatchObject({
      code: 'SCHEMA_INVALID'
    });
  });

  it('reports invalid when tree contains free-form novix-incompatible nodes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-'));
    const filePath = join(dir, 'novix-idea-tree.json');

    await writeFile(
      filePath,
      JSON.stringify({
        root: {
          id: 'root',
          parent: null,
          children: ['idea_1'],
          created_at: 1,
          type: 'topic',
          content: 'bad root',
          tags: 'x'
        },
        idea_1: {
          id: 'idea_1',
          parent: 'root',
          children: [],
          created_at: 2,
          type: 'idea',
          content: 'bad child',
          notes: 'free form'
        }
      })
    );

    const report = await validateTree(filePath);
    expect(report.valid).toBe(false);
    expect(report.errors.join('\n')).toContain('summary');
  });
});
