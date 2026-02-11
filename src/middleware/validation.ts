import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { ValidationError } from './error';

export const validate =
  (schema: ZodSchema) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        throw new ValidationError(JSON.stringify(errors));
      }
      next(error);
    }
  };

export const validateBody = (schema: ZodSchema) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    req.body = await schema.parseAsync(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      throw new ValidationError(JSON.stringify(errors));
    }
    next(error);
  }
};

export const validateQuery = (schema: ZodSchema) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    req.query = await schema.parseAsync(req.query);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      throw new ValidationError(JSON.stringify(errors));
    }
    next(error);
  }
};

export const validateParams = (schema: ZodSchema) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    req.params = await schema.parseAsync(req.params);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      throw new ValidationError(JSON.stringify(errors));
    }
    next(error);
  }
};

// Common validation schemas
export const uuidSchema = z.string().uuid();

export const paginationSchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 10),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export default {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  uuidSchema,
  paginationSchema,
  dateRangeSchema,
};
