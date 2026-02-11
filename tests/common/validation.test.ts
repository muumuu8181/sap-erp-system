import { z } from 'zod';
import { validateBody, validateQuery, validateParams } from '../../src/middleware/validation';
import { ValidationError } from '../../src/middleware/error';

describe('Validation Middleware', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = {
      body: {},
      params: {},
      query: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateBody', () => {
    const testSchema = z.object({
      name: z.string().min(1, 'Name is required'),
      email: z.string().email('Invalid email'),
      age: z.number().min(0, 'Age must be positive').optional(),
    });

    it('should pass validation for valid data', async () => {
      mockReq.body = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const middleware = validateBody(testSchema);
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should reject invalid data with ValidationError', async () => {
      mockReq.body = {
        name: '',
        email: 'invalid-email',
        age: -5,
      };

      const middleware = validateBody(testSchema);

      try {
        await middleware(mockReq, mockRes, mockNext);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
      }

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle missing required fields', async () => {
      mockReq.body = {
        email: 'test@example.com',
      };

      const middleware = validateBody(testSchema);

      try {
        await middleware(mockReq, mockRes, mockNext);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
      }

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle validation errors in nested objects', async () => {
      const nestedSchema = z.object({
        user: z.object({
          name: z.string().min(1),
          contact: z.object({
            email: z.string().email(),
          }),
        }),
      });

      mockReq.body = {
        user: {
          name: '',
          contact: {
            email: 'invalid',
          },
        },
      };

      const middleware = validateBody(nestedSchema);

      try {
        await middleware(mockReq, mockRes, mockNext);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
      }

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle array validation', async () => {
      const arraySchema = z.object({
        items: z.array(z.object({
          productId: z.string(),
          quantity: z.number().min(1),
        })).min(1, 'At least one item required'),
      });

      mockReq.body = {
        items: [
          { productId: 'p1', quantity: 10 },
          { productId: 'p2', quantity: -5 },
        ],
      };

      const middleware = validateBody(arraySchema);

      try {
        await middleware(mockReq, mockRes, mockNext);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
      }

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should pass with optional fields omitted', async () => {
      const schema = z.object({
        required: z.string(),
        optional: z.string().optional(),
        nullable: z.string().nullable(),
      });

      mockReq.body = {
        required: 'value',
        nullable: null,
      };

      const middleware = validateBody(schema);
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle enum validation', async () => {
      const enumSchema = z.object({
        status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']),
      });

      mockReq.body = {
        status: 'INVALID',
      };

      const middleware = validateBody(enumSchema);

      try {
        await middleware(mockReq, mockRes, mockNext);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
      }

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle refinement validation', async () => {
      const refinedSchema = z.object({
        password: z.string().min(8),
        confirmPassword: z.string(),
      }).refine(data => data.password === data.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      });

      mockReq.body = {
        password: 'password123',
        confirmPassword: 'different',
      };

      const middleware = validateBody(refinedSchema);

      try {
        await middleware(mockReq, mockRes, mockNext);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
      }

      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateQuery', () => {
    const querySchema = z.object({
      limit: z.string().transform(val => parseInt(val, 10)),
      offset: z.string().transform(val => parseInt(val, 10)).optional(),
    });

    it('should validate query parameters', async () => {
      mockReq.query = {
        limit: '10',
        offset: '5',
      };

      const middleware = validateQuery(querySchema);
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject invalid query parameters', async () => {
      mockReq.query = {
        limit: -1, // 負の値
      };

      const middleware = validateQuery(querySchema);

      let errorThrown = false;
      try {
        await middleware(mockReq, mockRes, mockNext);
      } catch (error) {
        errorThrown = true;
        expect(error).toBeInstanceOf(ValidationError);
      }

      expect(errorThrown).toBe(true);
    });
  });

  describe('validateParams', () => {
    const paramsSchema = z.object({
      id: z.string().uuid('Invalid ID format'),
    });

    it('should validate path parameters', async () => {
      mockReq.params = {
        id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const middleware = validateParams(paramsSchema);
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject invalid path parameters', async () => {
      mockReq.params = {
        id: 'invalid-id',
      };

      const middleware = validateParams(paramsSchema);

      try {
        await middleware(mockReq, mockRes, mockNext);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
      }

      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
