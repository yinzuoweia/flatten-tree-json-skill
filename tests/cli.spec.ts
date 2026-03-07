import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { execa } from 'execa';

async function runCli(args: string[], cwd: string) {
  const bin = join(process.cwd(), 'node_modules', '.bin', 'tsx');
  return execa(bin, ['src/cli.ts', ...args], { cwd });
}

describe('cli spark aliases', () => {
  it('supports spark search alias', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nis-cli-'));
    await runCli(['init', '--file', join(dir, '.nis', 'tree.json'), '--force'], process.cwd());

    const result = await runCli(
      ['spark', 'search', 'newer_than:7d', '--file', join(dir, '.nis', 'tree.json'), '--max', '10'],
      process.cwd()
    );

    const out = JSON.parse(result.stdout);
    expect(out.ok).toBe(true);
    expect(out.action).toBe('find');
  });
});
