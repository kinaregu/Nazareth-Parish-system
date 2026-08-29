/**
 * @nazareth/core — API error type.
 * Controllers map ApiError → consistent JSON: { error: { code, message, details? } }
 * Internal/technical errors never leak to the client (500 + generic message).
 */

export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static validation(message: string, details?: unknown) {
    return new ApiError(422, 'VALIDATION', message, details);
  }
  static unauthorized(message = 'Please sign in to continue.') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have permission to perform this action.') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'The record you are looking for was not found.') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string) {
    return new ApiError(409, 'CONFLICT', message);
  }
  static rateLimited(message = 'Too many attempts. Please try again later.') {
    return new ApiError(429, 'RATE_LIMITED', message);
  }
}

/** Wraps unknown thrown values into an ApiError (500) for safe client response. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const e = err as { message?: string };
  // Never expose raw driver errors to clients.
  return new ApiError(500, 'INTERNAL', e?.message ? 'An unexpected error occurred. Please try again.' : 'An unexpected error occurred.');
}
