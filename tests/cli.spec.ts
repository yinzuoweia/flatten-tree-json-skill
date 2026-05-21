import { describe, expect, it } from 'vitest';
import { execa } from 'execa';
import { join } from 'node:path';

async function runCli(args: string[], cwd = process.cwd()) {
  const bin = join(process.cwd(), 'node_modules', '.bin', 'tsx');
  const cliEntry = join(process.cwd(), 'src', 'cli.ts');
  return execa(bin, [cliEntry, ...args], { cwd });
}

describe('cli command surface', () => {
  it('does not expose spark commands in novix help', async () => {
    const result = await runCli(['--help']);
    expect(result.stdout).not.toContain('\nspark');
  });

  it('rejects spark commands in novix cli', async () => {
    try {
      await runCli(['spark', 'search', 'newer_than:7d']);
      throw new Error('expected command to fail');
    } catch (err) {
      const execaErr = err as { exitCode?: number; stderr?: string };
      expect(execaErr.exitCode).not.toBe(0);
      expect(execaErr.stderr ?? '').toContain("unknown command 'spark'");
    }
  });
});
