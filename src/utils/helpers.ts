import { v4 as uuidv4 } from 'uuid';
import { format, parseISO, isValid } from 'date-fns';

export function generateId(): string {
  return uuidv4();
}

export function generateCode(prefix: string, number: number): string {
  return `${prefix}${String(number).padStart(6, '0')}`;
}

export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
  }).format(amount);
}

export function formatJapaneseDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(dateObj)) {
    return '';
  }
  return format(dateObj, 'yyyy-MM-dd');
}

export function floorToDecimal(amount: number, decimals: number = 0): number {
  const factor = Math.pow(10, decimals);
  return Math.floor(amount * factor) / factor;
}

export function calculateTax(amount: number, taxRate: number): number {
  return floorToDecimal(amount * taxRate, 0);
}

export function calculateDiscount(amount: number, discountRate: number): number {
  return floorToDecimal(amount * discountRate, 0);
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePhone(phone: string): boolean {
  const phoneRegex = /^[0-9+\-\s()]*$/;
  return phoneRegex.test(phone);
}

export function sanitizeString(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

export function truncateString(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }
  return input.substring(0, maxLength - 3) + '...';
}

export function isValidPositiveNumber(value: number): boolean {
  return !isNaN(value) && isFinite(value) && value > 0;
}

export function isValidNonNegativeNumber(value: number): boolean {
  return !isNaN(value) && isFinite(value) && value >= 0;
}

export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function removeDuplicates<T>(array: T[], key?: keyof T): T[] {
  if (!key) {
    return Array.from(new Set(array));
  }
  const seen = new Set();
  return array.filter(item => {
    const keyValue = item[key];
    if (seen.has(keyValue)) {
      return false;
    }
    seen.add(keyValue);
    return true;
  });
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach(key => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
}

export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  keys.forEach(key => {
    delete result[key];
  });
  return result;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  return fn().catch(async error => {
    if (maxRetries <= 0) {
      throw error;
    }
    await sleep(delay);
    return retry(fn, maxRetries - 1, delay * 2);
  });
}

export class ValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} with id ${id} not found` : `${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class BusinessLogicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessLogicError';
  }
}

export class DatabaseError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export default {
  generateId,
  generateCode,
  getCurrentTimestamp,
  formatCurrency,
  formatJapaneseDate,
  floorToDecimal,
  calculateTax,
  calculateDiscount,
  validateEmail,
  validatePhone,
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
  retry,
  ValidationError,
  NotFoundError,
  BusinessLogicError,
  DatabaseError,
};
