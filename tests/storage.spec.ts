import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readTree, resolveTreePath, snapshotDir } from '../src/storage.js';

describe('storage defaults', () => {
  it('resolves default tree path to /home/novix/workspace/project/novix-idea-tree.json when preferred directory exists', () => {
    const path = resolveTreePath({
      preferredDirExists: (dir) => dir === '/home/novix/workspace/project'
    });
    expect(path).toBe('/home/novix/workspace/project/novix-idea-tree.json');
  });

  it('falls back to current working directory novix-idea-tree.json when preferred directory does not exist', () => {
    const path = resolveTreePath({ preferredDirExists: () => false });
    expect(path).toBe(resolve('novix-idea-tree.json'));
  });

  it('rejects custom file path whose file name does not end with idea-tree.json', () => {
    expect(() => resolveTreePath({ filePath: '/tmp/tree.json' })).toThrowError(/idea-tree\.json/);
  });

  it('uses .snapshot as snapshot directory name', () => {
    const dir = snapshotDir('/tmp/a/novix-idea-tree.json');
    expect(dir).toBe('/tmp/a/.snapshot');
  });

  it('uses treejson command in file-not-found hint', async () => {
    await expect(readTree('/tmp/definitely-not-exists-treejson.json')).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND',
      hint: 'run `treejson init` first'
    });
  });
});
