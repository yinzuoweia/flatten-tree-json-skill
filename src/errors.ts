import type { ErrorCode } from './types.js';

export class CliError extends Error {
  readonly code: ErrorCode;
  readonly hint?: string;

  constructor(code: ErrorCode, message: string, hint?: string) {
    super(message);
    this.code = code;
    this.hint = hint;
  }
}

export function isNodeErrorWithCode(err: unknown): err is NodeJS.ErrnoException {
  return Boolean(err && typeof err === 'object' && 'code' in err);
}
