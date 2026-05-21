#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'node:module';
import { CliError } from './errors.js';
import { resolveTreePath } from './storage.js';
import {
  addNode,
  applyBulkFromOpsFile,
  createSnapshot,
  deleteNode,
  findNodes,
  getNode,
  initTree,
  listChildren,
  moveNode,
  parseSetPairs,
  restoreSnapshot,
  updateNode,
  upsertNode,
  validateTree
} from './api.js';
import type { ErrorEnvelope, SuccessEnvelope } from './types.js';

const require = createRequire(import.meta.url);
const { version: packageVersion } = require('../package.json') as { version: string };

const EXIT_MAP: Record<string, number> = {
  FILE_NOT_FOUND: 2,
  SCHEMA_INVALID: 3,
  NODE_NOT_FOUND: 4,
  NODE_ID_CONFLICT: 5,
  ROOT_IMMUTABLE: 6,
  DELETE_CONFIRM_REQUIRED: 7,
  CYCLE_DETECTED: 8,
  LOCK_TIMEOUT: 9
};

function outputSuccess<T>(action: string, file: string, result: T, warnings: string[] = []): void {
  const payload: SuccessEnvelope<T> = {
    ok: true,
    action,
    file,
    result,
    warnings
  };
  console.log(JSON.stringify(payload));
}

function outputError(action: string, err: unknown): never {
  if (err instanceof CliError) {
    const payload: ErrorEnvelope = {
      ok: false,
      action,
      error: {
        code: err.code,
        message: err.message,
        hint: err.hint
      }
    };
    console.error(JSON.stringify(payload));
    process.exit(EXIT_MAP[err.code] ?? 1);
  }

  const message = err instanceof Error ? err.message : String(err);
  const payload: ErrorEnvelope = {
    ok: false,
    action,
    error: {
      code: 'UNKNOWN',
      message
    }
  };
  console.error(JSON.stringify(payload));
  process.exit(1);
}

function outputFile(filePath?: string): string {
  return filePath ?? resolveTreePath();
}

const fileOptionDescription =
  'path to tree file (defaults to /home/novix/workspace/project/novix-idea-tree.json or ./novix-idea-tree.json; file name must end with idea-tree.json)';

const topLevelDescription = [
  'treejson CLI for Novix fixed-schema nodes',
  '',
  'Node schema:',
  '  summary: string',
  '  description: string',
  '  references: string[]'
].join('\n');

const program = new Command();
program
  .name('treejson')
  .description(topLevelDescription)
  .version(packageVersion);

program
  .command('init')
  .description('Initialize a tree with a fixed-schema root node.')
  .option('--file <path>', fileOptionDescription)
  .option('--force', 'overwrite existing tree')
  .action(async (opts) => {
    try {
      const result = await initTree(opts.file, { force: Boolean(opts.force) });
      outputSuccess('init', result.file, result);
    } catch (err) {
      outputError('init', err);
    }
  });

program
  .command('add')
  .description('Add a node. Allowed business fields: summary, description, references.')
  .requiredOption('--set <pair...>', 'key=value pairs')
  .addHelpText('after', '\nAllowed fields: summary, description, references\nMissing fields default to empty values.')
  .option('--file <path>', fileOptionDescription)
  .option('--parent <id>')
  .option('--id <id>')
  .action(async (opts) => {
    try {
      const result = await addNode(opts.file, {
        parent: opts.parent,
        id: opts.id,
        set: parseSetPairs(opts.set)
      });
      outputSuccess('add', outputFile(opts.file), result);
    } catch (err) {
      outputError('add', err);
    }
  });

program
  .command('get')
  .argument('<id>')
  .description('Get a node.')
  .option('--file <path>', fileOptionDescription)
  .action(async (id, opts) => {
    try {
      const result = await getNode(opts.file, id);
      outputSuccess('get', outputFile(opts.file), result);
    } catch (err) {
      outputError('get', err);
    }
  });

program
  .command('ls')
  .argument('[parentId]')
  .description('List child nodes under a parent.')
  .option('--file <path>', fileOptionDescription)
  .option('--max <n>', 'limit', (v) => Number(v))
  .action(async (parentId, opts) => {
    try {
      const result = await listChildren(opts.file, parentId, opts.max);
      outputSuccess('ls', outputFile(opts.file), result);
    } catch (err) {
      outputError('ls', err);
    }
  });

program
  .command('update')
  .argument('<id>')
  .description('Update summary, description, or references while preserving the fixed schema.')
  .addHelpText('after', '\nAllowed fields: summary, description, references')
  .option('--file <path>', fileOptionDescription)
  .option('--set <pair...>')
  .option('--unset <key...>')
  .action(async (id, opts) => {
    try {
      const result = await updateNode(opts.file, id, {
        set: parseSetPairs(opts.set ?? []),
        unset: opts.unset ?? []
      });
      outputSuccess('update', outputFile(opts.file), result);
    } catch (err) {
      outputError('update', err);
    }
  });

