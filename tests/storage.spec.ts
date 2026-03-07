import { describe, expect, it } from 'vitest';
import { readTree, resolveTreePath } from '../src/storage.js';

describe('storage defaults', () => {
  it('resolves default tree path to .treejson/tree.json', () => {
    const path = resolveTreePath();
    expect(path.endsWith('.treejson/tree.json')).toBe(true);
  });

  it('uses treejson command in file-not-found hint', async () => {
    await expect(readTree('/tmp/definitely-not-exists-treejson.json')).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND',
      hint: 'run `treejson init` first'
    });
  });
});
