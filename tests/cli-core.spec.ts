import { mkdtemp } from 'node:fs/promises';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { execa } from 'execa';

async function runCli(args: string[], cwd = process.cwd()) {
  const bin = join(process.cwd(), 'node_modules', '.bin', 'tsx');
  const cliEntry = join(process.cwd(), 'src', 'cli.ts');
  return execa(bin, [cliEntry, ...args], { cwd });
}

describe('cli core commands', () => {
  it('reports package version with --version', async () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      version: string;
      bin: Record<string, string>;
    };
    const out = await runCli(['--version']);
    expect(out.stdout.trim()).toBe(pkg.version);
  });

  it('exposes only treejson binary in package metadata', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      bin: Record<string, string>;
    };
    expect(pkg.bin).toEqual({
      treejson: 'dist/cli.js'
    });
  });

  it('uses treejson as command name in help output', async () => {
    const out = await runCli(['--help']);
    expect(out.stdout).toContain('Usage: treejson');
    expect(out.stdout).toContain('fixed node schema');
    expect(out.stdout).toContain('summary');
    expect(out.stdout).toContain('description');
    expect(out.stdout).toContain('next_action');
    expect(out.stdout).toContain('references');
    expect(out.stdout).toContain('branch_mode');
    expect(out.stdout).toContain('growth_posture');
    expect(out.stdout).toContain('next_action_style');
  });

  it('supports init/add/update/delete preview and confirm', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-cli-core-'));
    const treeFile = join(dir, 'novix-idea-tree.json');

    const initOut = await runCli(['init', '--file', treeFile, '--force']);
    expect(JSON.parse(initOut.stdout).ok).toBe(true);

    const addOut = await runCli([
      'add',
      '--file',
      treeFile,
      '--set',
      'summary=hello',
      '--set',
      'description=hello-description',
      '--set',
      'next_action=Open a focused follow-up session with scope, inputs, method, validation, and deliverable.',
      '--set',
      'references=[\"https://example.com/hello\"]',
      '--set',
      'branch_mode=inquiry',
      '--set',
      'growth_posture=deepen',
      '--set',
      'next_action_style=synthesize'
    ]);
    const addPayload = JSON.parse(addOut.stdout);
    expect(addPayload.action).toBe('add');
    const id = addPayload.result.id;

    const updateOut = await runCli([
      'update',
      id,
      '--file',
      treeFile,
      '--set',
      'description=updated-description'
    ]);
    const updatePayload = JSON.parse(updateOut.stdout);
    expect(updatePayload.result.description).toBe('updated-description');
    expect(updatePayload.result.branch_mode).toBe('inquiry');
    expect(updatePayload.result.growth_posture).toBe('deepen');
    expect(updatePayload.result.next_action_style).toBe('synthesize');

    const previewOut = await runCli(['delete', id, '--file', treeFile]);
    const previewPayload = JSON.parse(previewOut.stdout);
    expect(previewPayload.action).toBe('delete_preview');
    expect(previewPayload.result.requires_confirmation).toBe(true);

    const confirmOut = await runCli(['delete', id, '--file', treeFile, '--yes']);
    const confirmPayload = JSON.parse(confirmOut.stdout);
    expect(confirmPayload.action).toBe('delete');
    expect(confirmPayload.result.deleted_ids).toContain(id);
  });

  it('allows partial add, fills defaults, and rejects incomplete visible leaves on validate', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-cli-core-'));
    const treeFile = join(dir, 'novix-idea-tree.json');

    await runCli(['init', '--file', treeFile, '--force']);

    const addOut = await runCli([
      'add',
      '--file',
      treeFile,
      '--set',
      'summary=draft'
    ]);
    const addPayload = JSON.parse(addOut.stdout);
    const id = addPayload.result.id;

    const getOut = await runCli(['get', id, '--file', treeFile]);
    const getPayload = JSON.parse(getOut.stdout);
    expect(getPayload.result.summary).toBe('draft');
    expect(getPayload.result.description).toBe('');
    expect(getPayload.result.next_action).toBe('');
    expect(getPayload.result.references).toEqual([]);
    expect(getPayload.result.branch_mode).toBe('execution');
    expect(getPayload.result.growth_posture).toBe('converge');
    expect(getPayload.result.next_action_style).toBe('implement');

    const validateOut = await runCli(['validate', '--file', treeFile]);
    const validatePayload = JSON.parse(validateOut.stdout);
    expect(validatePayload.result.valid).toBe(false);
    expect(validatePayload.result.errors.join('\n')).toContain(`leaf node '${id}' must define non-empty next_action`);
    expect(validatePayload.warnings.join('\n')).toContain(`node '${id}' has empty description`);
    expect(validatePayload.warnings.join('\n')).toContain(`node '${id}' has empty next_action`);
    expect(validatePayload.warnings.join('\n')).toContain(`node '${id}' has no references`);
  });

  it('uses preferred default file path and falls back to command cwd when preferred directory is missing', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'treejson-cli-default-'));
    const out = await runCli(['init', '--force'], cwd);
    const payload = JSON.parse(out.stdout);

    const preferredDir = '/home/novix/workspace/project';
    const expectedFile = existsSync(preferredDir)
      ? join(preferredDir, 'novix-idea-tree.json')
      : join(realpathSync(cwd), 'novix-idea-tree.json');

    expect(payload.file).toBe(expectedFile);
    expect(payload.result.file).toBe(expectedFile);
  });

  it('returns schema error when --file does not end with idea-tree.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-cli-invalid-file-'));
    const invalidFile = join(dir, 'tree.json');

    try {
      await runCli(['init', '--file', invalidFile, '--force']);
      throw new Error('expected command to fail with SCHEMA_INVALID');
    } catch (err) {
      const execaErr = err as { exitCode?: number; stderr?: string };
      expect(execaErr.exitCode).toBe(3);
      const payload = JSON.parse(execaErr.stderr ?? '{}');
      expect(payload.error.code).toBe('SCHEMA_INVALID');
      expect(payload.error.message).toContain('idea-tree.json');
    }
  });

  it('documents novix fixed-schema fields in command help', async () => {
    const addHelp = await runCli(['add', '--help']);
    expect(addHelp.stdout).toContain('summary');
    expect(addHelp.stdout).toContain('description');
    expect(addHelp.stdout).toContain('next_action');
    expect(addHelp.stdout).toContain('references');
    expect(addHelp.stdout).toContain('branch_mode');
    expect(addHelp.stdout).toContain('growth_posture');
    expect(addHelp.stdout).toContain('next_action_style');
    expect(addHelp.stdout).toContain('Missing fields default to empty values');
    expect(addHelp.stdout).not.toContain('Novix idea tree');

    const validateHelp = await runCli(['validate', '--help']);
    expect(validateHelp.stdout).toContain('root');
    expect(validateHelp.stdout).toContain('references');
    expect(validateHelp.stdout).toContain('non-root leaf');
    expect(validateHelp.stdout).toContain('branch_mode');
    expect(validateHelp.stdout).toContain('warning');
    expect(validateHelp.stdout).not.toContain('Novix idea tree');
  });

  it('rejects extra non-novix fields from cli add', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-cli-invalid-field-'));
    const treeFile = join(dir, 'novix-idea-tree.json');

    await runCli(['init', '--file', treeFile, '--force']);

    try {
      await runCli([
        'add',
        '--file',
        treeFile,
        '--set',
        'summary=hello',
        '--set',
        'description=hello-description',
        '--set',
        'next_action=Open a focused follow-up session with scope, inputs, method, validation, and deliverable.',
        '--set',
        'references=[\"https://example.com/hello\"]',
        '--set',
        'type=idea'
      ]);
      throw new Error('expected command to fail with SCHEMA_INVALID');
    } catch (err) {
      const execaErr = err as { exitCode?: number; stderr?: string };
      expect(execaErr.exitCode).toBe(3);
      const payload = JSON.parse(execaErr.stderr ?? '{}');
      expect(payload.error.code).toBe('SCHEMA_INVALID');
      expect(payload.error.message).toContain('type');
    }
  });
});
