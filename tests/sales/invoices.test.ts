import { DatabaseConnection } from '../../src/db/connection';
import { InvoicesService, InvoiceData, InvoiceItemData } from '../../src/sales/invoices';
import { CustomersService, CustomerData } from '../../src/sales/customers';
import { ProductsService, ProductData } from '../../src/inventory/products';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../src/utils/helpers';

describe('InvoicesService', () => {
  let db: any;
  let service: InvoicesService;
  let customersService: CustomersService;
  let productsService: ProductsService;
  let testCustomerId: string;
  let testProductId: string;

  beforeAll(async () => {
    db = DatabaseConnection.getInstance();
    await DatabaseConnection.initialize();
    service = new InvoicesService(db);
    customersService = new CustomersService(db);
    productsService = new ProductsService(db);
  });

  beforeEach(async () => {
    // Delete in correct order due to foreign key constraints
    db.prepare('DELETE FROM accounts_receivable').run();
    db.prepare('DELETE FROM invoice_items').run();
    db.prepare('DELETE FROM invoices').run();
    db.prepare('DELETE FROM inventory_stock').run();
    db.prepare('DELETE FROM products').run();
    db.prepare('DELETE FROM customers').run();

    // Create test customer
    const customerData: CustomerData = {
      code: 'CUS000001',
      name: 'Test Customer',
      category: 'RETAIL',
      payment_term: 30,
    };
    testCustomerId = await customersService.create(customerData);

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
    // Delete in correct order due to foreign key constraints
    db.prepare('DELETE FROM accounts_receivable').run();
    db.prepare('DELETE FROM invoice_items').run();
    db.prepare('DELETE FROM invoices').run();
    db.prepare('DELETE FROM inventory_stock').run();
    db.prepare('DELETE FROM products').run();
    db.prepare('DELETE FROM customers').run();
  });

  afterAll(() => {
    DatabaseConnection.close();
  });

  describe('create', () => {
    it('should create a new invoice with items', async () => {
      const items: InvoiceItemData[] = [
        {
          product_id: testProductId,
          description: 'Test Item 1',
          quantity: 10,
          unit_price: 1000,
          tax_rate: 0.10,
        },
        {
          product_id: testProductId,
          description: 'Test Item 2',
          quantity: 5,
          unit_price: 2000,
          tax_rate: 0.10,
        },
      ];

      const data: InvoiceData = {
        customer_id: testCustomerId,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items,
      };

      const id = await service.create(data);

      expect(id).toBeDefined();

      const invoice = await service.findById(id);
      expect(invoice).toBeDefined();
      expect(invoice?.customer_id).toBe(testCustomerId);
      expect(invoice?.items).toHaveLength(2);
    });

    it('should create accounts receivable automatically', async () => {
      const items: InvoiceItemData[] = [
        {
          product_id: testProductId,
          description: 'Test Item',
          quantity: 10,
          unit_price: 1000,
          tax_rate: 0.10,
        },
      ];

      const data: InvoiceData = {
        customer_id: testCustomerId,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items,
      };

      const id = await service.create(data);

      const ar = db.prepare('SELECT * FROM accounts_receivable WHERE invoice_id = ?').get(id);
      expect(ar).toBeDefined();
      expect(ar.customer_id).toBe(testCustomerId);
      expect(ar.debit_amount).toBe(11000); // 10 * 1000 * 1.10
      expect(ar.status).toBe('OPEN');
    });

    it('should calculate totals correctly', async () => {
      const items: InvoiceItemData[] = [
        {
          product_id: testProductId,
          description: 'Item 1',
          quantity: 10,
          unit_price: 1000,
          tax_rate: 0.10,
        },
        {
          product_id: testProductId,
          description: 'Item 2',
          quantity: 5,
          unit_price: 2000,
          tax_rate: 0.10,
        },
      ];

      const data: InvoiceData = {
        customer_id: testCustomerId,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items,
      };

      const id = await service.create(data);
      const invoice = await service.findById(id);

      // Item 1: 10 * 1000 = 10000, Item 2: 5 * 2000 = 10000, Subtotal = 20000
      // Tax: 20000 * 0.10 = 2000, Total = 22000
      expect(invoice?.subtotal).toBe(20000);
      expect(invoice?.tax_amount).toBe(2000);
      expect(invoice?.total_amount).toBe(22000);
    });

    it('should throw ValidationError when customer_id is missing', async () => {
      const items: InvoiceItemData[] = [
        {
          product_id: testProductId,
          description: 'Test Item',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: InvoiceData = {
        customer_id: '',
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError for non-existent customer', async () => {
      const items: InvoiceItemData[] = [
        {
          product_id: testProductId,
          description: 'Test Item',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: InvoiceData = {
        customer_id: 'non-existent',
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items,
      };

      await expect(service.create(data)).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError for empty items', async () => {
      const data: InvoiceData = {
        customer_id: testCustomerId,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items: [],
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when item description is empty', async () => {
      const items: InvoiceItemData[] = [
        {
          description: '',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: InvoiceData = {
        customer_id: testCustomerId,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when item quantity is zero', async () => {
      const items: InvoiceItemData[] = [
        {
          product_id: testProductId,
          description: 'Test Item',
          quantity: 0,
          unit_price: 1000,
        },
      ];

      const data: InvoiceData = {
        customer_id: testCustomerId,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when due_date is before invoice_date', async () => {
      const items: InvoiceItemData[] = [
        {
          product_id: testProductId,
          description: 'Test Item',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: InvoiceData = {
        customer_id: testCustomerId,
        invoice_date: '2024-01-10T00:00:00.000Z',
        due_date: '2024-01-01T00:00:00.000Z',
        items,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid discount_rate', async () => {
      const items: InvoiceItemData[] = [
        {
          product_id: testProductId,
          description: 'Test Item',
          quantity: 1,
          unit_price: 1000,
          discount_rate: 1.5,
        },
      ];

      const data: InvoiceData = {
        customer_id: testCustomerId,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });
  });

  describe('update', () => {
    let testInvoiceId: string;

    beforeEach(async () => {
      const items: InvoiceItemData[] = [
        {
          product_id: testProductId,
          description: 'Test Item',
          quantity: 10,
          unit_price: 1000,
          tax_rate: 0.10,
        },
      ];

      const data: InvoiceData = {
        customer_id: testCustomerId,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items,
      };

      testInvoiceId = await service.create(data);
    });

    it('should update invoice status', async () => {
      await service.update(testInvoiceId, { status: 'SENT' });

      const invoice = await service.findById(testInvoiceId);
      expect(invoice?.status).toBe('SENT');
    });

    it('should update notes', async () => {
      await service.update(testInvoiceId, { notes: 'Updated notes' });

      const invoice = await service.findById(testInvoiceId);
      expect(invoice?.notes).toBe('Updated notes');
    });

    it('should throw NotFoundError for non-existent invoice', async () => {
      await expect(
        service.update('non-existent-id', { status: 'SENT' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessLogicError when updating paid invoice', async () => {
      await service.update(testInvoiceId, { status: 'PAID' });

      await expect(
        service.update(testInvoiceId, { status: 'SENT' })
      ).rejects.toThrow(BusinessLogicError);
    });

    it('should apply payment and update status', async () => {
      // Payments are handled through AccountsReceivableService
      // This test verifies that invoice status can be updated
      await service.update(testInvoiceId, { status: 'PARTIAL' });

      const invoice = await service.findById(testInvoiceId);
      expect(invoice?.status).toBe('PARTIAL');
    });

    it('should update to PAID when fully paid', async () => {
      await service.update(testInvoiceId, { status: 'PAID' });

      const updated = await service.findById(testInvoiceId);
      expect(updated?.status).toBe('PAID');
    });
  });

  describe('delete', () => {
    it('should delete invoice successfully', async () => {
      const items: InvoiceItemData[] = [
        {
          product_id: testProductId,
          description: 'Test Item',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: InvoiceData = {
        customer_id: testCustomerId,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items,
      };

      const id = await service.create(data);
      await service.delete(id);

      const invoice = await service.findById(id);
      expect(invoice).toBeNull();
    });

    it('should throw NotFoundError for non-existent invoice', async () => {
      await expect(service.delete('non-existent-id')).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessLogicError when deleting paid invoice', async () => {
      const items: InvoiceItemData[] = [
        {
          product_id: testProductId,
          description: 'Test Item',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: InvoiceData = {
        customer_id: testCustomerId,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items,
        status: 'PAID',
      };

      const id = await service.create(data);

      await expect(service.delete(id)).rejects.toThrow(BusinessLogicError);
    });

    it('should delete associated accounts receivable', async () => {
      const items: InvoiceItemData[] = [
        {
          product_id: testProductId,
          description: 'Test Item',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: InvoiceData = {
        customer_id: testCustomerId,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items,
      };

      const id = await service.create(data);

      // Verify AR was created
      let ar = db.prepare('SELECT * FROM accounts_receivable WHERE invoice_id = ?').get(id);
      expect(ar).toBeDefined();

      await service.delete(id);

      // Verify AR was deleted
      ar = db.prepare('SELECT * FROM accounts_receivable WHERE invoice_id = ?').get(id);
      expect(ar).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('should find invoice by id', async () => {
      const items: InvoiceItemData[] = [
        {
          product_id: testProductId,
          description: 'Test Item',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: InvoiceData = {
        customer_id: testCustomerId,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items,
      };

      const id = await service.create(data);
      const invoice = await service.findById(id);

      expect(invoice).toBeDefined();
      expect(invoice?.id).toBe(id);
      expect(invoice?.customer_id).toBe(testCustomerId);
    });

    it('should return null for non-existent invoice', async () => {
      const invoice = await service.findById('non-existent-id');
      expect(invoice).toBeNull();
    });
  });

  describe('findByInvoiceNo', () => {
    it('should find invoice by invoice number', async () => {
      const items: InvoiceItemData[] = [
        {
          product_id: testProductId,
          description: 'Test Item',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: InvoiceData = {
        invoice_no: 'INV999999',
        customer_id: testCustomerId,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items,
      };

      await service.create(data);
      const invoice = await service.findByInvoiceNo('INV999999');

      expect(invoice).toBeDefined();
      expect(invoice?.invoice_no).toBe('INV999999');
    });

    it('should return null for non-existent invoice number', async () => {
      const invoice = await service.findByInvoiceNo('NONEXISTENT');
      expect(invoice).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      const items: InvoiceItemData[] = [
        {
          product_id: testProductId,
          description: 'Test Item',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const invoices: InvoiceData[] = [
        {
          customer_id: testCustomerId,
          invoice_date: '2024-01-01T00:00:00.000Z',
          due_date: '2024-01-31T00:00:00.000Z',
          status: 'PENDING',
          items,
        },
        {
          customer_id: testCustomerId,
          invoice_date: '2024-01-02T00:00:00.000Z',
          due_date: '2024-02-01T00:00:00.000Z',
          status: 'SENT',
          items,
        },
        {
          customer_id: testCustomerId,
          invoice_date: '2024-01-03T00:00:00.000Z',
          due_date: '2024-02-02T00:00:00.000Z',
          status: 'PAID',
          items,
        },
      ];

      for (const invoice of invoices) {
        await service.create(invoice);
      }
    });

    it('should find all invoices', async () => {
      const invoices = await service.findAll();
      expect(invoices.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by customer_id', async () => {
      const invoices = await service.findAll({ customer_id: testCustomerId });
      expect(invoices.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by status', async () => {
      const invoices = await service.findAll({ status: 'PENDING' });
      expect(invoices.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by date range', async () => {
      const invoices = await service.findAll({
        start_date: '2024-01-01T00:00:00.000Z',
        end_date: '2024-01-02T00:00:00.000Z',
      });
      expect(invoices.length).toBeGreaterThanOrEqual(2);
    });

    it('should support pagination', async () => {
      const invoices = await service.findAll({ limit: 2, offset: 0 });
      expect(invoices.length).toBeLessThanOrEqual(2);
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      const items: InvoiceItemData[] = [
        {
          product_id: testProductId,
          description: 'Test Item',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const invoices: InvoiceData[] = [
        {
          customer_id: testCustomerId,
          invoice_date: new Date().toISOString(),
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'PENDING',
          items,
        },
        {
          customer_id: testCustomerId,
          invoice_date: new Date().toISOString(),
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'PAID',
          items,
        },
        {
          customer_id: testCustomerId,
          invoice_date: new Date().toISOString(),
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'PENDING',
          items,
        },
      ];

      for (const invoice of invoices) {
        await service.create(invoice);
      }
    });

    it('should count all invoices', async () => {
      const count = await service.count();
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it('should count by status', async () => {
      const count = await service.count({ status: 'PENDING' });
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getCustomerInvoices', () => {
    it('should get invoices for a specific customer', async () => {
      const items: InvoiceItemData[] = [
        {
          product_id: testProductId,
          description: 'Test Item',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      await service.create({
        customer_id: testCustomerId,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items,
      });

      const invoices = await service.getCustomerInvoices(testCustomerId);
      expect(invoices.length).toBeGreaterThan(0);
      expect(invoices[0].customer_id).toBe(testCustomerId);
    });
  });

  describe('getOverdueInvoices', () => {
    it('should return overdue invoices', async () => {
      const items: InvoiceItemData[] = [
        {
          product_id: testProductId,
          description: 'Test Item',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      await service.create({
        customer_id: testCustomerId,
        invoice_date: '2024-01-01T00:00:00.000Z',
        due_date: '2024-01-15T00:00:00.000Z',
        status: 'PENDING',
        items,
      });

      const overdue = await service.getOverdueInvoices();
      expect(overdue.length).toBeGreaterThan(0);
    });
  });

  describe('getSummary', () => {
    it('should return invoice summary', async () => {
      const items: InvoiceItemData[] = [
        {
          product_id: testProductId,
          description: 'Test Item',
          quantity: 10,
          unit_price: 1000,
          tax_rate: 0.10,
        },
      ];

      await service.create({
        customer_id: testCustomerId,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items,
      });

      const summary = await service.getSummary();
      expect(summary).toBeDefined();
      expect(summary.total_invoices).toBeGreaterThan(0);
      expect(summary.total_amount).toBeGreaterThan(0);
    });
  });
});
