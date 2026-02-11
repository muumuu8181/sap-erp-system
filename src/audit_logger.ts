/**
 * Audit Logger - Track and log all system operations for compliance
 *
 * Records user actions, data changes, and system events for audit trails.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const BUFFER_FLUSH_SIZE = 10;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY_ENV = 'AUDIT_LOG_ENCRYPTION_KEY';
const ENCRYPTION_IV_BYTES = 12;

export interface AuditEvent {
  userId: string;
  action: string;
  resource: string;
  timestamp: Date;
  details?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

interface PersistedAuditEvent extends Omit<AuditEvent, 'timestamp'> {
  timestamp: string;
  eventId: string;
}

export interface AuditLogConfig {
  logDirectory: string;
  retentionDays: number;
  enableEncryption: boolean;
  maxFileSize: number;
}

export class AuditLogger {
  private config: AuditLogConfig;
  private currentLogFile: string;
  private buffer: PersistedAuditEvent[] = [];
  private rotationSequence = 0;

  constructor(config: AuditLogConfig) {
    this.config = config;
    this.currentLogFile = this.getLogFilePath();
    this.ensureLogDirectory();
  }

  /**
   * Log an audit event.
   */
  public logEvent(event: AuditEvent): void {
    const enrichedEvent: PersistedAuditEvent = {
      ...event,
      timestamp: (event.timestamp ?? new Date()).toISOString(),
      eventId: this.generateEventId()
    };

    this.buffer.push(enrichedEvent);

    if (this.buffer.length >= BUFFER_FLUSH_SIZE) {
      this.flush();
    }
  }

  /**
   * Log user login event.
   */
  public logLogin(userId: string, ipAddress: string, success: boolean): void {
    this.logEvent({
      userId,
      action: success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILURE',
      resource: 'authentication',
      timestamp: new Date(),
      ipAddress,
      details: { success }
    });
  }

  /**
   * Log data modification event.
   */
  public logDataChange(
    userId: string,
    resource: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    oldValue?: unknown,
    newValue?: unknown
  ): void {
    this.logEvent({
      userId,
      action: `DATA_${action}`,
      resource,
      timestamp: new Date(),
      details: {
        oldValue,
        newValue,
        changeType: action
      }
    });
  }

  /**
   * Flush buffered events to disk.
   */
  public flush(): void {
    if (this.buffer.length === 0) {
      return;
    }

    const serializedRecords = this.buffer.map((event) => {
      const payload = JSON.stringify(event);
      return this.config.enableEncryption ? this.encrypt(payload) : payload;
    });
    const logContent = `${serializedRecords.join('\n')}\n`;

    try {
      fs.appendFileSync(this.currentLogFile, logContent, 'utf8');
      this.buffer = [];

      if (this.shouldRotateLog()) {
        this.rotateLog();
      }
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }

  /**
   * Query audit logs.
   */
  public async queryLogs(filters: {
    userId?: string;
    action?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<AuditEvent[]> {
    const results: AuditEvent[] = [];
    const logFiles = this.getLogFiles();

    for (const logFile of logFiles) {
      let content = '';

      try {
        content = fs.readFileSync(logFile, 'utf8');
      } catch (error) {
        console.error(`Failed to read audit log file ${logFile}:`, error);
        continue;
      }

      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const decodedLine = this.config.enableEncryption ? this.decrypt(line) : line;
          const event = this.parseEvent(decodedLine);

          if (this.matchesFilters(event, filters)) {
            results.push(event);
          }
        } catch (error) {
          console.error('Failed to parse log line:', error);
        }
      }
    }

    return results;
  }

  /**
   * Clean up old log files.
   */
  public cleanupOldLogs(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    const logFiles = this.getLogFiles();

    for (const logFile of logFiles) {
      const stats = fs.statSync(logFile);

      if (stats.mtime < cutoffDate) {
        fs.unlinkSync(logFile);
      }
    }
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.config.logDirectory)) {
      fs.mkdirSync(this.config.logDirectory, { recursive: true });
    }
  }

  private getLogFilePath(): string {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];
    return path.join(this.config.logDirectory, `audit_${dateStr}_${this.rotationSequence}.log`);
  }

  private getLogFiles(): string[] {
    const files = fs.readdirSync(this.config.logDirectory);
    return files
      .filter((file) => file.startsWith('audit_') && file.endsWith('.log'))
      .map((file) => path.join(this.config.logDirectory, file))
      .sort();
  }

  private shouldRotateLog(): boolean {
    try {
      const stats = fs.statSync(this.currentLogFile);
      return stats.size >= this.config.maxFileSize;
    } catch {
      return false;
    }
  }

  private rotateLog(): void {
    this.rotationSequence += 1;
    this.currentLogFile = this.getLogFilePath();
  }

  private parseEvent(line: string): AuditEvent {
    const parsed = JSON.parse(line) as PersistedAuditEvent;

    return {
      ...parsed,
      timestamp: new Date(parsed.timestamp)
    };
  }

  private encrypt(text: string): string {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(ENCRYPTION_IV_BYTES);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  private decrypt(payload: string): string {
    const key = this.getEncryptionKey();
    const raw = Buffer.from(payload, 'base64');
    const iv = raw.subarray(0, ENCRYPTION_IV_BYTES);
    const authTag = raw.subarray(ENCRYPTION_IV_BYTES, ENCRYPTION_IV_BYTES + 16);
    const encrypted = raw.subarray(ENCRYPTION_IV_BYTES + 16);
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return decrypted.toString('utf8');
  }

  private getEncryptionKey(): Buffer {
    const rawKey = process.env[ENCRYPTION_KEY_ENV];

    if (!rawKey) {
      throw new Error(
        `Audit log encryption is enabled but ${ENCRYPTION_KEY_ENV} is not configured.`
      );
    }

    return crypto.createHash('sha256').update(rawKey).digest();
  }

  private generateEventId(): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  private matchesFilters(
    event: AuditEvent,
    filters: {
      userId?: string;
      action?: string;
      resource?: string;
      startDate?: Date;
      endDate?: Date;
    }
  ): boolean {
    if (filters.userId && event.userId !== filters.userId) {
      return false;
    }

    if (filters.action && event.action !== filters.action) {
      return false;
    }

    if (filters.resource && event.resource !== filters.resource) {
      return false;
    }

    if (filters.startDate && event.timestamp < filters.startDate) {
      return false;
    }

    if (filters.endDate && event.timestamp > filters.endDate) {
      return false;
    }

    return true;
  }
}

/**
 * Simple function for logging audit events.
 */
export function logAuditEvent(event: AuditEvent): void {
  const logger = new AuditLogger({
    logDirectory: './logs/audit',
    retentionDays: 90,
    enableEncryption: false,
    maxFileSize: 10 * 1024 * 1024
  });

  logger.logEvent(event);
  logger.flush();
}
