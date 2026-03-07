#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'node:module';
import { CliError } from './errors.js';
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
  parseSparkExpression,
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

const program = new Command();
program.name('nis').description('NIS CLI for JSON tree operations').version(packageVersion);

program
  .command('init')
  .option('--file <path>')
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
  .requiredOption('--set <pair...>', 'key=value pairs')
  .option('--file <path>')
  .option('--parent <id>')
  .option('--id <id>')
  .action(async (opts) => {
    try {
      const result = await addNode(opts.file, {
        parent: opts.parent,
        id: opts.id,
        set: parseSetPairs(opts.set)
      });
      outputSuccess('add', opts.file ?? '.nis/tree.json', result);
    } catch (err) {
      outputError('add', err);
    }
  });

program
  .command('get')
  .argument('<id>')
  .option('--file <path>')
  .action(async (id, opts) => {
    try {
      const result = await getNode(opts.file, id);
      outputSuccess('get', opts.file ?? '.nis/tree.json', result);
    } catch (err) {
      outputError('get', err);
    }
  });

program
  .command('ls')
  .argument('[parentId]')
  .option('--file <path>')
  .option('--max <n>', 'limit', (v) => Number(v))
  .action(async (parentId, opts) => {
    try {
      const result = await listChildren(opts.file, parentId, opts.max);
      outputSuccess('ls', opts.file ?? '.nis/tree.json', result);
    } catch (err) {
      outputError('ls', err);
    }
  });

program
  .command('update')
  .argument('<id>')
  .option('--file <path>')
  .option('--set <pair...>')
  .option('--unset <key...>')
  .action(async (id, opts) => {
    try {
      const result = await updateNode(opts.file, id, {
        set: parseSetPairs(opts.set ?? []),
        unset: opts.unset ?? []
      });
      outputSuccess('update', opts.file ?? '.nis/tree.json', result);
    } catch (err) {
      outputError('update', err);
    }
  });

program
  .command('delete')
  .argument('<id>')
  .option('--file <path>')
  .option('--cascade', 'cascade delete')
  .option('--no-cascade', 'disable cascade delete')
  .option('--yes', 'confirm delete')
  .action(async (id, opts) => {
    try {
      const result = await deleteNode(opts.file, id, { cascade: opts.cascade !== false, yes: Boolean(opts.yes) });
      outputSuccess(opts.yes ? 'delete' : 'delete_preview', opts.file ?? '.nis/tree.json', result);
    } catch (err) {
      outputError('delete', err);
    }
  });

program
  .command('move')
  .argument('<id>')
  .requiredOption('--to <id>')
  .option('--file <path>')
  .action(async (id, opts) => {
    try {
      const result = await moveNode(opts.file, id, opts.to);
      outputSuccess('move', opts.file ?? '.nis/tree.json', result);
    } catch (err) {
      outputError('move', err);
    }
  });

program
  .command('find')
  .argument('<query>')
  .option('--file <path>')
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
      outputSuccess('find', opts.file ?? '.nis/tree.json', result);
    } catch (err) {
      outputError('find', err);
    }
  });

program
  .command('validate')
  .option('--file <path>')
  .action(async (opts) => {
    try {
      const result = await validateTree(opts.file);
      outputSuccess('validate', opts.file ?? '.nis/tree.json', result, result.warnings);
    } catch (err) {
      outputError('validate', err);
    }
  });

program
  .command('upsert')
  .requiredOption('--id <id>')
  .requiredOption('--set <pair...>')
  .option('--parent <id>')
  .option('--file <path>')
  .action(async (opts) => {
    try {
      const result = await upsertNode(opts.file, {
        id: opts.id,
        parent: opts.parent,
        set: parseSetPairs(opts.set)
      });
      outputSuccess('upsert', opts.file ?? '.nis/tree.json', result);
    } catch (err) {
      outputError('upsert', err);
    }
  });

program
  .command('bulk')
  .requiredOption('--ops-file <path>')
  .option('--file <path>')
  .option('--atomic', 'enable atomic rollback')
  .option('--no-atomic', 'disable atomic rollback')
  .action(async (opts) => {
    try {
      const result = await applyBulkFromOpsFile(opts.file, { opsFile: opts.opsFile, atomic: opts.atomic !== false });
      outputSuccess('bulk', opts.file ?? '.nis/tree.json', result);
    } catch (err) {
      outputError('bulk', err);
    }
  });

const snapshot = program.command('snapshot');

snapshot
  .command('create')
  .option('--file <path>')
  .option('--name <name>')
  .action(async (opts) => {
    try {
      const result = await createSnapshot(opts.file, opts.name);
      outputSuccess('snapshot_create', opts.file ?? '.nis/tree.json', result);
    } catch (err) {
      outputError('snapshot_create', err);
    }
  });

snapshot
  .command('restore')
  .argument('<snapshotId>')
  .option('--file <path>')
  .action(async (snapshotId, opts) => {
    try {
      const result = await restoreSnapshot(opts.file, snapshotId);
      outputSuccess('snapshot_restore', opts.file ?? '.nis/tree.json', result);
    } catch (err) {
      outputError('snapshot_restore', err);
    }
  });

const spark = program.command('spark').description('natural-language style aliases');

spark
  .command('search')
  .argument('<query>')
  .option('--file <path>')
  .option('--max <n>', 'limit', (v) => Number(v))
  .option('--sort <spec>')
  .action(async (query, opts) => {
    try {
      const result = await findNodes(opts.file, query, {
        max: opts.max,
        sort: opts.sort
      });
      outputSuccess('find', opts.file ?? '.nis/tree.json', result);
    } catch (err) {
      outputError('find', err);
    }
  });

spark
  .command('add')
  .argument('<expression>')
  .argument('[underKeyword]')
  .argument('[parentId]')
  .option('--file <path>')
  .option('--id <id>')
  .action(async (expression, underKeyword, parentId, opts) => {
    try {
      if (underKeyword && underKeyword !== 'under') {
        throw new CliError('SCHEMA_INVALID', `expected keyword 'under', got '${underKeyword}'`);
      }
      const result = await addNode(opts.file, {
        parent: parentId ?? 'root',
        id: opts.id,
        set: parseSparkExpression(expression)
      });
      outputSuccess('add', opts.file ?? '.nis/tree.json', result);
    } catch (err) {
      outputError('add', err);
    }
  });

spark
  .command('delete')
  .argument('<id>')
  .option('--file <path>')
  .option('--yes')
  .action(async (id, opts) => {
    try {
      const result = await deleteNode(opts.file, id, {
        cascade: true,
        yes: Boolean(opts.yes)
      });
      outputSuccess(opts.yes ? 'delete' : 'delete_preview', opts.file ?? '.nis/tree.json', result);
    } catch (err) {
      outputError('delete', err);
    }
  });

await program.parseAsync(process.argv);
