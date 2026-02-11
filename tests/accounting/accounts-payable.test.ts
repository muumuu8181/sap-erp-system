import { DatabaseConnection } from '../../src/db/connection';
import { AccountsPayableService, PayableData } from '../../src/accounting/accounts-payable';
import { SuppliersService, SupplierData } from '../../src/purchasing/suppliers';
import { PurchaseOrdersService, PurchaseOrderData, PurchaseOrderItemData } from '../../src/purchasing/purchase-orders';
import { ProductsService, ProductData } from '../../src/inventory/products';
import { ValidationError, NotFoundError } from '../../src/utils/helpers';

describe('AccountsPayableService', () => {
  let db: any;
  let service: AccountsPayableService;
  let suppliersService: SuppliersService;
  let purchaseOrdersService: PurchaseOrdersService;
  let productsService: ProductsService;
  let testSupplierId: string;
  let testProductId: string;

  beforeAll(async () => {
    db = DatabaseConnection.getInstance();
    await DatabaseConnection.initialize();
    service = new AccountsPayableService(db);
    suppliersService = new SuppliersService(db);
    purchaseOrdersService = new PurchaseOrdersService(db);
    productsService = new ProductsService(db);
  });

  beforeEach(async () => {
    db.prepare('DELETE FROM accounts_payable').run();
    db.prepare('DELETE FROM purchase_order_items').run();
    db.prepare('DELETE FROM purchase_orders').run();
    db.prepare('DELETE FROM inventory_stock').run();
    db.prepare('DELETE FROM products').run();
    db.prepare('DELETE FROM suppliers').run();

    // Create test supplier
    const supplierData: SupplierData = {
      code: 'SUP000001',
      name: 'Test Supplier',
      category: 'RAW_MATERIALS',
      payment_term: 30,
    };
    testSupplierId = await suppliersService.create(supplierData);

    // Create test product
    const productData: ProductData = {
      code: 'PRD000001',
      name: 'Test Product',
      category: 'ELECTRONICS',
      unit: 'EA',
      cost_price: 1000,
      selling_price: 1500,
    };
    testProductId = await productsService.create(productData);
  });

  afterEach(() => {
    db.prepare('DELETE FROM accounts_payable').run();
    db.prepare('DELETE FROM purchase_order_items').run();
    db.prepare('DELETE FROM purchase_orders').run();
    db.prepare('DELETE FROM inventory_stock').run();
    db.prepare('DELETE FROM products').run();
    db.prepare('DELETE FROM suppliers').run();
  });

  afterAll(() => {
    DatabaseConnection.close();
  });

  // Helper function to create a purchase order
  async function createPurchaseOrder(poNo: string): Promise<string> {
    const items: PurchaseOrderItemData[] = [
      {
        product_id: testProductId,
        quantity: 10,
        unit_price: 1000,
      },
    ];

    const orderData: PurchaseOrderData = {
      supplier_id: testSupplierId,
      order_date: new Date().toISOString(),
      items,
    };

    return await purchaseOrdersService.create(orderData);
  }

  describe('create', () => {
    it('should create a new accounts payable', async () => {
      const poId = await createPurchaseOrder('PO-001');

      const data: PayableData = {
        supplier_id: testSupplierId,
        reference_id: poId,
        transaction_date: new Date().toISOString(),
        debit_amount: 0,
        credit_amount: 10000,
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const id = await service.create(data);

      expect(id).toBeDefined();

      const ap = db.prepare('SELECT * FROM accounts_payable WHERE id = ?').get(id);
      expect(ap).toBeDefined();
      expect(ap.supplier_id).toBe(testSupplierId);
      expect(ap.balance).toBe(10000);
      expect(ap.status).toBe('OPEN');
    });

    it('should throw NotFoundError for non-existent supplier', async () => {
      const data: PayableData = {
        supplier_id: 'non-existent',
        reference_id: 'po-002',
        transaction_date: new Date().toISOString(),
        debit_amount: 0,
        credit_amount: 10000,
        due_date: new Date().toISOString(),
      };

      await expect(service.create(data)).rejects.toThrow(NotFoundError);
    });

    it('should calculate balance correctly', async () => {
      const poId = await createPurchaseOrder('PO-003');

      const data: PayableData = {
        supplier_id: testSupplierId,
        reference_id: poId,
        transaction_date: new Date().toISOString(),
        debit_amount: 2000,
        credit_amount: 10000,
        due_date: new Date().toISOString(),
      };

      const id = await service.create(data);

      const ap = db.prepare('SELECT * FROM accounts_payable WHERE id = ?').get(id);
      expect(ap.balance).toBe(8000);
    });
  });

  describe('applyPayment', () => {
    let testPayableId: string;

    beforeEach(async () => {
      const poId = await createPurchaseOrder('PO-004');

      const data: PayableData = {
        supplier_id: testSupplierId,
        reference_id: poId,
        transaction_date: new Date().toISOString(),
        debit_amount: 0,
        credit_amount: 10000,
        due_date: new Date().toISOString(),
        status: 'OPEN',
      };

      testPayableId = await service.create(data);
    });

    it('should apply payment to payable', async () => {
      const paymentData = {
        payable_id: testPayableId,
        payment_date: new Date().toISOString(),
        amount: 5000,
        payment_method: 'BANK_TRANSFER',
        reference: 'PAY-001',
      };

      const id = await service.applyPayment(paymentData);

      expect(id).toBeDefined();

      const ap = db.prepare('SELECT * FROM accounts_payable WHERE id = ?').get(testPayableId);
      expect(ap.debit_amount).toBe(5000);
      expect(ap.balance).toBe(5000);
      expect(ap.status).toBe('PARTIAL');
    });

    it('should update status to PAID when fully paid', async () => {
      const paymentData = {
        payable_id: testPayableId,
        payment_date: new Date().toISOString(),
        amount: 10000,
        payment_method: 'CASH',
      };

      await service.applyPayment(paymentData);

      const ap = db.prepare('SELECT * FROM accounts_payable WHERE id = ?').get(testPayableId);
      expect(ap.balance).toBe(0);
      expect(ap.status).toBe('PAID');
    });

    it('should throw NotFoundError for non-existent payable', async () => {
      const paymentData = {
        payable_id: 'non-existent',
        payment_date: new Date().toISOString(),
        amount: 1000,
      };

      await expect(service.applyPayment(paymentData)).rejects.toThrow(NotFoundError);
    });

    it('should throw error for already paid payable', async () => {
      // First, mark as paid
      db.prepare('UPDATE accounts_payable SET status = ? WHERE id = ?')
        .run('PAID', testPayableId);

      const paymentData = {
        payable_id: testPayableId,
        payment_date: new Date().toISOString(),
        amount: 1000,
      };

      await expect(service.applyPayment(paymentData)).rejects.toThrow();
    });

    it('should throw ValidationError for payment exceeding balance', async () => {
      // Reset to open
      db.prepare('UPDATE accounts_payable SET status = ? WHERE id = ?')
        .run('OPEN', testPayableId);

      const paymentData = {
        payable_id: testPayableId,
        payment_date: new Date().toISOString(),
        amount: 15000,
      };

      await expect(service.applyPayment(paymentData)).rejects.toThrow();
    });
  });

  describe('findById', () => {
    it('should find payable by id', async () => {
      const poId = await createPurchaseOrder('PO-005');

      const data: PayableData = {
        supplier_id: testSupplierId,
        reference_id: poId,
        transaction_date: new Date().toISOString(),
        debit_amount: 0,
        credit_amount: 10000,
        due_date: new Date().toISOString(),
      };

      const id = await service.create(data);
      const ap = await service.findById(id);

      expect(ap).toBeDefined();
      expect(ap?.id).toBe(id);
      expect(ap?.supplier_id).toBe(testSupplierId);
    });

    it('should return null for non-existent payable', async () => {
      const ap = await service.findById('non-existent-id');
      expect(ap).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      const poIds = await Promise.all([
        createPurchaseOrder('PO-006'),
        createPurchaseOrder('PO-007'),
        createPurchaseOrder('PO-008'),
      ]);

      const payables: PayableData[] = [
        {
          supplier_id: testSupplierId,
          reference_id: poIds[0],
          transaction_date: new Date().toISOString(),
          debit_amount: 0,
          credit_amount: 10000,
          due_date: new Date().toISOString(),
          status: 'OPEN',
        },
        {
          supplier_id: testSupplierId,
          reference_id: poIds[1],
          transaction_date: new Date().toISOString(),
          debit_amount: 3000,
          credit_amount: 10000,
          due_date: new Date().toISOString(),
          status: 'PARTIAL',
        },
        {
          supplier_id: testSupplierId,
          reference_id: poIds[2],
          transaction_date: new Date().toISOString(),
          debit_amount: 10000,
          credit_amount: 10000,
          due_date: new Date().toISOString(),
          status: 'PAID',
        },
      ];

      for (const ap of payables) {
        await service.create(ap);
      }
    });

    it('should find all payables', async () => {
      const payables = await service.findAll();
      expect(payables.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by supplier_id', async () => {
      const payables = await service.findAll({ supplier_id: testSupplierId });
      expect(payables.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by status', async () => {
      const payables = await service.findAll({ status: 'OPEN' });
      expect(payables.length).toBeGreaterThanOrEqual(1);
    });

    it('should support pagination', async () => {
      const payables = await service.findAll({ limit: 2, offset: 0 });
      expect(payables.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getSupplierPayables', () => {
    it('should get payables for a specific supplier', async () => {
      const poId = await createPurchaseOrder('PO-009');

      const data: PayableData = {
        supplier_id: testSupplierId,
        reference_id: poId,
        transaction_date: new Date().toISOString(),
        debit_amount: 0,
        credit_amount: 10000,
        due_date: new Date().toISOString(),
      };

      await service.create(data);

      const payables = await service.getSupplierPayables(testSupplierId);
      expect(payables.length).toBeGreaterThan(0);
      expect(payables[0].supplier_id).toBe(testSupplierId);
    });
  });

  describe('getOverduePayables', () => {
    it('should return overdue payables', async () => {
      const poId = await createPurchaseOrder('PO-010');

      const data: PayableData = {
        supplier_id: testSupplierId,
        reference_id: poId,
        transaction_date: '2024-01-01T00:00:00.000Z',
        debit_amount: 0,
        credit_amount: 10000,
        due_date: '2024-01-15T00:00:00.000Z',
        status: 'OPEN',
      };

      await service.create(data);

      const overdue = await service.getOverduePayables();
      expect(overdue.length).toBeGreaterThan(0);
    });
  });

  describe('getAgingReport', () => {
    it('should generate aging report', async () => {
      const poId = await createPurchaseOrder('PO-011');

      const data: PayableData = {
        supplier_id: testSupplierId,
        reference_id: poId,
        transaction_date: new Date().toISOString(),
        debit_amount: 0,
        credit_amount: 10000,
        due_date: new Date().toISOString(),
        status: 'OPEN',
      };

      await service.create(data);

      const report = await service.getAgingReport();
      expect(report).toBeDefined();
      expect(Array.isArray(report)).toBe(true);
    });
  });

  describe('getSummary', () => {
    it('should return accounts payable summary', async () => {
      const poId = await createPurchaseOrder('PO-012');

      const data: PayableData = {
        supplier_id: testSupplierId,
        reference_id: poId,
        transaction_date: new Date().toISOString(),
        debit_amount: 0,
        credit_amount: 10000,
        due_date: new Date().toISOString(),
      };

      await service.create(data);

      const summary = await service.getSummary();
      expect(summary).toBeDefined();
      expect(summary.total_payables).toBeGreaterThan(0);
      expect(summary.total_outstanding).toBeGreaterThan(0);
    });
  });
});
