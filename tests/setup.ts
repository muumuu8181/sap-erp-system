// Global test setup
import { DatabaseConnection } from '../src/db/connection';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:'; // Use in-memory database for tests

// Configure console to reduce noise during tests
if (process.env.NODE_ENV === 'test') {
  const originalError = console.error;
  console.error = (...args: any[]) => {
    // Filter out expected error messages during tests
    const message = args[0]?.toString() || '';
    if (
      message.includes('validation') ||
      message.includes('not found') ||
      message.includes('duplicate')
    ) {
      return;
    }
    originalError.apply(console, args);
  };
}

// Global setup before all tests
beforeAll(async () => {
  // Initialize database for tests
  await DatabaseConnection.initialize();
});

// Global teardown after all tests
afterAll(() => {
  // Close database connection
  DatabaseConnection.close();
});

// Increase timeout for database operations
jest.setTimeout(30000);
