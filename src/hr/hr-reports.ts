import Database from 'better-sqlite3';
import { Logger } from '../utils/logger';

const logger = new Logger('HRReportsService');

export interface HrSummary {
  total_employees: number;
  active_employees: number;
  new_hires_this_month: number;
  total_departments: number;
}

export interface DepartmentStats {
  department: string;
  employee_count: number;
  total_salary: number;
  avg_salary: number;
}

export interface AttendanceStats {
  date: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
}

export class HRReportsService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async getHRSummary(): Promise<HrSummary> {
    try {
      const totalRow = this.db
        .prepare('SELECT COUNT(*) as count FROM employees')
        .get() as any;

      const activeRow = this.db
        .prepare('SELECT COUNT(*) as count FROM employees WHERE is_active = 1')
        .get() as any;

      const newHiresRow = this.db
        .prepare(`
          SELECT COUNT(*) as count
          FROM employees
          WHERE strftime("%Y-%m", hire_date) = strftime("%Y-%m", 'now')
        `)
        .get() as any;

      const deptRow = this.db
        .prepare('SELECT COUNT(DISTINCT department) as count FROM employees WHERE is_active = 1')
        .get() as any;

      return {
        total_employees: totalRow.count || 0,
        active_employees: activeRow.count || 0,
        new_hires_this_month: newHiresRow.count || 0,
        total_departments: deptRow.count || 0,
      };
    } catch (error) {
      logger.error('Error getting HR summary', error);
      throw error;
    }
  }

  async getDepartmentStats(): Promise<DepartmentStats[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            department,
            COUNT(*) as employee_count,
            0 as total_salary,
            0 as avg_salary
          FROM employees
          WHERE is_active = 1
          GROUP BY department
          ORDER BY employee_count DESC
        `)
        .all() as any[];

      return rows.map(row => ({
        department: row.department,
        employee_count: row.employee_count,
        total_salary: row.total_salary,
        avg_salary: row.avg_salary,
      }));
    } catch (error) {
      logger.error('Error getting department stats', error);
      throw error;
    }
  }

  async getEmployeeByDepartment(): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            e.department,
            e.position,
            COUNT(*) as count
          FROM employees e
          WHERE e.is_active = 1
          GROUP BY e.department, e.position
          ORDER BY e.department, e.position
        `)
        .all() as any[];

      return rows.map(row => ({
        department: row.department,
        position: row.position,
        count: row.count,
      }));
    } catch (error) {
      logger.error('Error getting employee by department', error);
      throw error;
    }
  }

  async getAttendanceReport(startDate: string, endDate: string): Promise<AttendanceStats[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            attendance_date as date,
            SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) as present,
            SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END) as absent,
            SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END) as late,
            SUM(CASE WHEN status = 'LEAVE' THEN 1 ELSE 0 END) as leave
          FROM attendance
          WHERE attendance_date >= ? AND attendance_date <= ?
          GROUP BY attendance_date
          ORDER BY attendance_date
        `)
        .all(startDate, endDate) as any[];

      return rows.map(row => ({
        date: row.date,
        present: row.present || 0,
        absent: row.absent || 0,
        late: row.late || 0,
        leave: row.leave || 0,
      }));
    } catch (error) {
      logger.error('Error getting attendance report', error);
      throw error;
    }
  }

  async getPayrollSummary(startDate: string, endDate: string): Promise<any> {
    try {
      const row = this.db
        .prepare(`
          SELECT
            COUNT(*) as payroll_count,
            COUNT(DISTINCT employee_id) as employee_count,
            SUM(basic_salary + overtime_pay + bonus + allowances) as gross_payroll,
            SUM(deductions + tax_amount + insurance_amount) as total_deductions,
            SUM(net_pay) as total_net_pay,
            AVG(net_pay) as avg_net_pay
          FROM payroll
          WHERE pay_date >= ? AND pay_date <= ? AND status = 'PAID'
        `)
        .get(startDate, endDate) as any;

      return {
        payroll_count: row.payroll_count || 0,
        employee_count: row.employee_count || 0,
        gross_payroll: row.gross_payroll || 0,
        total_deductions: row.total_deductions || 0,
        total_net_pay: row.total_net_pay || 0,
        avg_net_pay: row.avg_net_pay || 0,
      };
    } catch (error) {
      logger.error('Error getting payroll summary', error);
      throw error;
    }
  }

  async getOvertimeReport(startDate: string, endDate: string): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            a.employee_id,
            e.code,
            e.name,
            e.department,
            e.position,
            SUM(a.overtime_hours) as total_overtime_hours,
            COUNT(*) as overtime_days
          FROM attendance a
          JOIN employees e ON a.employee_id = e.id
          WHERE a.attendance_date >= ? AND a.attendance_date <= ?
            AND a.overtime_hours > 0
          GROUP BY a.employee_id, e.code, e.name, e.department, e.position
          ORDER BY total_overtime_hours DESC
        `)
        .all(startDate, endDate) as any[];

      return rows.map(row => ({
        employee_id: row.employee_id,
        employee_code: row.code,
        employee_name: row.name,
        department: row.department,
        position: row.position,
        total_overtime_hours: row.total_overtime_hours,
        overtime_days: row.overtime_days,
      }));
    } catch (error) {
      logger.error('Error getting overtime report', error);
      throw error;
    }
  }

  async getLeaveReport(startDate: string, endDate: string): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            a.employee_id,
            e.code,
            e.name,
            e.department,
            COUNT(*) as leave_days,
            SUM(a.work_hours) as total_leave_hours
          FROM attendance a
          JOIN employees e ON a.employee_id = e.id
          WHERE a.attendance_date >= ? AND a.attendance_date <= ?
            AND a.status = 'LEAVE'
          GROUP BY a.employee_id, e.code, e.name, e.department
          ORDER BY leave_days DESC
        `)
        .all(startDate, endDate) as any[];

      return rows.map(row => ({
        employee_id: row.employee_id,
        employee_code: row.code,
        employee_name: row.name,
        department: row.department,
        leave_days: row.leave_days,
        total_leave_hours: row.total_leave_hours || 0,
      }));
    } catch (error) {
      logger.error('Error getting leave report', error);
      throw error;
    }
  }

  async getHiringTrend(year: number): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            CAST(strftime("%m", hire_date) AS INTEGER) as month,
            COUNT(*) as hires
          FROM employees
          WHERE strftime("%Y", hire_date) = ?
          GROUP BY strftime("%m", hire_date)
          ORDER BY month
        `)
        .all(String(year)) as any[];

      const result = [];
      for (let i = 1; i <= 12; i++) {
        const monthData = rows.find((r: any) => r.month === i);
        result.push({
          month: i,
          hires: monthData ? monthData.hires : 0,
        });
      }

      return result;
    } catch (error) {
      logger.error('Error getting hiring trend', error);
      throw error;
    }
  }

  async getEmployeeTenure(): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            id,
            code,
            name,
            department,
            position,
            hire_date,
            CAST(julianday('now') - julianday(hire_date) AS INTEGER) as days_of_service
          FROM employees
          WHERE is_active = 1
          ORDER BY days_of_service DESC
        `)
        .all() as any[];

      return rows.map(row => ({
        employee_id: row.id,
        employee_code: row.code,
        employee_name: row.name,
        department: row.department,
        position: row.position,
        hire_date: row.hire_date,
        days_of_service: row.days_of_service,
        years_of_service: Math.floor(row.days_of_service / 365),
        months_of_service: Math.floor((row.days_of_service % 365) / 30),
      }));
    } catch (error) {
      logger.error('Error getting employee tenure', error);
      throw error;
    }
  }

  async getTopEarners(limit: number = 10): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            e.id,
            e.code,
            e.name,
            e.department,
            e.position,
            p.basic_salary
          FROM employees e
          LEFT JOIN (
            SELECT employee_id, basic_salary
            FROM payroll
            WHERE status = 'PAID'
            ORDER BY pay_date DESC
            LIMIT 1
          ) p ON e.id = p.employee_id
          WHERE e.is_active = 1 AND p.basic_salary IS NOT NULL
          ORDER BY p.basic_salary DESC
          LIMIT ?
        `)
        .all(limit) as any[];

      return rows.map(row => ({
        employee_id: row.id,
        employee_code: row.code,
        employee_name: row.name,
        department: row.department,
        position: row.position,
        basic_salary: row.basic_salary,
      }));
    } catch (error) {
      logger.error('Error getting top earners', error);
      throw error;
    }
  }
}

export default HRReportsService;
