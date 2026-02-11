import { DatabaseConnection } from '../../src/db/connection';
import { AttendanceService, AttendanceData } from '../../src/hr/attendance';
import { EmployeesService, EmployeeData } from '../../src/hr/employees';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../src/utils/helpers';

describe('AttendanceService', () => {
  let db: any;
  let service: AttendanceService;
  let employeesService: EmployeesService;
  let testEmployeeId: string;

  beforeAll(async () => {
    db = DatabaseConnection.getInstance();
    await DatabaseConnection.initialize();
    service = new AttendanceService(db);
    employeesService = new EmployeesService(db);
  });

  beforeEach(async () => {
    db.prepare('DELETE FROM attendance').run();
    db.prepare('DELETE FROM employees').run();

    // Create test employee
    const employeeData: EmployeeData = {
      code: 'EMP000001',
      name: 'Test Employee',
      email: 'test@example.com',
      department: 'ENGINEERING',
      position: 'Software Engineer',
      hire_date: '2024-01-01',
      is_active: true,
    };
    testEmployeeId = await employeesService.create(employeeData);
  });

  afterEach(() => {
    db.prepare('DELETE FROM attendance').run();
    db.prepare('DELETE FROM employees').run();
  });

  afterAll(() => {
    DatabaseConnection.close();
  });

  describe('create', () => {
    it('should create attendance with check in/out and auto-calculate hours', async () => {
      const data: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-15',
        check_in: '09:00',
        check_out: '18:00',
      };

      const id = await service.create(data);

      expect(id).toBeDefined();

      const attendance = await service.findById(id);
      expect(attendance).toBeDefined();
      expect(attendance?.work_hours).toBe(9);
      expect(attendance?.status).toBe('PRESENT');
    });

    it('should calculate overtime when work hours exceed standard', async () => {
      const data: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-15',
        check_in: '09:00',
        check_out: '20:00',
      };

      const id = await service.create(data);
      const attendance = await service.findById(id);

      expect(attendance?.work_hours).toBe(11);
      expect(attendance?.overtime_hours).toBe(3);
    });

    it('should set status to LATE when check in is after 9:00', async () => {
      const data: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-15',
        check_in: '09:30',
        check_out: '18:00',
      };

      const id = await service.create(data);
      const attendance = await service.findById(id);

      expect(attendance?.status).toBe('LATE');
    });

    it('should set status to HALF_DAY when work hours less than 4', async () => {
      const data: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-15',
        check_in: '09:00',
        check_out: '12:00',
      };

      const id = await service.create(data);
      const attendance = await service.findById(id);

      expect(attendance?.status).toBe('HALF_DAY');
    });

    it('should create attendance with manual status', async () => {
      const data: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-15',
        status: 'ABSENT',
        notes: 'Sick leave',
      };

      const id = await service.create(data);
      const attendance = await service.findById(id);

      expect(attendance?.status).toBe('ABSENT');
      expect(attendance?.notes).toBe('Sick leave');
    });

    it('should create attendance with manual work hours', async () => {
      const data: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-15',
        work_hours: 8,
        overtime_hours: 2,
        status: 'PRESENT',
      };

      const id = await service.create(data);
      const attendance = await service.findById(id);

      expect(attendance?.work_hours).toBe(8);
      expect(attendance?.overtime_hours).toBe(2);
    });

    it('should create attendance with LEAVE status', async () => {
      const data: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-15',
        status: 'LEAVE',
        notes: 'Annual leave',
      };

      const id = await service.create(data);
      const attendance = await service.findById(id);

      expect(attendance?.status).toBe('LEAVE');
    });

    it('should create attendance with HOLIDAY status', async () => {
      const data: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-01',
        status: 'HOLIDAY',
        notes: 'New Year',
      };

      const id = await service.create(data);
      const attendance = await service.findById(id);

      expect(attendance?.status).toBe('HOLIDAY');
    });

    it('should throw NotFoundError for non-existent employee', async () => {
      const data: AttendanceData = {
        employee_id: 'non-existent',
        attendance_date: '2024-01-15',
        status: 'PRESENT',
      };

      await expect(service.create(data)).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessLogicError for inactive employee', async () => {
      await employeesService.update(testEmployeeId, { is_active: false });

      const data: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-15',
        status: 'PRESENT',
      };

      await expect(service.create(data)).rejects.toThrow(BusinessLogicError);
    });

    it('should throw ValidationError when attendance_date is missing', async () => {
      const data: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '',
        status: 'PRESENT',
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when check_out is before check_in', async () => {
      const data: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-15',
        check_in: '18:00',
        check_out: '09:00',
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative work_hours', async () => {
      const data: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-15',
        work_hours: -1,
        status: 'PRESENT',
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative overtime_hours', async () => {
      const data: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-15',
        work_hours: 8,
        overtime_hours: -1,
        status: 'PRESENT',
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw BusinessLogicError for duplicate attendance', async () => {
      const data: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-15',
        status: 'PRESENT',
      };

      await service.create(data);

      const duplicateData: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-15',
        status: 'LATE',
      };

      await expect(service.create(duplicateData)).rejects.toThrow(BusinessLogicError);
    });

    it('should allow attendance for different dates', async () => {
      const data1: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-15',
        status: 'PRESENT',
      };

      const data2: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-16',
        status: 'PRESENT',
      };

      const id1 = await service.create(data1);
      const id2 = await service.create(data2);

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should calculate work hours with minutes', async () => {
      const data: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-15',
        check_in: '09:30',
        check_out: '18:45',
      };

      const id = await service.create(data);
      const attendance = await service.findById(id);

      // 9 hours and 15 minutes = 9.25 hours
      expect(attendance?.work_hours).toBeCloseTo(9.25, 1);
    });
  });

  describe('update', () => {
    let testAttendanceId: string;

    beforeEach(async () => {
      const data: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-15',
        check_in: '09:00',
        check_out: '18:00',
      };
      testAttendanceId = await service.create(data);
    });

    it('should update check in/out and recalculate hours', async () => {
      await service.update(testAttendanceId, {
        check_in: '08:00',
        check_out: '19:00',
      });

      const attendance = await service.findById(testAttendanceId);
      expect(attendance?.check_in).toBe('08:00');
      expect(attendance?.check_out).toBe('19:00');
      expect(attendance?.work_hours).toBe(11);
    });

    it('should update status manually', async () => {
      await service.update(testAttendanceId, { status: 'LEAVE' });

      const attendance = await service.findById(testAttendanceId);
      expect(attendance?.status).toBe('LEAVE');
    });

    it('should update work hours manually', async () => {
      await service.update(testAttendanceId, { work_hours: 7.5 });

      const attendance = await service.findById(testAttendanceId);
      expect(attendance?.work_hours).toBe(7.5);
    });

    it('should update overtime hours manually', async () => {
      await service.update(testAttendanceId, { overtime_hours: 3 });

      const attendance = await service.findById(testAttendanceId);
      expect(attendance?.overtime_hours).toBe(3);
    });

    it('should update notes', async () => {
      await service.update(testAttendanceId, { notes: 'Late due to traffic' });

      const attendance = await service.findById(testAttendanceId);
      expect(attendance?.notes).toBe('Late due to traffic');
    });

    it('should recalculate status when updating check_in/check_out', async () => {
      await service.update(testAttendanceId, {
        check_in: '09:30',
        check_out: '18:00',
      });

      const attendance = await service.findById(testAttendanceId);
      expect(attendance?.status).toBe('LATE');
    });

    it('should reset overtime when work hours are within standard', async () => {
      await service.update(testAttendanceId, {
        check_in: '09:00',
        check_out: '17:00',
      });

      const attendance = await service.findById(testAttendanceId);
      expect(attendance?.overtime_hours).toBe(0);
    });

    it('should throw NotFoundError for non-existent attendance', async () => {
      await expect(
        service.update('non-existent-id', { status: 'LEAVE' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError when check_out is before check_in', async () => {
      await expect(
        service.update(testAttendanceId, {
          check_in: '18:00',
          check_out: '09:00',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should update only check_in', async () => {
      await service.update(testAttendanceId, { check_in: '08:30' });

      const attendance = await service.findById(testAttendanceId);
      expect(attendance?.check_in).toBe('08:30');
      expect(attendance?.check_out).toBe('18:00');
    });

    it('should update only check_out', async () => {
      await service.update(testAttendanceId, { check_out: '19:30' });

      const attendance = await service.findById(testAttendanceId);
      expect(attendance?.check_in).toBe('09:00');
      expect(attendance?.check_out).toBe('19:30');
    });
  });

  describe('delete', () => {
    it('should delete attendance successfully', async () => {
      const data: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-15',
        status: 'PRESENT',
      };

      const id = await service.create(data);
      await service.delete(id);

      const attendance = await service.findById(id);
      expect(attendance).toBeNull();
    });

    it('should throw NotFoundError for non-existent attendance', async () => {
      await expect(service.delete('non-existent-id')).rejects.toThrow(NotFoundError);
    });
  });

  describe('findById', () => {
    it('should find attendance by id', async () => {
      const data: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-15',
        status: 'PRESENT',
      };

      const id = await service.create(data);
      const attendance = await service.findById(id);

      expect(attendance).toBeDefined();
      expect(attendance?.id).toBe(id);
      expect(attendance?.employee_id).toBe(testEmployeeId);
    });

    it('should return null for non-existent attendance', async () => {
      const attendance = await service.findById('non-existent-id');
      expect(attendance).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      const attendances: AttendanceData[] = [
        {
          employee_id: testEmployeeId,
          attendance_date: '2024-01-15',
          status: 'PRESENT',
        },
        {
          employee_id: testEmployeeId,
          attendance_date: '2024-01-16',
          status: 'LATE',
        },
        {
          employee_id: testEmployeeId,
          attendance_date: '2024-01-17',
          status: 'ABSENT',
        },
        {
          employee_id: testEmployeeId,
          attendance_date: '2024-01-18',
          status: 'LEAVE',
        },
      ];

      for (const attendance of attendances) {
        await service.create(attendance);
      }
    });

    it('should find all attendance records', async () => {
      const attendances = await service.findAll();
      expect(attendances.length).toBeGreaterThanOrEqual(4);
    });

    it('should filter by employee_id', async () => {
      const attendances = await service.findAll({ employee_id: testEmployeeId });
      expect(attendances.length).toBeGreaterThanOrEqual(4);
    });

    it('should filter by status', async () => {
      const attendances = await service.findAll({ status: 'PRESENT' });
      expect(attendances.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by date range', async () => {
      const attendances = await service.findAll({
        start_date: '2024-01-15',
        end_date: '2024-01-16',
      });
      expect(attendances.length).toBeGreaterThanOrEqual(2);
    });

    it('should support pagination', async () => {
      const attendances = await service.findAll({ limit: 2, offset: 0 });
      expect(attendances.length).toBeLessThanOrEqual(2);
    });

    it('should order by attendance_date DESC', async () => {
      const attendances = await service.findAll();
      expect(attendances[0].attendance_date).toBe('2024-01-18');
      expect(attendances[1].attendance_date).toBe('2024-01-17');
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      const attendances: AttendanceData[] = [
        {
          employee_id: testEmployeeId,
          attendance_date: '2024-01-15',
          status: 'PRESENT',
        },
        {
          employee_id: testEmployeeId,
          attendance_date: '2024-01-16',
          status: 'LATE',
        },
        {
          employee_id: testEmployeeId,
          attendance_date: '2024-01-17',
          status: 'ABSENT',
        },
      ];

      for (const attendance of attendances) {
        await service.create(attendance);
      }
    });

    it('should count all attendance records', async () => {
      const count = await service.count();
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it('should count by employee_id', async () => {
      const count = await service.count({ employee_id: testEmployeeId });
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it('should count by status', async () => {
      const count = await service.count({ status: 'PRESENT' });
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('should count by date range', async () => {
      const count = await service.count({
        start_date: '2024-01-15',
        end_date: '2024-01-16',
      });
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getEmployeeAttendance', () => {
    beforeEach(async () => {
      const attendances: AttendanceData[] = [
        {
          employee_id: testEmployeeId,
          attendance_date: '2024-01-15',
          status: 'PRESENT',
          check_in: '09:00',
          check_out: '18:00',
        },
        {
          employee_id: testEmployeeId,
          attendance_date: '2024-01-16',
          status: 'PRESENT',
          check_in: '09:00',
          check_out: '18:00',
        },
        {
          employee_id: testEmployeeId,
          attendance_date: '2024-01-17',
          status: 'LATE',
          check_in: '09:30',
          check_out: '18:00',
        },
      ];

      for (const attendance of attendances) {
        await service.create(attendance);
      }
    });

    it('should get attendance for employee in date range', async () => {
      const attendances = await service.getEmployeeAttendance(
        testEmployeeId,
        '2024-01-15',
        '2024-01-17'
      );
      expect(attendances.length).toBeGreaterThanOrEqual(3);
      expect(attendances[0].employee_id).toBe(testEmployeeId);
    });

    it('should filter by start date', async () => {
      const attendances = await service.getEmployeeAttendance(
        testEmployeeId,
        '2024-01-16',
        '2024-01-31'
      );
      expect(attendances.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by end date', async () => {
      const attendances = await service.getEmployeeAttendance(
        testEmployeeId,
        '2024-01-01',
        '2024-01-16'
      );
      expect(attendances.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getAttendanceSummary', () => {
    beforeEach(async () => {
      const attendances: AttendanceData[] = [
        {
          employee_id: testEmployeeId,
          attendance_date: '2024-01-15',
          status: 'PRESENT',
          work_hours: 8,
        },
        {
          employee_id: testEmployeeId,
          attendance_date: '2024-01-16',
          status: 'PRESENT',
          work_hours: 8,
        },
        {
          employee_id: testEmployeeId,
          attendance_date: '2024-01-17',
          status: 'LATE',
          work_hours: 8,
        },
        {
          employee_id: testEmployeeId,
          attendance_date: '2024-01-18',
          status: 'ABSENT',
          work_hours: 0,
        },
        {
          employee_id: testEmployeeId,
          attendance_date: '2024-01-19',
          status: 'LEAVE',
          work_hours: 0,
        },
      ];

      for (const attendance of attendances) {
        await service.create(attendance);
      }
    });

    it('should calculate attendance summary', async () => {
      const summary = await service.getAttendanceSummary(
        testEmployeeId,
        '2024-01-15',
        '2024-01-19'
      );

      expect(summary.total_days).toBe(5);
      expect(summary.present_days).toBe(2);
      expect(summary.late_days).toBe(1);
      expect(summary.absent_days).toBe(1);
      expect(summary.leave_days).toBe(1);
      expect(summary.total_work_hours).toBe(24);
    });

    it('should calculate attendance rate', async () => {
      const summary = await service.getAttendanceSummary(
        testEmployeeId,
        '2024-01-15',
        '2024-01-19'
      );

      // 2 present days out of 5 total days = 40%
      expect(summary.attendance_rate).toBe(40);
    });

    it('should return zero summary when no records', async () => {
      const summary = await service.getAttendanceSummary(
        testEmployeeId,
        '2024-02-01',
        '2024-02-28'
      );

      expect(summary.total_days).toBe(0);
      expect(summary.present_days).toBe(0);
      expect(summary.attendance_rate).toBe(0);
    });

    it('should include overtime in summary', async () => {
      const data: AttendanceData = {
        employee_id: testEmployeeId,
        attendance_date: '2024-01-20',
        check_in: '09:00',
        check_out: '20:00',
      };
      await service.create(data);

      const summary = await service.getAttendanceSummary(
        testEmployeeId,
        '2024-01-15',
        '2024-01-20'
      );

      expect(summary.total_overtime_hours).toBeGreaterThan(0);
    });
  });
});
