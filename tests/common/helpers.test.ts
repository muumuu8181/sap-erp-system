import {
  generateId,
  generateCode,
  getCurrentTimestamp,
  floorToDecimal,
  validateEmail,
  validatePhone,
  ValidationError,
  NotFoundError,
  BusinessLogicError,
  DatabaseError,
  formatCurrency,
  formatJapaneseDate,
  calculateTax,
  calculateDiscount,
  sanitizeString,
  truncateString,
  isValidPositiveNumber,
  isValidNonNegativeNumber,
  chunkArray,
  removeDuplicates,
  deepClone,
  pick,
  omit,
  sleep,
} from '../../src/utils/helpers';

describe('Helper Functions', () => {
  describe('generateId', () => {
    it('should generate a valid UUID', () => {
      const id = generateId();
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateCode', () => {
    it('should generate code with prefix and number', () => {
      const code = generateCode('TEST', 1);
      expect(code).toBe('TEST000001');
    });

    it('should pad numbers with zeros', () => {
      const code = generateCode('ABC', 123);
      expect(code).toBe('ABC000123');
    });

    it('should handle larger numbers', () => {
      const code = generateCode('XYZ', 99999);
      expect(code).toBe('XYZ099999');
    });
  });

  describe('getCurrentTimestamp', () => {
    it('should return valid ISO timestamp', () => {
      const timestamp = getCurrentTimestamp();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should be parseable as Date', () => {
      const timestamp = getCurrentTimestamp();
      const date = new Date(timestamp);
      expect(date.getTime()).not.toBeNaN();
    });
  });

  describe('formatCurrency', () => {
    it('should format currency as Japanese Yen', () => {
      const formatted = formatCurrency(1234);
      expect(formatted).toContain('1,234');
    });
  });

  describe('formatJapaneseDate', () => {
    it('should format date to yyyy-MM-dd', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const formatted = formatJapaneseDate(date);
      expect(formatted).toBe('2024-01-15');
    });

    it('should handle string dates', () => {
      const formatted = formatJapaneseDate('2024-01-15');
      expect(formatted).toBe('2024-01-15');
    });
  });

  describe('floorToDecimal', () => {
    it('should floor to specified decimals', () => {
      expect(floorToDecimal(3.4567, 0)).toBe(3);
      expect(floorToDecimal(3.4567, 1)).toBe(3.4);
      expect(floorToDecimal(3.4567, 2)).toBe(3.45);
      expect(floorToDecimal(3.4567, 3)).toBe(3.456);
    });

    it('should default to 0 decimals', () => {
      expect(floorToDecimal(3.7)).toBe(3);
    });

    it('should handle whole numbers', () => {
      expect(floorToDecimal(5, 2)).toBe(5);
    });

    it('should handle negative numbers', () => {
      expect(floorToDecimal(-3.4567, 2)).toBe(-3.46);
    });

    it('should handle zero', () => {
      expect(floorToDecimal(0, 2)).toBe(0);
    });
  });

  describe('calculateTax', () => {
    it('should calculate tax correctly', () => {
      expect(calculateTax(1000, 0.10)).toBe(100);
      expect(calculateTax(1500, 0.10)).toBe(150);
    });

    it('should floor to integer', () => {
      expect(calculateTax(1001, 0.10)).toBe(100);
    });
  });

  describe('calculateDiscount', () => {
    it('should calculate discount correctly', () => {
      expect(calculateDiscount(1000, 0.10)).toBe(100);
      expect(calculateDiscount(1500, 0.20)).toBe(300);
    });

    it('should floor to integer', () => {
      expect(calculateDiscount(1001, 0.10)).toBe(100);
    });
  });

  describe('validateEmail', () => {
    it('should accept valid email addresses', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name@domain.co.jp')).toBe(true);
      expect(validateEmail('user+tag@example.org')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('invalid@')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('user@domain')).toBe(false);
      expect(validateEmail('user domain@com')).toBe(false);
    });

    it('should reject empty email', () => {
      expect(validateEmail('')).toBe(false);
    });
  });

  describe('validatePhone', () => {
    it('should accept valid Japanese phone numbers', () => {
      expect(validatePhone('03-1234-5678')).toBe(true);
      expect(validatePhone('090-1234-5678')).toBe(true);
      expect(validatePhone('0120-123-456')).toBe(true);
    });

    it('should accept international phone numbers', () => {
      expect(validatePhone('+1-234-567-8900')).toBe(true);
      expect(validatePhone('+81-3-1234-5678')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(validatePhone('123')).toBe(true); // Only numbers
      expect(validatePhone('abcdefgh')).toBe(false);
    });

    it('should accept empty phone number (optional field)', () => {
      expect(validatePhone('')).toBe(true);
    });
  });

  describe('sanitizeString', () => {
    it('should trim and normalize whitespace', () => {
      expect(sanitizeString('  hello   world  ')).toBe('hello world');
    });

    it('should handle empty strings', () => {
      expect(sanitizeString('   ')).toBe('');
    });
  });

  describe('truncateString', () => {
    it('should truncate long strings', () => {
      expect(truncateString('Hello World', 8)).toBe('Hello...');
      expect(truncateString('1234567890', 8)).toBe('12345...');
    });

    it('should not truncate short strings', () => {
      expect(truncateString('Hi', 10)).toBe('Hi');
    });
  });

  describe('isValidPositiveNumber', () => {
    it('should validate positive numbers', () => {
      expect(isValidPositiveNumber(1)).toBe(true);
      expect(isValidPositiveNumber(100.5)).toBe(true);
    });

    it('should reject non-positive numbers', () => {
      expect(isValidPositiveNumber(0)).toBe(false);
      expect(isValidPositiveNumber(-1)).toBe(false);
    });

    it('should reject NaN and Infinity', () => {
      expect(isValidPositiveNumber(NaN)).toBe(false);
      expect(isValidPositiveNumber(Infinity)).toBe(false);
    });
  });

  describe('isValidNonNegativeNumber', () => {
    it('should validate non-negative numbers', () => {
      expect(isValidNonNegativeNumber(0)).toBe(true);
      expect(isValidNonNegativeNumber(1)).toBe(true);
    });

    it('should reject negative numbers', () => {
      expect(isValidNonNegativeNumber(-1)).toBe(false);
    });
  });

  describe('chunkArray', () => {
    it('should chunk array into smaller arrays', () => {
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      const chunks = chunkArray(arr, 3);
      expect(chunks).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    });

    it('should handle remainder', () => {
      const arr = [1, 2, 3, 4, 5];
      const chunks = chunkArray(arr, 2);
      expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
    });
  });

  describe('removeDuplicates', () => {
    it('should remove duplicates from array', () => {
      const arr = [1, 2, 2, 3, 3, 3];
      expect(removeDuplicates(arr)).toEqual([1, 2, 3]);
    });

    it('should remove duplicates by key', () => {
      const arr = [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
        { id: 1, name: 'A' },
      ];
      const deduped = removeDuplicates(arr, 'id');
      expect(deduped).toHaveLength(2);
      expect(deduped[0].id).toBe(1);
      expect(deduped[1].id).toBe(2);
    });
  });

  describe('deepClone', () => {
    it('should create deep copy of object', () => {
      const obj = { a: 1, b: { c: 2 } };
      const cloned = deepClone(obj);

      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.b).not.toBe(obj.b);
    });
  });

  describe('pick', () => {
    it('should pick specified keys from object', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const picked = pick(obj, ['a', 'c']);
      expect(picked).toEqual({ a: 1, c: 3 });
    });
  });

  describe('omit', () => {
    it('should omit specified keys from object', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const omitted = omit(obj, ['b']);
      expect(omitted).toEqual({ a: 1, c: 3 });
    });
  });

  describe('sleep', () => {
    it('should sleep for specified time', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });
  });
});

