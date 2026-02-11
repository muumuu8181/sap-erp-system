import { DatabaseConnection } from '../../src/db/connection';
import { CustomersService, CustomerData } from '../../src/sales/customers';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../src/utils/helpers';

describe('CustomersService', () => {
  let db: any;
  let service: CustomersService;
  let testCustomerId: string;

  beforeAll(async () => {
    db = DatabaseConnection.getInstance();
    await DatabaseConnection.initialize();
    service = new CustomersService(db);
  });

  beforeEach(() => {
    // Clean up in correct order to respect foreign keys
    db.prepare('DELETE FROM sales_order_items').run();
    db.prepare('DELETE FROM sales_orders').run();
    db.prepare('DELETE FROM invoice_items').run();
    db.prepare('DELETE FROM invoices').run();
    db.prepare('DELETE FROM accounts_receivable').run();
    db.prepare('DELETE FROM customers').run();
  });

  afterEach(() => {
    db.prepare('DELETE FROM sales_order_items').run();
    db.prepare('DELETE FROM sales_orders').run();
    db.prepare('DELETE FROM invoice_items').run();
    db.prepare('DELETE FROM invoices').run();
    db.prepare('DELETE FROM accounts_receivable').run();
    db.prepare('DELETE FROM customers').run();
  });

  afterAll(() => {
    DatabaseConnection.close();
  });

  describe('create', () => {
    it('should create a new customer with auto-generated code', async () => {
      const data: CustomerData = {
        code: 'CUS000001',
        name: 'Test Customer',
        category: 'RETAIL',
        payment_term: 30,
        credit_limit: 1000000,
        email: 'test@example.com',
        phone: '03-1234-5678',
        address: 'Tokyo',
      };

      const id = await service.create(data);

      expect(id).toBeDefined();
      expect(id).toMatch(/^[0-9a-f-]{36}$/);

      const customer = await service.findById(id);
      expect(customer).toBeDefined();
      expect(customer?.name).toBe('Test Customer');
      expect(customer?.code).toBe('CUS000001');
    });

    it('should throw ValidationError when name is empty', async () => {
      const data: CustomerData = {
        code: 'CUS000002',
        name: '',
        category: 'RETAIL',
        payment_term: 30,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when payment_term is negative', async () => {
      const data: CustomerData = {
        code: 'CUS000003',
        name: 'Test Customer',
        category: 'RETAIL',
        payment_term: -10,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid email format', async () => {
      const data: CustomerData = {
        code: 'CUS000004',
        name: 'Test Customer',
        category: 'RETAIL',
        payment_term: 30,
        email: 'invalid-email',
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw BusinessLogicError for duplicate code', async () => {
      const data: CustomerData = {
        code: 'CUS000005',
        name: 'Customer 1',
        category: 'RETAIL',
        payment_term: 30,
      };

      await service.create(data);

      const data2: CustomerData = {
        code: 'CUS000005',
        name: 'Customer 2',
        category: 'WHOLESALE',
        payment_term: 60,
      };

      await expect(service.create(data2)).rejects.toThrow(BusinessLogicError);
    });

    it('should create customer with default values', async () => {
      const data: CustomerData = {
        code: 'CUS000006',
        name: 'Minimal Customer',
        category: 'RETAIL',
        payment_term: 30,
      };

      const id = await service.create(data);
      const customer = await service.findById(id);

      expect(customer?.country).toBe('JP');
      expect(customer?.is_active).toBe(true);
      expect(customer?.credit_limit).toBe(0);
    });
  });

  describe('update', () => {
    it('should update customer details', async () => {
      const data: CustomerData = {
        code: 'CUS000007',
        name: 'Original Name',
        category: 'RETAIL',
        payment_term: 30,
      };

      const id = await service.create(data);

      await service.update(id, {
        name: 'Updated Name',
        category: 'WHOLESALE',
        payment_term: 60,
      });

      const customer = await service.findById(id);
      expect(customer?.name).toBe('Updated Name');
      expect(customer?.category).toBe('WHOLESALE');
      expect(customer?.payment_term).toBe(60);
    });

    it('should throw NotFoundError for non-existent customer', async () => {
      await expect(
        service.update('non-existent-id', { name: 'Test' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError for negative credit_limit on update', async () => {
      const data: CustomerData = {
        code: 'CUS000008',
        name: 'Test Customer',
        category: 'RETAIL',
        payment_term: 30,
      };

      const id = await service.create(data);

      await expect(
        service.update(id, { credit_limit: -100 })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid email on update', async () => {
      const data: CustomerData = {
        code: 'CUS000009',
        name: 'Test Customer',
        category: 'RETAIL',
        payment_term: 30,
      };

      const id = await service.create(data);

      await expect(
        service.update(id, { email: 'bad-email' })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('delete', () => {
    it('should delete customer successfully', async () => {
      const data: CustomerData = {
        code: 'CUS000010',
        name: 'Test Customer',
        category: 'RETAIL',
        payment_term: 30,
      };

      const id = await service.create(data);
      await service.delete(id);

      const customer = await service.findById(id);
      expect(customer).toBeNull();
    });

    it('should throw NotFoundError for non-existent customer', async () => {
      await expect(service.delete('non-existent-id')).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessLogicError when customer has orders', async () => {
      const data: CustomerData = {
        code: 'CUS000011',
        name: 'Test Customer',
        category: 'RETAIL',
        payment_term: 30,
      };

      const id = await service.create(data);

      // Create a sales order for this customer
      db.prepare(`
        INSERT INTO sales_orders (id, order_no, customer_id, order_date, status, subtotal, tax_amount, total_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test-order-id',
        'SO000001',
        id,
        new Date().toISOString(),
        'PENDING',
        10000,
        1000,
        11000,
        new Date().toISOString(),
        new Date().toISOString()
      );

      await expect(service.delete(id)).rejects.toThrow(BusinessLogicError);
    });
  });

  describe('findById', () => {
    it('should find customer by id', async () => {
      const data: CustomerData = {
        code: 'CUS000012',
        name: 'Test Customer',
        category: 'RETAIL',
        payment_term: 30,
      };

      const id = await service.create(data);
      const customer = await service.findById(id);

      expect(customer).toBeDefined();
      expect(customer?.id).toBe(id);
      expect(customer?.name).toBe('Test Customer');
    });

    it('should return null for non-existent customer', async () => {
      const customer = await service.findById('non-existent-id');
      expect(customer).toBeNull();
    });
  });

  describe('findByCode', () => {
    it('should find customer by code', async () => {
      const data: CustomerData = {
        code: 'CUS000013',
        name: 'Test Customer',
        category: 'RETAIL',
        payment_term: 30,
      };

      await service.create(data);
      const customer = await service.findByCode('CUS000013');

      expect(customer).toBeDefined();
      expect(customer?.name).toBe('Test Customer');
    });

    it('should return null for non-existent code', async () => {
      const customer = await service.findByCode('NONEXISTENT');
      expect(customer).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      const customers: CustomerData[] = [
        { code: 'CUS000014', name: 'Customer A', category: 'RETAIL', payment_term: 30, is_active: true },
        { code: 'CUS000015', name: 'Customer B', category: 'WHOLESALE', payment_term: 60, is_active: true },
        { code: 'CUS000016', name: 'Customer C', category: 'RETAIL', payment_term: 30, is_active: false },
      ];

      for (const customer of customers) {
        await service.create(customer);
      }
    });

    it('should find all customers', async () => {
      const customers = await service.findAll();
      expect(customers).toHaveLength(3);
    });

    it('should filter by category', async () => {
      const customers = await service.findAll({ category: 'RETAIL' });
      expect(customers).toHaveLength(2);
    });

    it('should filter by is_active', async () => {
      const customers = await service.findAll({ is_active: true });
      expect(customers).toHaveLength(2);
    });

    it('should search by name', async () => {
      const customers = await service.findAll({ search: 'Customer A' });
      expect(customers).toHaveLength(1);
      expect(customers[0].name).toBe('Customer A');
    });

    it('should support pagination', async () => {
      const customers = await service.findAll({ limit: 2, offset: 0 });
      expect(customers).toHaveLength(2);
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      const customers: CustomerData[] = [
        { code: 'CUS000017', name: 'Customer A', category: 'RETAIL', payment_term: 30, is_active: true },
        { code: 'CUS000018', name: 'Customer B', category: 'WHOLESALE', payment_term: 60, is_active: true },
        { code: 'CUS000019', name: 'Customer C', category: 'RETAIL', payment_term: 30, is_active: false },
      ];

      for (const customer of customers) {
        await service.create(customer);
      }
    });

    it('should count all customers', async () => {
      const count = await service.count();
      expect(count).toBe(3);
    });

    it('should count by category', async () => {
      const count = await service.count({ category: 'RETAIL' });
      expect(count).toBe(2);
    });

    it('should count by is_active', async () => {
      const count = await service.count({ is_active: true });
      expect(count).toBe(2);
    });
  });

  describe('getCustomerStats', () => {
    it('should return customer statistics', async () => {
      const data: CustomerData = {
        code: 'CUS000020',
        name: 'Test Customer',
        category: 'RETAIL',
        payment_term: 30,
      };

      const id = await service.create(data);

      const stats = await service.getCustomerStats(id);

      expect(stats).toBeDefined();
      expect(stats.customer).toBeDefined();
      expect(stats.customer.id).toBe(id);
      expect(stats.totalOrders).toBe(0);
      expect(stats.totalInvoices).toBe(0);
      expect(stats.outstandingBalance).toBe(0);
    });

    it('should throw NotFoundError for non-existent customer', async () => {
      await expect(
        service.getCustomerStats('non-existent-id')
      ).rejects.toThrow(NotFoundError);
    });
  });
});
