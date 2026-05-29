import { CliError } from './errors.js';
import { RESERVED_FIELDS, ROOT_ID, type TreeFile, type TreeNode } from './types.js';

export const NOVIX_BRANCH_MODES = ['execution', 'inquiry', 'signal', 'memory', 'strategy'] as const;
export const NOVIX_GROWTH_POSTURES = ['converge', 'deepen', 'branch', 'connect', 'preserve', 'quiet'] as const;
export const NOVIX_NEXT_ACTION_STYLES = [
  'implement',
  'validate',
  'compare',
  'frame',
  'synthesize',
  'probe_signal',
  'find_counterexample',
  'preserve_context'
] as const;

export const NOVIX_MUTABLE_FIELDS = [
  'summary',
  'description',
  'next_action',
  'references',
  'branch_mode',
  'growth_posture',
  'next_action_style'
] as const;

const NOVIX_MUTABLE_FIELD_SET = new Set<string>(NOVIX_MUTABLE_FIELDS);
const NOVIX_ALLOWED_FIELD_SET = new Set<string>([...RESERVED_FIELDS, ...NOVIX_MUTABLE_FIELDS]);
const NOVIX_BRANCH_MODE_SET = new Set<string>(NOVIX_BRANCH_MODES);
const NOVIX_GROWTH_POSTURE_SET = new Set<string>(NOVIX_GROWTH_POSTURES);
const NOVIX_NEXT_ACTION_STYLE_SET = new Set<string>(NOVIX_NEXT_ACTION_STYLES);
export const NOVIX_ALLOWED_FIELDS_HELP = 'allowed fields: summary, description, next_action, references, branch_mode, growth_posture, next_action_style';

export const NOVIX_ROOT_SUMMARY = 'Novix idea tree';
export const NOVIX_ROOT_DESCRIPTION = 'Root node for Novix idea exploration.';
export const NOVIX_ROOT_NEXT_ACTION = 'Use child nodes as actionable follow-up ideas.';
export const NOVIX_DEFAULT_BRANCH_MODE = 'execution';
export const NOVIX_DEFAULT_GROWTH_POSTURE = 'converge';
export const NOVIX_DEFAULT_NEXT_ACTION_STYLE = 'implement';
export const NOVIX_ROOT_BRANCH_MODE = 'strategy';
export const NOVIX_ROOT_GROWTH_POSTURE = 'preserve';
export const NOVIX_ROOT_NEXT_ACTION_STYLE = 'frame';

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
    next_action: '',
    references: [],
    branch_mode: NOVIX_DEFAULT_BRANCH_MODE,
    growth_posture: NOVIX_DEFAULT_GROWTH_POSTURE,
    next_action_style: NOVIX_DEFAULT_NEXT_ACTION_STYLE,
    ...input
  };
}

export function assertOnlyNovixMutableFields(input: Record<string, unknown>): void {
  for (const key of Object.keys(input)) {
    if (!NOVIX_MUTABLE_FIELD_SET.has(key)) {
      throw new CliError(
        'SCHEMA_INVALID',
        `field '${key}' is not allowed in novix nodes`,
        NOVIX_ALLOWED_FIELDS_HELP
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
        NOVIX_ALLOWED_FIELDS_HELP
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

  if (!hasOwn(node, 'next_action')) {
    errors.push(`node '${nodeId}' must define next_action`);
  } else if (!hasString(node.next_action)) {
    errors.push(`node '${nodeId}' next_action must be a string`);
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

  if (!hasOwn(node, 'branch_mode')) {
    errors.push(`node '${nodeId}' must define branch_mode`);
  } else if (!hasString(node.branch_mode)) {
    errors.push(`node '${nodeId}' branch_mode must be a string`);
  } else if (!NOVIX_BRANCH_MODE_SET.has(node.branch_mode)) {
    errors.push(`node '${nodeId}' branch_mode must be one of: ${NOVIX_BRANCH_MODES.join(', ')}`);
  }

  if (!hasOwn(node, 'growth_posture')) {
    errors.push(`node '${nodeId}' must define growth_posture`);
  } else if (!hasString(node.growth_posture)) {
    errors.push(`node '${nodeId}' growth_posture must be a string`);
  } else if (!NOVIX_GROWTH_POSTURE_SET.has(node.growth_posture)) {
    errors.push(`node '${nodeId}' growth_posture must be one of: ${NOVIX_GROWTH_POSTURES.join(', ')}`);
  }

  if (!hasOwn(node, 'next_action_style')) {
    errors.push(`node '${nodeId}' must define next_action_style`);
  } else if (!hasString(node.next_action_style)) {
    errors.push(`node '${nodeId}' next_action_style must be a string`);
  } else if (!NOVIX_NEXT_ACTION_STYLE_SET.has(node.next_action_style)) {
    errors.push(`node '${nodeId}' next_action_style must be one of: ${NOVIX_NEXT_ACTION_STYLES.join(', ')}`);
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

  if (hasOwn(node, 'next_action') && hasString(node.next_action) && !hasNonEmptyString(node.next_action)) {
    warnings.push(`node '${nodeId}' has empty next_action`);
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