program
  .command('delete')
  .argument('<id>')
  .description('Preview or delete a node.')
  .option('--file <path>', fileOptionDescription)
  .option('--cascade', 'cascade delete')
  .option('--no-cascade', 'disable cascade delete')
  .option('--yes', 'confirm delete')
  .action(async (id, opts) => {
    try {
      const result = await deleteNode(opts.file, id, { cascade: opts.cascade !== false, yes: Boolean(opts.yes) });
      outputSuccess(opts.yes ? 'delete' : 'delete_preview', outputFile(opts.file), result);
    } catch (err) {
      outputError('delete', err);
    }
  });

program
  .command('move')
  .argument('<id>')
  .requiredOption('--to <id>')
  .description('Move a node within the tree.')
  .option('--file <path>', fileOptionDescription)
  .action(async (id, opts) => {
    try {
      const result = await moveNode(opts.file, id, opts.to);
      outputSuccess('move', outputFile(opts.file), result);
    } catch (err) {
      outputError('move', err);
    }
  });

program
  .command('find')
  .argument('<query>')
  .description('Search nodes in the tree.')
  .option('--file <path>', fileOptionDescription)
  .option('--max <n>', 'limit', (v) => Number(v))
  .option('--sort <spec>')
  .option('--fields <csv>')
  .action(async (query, opts) => {
    try {
      const fields = typeof opts.fields === 'string' ? opts.fields.split(',').map((f: string) => f.trim()).filter(Boolean) : undefined;
      const result = await findNodes(opts.file, query, {
        max: opts.max,
        sort: opts.sort,
        fields
      });
      outputSuccess('find', outputFile(opts.file), result);
    } catch (err) {
      outputError('find', err);
    }
  });

program
  .command('validate')
  .description('Validate tree structure and fixed node schema. Incomplete node content is reported as warnings.')
  .addHelpText('after', '\nRoot references may be empty. Non-root empty references are reported as warnings.')
  .option('--file <path>', fileOptionDescription)
  .action(async (opts) => {
    try {
      const result = await validateTree(opts.file);
      outputSuccess('validate', outputFile(opts.file), result, result.warnings);
    } catch (err) {
      outputError('validate', err);
    }
  });

program
  .command('upsert')
  .description('Create or update a node. Allowed business fields: summary, description, references.')
  .requiredOption('--id <id>')
  .requiredOption('--set <pair...>')
  .option('--parent <id>')
  .addHelpText('after', '\nAllowed fields: summary, description, references\nMissing fields default to empty values.')
  .option('--file <path>', fileOptionDescription)
  .action(async (opts) => {
    try {
      const result = await upsertNode(opts.file, {
        id: opts.id,
        parent: opts.parent,
        set: parseSetPairs(opts.set)
      });
      outputSuccess('upsert', outputFile(opts.file), result);
    } catch (err) {
      outputError('upsert', err);
    }
  });

program
  .command('bulk')
  .description('Apply bulk mutations to the tree.')
  .requiredOption('--ops-file <path>')
  .option('--file <path>', fileOptionDescription)
  .option('--atomic', 'enable atomic rollback')
  .option('--no-atomic', 'disable atomic rollback')
  .action(async (opts) => {
    try {
      const result = await applyBulkFromOpsFile(opts.file, { opsFile: opts.opsFile, atomic: opts.atomic !== false });
      outputSuccess('bulk', outputFile(opts.file), result);
    } catch (err) {
      outputError('bulk', err);
    }
  });

const snapshot = program.command('snapshot');

snapshot
  .command('create')
  .description('Create a snapshot of the current tree.')
  .option('--file <path>', fileOptionDescription)
  .option('--name <name>')
  .action(async (opts) => {
    try {
      const result = await createSnapshot(opts.file, opts.name);
      outputSuccess('snapshot_create', outputFile(opts.file), result);
    } catch (err) {
      outputError('snapshot_create', err);
    }
  });

snapshot
  .command('restore')
  .argument('<snapshotId>')
  .description('Restore the tree from a snapshot.')
  .option('--file <path>', fileOptionDescription)
  .action(async (snapshotId, opts) => {
    try {
      const result = await restoreSnapshot(opts.file, snapshotId);
      outputSuccess('snapshot_restore', outputFile(opts.file), result);
    } catch (err) {
      outputError('snapshot_restore', err);
    }
  });

await program.parseAsync(process.argv);
