import type { ParsedQuery, QueryFilter, TreeNode } from './types.js';

const COMPARE_RE = /^([^:<>!=\s]+)(>=|<=|>|<)(.+)$/;
const FIELD_RE = /^([^:<>!=\s]+):(.+)$/;

function tokenize(query: string): string[] {
  return query.match(/"[^"]+"|'[^']+'|\S+/g) ?? [];
}

function stripQuotes(raw: string): string {
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}

export function parseDurationToMs(raw: string): number {
  const match = raw.trim().match(/^(\d+)([smhdw])$/i);
  if (!match) {
    return Number.NaN;
  }
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const map: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000
  };
  return value * map[unit];
}

export function parseQuery(query: string): ParsedQuery {
  const terms: string[] = [];
  const filters: QueryFilter[] = [];

  for (const tokenRaw of tokenize(query)) {
    const token = stripQuotes(tokenRaw);
    const lower = token.toLowerCase();

    if (lower.startsWith('newer_than:')) {
      const ms = parseDurationToMs(token.slice('newer_than:'.length));
      if (!Number.isNaN(ms)) {
        filters.push({ kind: 'relative', key: 'created_at', direction: 'newer', ms });
        continue;
      }
    }

    if (lower.startsWith('older_than:')) {
      const ms = parseDurationToMs(token.slice('older_than:'.length));
      if (!Number.isNaN(ms)) {
        filters.push({ kind: 'relative', key: 'created_at', direction: 'older', ms });
        continue;
      }
    }

    const compare = token.match(COMPARE_RE);
    if (compare) {
      filters.push({
        kind: 'compare',
        key: compare[1],
        op: compare[2] as '>' | '>=' | '<' | '<=',
        value: compare[3]
      });
      continue;
    }

    const field = token.match(FIELD_RE);
    if (field) {
      filters.push({ kind: 'field', key: field[1], value: field[2] });
      continue;
    }

    terms.push(token);
  }

  return { terms, filters };
}

function toComparable(value: unknown): number | string {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const date = Date.parse(value);
    if (!Number.isNaN(date)) {
      return date;
    }
    const num = Number(value);
    if (!Number.isNaN(num)) {
      return num;
    }
    return value.toLowerCase();
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  return String(value).toLowerCase();
}

function compareValues(left: unknown, rightRaw: string, op: '>' | '>=' | '<' | '<='): boolean {
  const leftComp = toComparable(left);
  const rightComp = toComparable(rightRaw);

  if (typeof leftComp === 'number' && typeof rightComp === 'number') {
    switch (op) {
      case '>':
        return leftComp > rightComp;
      case '>=':
        return leftComp >= rightComp;
      case '<':
        return leftComp < rightComp;
      case '<=':
        return leftComp <= rightComp;
      default:
        return false;
    }
  }

  const leftStr = String(leftComp);
  const rightStr = String(rightComp);
  switch (op) {
    case '>':
      return leftStr > rightStr;
    case '>=':
      return leftStr >= rightStr;
    case '<':
      return leftStr < rightStr;
    case '<=':
      return leftStr <= rightStr;
    default:
      return false;
  }
}

export function matchesNode(node: TreeNode, parsed: ParsedQuery, now: Date = new Date()): boolean {
  const blob = Object.values(node)
    .map((v) => (typeof v === 'string' ? v : ''))
    .join(' ')
    .toLowerCase();

  for (const term of parsed.terms) {
    if (!blob.includes(term.toLowerCase())) {
      return false;
    }
  }

  for (const filter of parsed.filters) {
    if (filter.kind === 'field') {
      const value = node[filter.key];
      if (value === undefined || value === null) {
        return false;
      }
      if (Array.isArray(value)) {
        const found = value.some((item) => String(item).toLowerCase().includes(filter.value.toLowerCase()));
        if (!found) {
          return false;
        }
      } else if (!String(value).toLowerCase().includes(filter.value.toLowerCase())) {
        return false;
      }
      continue;
    }

    if (filter.kind === 'compare') {
      const value = node[filter.key];
      if (value === undefined || !compareValues(value, filter.value, filter.op)) {
        return false;
      }
      continue;
    }

    const created = Number(node.created_at);
    if (Number.isNaN(created)) {
      return false;
    }
    const threshold = now.getTime() - filter.ms;
    const createdMs = created * 1000;
    if (filter.direction === 'newer' && !(createdMs >= threshold)) {
      return false;
    }
    if (filter.direction === 'older' && !(createdMs <= threshold)) {
      return false;
    }
  }

  return true;
}
