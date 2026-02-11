import { DatabaseConnection } from '../../src/db/connection';
import { PayrollService, PayrollData } from '../../src/hr/payroll';
import { EmployeesService, EmployeeData } from '../../src/hr/employees';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../src/utils/helpers';

describe('PayrollService', () => {
  let db: any;
  let service: PayrollService;
  let employeesService: EmployeesService;
  let testEmployeeId: string;

  beforeAll(async () => {
    db = DatabaseConnection.getInstance();
    await DatabaseConnection.initialize();
    service = new PayrollService(db);
    employeesService = new EmployeesService(db);
  });

  beforeEach(async () => {
    db.prepare('DELETE FROM payroll').run();
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
    db.prepare('DELETE FROM payroll').run();
    db.prepare('DELETE FROM employees').run();
  });

  afterAll(() => {
    DatabaseConnection.close();
  });

  describe('create', () => {
    const getValidData = (): PayrollData => ({
      employee_id: testEmployeeId,
      period_start: '2024-01-01',
      period_end: '2024-01-31',
      pay_date: '2024-01-31',
      basic_salary: 300000,
    });

    it('should create a new payroll with auto-generated number', async () => {
      const id = await service.create(getValidData());

      expect(id).toBeDefined();

      const payroll = await service.findById(id);
      expect(payroll).toBeDefined();
      expect(payroll?.basic_salary).toBe(300000);
      expect(payroll?.payroll_no).toMatch(/^PR\d+/);
    });

    it('should calculate tax and insurance correctly', async () => {
      const id = await service.create(getValidData());
      const payroll = await service.findById(id);

      // Check calculations
      expect(payroll).toBeDefined();
      expect(payroll?.tax_amount).toBeGreaterThan(0);
      expect(payroll?.insurance_amount).toBeGreaterThan(0);
      expect(payroll?.net_pay).toBeLessThan(300000);
    });

    it('should calculate income tax with correct bracket (5% for low income)', async () => {
      const data: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        pay_date: '2024-01-31',
        basic_salary: 150000, // Below 195000 - 5% bracket
      };

      const id = await service.create(data);
      const payroll = await service.findById(id);

      // 150000 * 0.05 = 7500
      expect(payroll?.tax_amount).toBe(7500);
    });

    it('should calculate income tax with correct bracket (10%)', async () => {
      const data: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        pay_date: '2024-01-31',
        basic_salary: 250000, // Between 195000 and 330000
      };

      const id = await service.create(data);
      const payroll = await service.findById(id);

      // First 195000 at 5%: 9750
      // Next 55000 at 10%: 5500
      // Total: 15250
      expect(payroll?.tax_amount).toBe(15250);
    });

    it('should calculate income tax with correct bracket (20%)', async () => {
      const data: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        pay_date: '2024-01-31',
        basic_salary: 500000, // Between 330000 and 695000
      };

      const id = await service.create(data);
      const payroll = await service.findById(id);

      // Progressive calculation
      expect(payroll?.tax_amount).toBeGreaterThan(0);
    });

    it('should calculate social insurance correctly', async () => {
      const id = await service.create(getValidData());
      const payroll = await service.findById(id);

      // Health: 5%, Pension: 4.5%, Unemployment: 0.3% = 9.8%
      const expectedInsurance = Math.floor(300000 * 0.098);
      expect(payroll?.insurance_amount).toBe(expectedInsurance);
    });

    it('should create payroll with all optional fields', async () => {
      const data: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        pay_date: '2024-01-31',
        basic_salary: 300000,
        overtime_pay: 50000,
        bonus: 100000,
        allowances: 30000,
        deductions: 50000,
        notes: 'Performance bonus',
      };

      const id = await service.create(data);
      const payroll = await service.findById(id);

      expect(payroll?.overtime_pay).toBe(50000);
      expect(payroll?.bonus).toBe(100000);
      expect(payroll?.allowances).toBe(30000);
      expect(payroll?.deductions).toBe(50000);
    });

    it('should throw NotFoundError for non-existent employee', async () => {
      const data: PayrollData = {
        employee_id: 'non-existent',
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        pay_date: '2024-01-31',
        basic_salary: 300000,
      };

      await expect(service.create(data)).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessLogicError for inactive employee', async () => {
      await employeesService.update(testEmployeeId, { is_active: false });

      const data: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        pay_date: '2024-01-31',
        basic_salary: 300000,
      };

      await expect(service.create(data)).rejects.toThrow(BusinessLogicError);
    });

    it('should throw ValidationError when period_start is missing', async () => {
      const data: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '',
        period_end: '2024-01-31',
        pay_date: '2024-01-31',
        basic_salary: 300000,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when period_end is before period_start', async () => {
      const data: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-01-31',
        period_end: '2024-01-01',
        pay_date: '2024-02-01',
        basic_salary: 300000,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when pay_date is before period_end', async () => {
      const data: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        pay_date: '2024-01-15',
        basic_salary: 300000,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative basic_salary', async () => {
      const data: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        pay_date: '2024-01-31',
        basic_salary: -1000,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative overtime_pay', async () => {
      const data: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        pay_date: '2024-01-31',
        basic_salary: 300000,
        overtime_pay: -5000,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative bonus', async () => {
      const data: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        pay_date: '2024-01-31',
        basic_salary: 300000,
        bonus: -10000,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative allowances', async () => {
      const data: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        pay_date: '2024-01-31',
        basic_salary: 300000,
        allowances: -1000,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative deductions', async () => {
      const data: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        pay_date: '2024-01-31',
        basic_salary: 300000,
        deductions: -500,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw BusinessLogicError for duplicate period', async () => {
      await service.create(getValidData());

      const duplicateData: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        pay_date: '2024-01-31',
        basic_salary: 350000,
      };

      await expect(service.create(duplicateData)).rejects.toThrow(BusinessLogicError);
    });

    it('should create payroll for different periods for same employee', async () => {
      await service.create(getValidData());

      const differentPeriod: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-02-01',
        period_end: '2024-02-29',
        pay_date: '2024-02-29',
        basic_salary: 300000,
      };

      const id = await service.create(differentPeriod);
      expect(id).toBeDefined();
    });
  });

  describe('update', () => {
    let testPayrollId: string;

    beforeEach(async () => {
      const data: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        pay_date: '2024-01-31',
        basic_salary: 300000,
      };
      testPayrollId = await service.create(data);
    });

    it('should update basic salary and recalculate', async () => {
      await service.update(testPayrollId, { basic_salary: 350000 });

      const payroll = await service.findById(testPayrollId);
      expect(payroll?.basic_salary).toBe(350000);
      expect(payroll?.tax_amount).not.toBe(0);
    });

    it('should update overtime pay', async () => {
      await service.update(testPayrollId, { overtime_pay: 50000 });

      const payroll = await service.findById(testPayrollId);
      expect(payroll?.overtime_pay).toBe(50000);
    });

    it('should update bonus', async () => {
      await service.update(testPayrollId, { bonus: 100000 });

      const payroll = await service.findById(testPayrollId);
      expect(payroll?.bonus).toBe(100000);
    });

    it('should update allowances', async () => {
      await service.update(testPayrollId, { allowances: 30000 });

      const payroll = await service.findById(testPayrollId);
      expect(payroll?.allowances).toBe(30000);
    });

    it('should update deductions', async () => {
      await service.update(testPayrollId, { deductions: 5000 });

      const payroll = await service.findById(testPayrollId);
      expect(payroll?.deductions).toBe(5000);
    });

    it('should update status', async () => {
      await service.update(testPayrollId, { status: 'CALCULATED' });

      const payroll = await service.findById(testPayrollId);
      expect(payroll?.status).toBe('CALCULATED');
    });

    it('should update pay_date', async () => {
      await service.update(testPayrollId, { pay_date: '2024-02-05' });

      const payroll = await service.findById(testPayrollId);
      expect(payroll?.pay_date).toBe('2024-02-05');
    });

    it('should update notes', async () => {
      await service.update(testPayrollId, { notes: 'Updated notes' });

      const payroll = await service.findById(testPayrollId);
      expect(payroll?.notes).toBe('Updated notes');
    });

    it('should throw NotFoundError for non-existent payroll', async () => {
      await expect(
        service.update('non-existent-id', { basic_salary: 350000 })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessLogicError when updating paid payroll', async () => {
      await service.update(testPayrollId, { status: 'PAID' });

      await expect(
        service.update(testPayrollId, { basic_salary: 350000 })
      ).rejects.toThrow(BusinessLogicError);
    });

    it('should throw BusinessLogicError when updating cancelled payroll', async () => {
      await service.update(testPayrollId, { status: 'CANCELLED' });

      await expect(
        service.update(testPayrollId, { basic_salary: 350000 })
      ).rejects.toThrow(BusinessLogicError);
    });

    it('should throw ValidationError for invalid status', async () => {
      await expect(
        service.update(testPayrollId, { status: 'INVALID' as any })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative basic_salary', async () => {
      await expect(
        service.update(testPayrollId, { basic_salary: -1000 })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative overtime_pay', async () => {
      await expect(
        service.update(testPayrollId, { overtime_pay: -5000 })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative bonus', async () => {
      await expect(
        service.update(testPayrollId, { bonus: -10000 })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative allowances', async () => {
      await expect(
        service.update(testPayrollId, { allowances: -1000 })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative deductions', async () => {
      await expect(
        service.update(testPayrollId, { deductions: -500 })
      ).rejects.toThrow(ValidationError);
    });

    it('should recalculate tax and insurance after update', async () => {
      const original = await service.findById(testPayrollId);
      const originalTax = original?.tax_amount || 0;

      await service.update(testPayrollId, { basic_salary: 400000 });

      const updated = await service.findById(testPayrollId);
      expect(updated?.tax_amount).toBeGreaterThan(originalTax);
    });
  });

  describe('delete', () => {
    it('should delete draft payroll successfully', async () => {
      const data: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        pay_date: '2024-01-31',
        basic_salary: 300000,
        status: 'DRAFT',
      };

      const id = await service.create(data);
      await service.delete(id);

      const payroll = await service.findById(id);
      expect(payroll).toBeNull();
    });

    it('should throw NotFoundError for non-existent payroll', async () => {
      await expect(service.delete('non-existent-id')).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessLogicError when deleting paid payroll', async () => {
      const data: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        pay_date: '2024-01-31',
        basic_salary: 300000,
        status: 'PAID',
      };

      const id = await service.create(data);

      await expect(service.delete(id)).rejects.toThrow(BusinessLogicError);
    });

    it('should delete calculated payroll successfully', async () => {
      const data: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        pay_date: '2024-01-31',
        basic_salary: 300000,
        status: 'CALCULATED',
      };

      const id = await service.create(data);
      await service.delete(id);

      const payroll = await service.findById(id);
      expect(payroll).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find payroll by id', async () => {
      const data: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        pay_date: '2024-01-31',
        basic_salary: 300000,
      };

      const id = await service.create(data);
      const payroll = await service.findById(id);

      expect(payroll).toBeDefined();
      expect(payroll?.id).toBe(id);
      expect(payroll?.employee_id).toBe(testEmployeeId);
    });

    it('should return null for non-existent payroll', async () => {
      const payroll = await service.findById('non-existent-id');
      expect(payroll).toBeNull();
    });
  });

  describe('findByPayrollNo', () => {
    it('should find payroll by payroll number', async () => {
      const data: PayrollData = {
        employee_id: testEmployeeId,
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        pay_date: '2024-01-31',
        basic_salary: 300000,
        payroll_no: 'PR999999',
      };

      await service.create(data);
      const payroll = await service.findByPayrollNo('PR999999');

      expect(payroll).toBeDefined();
      expect(payroll?.payroll_no).toBe('PR999999');
    });

    it('should return null for non-existent payroll number', async () => {
      const payroll = await service.findByPayrollNo('NONEXISTENT');
      expect(payroll).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      const payrolls: PayrollData[] = [
        {
          employee_id: testEmployeeId,
          period_start: '2024-01-01',
          period_end: '2024-01-31',
          pay_date: '2024-01-31',
          basic_salary: 300000,
          status: 'DRAFT',
        },
        {
          employee_id: testEmployeeId,
          period_start: '2024-02-01',
          period_end: '2024-02-29',
          pay_date: '2024-02-29',
          basic_salary: 300000,
          status: 'CALCULATED',
        },
        {
          employee_id: testEmployeeId,
          period_start: '2024-03-01',
          period_end: '2024-03-31',
          pay_date: '2024-03-31',
          basic_salary: 300000,
          status: 'PAID',
        },
      ];

      for (const payroll of payrolls) {
        await service.create(payroll);
      }
    });

    it('should find all payrolls', async () => {
      const payrolls = await service.findAll();
      expect(payrolls.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by employee_id', async () => {
      const payrolls = await service.findAll({ employee_id: testEmployeeId });
      expect(payrolls.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by status', async () => {
      const payrolls = await service.findAll({ status: 'DRAFT' });
      expect(payrolls.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by period', async () => {
      const payrolls = await service.findAll({
        period_start: '2024-01-15',
        period_end: '2024-02-15',
      });
      expect(payrolls.length).toBeGreaterThanOrEqual(2);
    });

    it('should support pagination', async () => {
      const payrolls = await service.findAll({ limit: 2, offset: 0 });
      expect(payrolls.length).toBeLessThanOrEqual(2);
    });

    it('should order by period_start DESC', async () => {
      const payrolls = await service.findAll();
      expect(payrolls[0].period_start).toBe('2024-03-01');
      expect(payrolls[1].period_start).toBe('2024-02-01');
      expect(payrolls[2].period_start).toBe('2024-01-01');
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      const payrolls: PayrollData[] = [
        {
          employee_id: testEmployeeId,
          period_start: '2024-01-01',
          period_end: '2024-01-31',
          pay_date: '2024-01-31',
          basic_salary: 300000,
          status: 'DRAFT',
        },
        {
          employee_id: testEmployeeId,
          period_start: '2024-02-01',
          period_end: '2024-02-29',
          pay_date: '2024-02-29',
          basic_salary: 300000,
          status: 'CALCULATED',
        },
        {
          employee_id: testEmployeeId,
          period_start: '2024-03-01',
          period_end: '2024-03-31',
          pay_date: '2024-03-31',
          basic_salary: 300000,
          status: 'PAID',
        },
      ];

      for (const payroll of payrolls) {
        await service.create(payroll);
      }
    });

    it('should count all payrolls', async () => {
      const count = await service.count();
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it('should count by employee_id', async () => {
      const count = await service.count({ employee_id: testEmployeeId });
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it('should count by status', async () => {
      const count = await service.count({ status: 'PAID' });
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('should count by period', async () => {
      const count = await service.count({
        period_start: '2024-01-01',
        period_end: '2024-02-28',
      });
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getEmployeePayroll', () => {
    beforeEach(async () => {
      const payrolls: PayrollData[] = [
        {
          employee_id: testEmployeeId,
          period_start: '2024-01-01',
          period_end: '2024-01-31',
          pay_date: '2024-01-31',
          basic_salary: 300000,
        },
        {
          employee_id: testEmployeeId,
          period_start: '2024-02-01',
          period_end: '2024-02-29',
          pay_date: '2024-02-29',
          basic_salary: 300000,
        },
        {
          employee_id: testEmployeeId,
          period_start: '2024-03-01',
          period_end: '2024-03-31',
          pay_date: '2024-03-31',
          basic_salary: 300000,
        },
      ];

      for (const payroll of payrolls) {
        await service.create(payroll);
      }
    });

    it('should get payroll history for employee', async () => {
      const payrolls = await service.getEmployeePayroll(testEmployeeId, 10);
      expect(payrolls.length).toBeGreaterThanOrEqual(3);
      expect(payrolls[0].employee_id).toBe(testEmployeeId);
    });

    it('should limit results', async () => {
      const payrolls = await service.getEmployeePayroll(testEmployeeId, 2);
      expect(payrolls.length).toBeLessThanOrEqual(2);
    });
  });
});
