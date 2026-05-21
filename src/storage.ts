import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { CliError, isNodeErrorWithCode } from './errors.js';
import { NOVIX_ROOT_DESCRIPTION, NOVIX_ROOT_SUMMARY, collectNovixTreeErrors } from './novix.js';
import { ROOT_ID, type TreeFile } from './types.js';

const nodeSchema = z
  .object({
    id: z.string().min(1),
    parent: z.string().nullable(),
    children: z.array(z.string()),
    created_at: z.number()
  })
  .passthrough();

const treeSchema = z.record(nodeSchema);

export type ResolvePathOptions = {
  filePath?: string;
  preferredDirExists?: (dir: string) => boolean;
};

const PREFERRED_DEFAULT_TREE_DIR = '/home/novix/workspace/project';
const DEFAULT_TREE_FILENAME = 'novix-idea-tree.json';
const REQUIRED_TREE_FILENAME_SUFFIX = 'idea-tree.json';

function assertValidTreeFilePath(filePath: string): void {
  const fileName = basename(filePath);
  if (fileName.endsWith(REQUIRED_TREE_FILENAME_SUFFIX)) {
    return;
  }
  throw new CliError(
    'SCHEMA_INVALID',
    `tree file name must end with '${REQUIRED_TREE_FILENAME_SUFFIX}': ${filePath}`,
    `use --file /path/to/your-${REQUIRED_TREE_FILENAME_SUFFIX}`
  );
}

export function resolveTreePath(options: ResolvePathOptions = {}): string {
  const resolvedPath = options.filePath ? resolve(options.filePath) : (() => {
    const preferredDirExists = options.preferredDirExists ?? existsSync;
    if (preferredDirExists(PREFERRED_DEFAULT_TREE_DIR)) {
      return join(PREFERRED_DEFAULT_TREE_DIR, DEFAULT_TREE_FILENAME);
    }
    return resolve(DEFAULT_TREE_FILENAME);
  })();

  assertValidTreeFilePath(resolvedPath);
  return resolvedPath;
}

export function getLockPath(filePath: string): string {
  return `${filePath}.lock`;
}

export function snapshotDir(filePath: string): string {
  return join(dirname(filePath), '.snapshot');
}

export function createInitialTree(now: Date = new Date()): TreeFile {
  const ts = now.getTime() / 1000;
  return {
    [ROOT_ID]: {
      id: ROOT_ID,
      parent: null,
      children: [],
      created_at: ts,
      summary: NOVIX_ROOT_SUMMARY,
      description: NOVIX_ROOT_DESCRIPTION,
      references: []
    }
  };
}

export async function readTree(filePath: string): Promise<TreeFile> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    const validated = treeSchema.safeParse(parsed);
    if (!validated.success) {
      throw new CliError('SCHEMA_INVALID', 'tree file schema is invalid', validated.error.message);
    }
    const novixErrors = collectNovixTreeErrors(validated.data);
    if (novixErrors.length > 0) {
      throw new CliError('SCHEMA_INVALID', 'tree file schema is invalid', novixErrors.join('; '));
    }
    return validated.data;
  } catch (err) {
    if (isNodeErrorWithCode(err) && err.code === 'ENOENT') {
      throw new CliError('FILE_NOT_FOUND', `tree file not found: ${filePath}`, 'run `treejson init` first');
    }
    if (err instanceof CliError) {
      throw err;
    }
    if (err instanceof SyntaxError) {
      throw new CliError('SCHEMA_INVALID', 'tree file is not valid JSON', err.message);
    }
    throw err;
  }
}

export async function writeTreeAtomic(filePath: string, tree: TreeFile): Promise<void> {
  const validated = treeSchema.safeParse(tree);
  if (!validated.success) {
    throw new CliError('SCHEMA_INVALID', 'tree object is invalid', validated.error.message);
  }
  const novixErrors = collectNovixTreeErrors(validated.data);
  if (novixErrors.length > 0) {
    throw new CliError('SCHEMA_INVALID', 'tree object is invalid', novixErrors.join('; '));
  }

  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, JSON.stringify(validated.data, null, 2), 'utf-8');
  await rename(tempPath, filePath);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch (err) {
    if (isNodeErrorWithCode(err) && err.code === 'ENOENT') {
      return false;
    }
    throw err;
  }
}

export async function removeFileIfExists(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}
