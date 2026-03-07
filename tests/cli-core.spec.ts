import { mkdtemp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { execa } from 'execa';

async function runCli(args: string[]) {
  const bin = join(process.cwd(), 'node_modules', '.bin', 'tsx');
  return execa(bin, ['src/cli.ts', ...args], { cwd: process.cwd() });
}

describe('cli core commands', () => {
  it('reports package version with --version', async () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string };
    const out = await runCli(['--version']);
    expect(out.stdout.trim()).toBe(pkg.version);
  });

  it('uses treejson as command name in help output', async () => {
    const out = await runCli(['--help']);
    expect(out.stdout).toContain('Usage: treejson');
  });

  it('supports init/add/update/delete preview and confirm', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'treejson-cli-core-'));
    const treeFile = join(dir, '.treejson', 'tree.json');

    const initOut = await runCli(['init', '--file', treeFile, '--force']);
    expect(JSON.parse(initOut.stdout).ok).toBe(true);

    const addOut = await runCli(['add', '--file', treeFile, '--set', 'summary=hello']);
    const addPayload = JSON.parse(addOut.stdout);
    expect(addPayload.action).toBe('add');
    const id = addPayload.result.id;

    const updateOut = await runCli(['update', id, '--file', treeFile, '--set', 'tag=idea']);
    const updatePayload = JSON.parse(updateOut.stdout);
    expect(updatePayload.result.tag).toBe('idea');

    const previewOut = await runCli(['delete', id, '--file', treeFile]);
    const previewPayload = JSON.parse(previewOut.stdout);
    expect(previewPayload.action).toBe('delete_preview');
    expect(previewPayload.result.requires_confirmation).toBe(true);

    const confirmOut = await runCli(['delete', id, '--file', treeFile, '--yes']);
    const confirmPayload = JSON.parse(confirmOut.stdout);
    expect(confirmPayload.action).toBe('delete');
    expect(confirmPayload.result.deleted_ids).toContain(id);
  });
});
