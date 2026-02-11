import { Logger } from '../../src/utils/logger';

describe('Logger', () => {
  let originalConsole: Console;
  let mockConsole: any;
  let logger: Logger;

  beforeAll(() => {
    originalConsole = global.console;
    mockConsole = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    global.console = mockConsole as any;

    // Set development mode to enable debug logs
    process.env.NODE_ENV = 'development';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('TestService');
  });

  afterAll(() => {
    global.console = originalConsole;
    delete process.env.NODE_ENV;
  });

  describe('info', () => {
    it('should log info messages', () => {
      logger.info('Test info message');

      expect(mockConsole.info).toHaveBeenCalledTimes(1);
      const callArgs = mockConsole.info.mock.calls[0][0];
      expect(callArgs).toContain('[INFO]');
      expect(callArgs).toContain('[TestService]');
      expect(callArgs).toContain('Test info message');
    });

    it('should log info messages with data', () => {
      const data = { id: '123', name: 'Test' };
      logger.info('Test message', data);

      expect(mockConsole.info).toHaveBeenCalledTimes(1);
      const callArgs = mockConsole.info.mock.calls[0];
      expect(callArgs[0]).toContain('[INFO]');
      expect(callArgs[0]).toContain('[TestService]');
      expect(callArgs[0]).toContain('Test message');
      expect(callArgs[1]).toEqual(data);
    });
  });

  describe('warn', () => {
    it('should log warning messages', () => {
      logger.warn('Test warning message');

      expect(mockConsole.warn).toHaveBeenCalledTimes(1);
      const callArgs = mockConsole.warn.mock.calls[0][0];
      expect(callArgs).toContain('[WARN]');
      expect(callArgs).toContain('[TestService]');
      expect(callArgs).toContain('Test warning message');
    });

    it('should log warning messages with data', () => {
      const data = { field: 'value' };
      logger.warn('Warning with data', data);

      expect(mockConsole.warn).toHaveBeenCalledTimes(1);
      const callArgs = mockConsole.warn.mock.calls[0];
      expect(callArgs[0]).toContain('[WARN]');
      expect(callArgs[0]).toContain('[TestService]');
      expect(callArgs[1]).toEqual(data);
    });
  });

  describe('error', () => {
    it('should log error messages', () => {
      logger.error('Test error message');

      expect(mockConsole.error).toHaveBeenCalledTimes(1);
      const callArgs = mockConsole.error.mock.calls[0];
      expect(callArgs[0]).toContain('[ERROR]');
      expect(callArgs[0]).toContain('[TestService]');
      expect(callArgs[0]).toContain('Test error message');
    });

    it('should log error messages with error object message', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', error);

      // Logger passes error.message, not the full error object
      expect(mockConsole.error).toHaveBeenCalledTimes(1);
      const callArgs = mockConsole.error.mock.calls[0];
      expect(callArgs[0]).toContain('[ERROR]');
      expect(callArgs[0]).toContain('[TestService]');
      expect(callArgs[0]).toContain('Error occurred');
      expect(callArgs[1]).toBe('Test error');
    });

    it('should log error messages with additional data', () => {
      const error = new Error('Test error');
      const data = { context: 'test context' };
      logger.error('Error with data', error, data);

      expect(mockConsole.error).toHaveBeenCalledTimes(1);
      const callArgs = mockConsole.error.mock.calls[0];
      expect(callArgs[0]).toContain('[ERROR]');
      expect(callArgs[2]).toEqual(data);
    });
  });

  describe('debug', () => {
    it('should log debug messages in development', () => {
      logger.debug('Test debug message');

      expect(mockConsole.debug).toHaveBeenCalledTimes(1);
      const callArgs = mockConsole.debug.mock.calls[0][0];
      expect(callArgs).toContain('[DEBUG]');
      expect(callArgs).toContain('[TestService]');
      expect(callArgs).toContain('Test debug message');
    });

    it('should log debug messages with data in development', () => {
      const data = { debug: 'info' };
      logger.debug('Debug with data', data);

      expect(mockConsole.debug).toHaveBeenCalledTimes(1);
      const callArgs = mockConsole.debug.mock.calls[0];
      expect(callArgs[0]).toContain('[DEBUG]');
      expect(callArgs[1]).toEqual(data);
    });

    it('should not log debug in production', () => {
      process.env.NODE_ENV = 'production';

      logger.debug('Test debug message');

      expect(mockConsole.debug).not.toHaveBeenCalled();

      // Reset to development for other tests
      process.env.NODE_ENV = 'development';
    });
  });

  describe('context', () => {
    it('should include service name in logs', () => {
      logger.info('Test message');

      expect(mockConsole.info).toHaveBeenCalledTimes(1);
      const callArgs = mockConsole.info.mock.calls[0][0];
      expect(callArgs).toContain('[TestService]');
    });

    it('should handle different service names', () => {
      const logger1 = new Logger('Service1');
      const logger2 = new Logger('Service2');

      logger1.info('Message from service 1');
      logger2.info('Message from service 2');

      expect(mockConsole.info).toHaveBeenCalledTimes(2);
    });
  });

  describe('formatting', () => {
    it('should format message with timestamp, level, and context', () => {
      logger.info('Test message');

      const callArgs = mockConsole.info.mock.calls[0][0];
      expect(callArgs).toMatch(/^\[\d{4}-\d{2}-\d{2}T/);
      expect(callArgs).toContain('[INFO]');
      expect(callArgs).toContain('[TestService]');
    });
  });
});
