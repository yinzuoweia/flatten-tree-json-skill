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
  applyAddMany,
  restoreSnapshot,
  createSnapshot,
  updateNode,
  getNode
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
    expect(raw.root.evidence_rationale).toBe('');
    expect(typeof raw.root.next_action).toBe('string');
    expect(raw.root.next_action.length).toBeGreaterThan(0);
    expect(raw.root.branch_mode).toBe('strategy');
    expect(raw.root.growth_posture).toBe('preserve');
    expect(raw.root.next_action_style).toBe('frame');
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
        next_action: 'Use a focused session to expand A into a concrete research task.',
        references: ['https://example.com/a'],
        branch_mode: 'inquiry',
        growth_posture: 'deepen',
        next_action_style: 'synthesize'
      }
    });
    const b = await addNode(filePath, {
      parent: a.id,
      set: {
        summary: 'B',
        description: 'B description',
        next_action: 'Use a follow-up session to refine B.',
        references: ['https://example.com/b'],
        branch_mode: 'execution',
        growth_posture: 'converge',
        next_action_style: 'implement'
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
            next_action: 'Turn this node into a concrete session.',
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
        next_action: 'Continue from V1.',
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
          next_action: 'Turn A into a concrete session.',
          references: ['https://example.com/a'],
          type: 'idea'
        }
      })
    ).rejects.toMatchObject({ code: 'SCHEMA_INVALID' });
  });

  it('fills missing novix fields with defaults and rejects incomplete visible leaves on validate', async () => {
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
    expect(raw[added.id].evidence_rationale).toBe('');
    expect(raw[added.id].next_action).toBe('');
    expect(raw[added.id].references).toEqual([]);
    expect(raw[added.id].branch_mode).toBe('execution');
    expect(raw[added.id].growth_posture).toBe('converge');
    expect(raw[added.id].next_action_style).toBe('implement');

    const initialReport = await validateTree(filePath);
    expect(initialReport.valid).toBe(false);
    expect(initialReport.errors.join('\n')).toContain(`leaf node '${added.id}' must define non-empty next_action`);
    expect(initialReport.warnings.join('\n')).toContain(`node '${added.id}' has empty description`);
    expect(initialReport.warnings.join('\n')).toContain(`node '${added.id}' has empty next_action`);
    expect(initialReport.warnings.join('\n')).toContain(`node '${added.id}' has no references`);

    await updateNode(filePath, added.id, {
      set: {
        description: 'Expanded description',
        evidence_rationale: 'The draft source explains why this node should be expanded now.',
        next_action: 'Open a Method Design session that specifies scope, inputs, method, validation, and deliverable.',
        references: ['https://example.com/draft']
      }
    });

    const completedReport = await validateTree(filePath);
    expect(completedReport.valid).toBe(true);
    expect(completedReport.errors).toEqual([]);
    expect(completedReport.warnings).toEqual([]);
  });

  it('rejects no-op next_action text on visible leaves during validation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-'));
    const filePath = join(dir, 'novix-idea-tree.json');

    await initTree(filePath, { force: true });
    const added = await addNode(filePath, {
      parent: 'root',
      set: {
        summary: 'Context-only leaf',
        description: 'This leaf should not pass with passive maintenance text.',
        next_action: 'Review periodically and keep as reference.',
        references: ['https://example.com/context'],
        branch_mode: 'memory',
        growth_posture: 'preserve',
        next_action_style: 'preserve_context'
      }
    });

    const report = await validateTree(filePath);
    expect(report.valid).toBe(false);
    expect(report.errors.join('\n')).toContain(`leaf node '${added.id}' next_action is a no-op`);

    await addNode(filePath, {
      parent: added.id,
      set: {
        summary: 'Concrete child',
        description: 'A child makes the passive parent an internal context branch.',
        next_action: 'Synthesize the context into one reusable framing paragraph with explicit boundaries.',
        references: ['https://example.com/context'],
        branch_mode: 'memory',
        growth_posture: 'preserve',
        next_action_style: 'synthesize'
      }
    });

    const internalReport = await validateTree(filePath);
    expect(internalReport.valid).toBe(true);
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
        next_action: 'Turn A into a concrete session.',
        references: ['https://example.com/a']
      }
    });

    await expect(updateNode(filePath, node.id, { unset: ['summary'] })).rejects.toMatchObject({
      code: 'SCHEMA_INVALID'
    });
    await expect(updateNode(filePath, node.id, { unset: ['next_action'] })).rejects.toMatchObject({
      code: 'SCHEMA_INVALID'
    });
    await expect(updateNode(filePath, node.id, { unset: ['branch_mode'] })).rejects.toMatchObject({
      code: 'SCHEMA_INVALID'
    });
  });

  it('validates living-map classification fields', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-'));
    const filePath = join(dir, 'novix-idea-tree.json');
    await initTree(filePath, { force: true });

    const node = await addNode(filePath, {
      set: {
        summary: 'Signal scan',
        description: 'Use a current external signal to decide whether a direction deserves expansion.',
        next_action: 'Compare the current signal against the parent direction and decide whether to keep it.',
        references: ['https://example.com/signal'],
        branch_mode: 'signal',
        growth_posture: 'connect',
        next_action_style: 'probe_signal'
      }
    });

    expect((await getNode(filePath, node.id)).branch_mode).toBe('signal');
    await expect(updateNode(filePath, node.id, { set: { branch_mode: 'todo' } })).rejects.toMatchObject({
      code: 'SCHEMA_INVALID'
    });
    await expect(updateNode(filePath, node.id, { set: { growth_posture: 'explode' } })).rejects.toMatchObject({
      code: 'SCHEMA_INVALID'
    });
    await expect(updateNode(filePath, node.id, { set: { next_action_style: 'do_everything' } })).rejects.toMatchObject({
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

  it('adds many nodes atomically from a nodes list', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-'));
    const filePath = join(dir, 'novix-idea-tree.json');

    await initTree(filePath, { force: true });
    const result = await applyAddMany(
      filePath,
      [
        {
          id: 'idea_a',
          parent: 'root',
          set: {
            summary: 'A',
            description: 'A description',
            evidence_rationale: 'The first source explains why A should become a card.',
            next_action: 'Turn A into a scoped research handoff.',
            references: ['context:session-a']
          }
        },
        {
          id: 'idea_b',
          parent: 'idea_a',
          set: {
            summary: 'B',
            description: 'B description',
            evidence_rationale: 'The second source specializes the A direction.',
            next_action: 'Turn B into a scoped validation handoff.',
            references: ['source:file-b.pdf']
          }
        }
      ],
      { atomic: true }
    );

    expect(result.added).toBe(2);
    expect(result.results).toEqual([
      { id: 'idea_a', parent: 'root' },
      { id: 'idea_b', parent: 'idea_a' }
    ]);

    const raw = JSON.parse(await readFile(filePath, 'utf-8'));
    expect(raw.idea_a.evidence_rationale).toContain('first source');
    expect(raw.idea_b.parent).toBe('idea_a');
    expect(raw.idea_a.children).toEqual(['idea_b']);
  });

  it('rolls back add-many when any node is invalid under atomic mode', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-'));
    const filePath = join(dir, 'novix-idea-tree.json');

    await initTree(filePath, { force: true });
    await expect(
      applyAddMany(
        filePath,
        [
          {
            id: 'idea_a',
            parent: 'root',
            set: {
              summary: 'A',
              description: 'A description',
              evidence_rationale: 'The first source explains why A should become a card.',
              next_action: 'Turn A into a scoped research handoff.',
              references: ['context:session-a']
            }
          },
          {
            id: 'idea_b',
            parent: 'missing_parent',
            set: {
              summary: 'B',
              description: 'B description',
              evidence_rationale: 'This should not be written because the parent is missing.',
              next_action: 'Turn B into a scoped validation handoff.',
              references: ['source:file-b.pdf']
            }
          }
        ],
        { atomic: true }
      )
    ).rejects.toThrow();

    const raw = JSON.parse(await readFile(filePath, 'utf-8'));
    expect(Object.keys(raw)).toEqual(['root']);
  });
});
