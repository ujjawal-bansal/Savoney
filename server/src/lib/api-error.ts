/**
 * The one error type the application throws deliberately.
 *
 * Carrying an HTTP status and a stable machine-readable `code` on the error
 * means route handlers can fail by throwing, and a single error middleware
 * decides how it reaches the client. Anything that is *not* an ApiError is
 * treated as an unexpected fault and never has its message shown to a user.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string[]>;
  /** Distinguishes faults we anticipated from genuine bugs, for log severity. */
  readonly isOperational = true;

  constructor(status: number, message: string, code: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (details) this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message: string, details?: Record<string, string[]>): ApiError {
    return new ApiError(400, message, 'BAD_REQUEST', details);
  }

  static validation(details: Record<string, string[]>): ApiError {
    return new ApiError(422, 'The submitted data failed validation', 'VALIDATION_FAILED', details);
  }

  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message = 'You do not have access to this resource'): ApiError {
    return new ApiError(403, message, 'FORBIDDEN');
  }

  static notFound(resource = 'Resource'): ApiError {
    return new ApiError(404, `${resource} not found`, 'NOT_FOUND');
  }

  static conflict(message: string, code = 'CONFLICT'): ApiError {
    return new ApiError(409, message, code);
  }

  static tooManyRequests(message = 'Too many requests. Please slow down.'): ApiError {
    return new ApiError(429, message, 'RATE_LIMITED');
  }

  static internal(message = 'Something went wrong on our end'): ApiError {
    return new ApiError(500, message, 'INTERNAL_ERROR');
  }
}
