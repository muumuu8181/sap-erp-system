import Database from 'better-sqlite3';
import { generateId, getCurrentTimestamp, ValidationError, NotFoundError, BusinessLogicError, DatabaseError } from '../utils/helpers';
import { Logger } from '../utils/logger';

const logger = new Logger('AttendanceService');

const STANDARD_WORK_HOURS = 8;

export interface AttendanceData {
  id?: string;
  employee_id: string;
  attendance_date: string;
  check_in?: string;
  check_out?: string;
  work_hours?: number;
  overtime_hours?: number;
  status?: 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'LEAVE' | 'HOLIDAY';
  notes?: string;
}

export interface UpdateAttendanceData {
  check_in?: string;
  check_out?: string;
  work_hours?: number;
  overtime_hours?: number;
  status?: 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'LEAVE' | 'HOLIDAY';
  notes?: string;
}

export interface AttendanceQuery {
  employee_id?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export class AttendanceService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async validateAttendanceData(data: AttendanceData): Promise<void> {
    if (!data.employee_id) {
      throw new ValidationError('Employee ID is required');
    }

    const employee = this.db
      .prepare('SELECT id, is_active FROM employees WHERE id = ?')
      .get(data.employee_id);

    if (!employee) {
      throw new NotFoundError('Employee', data.employee_id);
    }

    if (!(employee as any).is_active) {
      throw new BusinessLogicError('Employee is not active');
    }

    if (!data.attendance_date) {
      throw new ValidationError('Attendance date is required');
    }

    if (data.check_in && data.check_out) {
      const checkInTime = new Date(`${data.attendance_date}T${data.check_in}`);
      const checkOutTime = new Date(`${data.attendance_date}T${data.check_out}`);

      if (checkOutTime <= checkInTime) {
        throw new ValidationError('Check out time must be after check in time');
      }
    }

    if (data.work_hours !== undefined && data.work_hours < 0) {
      throw new ValidationError('Work hours cannot be negative');
    }

    if (data.overtime_hours !== undefined && data.overtime_hours < 0) {
      throw new ValidationError('Overtime hours cannot be negative');
    }

    const existing = this.db
      .prepare('SELECT id FROM attendance WHERE employee_id = ? AND attendance_date = ?')
      .get(data.employee_id, data.attendance_date) as { id: string } | undefined;

    if (existing && existing.id !== data.id) {
      throw new BusinessLogicError('Attendance for this date already exists');
    }
  }

  private calculateWorkHours(checkIn: string, checkOut: string): number {
    const checkInTime = new Date(`2000-01-01T${checkIn}`);
    const checkOutTime = new Date(`2000-01-01T${checkOut}`);
    const diffMs = checkOutTime.getTime() - checkInTime.getTime();
    return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
  }

  private determineStatus(checkIn: string, workHours: number): 'PRESENT' | 'LATE' | 'HALF_DAY' {
    const standardStartTime = '09:00';
    if (checkIn > standardStartTime) {
      return 'LATE';
    }
    if (workHours < STANDARD_WORK_HOURS / 2) {
      return 'HALF_DAY';
    }
    return 'PRESENT';
  }

