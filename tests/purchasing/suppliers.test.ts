import { DatabaseConnection } from '../../src/db/connection';
import { SuppliersService, SupplierData } from '../../src/purchasing/suppliers';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../src/utils/helpers';

describe('SuppliersService', () => {
  let db: any;
  let service: SuppliersService;

  beforeAll(async () => {
    db = DatabaseConnection.getInstance();
    await DatabaseConnection.initialize();
    service = new SuppliersService(db);
  });

  beforeEach(() => {
    // Clean up in correct order to respect foreign keys
    db.prepare('DELETE FROM purchase_order_items').run();
    db.prepare('DELETE FROM purchase_orders').run();
    db.prepare('DELETE FROM accounts_payable').run();
    db.prepare('DELETE FROM suppliers').run();
  });

  afterEach(() => {
    db.prepare('DELETE FROM purchase_order_items').run();
    db.prepare('DELETE FROM purchase_orders').run();
    db.prepare('DELETE FROM accounts_payable').run();
    db.prepare('DELETE FROM suppliers').run();
  });

  afterAll(() => {
    DatabaseConnection.close();
  });

  describe('create', () => {
    it('should create a new supplier with auto-generated code', async () => {
      const data: SupplierData = {
        code: 'SUP000001',
        name: 'Test Supplier',
        category: 'RAW_MATERIALS',
        payment_term: 30,
        email: 'test@supplier.com',
        phone: '03-9876-5432',
      };

      const id = await service.create(data);

      expect(id).toBeDefined();
      expect(id).toMatch(/^[0-9a-f-]{36}$/);

      const supplier = await service.findById(id);
      expect(supplier).toBeDefined();
      expect(supplier?.name).toBe('Test Supplier');
      expect(supplier?.code).toBe('SUP000001');
    });

    it('should throw ValidationError when name is empty', async () => {
      const data: SupplierData = {
        code: 'SUP000002',
        name: '',
        category: 'RAW_MATERIALS',
        payment_term: 30,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when category is empty', async () => {
      const data: SupplierData = {
        code: 'SUP000003',
        name: 'Test Supplier',
        category: '',
        payment_term: 30,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative payment_term', async () => {
      const data: SupplierData = {
        code: 'SUP000004',
        name: 'Test Supplier',
        category: 'RAW_MATERIALS',
        payment_term: -10,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid email format', async () => {
      const data: SupplierData = {
        code: 'SUP000005',
        name: 'Test Supplier',
        category: 'RAW_MATERIALS',
        payment_term: 30,
        email: 'invalid-email',
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw BusinessLogicError for duplicate code', async () => {
      const data: SupplierData = {
        code: 'SUP000006',
        name: 'Supplier 1',
        category: 'RAW_MATERIALS',
        payment_term: 30,
      };

      await service.create(data);

      const data2: SupplierData = {
        code: 'SUP000006',
        name: 'Supplier 2',
        category: 'SERVICES',
        payment_term: 60,
      };

      await expect(service.create(data2)).rejects.toThrow(BusinessLogicError);
    });

    it('should create supplier with default values', async () => {
      const data: SupplierData = {
        code: 'SUP000007',
        name: 'Minimal Supplier',
        category: 'RAW_MATERIALS',
        payment_term: 30,
      };

      const id = await service.create(data);
      const supplier = await service.findById(id);

      expect(supplier?.country).toBe('JP');
      expect(supplier?.is_active).toBe(true);
    });
  });

  describe('update', () => {
    it('should update supplier details', async () => {
      const data: SupplierData = {
        code: 'SUP000008',
        name: 'Original Name',
        category: 'RAW_MATERIALS',
        payment_term: 30,
      };

      const id = await service.create(data);

      await service.update(id, {
        name: 'Updated Name',
        category: 'SERVICES',
        payment_term: 60,
      });

      const supplier = await service.findById(id);
      expect(supplier?.name).toBe('Updated Name');
      expect(supplier?.category).toBe('SERVICES');
      expect(supplier?.payment_term).toBe(60);
    });

    it('should throw NotFoundError for non-existent supplier', async () => {
      await expect(
        service.update('non-existent-id', { name: 'Test' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError for negative payment_term on update', async () => {
      const data: SupplierData = {
        code: 'SUP000009',
        name: 'Test Supplier',
        category: 'RAW_MATERIALS',
        payment_term: 30,
      };

      const id = await service.create(data);

      await expect(
        service.update(id, { payment_term: -100 })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid email on update', async () => {
      const data: SupplierData = {
        code: 'SUP000010',
        name: 'Test Supplier',
        category: 'RAW_MATERIALS',
        payment_term: 30,
      };

      const id = await service.create(data);

      await expect(
        service.update(id, { email: 'bad-email' })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('delete', () => {
    it('should delete supplier successfully', async () => {
      const data: SupplierData = {
        code: 'SUP000011',
        name: 'Test Supplier',
        category: 'RAW_MATERIALS',
        payment_term: 30,
      };

      const id = await service.create(data);
      await service.delete(id);

      const supplier = await service.findById(id);
      expect(supplier).toBeNull();
    });

    it('should throw NotFoundError for non-existent supplier', async () => {
      await expect(service.delete('non-existent-id')).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessLogicError when supplier has orders', async () => {
      const data: SupplierData = {
        code: 'SUP000012',
        name: 'Test Supplier',
        category: 'RAW_MATERIALS',
        payment_term: 30,
      };

      const id = await service.create(data);

      // Create a purchase order for this supplier
      db.prepare(`
        INSERT INTO purchase_orders (id, order_no, supplier_id, order_date, status, subtotal, tax_amount, total_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test-po-id',
        'PO000001',
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
    it('should find supplier by id', async () => {
      const data: SupplierData = {
        code: 'SUP000013',
        name: 'Test Supplier',
        category: 'RAW_MATERIALS',
        payment_term: 30,
      };

      const id = await service.create(data);
      const supplier = await service.findById(id);

      expect(supplier).toBeDefined();
      expect(supplier?.id).toBe(id);
      expect(supplier?.name).toBe('Test Supplier');
    });

    it('should return null for non-existent supplier', async () => {
      const supplier = await service.findById('non-existent-id');
      expect(supplier).toBeNull();
    });
  });

  describe('findByCode', () => {
    it('should find supplier by code', async () => {
      const data: SupplierData = {
        code: 'SUP000014',
        name: 'Test Supplier',
        category: 'RAW_MATERIALS',
        payment_term: 30,
      };

      await service.create(data);
      const supplier = await service.findByCode('SUP000014');

      expect(supplier).toBeDefined();
      expect(supplier?.name).toBe('Test Supplier');
    });

    it('should return null for non-existent code', async () => {
      const supplier = await service.findByCode('NONEXISTENT');
      expect(supplier).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      const suppliers: SupplierData[] = [
        { code: 'SUP000015', name: 'Supplier A', category: 'RAW_MATERIALS', payment_term: 30, is_active: true },
        { code: 'SUP000016', name: 'Supplier B', category: 'SERVICES', payment_term: 60, is_active: true },
        { code: 'SUP000017', name: 'Supplier C', category: 'RAW_MATERIALS', payment_term: 30, is_active: false },
      ];

      for (const supplier of suppliers) {
        await service.create(supplier);
      }
    });

    it('should find all suppliers', async () => {
      const suppliers = await service.findAll();
      expect(suppliers).toHaveLength(3);
    });

    it('should filter by category', async () => {
      const suppliers = await service.findAll({ category: 'RAW_MATERIALS' });
      expect(suppliers).toHaveLength(2);
    });

    it('should filter by is_active', async () => {
      const suppliers = await service.findAll({ is_active: true });
      expect(suppliers).toHaveLength(2);
    });

    it('should search by name', async () => {
      const suppliers = await service.findAll({ search: 'Supplier A' });
      expect(suppliers).toHaveLength(1);
      expect(suppliers[0].name).toBe('Supplier A');
    });

    it('should support pagination', async () => {
      const suppliers = await service.findAll({ limit: 2, offset: 0 });
      expect(suppliers).toHaveLength(2);
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      const suppliers: SupplierData[] = [
        { code: 'SUP000018', name: 'Supplier A', category: 'RAW_MATERIALS', payment_term: 30, is_active: true },
        { code: 'SUP000019', name: 'Supplier B', category: 'SERVICES', payment_term: 60, is_active: true },
        { code: 'SUP000020', name: 'Supplier C', category: 'RAW_MATERIALS', payment_term: 30, is_active: false },
      ];

      for (const supplier of suppliers) {
        await service.create(supplier);
      }
    });

    it('should count all suppliers', async () => {
      const count = await service.count();
      expect(count).toBe(3);
    });

    it('should count by category', async () => {
      const count = await service.count({ category: 'RAW_MATERIALS' });
      expect(count).toBe(2);
    });

    it('should count by is_active', async () => {
      const count = await service.count({ is_active: true });
      expect(count).toBe(2);
    });
  });

  describe('getSupplierStats', () => {
    it('should return supplier statistics', async () => {
      const data: SupplierData = {
        code: 'SUP000021',
        name: 'Test Supplier',
        category: 'RAW_MATERIALS',
        payment_term: 30,
      };

      const id = await service.create(data);

      const stats = await service.getSupplierStats(id);

      expect(stats).toBeDefined();
      expect(stats.supplier).toBeDefined();
      expect(stats.supplier.id).toBe(id);
      expect(stats.totalOrders).toBe(0);
      expect(stats.outstandingBalance).toBe(0);
    });

    it('should throw NotFoundError for non-existent supplier', async () => {
      await expect(
        service.getSupplierStats('non-existent-id')
      ).rejects.toThrow(NotFoundError);
    });
  });
});
