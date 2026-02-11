import { Request, Response } from 'express';
import { EmployeesService } from './employees';
import { PayrollService } from './payroll';
import { AttendanceService } from './attendance';
import { HRReportsService } from './hr-reports';
import { DatabaseConnection } from '../db/connection';
import { Logger } from '../utils/logger';
import { NotFoundError, ValidationError, asyncHandler } from '../middleware/error';

const logger = new Logger('HRControllers');
const db = DatabaseConnection.getInstance();

export const employeesService = new EmployeesService(db);
export const payrollService = new PayrollService(db);
export const attendanceService = new AttendanceService(db);
export const hrReportsService = new HRReportsService(db);

export const employeesControllers = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const id = await employeesService.create(req.body);
    res.status(201).json({
      success: true,
      data: { id },
      message: 'Employee created successfully',
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await employeesService.update(id, req.body);
    res.json({
      success: true,
      message: 'Employee updated successfully',
    });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await employeesService.delete(id);
    res.json({
      success: true,
      message: 'Employee deleted successfully',
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const employee = await employeesService.findById(id);
    if (!employee) {
      throw new NotFoundError('Employee', id);
    }
    res.json({
      success: true,
      data: employee,
    });
  }),

  getByCode: asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.params;
    const employee = await employeesService.findByCode(code);
    if (!employee) {
      throw new NotFoundError(`Employee with code ${code}`);
    }
    res.json({
      success: true,
      data: employee,
    });
  }),

  getAll: asyncHandler(async (req: Request, res: Response) => {
    const query = {
      department: req.query.department as string,
      position: req.query.position as string,
      is_active: req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined,
      search: req.query.search as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };
    const employees = await employeesService.findAll(query);
    const count = await employeesService.count(query);
    res.json({
      success: true,
      data: employees,
      meta: { total: count, limit: query.limit, offset: query.offset },
    });
  }),

  getDepartments: asyncHandler(async (req: Request, res: Response) => {
    const departments = await employeesService.getDepartments();
    res.json({
      success: true,
      data: departments,
    });
  }),

  getPositions: asyncHandler(async (req: Request, res: Response) => {
    const positions = await employeesService.getPositions();
    res.json({
      success: true,
      data: positions,
    });
  }),
};

