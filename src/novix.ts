import { CliError } from './errors.js';
import { RESERVED_FIELDS, ROOT_ID, type TreeFile, type TreeNode } from './types.js';

export const NOVIX_MUTABLE_FIELDS = ['summary', 'description', 'references'] as const;

const NOVIX_MUTABLE_FIELD_SET = new Set<string>(NOVIX_MUTABLE_FIELDS);
const NOVIX_ALLOWED_FIELD_SET = new Set<string>([...RESERVED_FIELDS, ...NOVIX_MUTABLE_FIELDS]);

export const NOVIX_ROOT_SUMMARY = 'Novix idea tree';
export const NOVIX_ROOT_DESCRIPTION = 'Root node for Novix idea exploration.';

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasString(value: unknown): value is string {
  return typeof value === 'string';
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function withNovixDefaults(input: Record<string, unknown>): Record<string, unknown> {
  return {
    summary: '',
    description: '',
    references: [],
    ...input
  };
}

export function assertOnlyNovixMutableFields(input: Record<string, unknown>): void {
  for (const key of Object.keys(input)) {
    if (!NOVIX_MUTABLE_FIELD_SET.has(key)) {
      throw new CliError(
        'SCHEMA_INVALID',
        `field '${key}' is not allowed in novix nodes`,
        'allowed fields: summary, description, references'
      );
    }
  }
}

export function assertNovixUnsetAllowed(fields: string[]): void {
  for (const key of fields) {
    if (!NOVIX_MUTABLE_FIELD_SET.has(key)) {
      throw new CliError(
        'SCHEMA_INVALID',
        `field '${key}' is not allowed in novix nodes`,
        'allowed fields: summary, description, references'
      );
    }
    throw new CliError('SCHEMA_INVALID', `field '${key}' is required and cannot be unset`);
  }
}

export function collectNovixNodeErrors(nodeId: string, node: TreeNode): string[] {
  const errors: string[] = [];

  for (const key of Object.keys(node)) {
    if (!NOVIX_ALLOWED_FIELD_SET.has(key)) {
      errors.push(`node '${nodeId}' contains unsupported field '${key}'`);
    }
  }

  if (!hasOwn(node, 'summary')) {
    errors.push(`node '${nodeId}' must define summary`);
  } else if (!hasString(node.summary)) {
    errors.push(`node '${nodeId}' summary must be a string`);
  }

  if (!hasOwn(node, 'description')) {
    errors.push(`node '${nodeId}' must define description`);
  } else if (!hasString(node.description)) {
    errors.push(`node '${nodeId}' description must be a string`);
  }

  if (!hasOwn(node, 'references')) {
    errors.push(`node '${nodeId}' must define references`);
  } else if (!Array.isArray(node.references)) {
    errors.push(`node '${nodeId}' references must be an array of strings`);
  } else {
    const invalidReference = node.references.find((reference) => typeof reference !== 'string' || reference.trim().length === 0);
    if (invalidReference !== undefined) {
      errors.push(`node '${nodeId}' references must contain only non-empty strings`);
    }
  }

  return errors;
}

export function collectNovixTreeErrors(tree: TreeFile): string[] {
  const errors: string[] = [];
  for (const [nodeId, node] of Object.entries(tree)) {
    errors.push(...collectNovixNodeErrors(nodeId, node));
  }
  return errors;
}

export function collectNovixNodeWarnings(nodeId: string, node: TreeNode): string[] {
  const warnings: string[] = [];

  if (hasOwn(node, 'summary') && hasString(node.summary) && !hasNonEmptyString(node.summary)) {
    warnings.push(`node '${nodeId}' has empty summary`);
  }

  if (hasOwn(node, 'description') && hasString(node.description) && !hasNonEmptyString(node.description)) {
    warnings.push(`node '${nodeId}' has empty description`);
  }

  if (nodeId !== ROOT_ID && hasOwn(node, 'references') && Array.isArray(node.references) && node.references.length === 0) {
    warnings.push(`node '${nodeId}' has no references`);
  }

  return warnings;
}

export function collectNovixTreeWarnings(tree: TreeFile): string[] {
  const warnings: string[] = [];
  for (const [nodeId, node] of Object.entries(tree)) {
    warnings.push(...collectNovixNodeWarnings(nodeId, node));
  }
  return warnings;
}

export function assertValidNovixNode(nodeId: string, node: TreeNode): void {
  const errors = collectNovixNodeErrors(nodeId, node);
  if (errors.length > 0) {
    throw new CliError('SCHEMA_INVALID', errors.join('; '));
  }
}
