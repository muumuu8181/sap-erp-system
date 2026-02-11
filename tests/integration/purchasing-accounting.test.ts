import { DatabaseConnection } from '../../src/db/connection';
import { SuppliersService, SupplierData } from '../../src/purchasing/suppliers';
import { PurchaseOrdersService, PurchaseOrderData, PurchaseOrderItemData } from '../../src/purchasing/purchase-orders';
import { AccountsPayableService, PayableData } from '../../src/accounting/accounts-payable';
import { ProductsService, ProductData } from '../../src/inventory/products';

describe('Purchasing to Accounting Integration', () => {
  let db: any;
  let suppliersService: SuppliersService;
  let purchaseOrdersService: PurchaseOrdersService;
  let accountsPayableService: AccountsPayableService;
  let productsService: ProductsService;

  let testSupplierId: string;
  let testProductId: string;

  beforeAll(async () => {
    db = DatabaseConnection.getInstance();
    await DatabaseConnection.initialize();
    suppliersService = new SuppliersService(db);
    purchaseOrdersService = new PurchaseOrdersService(db);
    accountsPayableService = new AccountsPayableService(db);
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

  describe('Purchase Order to Accounts Payable Flow', () => {
    it('should create purchase order and accounts payable', async () => {
      // 1. Create purchase order
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 50,
          unit_price: 1000,
          tax_rate: 0.10,
        },
      ];

      const orderData: PurchaseOrderData = {
        supplier_id: testSupplierId,
        order_date: new Date().toISOString(),
        items,
      };

      const orderId = await purchaseOrdersService.create(orderData);
      const order = await purchaseOrdersService.findById(orderId);
      expect(order).toBeDefined();
      expect(order?.supplier_id).toBe(testSupplierId);

      // 2. Create accounts payable linked to PO
      const payableData: PayableData = {
        supplier_id: testSupplierId,
        reference_id: orderId,
        transaction_date: new Date().toISOString(),
        debit_amount: 0,
        credit_amount: 55000, // 50 * 1000 * 1.10
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const payableId = await accountsPayableService.create(payableData);
      const payable = await accountsPayableService.findById(payableId);

      expect(payable).toBeDefined();
      expect(payable?.supplier_id).toBe(testSupplierId);
      expect(payable?.reference_id).toBe(orderId);
    });

    it('should apply payment to accounts payable and update status', async () => {
      // Create accounts payable
      const payableData: PayableData = {
        supplier_id: testSupplierId,
        reference_id: 'po-001',
        transaction_date: new Date().toISOString(),
        debit_amount: 0,
        credit_amount: 10000,
        due_date: new Date().toISOString(),
      };

      const payableId = await accountsPayableService.create(payableData);

      // Apply payment
      await accountsPayableService.applyPayment({
        payable_id: payableId,
        payment_date: new Date().toISOString(),
        amount: 10000,
        payment_method: 'BANK_TRANSFER',
      });

      // Verify payable is fully paid
      const paidPayable = await accountsPayableService.findById(payableId);
      expect(paidPayable?.balance).toBe(0);
      expect(paidPayable?.status).toBe('PAID');
    });

    it('should handle partial payment correctly', async () => {
      // Create accounts payable
      const payableData: PayableData = {
        supplier_id: testSupplierId,
        reference_id: 'po-002',
        transaction_date: new Date().toISOString(),
        debit_amount: 0,
        credit_amount: 10000,
        due_date: new Date().toISOString(),
      };

      const payableId = await accountsPayableService.create(payableData);

      // Apply partial payment
      await accountsPayableService.applyPayment({
        payable_id: payableId,
        payment_date: new Date().toISOString(),
        amount: 5000,
        payment_method: 'CASH',
      });

      // Verify payable is partially paid
      const partialPayable = await accountsPayableService.findById(payableId);
      expect(partialPayable?.balance).toBe(5000);
      expect(partialPayable?.status).toBe('PARTIAL');
    });

    it('should calculate balance correctly with debit and credit', async () => {
      // Create payable with initial credit
      const payableData: PayableData = {
        supplier_id: testSupplierId,
        reference_id: 'po-003',
        transaction_date: new Date().toISOString(),
        debit_amount: 0,
        credit_amount: 10000,
        due_date: new Date().toISOString(),
      };

      const payableId = await accountsPayableService.create(payableData);
      let payable = await accountsPayableService.findById(payableId);
      expect(payable?.balance).toBe(10000);

      // Apply payment (debit)
      await accountsPayableService.applyPayment({
        payable_id: payableId,
        payment_date: new Date().toISOString(),
        amount: 3000,
        payment_method: 'BANK_TRANSFER',
      });

      payable = await accountsPayableService.findById(payableId);
      expect(payable?.balance).toBe(7000);
      expect(payable?.debit_amount).toBe(3000);
    });
  });

  describe('Supplier Payables Management', () => {
    it('should track supplier outstanding balance', async () => {
      // Create multiple payables for supplier
      for (let i = 0; i < 3; i++) {
        const payableData: PayableData = {
          supplier_id: testSupplierId,
          reference_id: `po-${i}`,
          transaction_date: new Date().toISOString(),
          debit_amount: 0,
          credit_amount: 10000,
          due_date: new Date().toISOString(),
        };

        await accountsPayableService.create(payableData);
      }

      // Get supplier payables
      const supplierPayables = await accountsPayableService.getSupplierPayables(testSupplierId);
      expect(supplierPayables.length).toBeGreaterThanOrEqual(3);

      // Get summary
      const summary = await accountsPayableService.getSummary();
      expect(summary.total_payables).toBeGreaterThan(0);
      expect(summary.total_outstanding).toBeGreaterThan(0);
    });

    it('should identify overdue payables', async () => {
      // Create payable with past due date
      const payableData: PayableData = {
        supplier_id: testSupplierId,
        reference_id: 'po-overdue',
        transaction_date: '2024-01-01T00:00:00.000Z',
        debit_amount: 0,
        credit_amount: 10000,
        due_date: '2024-01-15T00:00:00.000Z',
        status: 'OPEN',
      };

      await accountsPayableService.create(payableData);

      // Get overdue payables
      const overdue = await accountsPayableService.getOverduePayables();
      expect(overdue.length).toBeGreaterThan(0);
    });

    it('should generate aging report', async () => {
      // Create payables with different due dates
      const payableData1: PayableData = {
        supplier_id: testSupplierId,
        reference_id: 'po-001',
        transaction_date: new Date().toISOString(),
        debit_amount: 0,
        credit_amount: 5000,
        due_date: new Date().toISOString(),
      };

      const payableData2: PayableData = {
        supplier_id: testSupplierId,
        reference_id: 'po-002',
        transaction_date: new Date().toISOString(),
        debit_amount: 0,
        credit_amount: 10000,
        due_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
      };

      await accountsPayableService.create(payableData1);
      await accountsPayableService.create(payableData2);

      // Generate aging report
      const agingReport = await accountsPayableService.getAgingReport();
      expect(Array.isArray(agingReport)).toBe(true);
    });
  });

  describe('Purchase Order Workflow', () => {
    it('should transition purchase order through statuses', async () => {
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

      const orderId = await purchaseOrdersService.create(orderData);

      // Confirm order
      await purchaseOrdersService.update(orderId, { status: 'CONFIRMED' });
      let order = await purchaseOrdersService.findById(orderId);
      expect(order?.status).toBe('CONFIRMED');

      // Mark as received
      await purchaseOrdersService.update(orderId, { status: 'RECEIVED' });
      order = await purchaseOrdersService.findById(orderId);
      expect(order?.status).toBe('RECEIVED');

      // Should not be able to update received order
      await expect(
        purchaseOrdersService.update(orderId, { status: 'CANCELLED' })
      ).rejects.toThrow();
    });
  });
});