export const payrollControllers = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const id = await payrollService.create(req.body);
    res.status(201).json({
      success: true,
      data: { id },
      message: 'Payroll created successfully',
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await payrollService.update(id, req.body);
    res.json({
      success: true,
      message: 'Payroll updated successfully',
    });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await payrollService.delete(id);
    res.json({
      success: true,
      message: 'Payroll deleted successfully',
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const payroll = await payrollService.findById(id);
    if (!payroll) {
      throw new NotFoundError('Payroll', id);
    }
    res.json({
      success: true,
      data: payroll,
    });
  }),

  getByPayrollNo: asyncHandler(async (req: Request, res: Response) => {
    const { payrollNo } = req.params;
    const payroll = await payrollService.findByPayrollNo(payrollNo);
    if (!payroll) {
      throw new NotFoundError(`Payroll with number ${payrollNo}`);
    }
    res.json({
      success: true,
      data: payroll,
    });
  }),

  getAll: asyncHandler(async (req: Request, res: Response) => {
    const query = {
      employee_id: req.query.employee_id as string,
      status: req.query.status as string,
      period_start: req.query.period_start as string,
      period_end: req.query.period_end as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };
    const payrollRecords = await payrollService.findAll(query);
    const count = await payrollService.count(query);
    res.json({
      success: true,
      data: payrollRecords,
      meta: { total: count, limit: query.limit, offset: query.offset },
    });
  }),

  getEmployeePayroll: asyncHandler(async (req: Request, res: Response) => {
    const { employeeId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 12;
    const payrollRecords = await payrollService.getEmployeePayroll(employeeId, limit);
    res.json({
      success: true,
      data: payrollRecords,
    });
  }),
};

export const attendanceControllers = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const id = await attendanceService.create(req.body);
    res.status(201).json({
      success: true,
      data: { id },
      message: 'Attendance created successfully',
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await attendanceService.update(id, req.body);
    res.json({
      success: true,
      message: 'Attendance updated successfully',
    });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await attendanceService.delete(id);
    res.json({
      success: true,
      message: 'Attendance deleted successfully',
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const attendance = await attendanceService.findById(id);
    if (!attendance) {
      throw new NotFoundError('Attendance', id);
    }
    res.json({
      success: true,
      data: attendance,
    });
  }),

  getAll: asyncHandler(async (req: Request, res: Response) => {
    const query = {
      employee_id: req.query.employee_id as string,
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
      status: req.query.status as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };
    const attendanceRecords = await attendanceService.findAll(query);
    const count = await attendanceService.count(query);
    res.json({
      success: true,
      data: attendanceRecords,
      meta: { total: count, limit: query.limit, offset: query.offset },
    });
  }),

  getEmployeeAttendance: asyncHandler(async (req: Request, res: Response) => {
    const { employeeId } = req.params;
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      throw new ValidationError('Start date and end date are required');
    }
    const attendanceRecords = await attendanceService.getEmployeeAttendance(
      employeeId,
      start_date as string,
      end_date as string
    );
    res.json({
      success: true,
      data: attendanceRecords,
    });
  }),

  getAttendanceSummary: asyncHandler(async (req: Request, res: Response) => {
    const { employeeId } = req.params;
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      throw new ValidationError('Start date and end date are required');
    }
    const summary = await attendanceService.getAttendanceSummary(
      employeeId,
      start_date as string,
      end_date as string
    );
    res.json({
      success: true,
      data: summary,
    });
  }),
};

export const hrReportsControllers = {
  getHRSummary: asyncHandler(async (req: Request, res: Response) => {
    const summary = await hrReportsService.getHRSummary();
    res.json({
      success: true,
      data: summary,
    });
  }),

  getDepartmentStats: asyncHandler(async (req: Request, res: Response) => {
    const stats = await hrReportsService.getDepartmentStats();
    res.json({
      success: true,
      data: stats,
    });
  }),

  getEmployeeByDepartment: asyncHandler(async (req: Request, res: Response) => {
    const employees = await hrReportsService.getEmployeeByDepartment();
    res.json({
      success: true,
      data: employees,
    });
  }),

  getAttendanceReport: asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      throw new ValidationError('Start date and end date are required');
    }
    const report = await hrReportsService.getAttendanceReport(start_date as string, end_date as string);
    res.json({
      success: true,
      data: report,
    });
  }),

  getPayrollSummary: asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      throw new ValidationError('Start date and end date are required');
    }
    const summary = await hrReportsService.getPayrollSummary(start_date as string, end_date as string);
    res.json({
      success: true,
      data: summary,
    });
  }),

  getOvertimeReport: asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      throw new ValidationError('Start date and end date are required');
    }
    const report = await hrReportsService.getOvertimeReport(start_date as string, end_date as string);
    res.json({
      success: true,
      data: report,
    });
  }),

  getLeaveReport: asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      throw new ValidationError('Start date and end date are required');
    }
    const report = await hrReportsService.getLeaveReport(start_date as string, end_date as string);
    res.json({
      success: true,
      data: report,
    });
  }),

  getHiringTrend: asyncHandler(async (req: Request, res: Response) => {
    const { year } = req.query;
    if (!year) {
      throw new ValidationError('Year is required');
    }
    const trend = await hrReportsService.getHiringTrend(parseInt(year as string));
    res.json({
      success: true,
      data: trend,
    });
  }),

  getEmployeeTenure: asyncHandler(async (req: Request, res: Response) => {
    const tenure = await hrReportsService.getEmployeeTenure();
    res.json({
      success: true,
      data: tenure,
    });
  }),

  getTopEarners: asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const earners = await hrReportsService.getTopEarners(limit);
    res.json({
      success: true,
      data: earners,
    });
  }),
};

export default {
  employeesControllers,
  payrollControllers,
  attendanceControllers,
  hrReportsControllers,
};
