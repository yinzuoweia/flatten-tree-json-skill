export const ROOT_ID = 'root';

export const RESERVED_FIELDS = new Set([
  'id',
  'parent',
  'children',
  'created_at'
]);

export type ErrorCode =
  | 'FILE_NOT_FOUND'
  | 'SCHEMA_INVALID'
  | 'NODE_NOT_FOUND'
  | 'NODE_ID_CONFLICT'
  | 'ROOT_IMMUTABLE'
  | 'DELETE_CONFIRM_REQUIRED'
  | 'CYCLE_DETECTED'
  | 'LOCK_TIMEOUT';

export type TreeNode = {
  id: string;
  parent: string | null;
  children: string[];
  created_at: number;
  [key: string]: unknown;
};

export type TreeFile = Record<string, TreeNode>;

export type QueryComparator = '>' | '>=' | '<' | '<=';

export type QueryFilter =
  | { kind: 'field'; key: string; value: string }
  | { kind: 'compare'; key: string; op: QueryComparator; value: string }
  | { kind: 'relative'; key: 'created_at'; direction: 'newer' | 'older'; ms: number };

export type ParsedQuery = {
  terms: string[];
  filters: QueryFilter[];
};

export type SuccessEnvelope<T> = {
  ok: true;
  action: string;
  file: string;
  result: T;
  warnings: string[];
};

export type ErrorEnvelope = {
  ok: false;
  action: string;
  error: {
    code: ErrorCode | 'UNKNOWN';
    message: string;
    hint?: string;
  };
};
