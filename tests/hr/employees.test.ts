import { DatabaseConnection } from '../../src/db/connection';
import { EmployeesService, EmployeeData } from '../../src/hr/employees';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../src/utils/helpers';

describe('EmployeesService', () => {
  let db: any;
  let service: EmployeesService;

  beforeAll(async () => {
    db = DatabaseConnection.getInstance();
    await DatabaseConnection.initialize();
    service = new EmployeesService(db);
  });

  beforeEach(() => {
    // Delete from child tables first due to foreign key constraints
    db.prepare('DELETE FROM payroll').run();
    db.prepare('DELETE FROM attendance').run();
    db.prepare('DELETE FROM employees').run();
  });

  afterEach(() => {
    // Delete from child tables first due to foreign key constraints
    db.prepare('DELETE FROM payroll').run();
    db.prepare('DELETE FROM attendance').run();
    db.prepare('DELETE FROM employees').run();
  });

  afterAll(() => {
    DatabaseConnection.close();
  });

  describe('create', () => {
    const validData: EmployeeData = {
      code: 'EMP000001',
      name: 'Test Employee',
      email: 'test@example.com',
      department: 'ENGINEERING',
      position: 'Software Engineer',
      hire_date: '2024-01-01',
    };

    it('should create a new employee with auto-generated code', async () => {
      const id = await service.create(validData);

      expect(id).toBeDefined();
      expect(id).toMatch(/^[0-9a-f-]{36}$/);

      const employee = await service.findById(id);
      expect(employee).toBeDefined();
      expect(employee?.name).toBe('Test Employee');
      expect(employee?.code).toBe('EMP000001');
    });

    it('should create employee with all optional fields', async () => {
      const data: EmployeeData = {
        code: 'EMP000002',
        name: 'Complete Employee',
        email: 'complete@example.com',
        phone: '03-1234-5678',
        department: 'SALES',
        position: 'Sales Manager',
        hire_date: '2024-01-01',
        birth_date: '1990-01-01',
        gender: 'MALE',
        address: 'Tokyo, Japan',
        bank_name: 'Example Bank',
        bank_account: '1234567',
        is_active: true,
      };

      const id = await service.create(data);
      const employee = await service.findById(id);

      expect(employee).toBeDefined();
      expect(employee?.phone).toBe('03-1234-5678');
      expect(employee?.gender).toBe('MALE');
      expect(employee?.bank_name).toBe('Example Bank');
    });

    it('should throw ValidationError when name is empty', async () => {
      const data: EmployeeData = {
        code: 'EMP000003',
        name: '',
        email: 'test@example.com',
        department: 'ENGINEERING',
        position: 'Developer',
        hire_date: '2024-01-01',
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid email', async () => {
      const data: EmployeeData = {
        code: 'EMP000004',
        name: 'Test Employee',
        email: 'invalid-email',
        department: 'ENGINEERING',
        position: 'Developer',
        hire_date: '2024-01-01',
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when department is empty', async () => {
      const data: EmployeeData = {
        code: 'EMP000005',
        name: 'Test Employee',
        email: 'test@example.com',
        department: '',
        position: 'Developer',
        hire_date: '2024-01-01',
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when position is empty', async () => {
      const data: EmployeeData = {
        code: 'EMP000006',
        name: 'Test Employee',
        email: 'test@example.com',
        department: 'ENGINEERING',
        position: '',
        hire_date: '2024-01-01',
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when hire_date is missing', async () => {
      const data: EmployeeData = {
        code: 'EMP000007',
        name: 'Test Employee',
        email: 'test@example.com',
        department: 'ENGINEERING',
        position: 'Developer',
        hire_date: '',
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid gender', async () => {
      const data: EmployeeData = {
        code: 'EMP000008',
        name: 'Test Employee',
        email: 'test@example.com',
        department: 'ENGINEERING',
        position: 'Developer',
        hire_date: '2024-01-01',
        gender: 'INVALID' as any,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw BusinessLogicError for duplicate code', async () => {
      const data1: EmployeeData = {
        code: 'EMP000009',
        name: 'Employee 1',
        email: 'emp1@example.com',
        department: 'ENGINEERING',
        position: 'Developer',
        hire_date: '2024-01-01',
      };

      await service.create(data1);

      const data2: EmployeeData = {
        code: 'EMP000009',
        name: 'Employee 2',
        email: 'emp2@example.com',
        department: 'SALES',
        position: 'Manager',
        hire_date: '2024-01-01',
      };

      await expect(service.create(data2)).rejects.toThrow(BusinessLogicError);
    });

    it('should throw BusinessLogicError for duplicate email', async () => {
      const data1: EmployeeData = {
        code: 'EMP000010',
        name: 'Employee 1',
        email: 'duplicate@example.com',
        department: 'ENGINEERING',
        position: 'Developer',
        hire_date: '2024-01-01',
      };

      await service.create(data1);

      const data2: EmployeeData = {
        code: 'EMP000011',
        name: 'Employee 2',
        email: 'duplicate@example.com',
        department: 'SALES',
        position: 'Manager',
        hire_date: '2024-01-01',
      };

      await expect(service.create(data2)).rejects.toThrow(BusinessLogicError);
    });
  });

  describe('update', () => {
    let testEmployeeId: string;

    beforeEach(async () => {
      const data: EmployeeData = {
        code: 'EMP000012',
        name: 'Original Name',
        email: 'original@example.com',
        department: 'ENGINEERING',
        position: 'Developer',
        hire_date: '2024-01-01',
      };

      testEmployeeId = await service.create(data);
    });

    it('should update employee details', async () => {
      await service.update(testEmployeeId, {
        name: 'Updated Name',
        department: 'SALES',
        position: 'Manager',
      });

      const employee = await service.findById(testEmployeeId);
      expect(employee?.name).toBe('Updated Name');
      expect(employee?.department).toBe('SALES');
      expect(employee?.position).toBe('Manager');
    });

    it('should update optional fields', async () => {
      await service.update(testEmployeeId, {
        phone: '03-9876-5432',
        birth_date: '1990-05-15',
        gender: 'FEMALE',
        address: 'Osaka, Japan',
      });

      const employee = await service.findById(testEmployeeId);
      expect(employee?.phone).toBe('03-9876-5432');
      expect(employee?.birth_date).toBe('1990-05-15');
      expect(employee?.gender).toBe('FEMALE');
      expect(employee?.address).toBe('Osaka, Japan');
    });

    it('should throw NotFoundError for non-existent employee', async () => {
      await expect(
        service.update('non-existent-id', { name: 'Test' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError for invalid email on update', async () => {
      await expect(
        service.update(testEmployeeId, { email: 'bad-email' })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw BusinessLogicError for duplicate email on update', async () => {
      // Create another employee
      await service.create({
        code: 'EMP000013',
        name: 'Other Employee',
        email: 'other@example.com',
        department: 'HR',
        position: 'Manager',
        hire_date: '2024-01-01',
      });

      await expect(
        service.update(testEmployeeId, { email: 'other@example.com' })
      ).rejects.toThrow(BusinessLogicError);
    });

    it('should throw ValidationError for invalid gender', async () => {
      await expect(
        service.update(testEmployeeId, { gender: 'INVALID' as any })
      ).rejects.toThrow(ValidationError);
    });

    it('should update is_active status', async () => {
      await service.update(testEmployeeId, { is_active: false });

      const employee = await service.findById(testEmployeeId);
      expect(employee?.is_active).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete employee successfully', async () => {
      const data: EmployeeData = {
        code: 'EMP000014',
        name: 'Test Employee',
        email: 'test@example.com',
        department: 'ENGINEERING',
        position: 'Developer',
        hire_date: '2024-01-01',
      };

      const id = await service.create(data);
      await service.delete(id);

      const employee = await service.findById(id);
      expect(employee).toBeNull();
    });

    it('should throw NotFoundError for non-existent employee', async () => {
      await expect(service.delete('non-existent-id')).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessLogicError when employee has payroll records', async () => {
      const data: EmployeeData = {
        code: 'EMP000015',
        name: 'Test Employee',
        email: 'test@example.com',
        department: 'ENGINEERING',
        position: 'Developer',
        hire_date: '2024-01-01',
      };

      const id = await service.create(data);

      // Create a payroll record for this employee
      db.prepare(`
        INSERT INTO payroll (id, payroll_no, employee_id, period_start, period_end, pay_date,
          status, basic_salary, overtime_pay, tax_amount, insurance_amount, net_pay, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'payroll-001',
        'PR000001',
        id,
        '2024-01-01',
        '2024-01-31',
        '2024-01-31',
        'DRAFT',
        300000,
        0,
        30000,
        20000,
        250000,
        new Date().toISOString(),
        new Date().toISOString()
      );

      await expect(service.delete(id)).rejects.toThrow(BusinessLogicError);
    });
  });

  describe('findById', () => {
    it('should find employee by id', async () => {
      const data: EmployeeData = {
        code: 'EMP000016',
        name: 'Test Employee',
        email: 'test@example.com',
        department: 'ENGINEERING',
        position: 'Developer',
        hire_date: '2024-01-01',
      };

      const id = await service.create(data);
      const employee = await service.findById(id);

      expect(employee).toBeDefined();
      expect(employee?.id).toBe(id);
      expect(employee?.name).toBe('Test Employee');
    });

    it('should return null for non-existent employee', async () => {
      const employee = await service.findById('non-existent-id');
      expect(employee).toBeNull();
    });
  });

  describe('findByCode', () => {
    it('should find employee by code', async () => {
      const data: EmployeeData = {
        code: 'EMP000017',
        name: 'Test Employee',
        email: 'test@example.com',
        department: 'ENGINEERING',
        position: 'Developer',
        hire_date: '2024-01-01',
      };

      await service.create(data);
      const employee = await service.findByCode('EMP000017');

      expect(employee).toBeDefined();
      expect(employee?.name).toBe('Test Employee');
    });

    it('should return null for non-existent code', async () => {
      const employee = await service.findByCode('NONEXISTENT');
      expect(employee).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      const employees: EmployeeData[] = [
        { code: 'EMP000018', name: 'Employee A', email: 'empa@example.com', department: 'ENGINEERING', position: 'Developer', hire_date: '2024-01-01', is_active: true },
        { code: 'EMP000019', name: 'Employee B', email: 'empb@example.com', department: 'SALES', position: 'Manager', hire_date: '2024-01-01', is_active: true },
        { code: 'EMP000020', name: 'Employee C', email: 'empc@example.com', department: 'ENGINEERING', position: 'Senior Developer', hire_date: '2024-01-01', is_active: false },
      ];

      for (const emp of employees) {
        await service.create(emp);
      }
    });

    it('should find all employees', async () => {
      const employees = await service.findAll();
      expect(employees).toHaveLength(3);
    });

    it('should filter by department', async () => {
      const employees = await service.findAll({ department: 'ENGINEERING' });
      expect(employees).toHaveLength(2);
    });

    it('should filter by position', async () => {
      const employees = await service.findAll({ position: 'Developer' });
      expect(employees).toHaveLength(1);
    });

    it('should filter by is_active', async () => {
      const employees = await service.findAll({ is_active: true });
      expect(employees).toHaveLength(2);
    });

    it('should search by name', async () => {
      const employees = await service.findAll({ search: 'Employee A' });
      expect(employees).toHaveLength(1);
      expect(employees[0].name).toBe('Employee A');
    });

    it('should search by code', async () => {
      const employees = await service.findAll({ search: 'EMP000018' });
      expect(employees).toHaveLength(1);
    });

    it('should search by email', async () => {
      const employees = await service.findAll({ search: 'empb@example.com' });
      expect(employees).toHaveLength(1);
    });

    it('should support pagination', async () => {
      const employees = await service.findAll({ limit: 2, offset: 0 });
      expect(employees.length).toBe(2);
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      const employees: EmployeeData[] = [
        { code: 'EMP000021', name: 'Employee A', email: 'empa@example.com', department: 'ENGINEERING', position: 'Developer', hire_date: '2024-01-01', is_active: true },
        { code: 'EMP000022', name: 'Employee B', email: 'empb@example.com', department: 'SALES', position: 'Manager', hire_date: '2024-01-01', is_active: true },
        { code: 'EMP000023', name: 'Employee C', email: 'empc@example.com', department: 'ENGINEERING', position: 'Senior Developer', hire_date: '2024-01-01', is_active: false },
      ];

      for (const emp of employees) {
        await service.create(emp);
      }
    });

    it('should count all employees', async () => {
      const count = await service.count();
      expect(count).toBe(3);
    });

    it('should count by department', async () => {
      const count = await service.count({ department: 'ENGINEERING' });
      expect(count).toBe(2);
    });

    it('should count by is_active', async () => {
      const count = await service.count({ is_active: true });
      expect(count).toBe(2);
    });
  });

  describe('getDepartments', () => {
    it('should return unique departments', async () => {
      const employees: EmployeeData[] = [
        { code: 'EMP000024', name: 'Emp 1', email: 'e1@example.com', department: 'ENGINEERING', position: 'Dev', hire_date: '2024-01-01' },
        { code: 'EMP000025', name: 'Emp 2', email: 'e2@example.com', department: 'SALES', position: 'Manager', hire_date: '2024-01-01' },
        { code: 'EMP000026', name: 'Emp 3', email: 'e3@example.com', department: 'ENGINEERING', position: 'Senior Dev', hire_date: '2024-01-01' },
      ];

      for (const emp of employees) {
        await service.create(emp);
      }

      const departments = await service.getDepartments();
      expect(departments).toHaveLength(2);
      expect(departments).toContain('ENGINEERING');
      expect(departments).toContain('SALES');
    });
  });

  describe('getPositions', () => {
    it('should return unique positions', async () => {
      const employees: EmployeeData[] = [
        { code: 'EMP000027', name: 'Emp 1', email: 'e1@example.com', department: 'ENGINEERING', position: 'Developer', hire_date: '2024-01-01' },
        { code: 'EMP000028', name: 'Emp 2', email: 'e2@example.com', department: 'SALES', position: 'Manager', hire_date: '2024-01-01' },
        { code: 'EMP000029', name: 'Emp 3', email: 'e3@example.com', department: 'ENGINEERING', position: 'Developer', hire_date: '2024-01-01' },
      ];

      for (const emp of employees) {
        await service.create(emp);
      }

      const positions = await service.getPositions();
      expect(positions).toHaveLength(2);
      expect(positions).toContain('Developer');
      expect(positions).toContain('Manager');
    });
  });
});
