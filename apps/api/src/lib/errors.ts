import type { ErrorHandler } from 'hono';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const handleError: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json(
      {
        error: err.code || err.name,
        message: err.message,
        details: err.details,
      },
      err.statusCode as any,
    );
  }

  // Handle other unexpected errors
  console.error('Unhandled API Error:', err);
  return c.json(
    {
      error: 'InternalServerError',
      message: err.message || 'An unexpected error occurred',
    },
    500,
  );
};
