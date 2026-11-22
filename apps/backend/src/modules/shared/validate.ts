import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema<any>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'validation_failed', details: result.error.flatten() });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('Unhandled error:', err);
  const status = err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'internal_server_error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
