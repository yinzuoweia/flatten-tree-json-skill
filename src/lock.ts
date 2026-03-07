import { open, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { CliError, isNodeErrorWithCode } from './errors.js';

export type LockOptions = {
  timeoutMs?: number;
  retryMs?: number;
  staleMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeIfStale(lockPath: string, staleMs: number): Promise<void> {
  try {
    const info = await stat(lockPath);
    if (Date.now() - info.mtimeMs > staleMs) {
      await rm(lockPath, { force: true });
    }
  } catch {
    // ignore
  }
}

export async function withFileLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  options: LockOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const retryMs = options.retryMs ?? 80;
  const staleMs = options.staleMs ?? 30_000;

  await mkdir(dirname(lockPath), { recursive: true });
  const started = Date.now();

  while (true) {
    try {
      const handle = await open(lockPath, 'wx');
      try {
        return await fn();
      } finally {
        await handle.close();
        await rm(lockPath, { force: true });
      }
    } catch (err) {
      if (!isNodeErrorWithCode(err) || err.code !== 'EEXIST') {
        throw err;
      }
      await removeIfStale(lockPath, staleMs);
      if (Date.now() - started > timeoutMs) {
        throw new CliError('LOCK_TIMEOUT', `failed to acquire lock within ${timeoutMs}ms`, `lockPath=${lockPath}`);
      }
      await sleep(retryMs);
    }
  }
}