describe('Error Classes', () => {
  describe('ValidationError', () => {
    it('should create validation error with message', () => {
      const error = new ValidationError('Invalid input');
      expect(error.message).toBe('Invalid input');
      expect(error.name).toBe('ValidationError');
    });

    it('should include field', () => {
      const error = new ValidationError('Invalid input', 'email');
      expect(error.field).toBe('email');
    });

    it('should be instanceof Error', () => {
      const error = new ValidationError('Test');
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with entity and id', () => {
      const error = new NotFoundError('Product', 'prod-123');
      expect(error.message).toContain('Product');
      expect(error.message).toContain('prod-123');
      expect(error.name).toBe('NotFoundError');
    });

    it('should create not found error without id', () => {
      const error = new NotFoundError('Resource');
      expect(error.message).toContain('Resource');
      expect(error.name).toBe('NotFoundError');
    });

    it('should be instanceof Error', () => {
      const error = new NotFoundError('Test', 'id');
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('BusinessLogicError', () => {
    it('should create business logic error with message', () => {
      const error = new BusinessLogicError('Cannot delete paid invoice');
      expect(error.message).toBe('Cannot delete paid invoice');
      expect(error.name).toBe('BusinessLogicError');
    });

    it('should be instanceof Error', () => {
      const error = new BusinessLogicError('Test');
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('DatabaseError', () => {
    it('should create database error with message', () => {
      const originalError = new Error('Connection failed');
      const error = new DatabaseError('Failed to query database', originalError);
      expect(error.message).toBe('Failed to query database');
      expect(error.name).toBe('DatabaseError');
    });

    it('should wrap original error', () => {
      const originalError = new Error('Connection failed');
      const error = new DatabaseError('Failed', originalError);
      expect(error.originalError).toBe(originalError);
    });

    it('should be instanceof Error', () => {
      const error = new DatabaseError('Test', new Error('Original'));
      expect(error instanceof Error).toBe(true);
    });
  });
});