  async create(data: AttendanceData): Promise<string> {
    try {
      await this.validateAttendanceData(data);

      let workHours = data.work_hours;
      let overtimeHours = data.overtime_hours || 0;
      let status = data.status;

      if (data.check_in && data.check_out) {
        workHours = this.calculateWorkHours(data.check_in, data.check_out);
        if (workHours > STANDARD_WORK_HOURS) {
          overtimeHours = workHours - STANDARD_WORK_HOURS;
        }
        if (!status) {
          status = this.determineStatus(data.check_in, workHours);
        }
      }

      const id = data.id || generateId();
      const now = getCurrentTimestamp();

      const stmt = this.db.prepare(`
        INSERT INTO attendance (
          id, employee_id, attendance_date, check_in, check_out,
          work_hours, overtime_hours, status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        data.employee_id,
        data.attendance_date,
        data.check_in || null,
        data.check_out || null,
        workHours || 0,
        overtimeHours,
        status || 'PRESENT',
        data.notes || null,
        now,
        now
      );

      logger.info(`Attendance created: ${id}`);
      return id;
    } catch (error) {
      logger.error('Error creating attendance', error);
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to create attendance', error as Error);
    }
  }

  async update(id: string, data: UpdateAttendanceData): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Attendance', id);
      }

      let workHours = data.work_hours;
      let overtimeHours = data.overtime_hours;
      let status = data.status;

      // Validate check_in and check_out combination
      if (data.check_in && data.check_out) {
        const checkInTime = new Date(`2000-01-01T${data.check_in}`);
        const checkOutTime = new Date(`2000-01-01T${data.check_out}`);

        if (checkOutTime <= checkInTime) {
          throw new ValidationError('Check out time must be after check in time');
        }
      }

      if (data.check_in && data.check_out) {
        workHours = this.calculateWorkHours(data.check_in, data.check_out);
        if (workHours > STANDARD_WORK_HOURS) {
          overtimeHours = workHours - STANDARD_WORK_HOURS;
        } else {
          overtimeHours = 0;
        }
        if (!status) {
          status = this.determineStatus(data.check_in, workHours);
        }
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (data.check_in !== undefined) {
        updates.push('check_in = ?');
        values.push(data.check_in);
      }
      if (data.check_out !== undefined) {
        updates.push('check_out = ?');
        values.push(data.check_out);
      }
      if (workHours !== undefined) {
        updates.push('work_hours = ?');
        values.push(workHours);
      }
      if (overtimeHours !== undefined) {
        updates.push('overtime_hours = ?');
        values.push(overtimeHours);
      }
      if (status !== undefined) {
        updates.push('status = ?');
        values.push(status);
      }
      if (data.notes !== undefined) {
        updates.push('notes = ?');
        values.push(data.notes);
      }

      if (updates.length === 0) {
        return;
      }

      updates.push('updated_at = ?');
      values.push(getCurrentTimestamp());
      values.push(id);

      const stmt = this.db.prepare(`
        UPDATE attendance SET ${updates.join(', ')} WHERE id = ?
      `);

      stmt.run(...values);

      logger.info(`Attendance updated: ${id}`);
    } catch (error) {
      logger.error('Error updating attendance', error);
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError('Failed to update attendance', error as Error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Attendance', id);
      }

      const stmt = this.db.prepare('DELETE FROM attendance WHERE id = ?');
      stmt.run(id);

      logger.info(`Attendance deleted: ${id}`);
    } catch (error) {
      logger.error('Error deleting attendance', error);
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError('Failed to delete attendance', error as Error);
    }
  }

  async findById(id: string): Promise<AttendanceData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM attendance WHERE id = ?')
        .get(id) as any;

      if (!row) {
        return null;
      }

      return this.mapToAttendanceData(row);
    } catch (error) {
      logger.error('Error finding attendance', error);
      throw new DatabaseError('Failed to find attendance', error as Error);
    }
  }

  async findAll(query: AttendanceQuery = {}): Promise<AttendanceData[]> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.employee_id) {
        conditions.push('employee_id = ?');
        params.push(query.employee_id);
      }

      if (query.start_date) {
        conditions.push('attendance_date >= ?');
        params.push(query.start_date);
      }

      if (query.end_date) {
        conditions.push('attendance_date <= ?');
        params.push(query.end_date);
      }

      if (query.status) {
        conditions.push('status = ?');
        params.push(query.status);
      }

      let sql = `SELECT * FROM attendance WHERE ${conditions.join(' AND ')} ORDER BY attendance_date DESC`;

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
        if (query.offset) {
          sql += ' OFFSET ?';
          params.push(query.offset);
        }
      }

      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(row => this.mapToAttendanceData(row));
    } catch (error) {
      logger.error('Error finding attendance records', error);
      throw new DatabaseError('Failed to find attendance records', error as Error);
    }
  }

  async count(query: AttendanceQuery = {}): Promise<number> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.employee_id) {
        conditions.push('employee_id = ?');
        params.push(query.employee_id);
      }

      if (query.start_date) {
        conditions.push('attendance_date >= ?');
        params.push(query.start_date);
      }

      if (query.end_date) {
        conditions.push('attendance_date <= ?');
        params.push(query.end_date);
      }

      if (query.status) {
        conditions.push('status = ?');
        params.push(query.status);
      }

      const sql = `SELECT COUNT(*) as count FROM attendance WHERE ${conditions.join(' AND ')}`;

      const row = this.db.prepare(sql).get(...params) as { count: number };
      return row.count;
    } catch (error) {
      logger.error('Error counting attendance records', error);
      throw new DatabaseError('Failed to count attendance records', error as Error);
    }
  }

  async getEmployeeAttendance(employeeId: string, startDate: string, endDate: string): Promise<AttendanceData[]> {
    return this.findAll({
      employee_id: employeeId,
      start_date: startDate,
      end_date: endDate,
    });
  }

  async getAttendanceSummary(employeeId: string, startDate: string, endDate: string): Promise<any> {
    try {
      const row = this.db
        .prepare(`
          SELECT
            COUNT(*) as total_days,
            SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) as present_days,
            SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END) as absent_days,
            SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END) as late_days,
            SUM(CASE WHEN status = 'LEAVE' THEN 1 ELSE 0 END) as leave_days,
            SUM(work_hours) as total_work_hours,
            SUM(overtime_hours) as total_overtime_hours
          FROM attendance
          WHERE employee_id = ? AND attendance_date >= ? AND attendance_date <= ?
        `)
        .get(employeeId, startDate, endDate) as any;

      return {
        total_days: row.total_days || 0,
        present_days: row.present_days || 0,
        absent_days: row.absent_days || 0,
        late_days: row.late_days || 0,
        leave_days: row.leave_days || 0,
        total_work_hours: row.total_work_hours || 0,
        total_overtime_hours: row.total_overtime_hours || 0,
        attendance_rate: row.total_days > 0 ? Math.round(((row.present_days || 0) / row.total_days) * 10000) / 100 : 0,
      };
    } catch (error) {
      logger.error('Error getting attendance summary', error);
      throw error;
    }
  }

  private mapToAttendanceData(row: any): AttendanceData {
    return {
      id: row.id,
      employee_id: row.employee_id,
      attendance_date: row.attendance_date,
      check_in: row.check_in,
      check_out: row.check_out,
      work_hours: row.work_hours,
      overtime_hours: row.overtime_hours,
      status: row.status,
      notes: row.notes,
    };
  }
}

export default AttendanceService;
