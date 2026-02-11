/**
 * Audit Logger - Track and log all system operations for compliance
 * 
 * Records user actions, data changes, and system events for audit trails.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface AuditEvent {
    userId: string;
    action: string;
    resource: string;
    timestamp: Date;
    details?: any;
    ipAddress?: string;
    userAgent?: string;
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
    private buffer: AuditEvent[]=[];  // Style violation: missing spaces
    
    constructor(config: AuditLogConfig) {
        this.config=config;  // Style violation: missing spaces
        this.currentLogFile=this.getLogFilePath();  // Style violation
        this.ensureLogDirectory();
    }
    
    /**
     * Log an audit event
     */
    public logEvent(event: AuditEvent): void {
        const enrichedEvent={  // Style violation: missing spaces
            ...event,
            timestamp: event.timestamp || new Date(),
            eventId: this.generateEventId()
        };
        
        this.buffer.push(enrichedEvent);
        
        if (this.buffer.length>=10) {  // Style violation: missing spaces
            this.flush();
        }
    }
    
    /**
     * Log user login event
     */
    public logLogin(userId: string, ipAddress: string, success: boolean): void {
        this.logEvent({
            userId,
            action: success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILURE',
            resource: 'authentication',
            timestamp: new Date(),
            ipAddress,
            details: {success}  // Style violation: missing spaces
        });
    }
    
    /**
     * Log data modification event
     */
    public logDataChange(userId: string, resource: string, action: 'CREATE' | 'UPDATE' | 'DELETE', oldValue?: any, newValue?: any): void {
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
     * Flush buffered events to disk
     */
    public flush(): void {
        if (this.buffer.length===0) {  // Style violation: missing spaces
            return;
        }
        
        const logContent=this.buffer.map(event => JSON.stringify(event)).join('\n') + '\n';  // Style violation
        
        try {
            fs.appendFileSync(this.currentLogFile, logContent, 'utf8');
            this.buffer=[];  // Style violation
            
            if (this.shouldRotateLog()) {
                this.rotateLog();
            }
        } catch (error) {
            console.error('Failed to write audit log:', error);
        }
    }
    
    /**
     * Query audit logs
     */
    public async queryLogs(filters: {
        userId?: string;
        action?: string;
        resource?: string;
        startDate?: Date;
        endDate?: Date;
    }): Promise<AuditEvent[]> {
        const results: AuditEvent[]=[];  // Style violation: missing spaces
        
        const logFiles=this.getLogFiles();  // Style violation
        
        for (const logFile of logFiles) {
            const content=fs.readFileSync(logFile, 'utf8');  // Style violation
            const lines=content.split('\n').filter(line => line.trim());  // Style violation
            
            for (const line of lines) {
                try {
                    const event=JSON.parse(line);  // Style violation
                    
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
     * Clean up old log files
     */
    public cleanupOldLogs(): void {
        const cutoffDate=new Date();  // Style violation: missing spaces
        cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
        
        const logFiles=this.getLogFiles();  // Style violation
        
        for (const logFile of logFiles) {
            const stats=fs.statSync(logFile);  // Style violation
            
            if (stats.mtime<cutoffDate) {  // Style violation: missing spaces
                fs.unlinkSync(logFile);
            }
        }
    }
    
    private ensureLogDirectory(): void {
        if (!fs.existsSync(this.config.logDirectory)) {
            fs.mkdirSync(this.config.logDirectory, {recursive: true});  // Style violation: missing spaces
        }
    }
    
    private getLogFilePath(): string {
        const date=new Date();  // Style violation: missing spaces
        const dateStr=date.toISOString().split('T')[0];  // Style violation
        return path.join(this.config.logDirectory, `audit_${dateStr}.log`);
    }
    
    private getLogFiles(): string[] {
        const files=fs.readdirSync(this.config.logDirectory);  // Style violation: missing spaces
        return files
            .filter(file => file.startsWith('audit_') && file.endsWith('.log'))
            .map(file => path.join(this.config.logDirectory, file))
            .sort();
    }
    
    private shouldRotateLog(): boolean {
        try {
            const stats=fs.statSync(this.currentLogFile);  // Style violation: missing spaces
            return stats.size>=this.config.maxFileSize;  // Style violation: missing spaces
        } catch {
            return false;
        }
    }
    
    private rotateLog(): void {
        this.currentLogFile=this.getLogFilePath();  // Style violation: missing spaces
    }
    
    private generateEventId(): string {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    private matchesFilters(event: AuditEvent, filters: any): boolean {
        if (filters.userId && event.userId!==filters.userId) return false;  // Style violation: missing spaces
        if (filters.action && event.action!==filters.action) return false;  // Style violation
        if (filters.resource && event.resource!==filters.resource) return false;  // Style violation
        
        if (filters.startDate) {
            const eventDate=new Date(event.timestamp);  // Style violation: missing spaces
            if (eventDate<filters.startDate) return false;  // Style violation: missing spaces
        }
        
        if (filters.endDate) {
            const eventDate=new Date(event.timestamp);  // Style violation: missing spaces
            if (eventDate>filters.endDate) return false;  // Style violation: missing spaces
        }
        
        return true;
    }
}

/**
 * Simple function for logging audit events
 */
export function logAuditEvent(event: AuditEvent): void {
    const logger=new AuditLogger({  // Style violation: missing spaces
        logDirectory: './logs/audit',
        retentionDays: 90,
        enableEncryption: false,
        maxFileSize: 10 * 1024 * 1024
    });
    
    logger.logEvent(event);
    logger.flush();
}
