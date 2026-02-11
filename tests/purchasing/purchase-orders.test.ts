import { DatabaseConnection } from '../../src/db/connection';
import { PurchaseOrdersService, PurchaseOrderData, PurchaseOrderItemData } from '../../src/purchasing/purchase-orders';
import { SuppliersService, SupplierData } from '../../src/purchasing/suppliers';
import { ProductsService, ProductData } from '../../src/inventory/products';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../src/utils/helpers';

describe('PurchaseOrdersService', () => {
  let db: any;
  let service: PurchaseOrdersService;
  let suppliersService: SuppliersService;
  let productsService: ProductsService;
  let testSupplierId: string;
  let testProductId: string;

  beforeAll(async () => {
    db = DatabaseConnection.getInstance();
    await DatabaseConnection.initialize();
    service = new PurchaseOrdersService(db);
    suppliersService = new SuppliersService(db);
    productsService = new ProductsService(db);
  });

  beforeEach(async () => {
    // Delete in correct order due to foreign key constraints
    db.prepare('DELETE FROM receiving_items').run();
    db.prepare('DELETE FROM receiving').run();
    db.prepare('DELETE FROM purchase_order_items').run();
    db.prepare('DELETE FROM purchase_orders').run();
    db.prepare('DELETE FROM inventory_stock').run();
    db.prepare('DELETE FROM suppliers').run();
    db.prepare('DELETE FROM products').run();

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
    // Delete in correct order due to foreign key constraints
    db.prepare('DELETE FROM receiving_items').run();
    db.prepare('DELETE FROM receiving').run();
    db.prepare('DELETE FROM purchase_order_items').run();
    db.prepare('DELETE FROM purchase_orders').run();
    db.prepare('DELETE FROM inventory_stock').run();
    db.prepare('DELETE FROM suppliers').run();
    db.prepare('DELETE FROM products').run();
  });

  afterAll(() => {
    DatabaseConnection.close();
  });

  describe('create', () => {
    it('should create a new purchase order with items', async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 50,
          unit_price: 1000,
          tax_rate: 0.10,
        },
      ];

      const data: PurchaseOrderData = {
        supplier_id: testSupplierId,
        order_date: new Date().toISOString(),
        expected_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        items,
      };

      const id = await service.create(data);

      expect(id).toBeDefined();

      const order = await service.findById(id);
      expect(order).toBeDefined();
      expect(order?.supplier_id).toBe(testSupplierId);
      expect(order?.items).toHaveLength(1);
      expect(order?.items[0].quantity).toBe(50);
    });

    it('should calculate order totals correctly', async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 10,
          unit_price: 1000,
          tax_rate: 0.10,
        },
      ];

      const data: PurchaseOrderData = {
        supplier_id: testSupplierId,
        order_date: new Date().toISOString(),
        items,
      };

      const id = await service.create(data);
      const order = await service.findById(id);

      // 10 * 1000 = 10000 (subtotal)
      // 10000 * 0.10 = 1000 (tax)
      // total = 11000
      expect(order?.items[0].quantity).toBe(10);
    });

    it('should throw ValidationError when supplier_id is missing', async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: PurchaseOrderData = {
        supplier_id: '',
        order_date: new Date().toISOString(),
        items,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError for non-existent supplier', async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: PurchaseOrderData = {
        supplier_id: 'non-existent',
        order_date: new Date().toISOString(),
        items,
      };

      await expect(service.create(data)).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for non-existent product', async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: 'non-existent',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: PurchaseOrderData = {
        supplier_id: testSupplierId,
        order_date: new Date().toISOString(),
        items,
      };

      await expect(service.create(data)).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError for empty items', async () => {
      const data: PurchaseOrderData = {
        supplier_id: testSupplierId,
        order_date: new Date().toISOString(),
        items: [],
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when expected_date is before order_date', async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: PurchaseOrderData = {
        supplier_id: testSupplierId,
        order_date: '2024-01-10T00:00:00.000Z',
        expected_date: '2024-01-01T00:00:00.000Z',
        items,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid quantity', async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 0,
          unit_price: 1000,
        },
      ];

      const data: PurchaseOrderData = {
        supplier_id: testSupplierId,
        order_date: new Date().toISOString(),
        items,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid discount_rate', async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 1,
          unit_price: 1000,
          discount_rate: 1.5,
        },
      ];

      const data: PurchaseOrderData = {
        supplier_id: testSupplierId,
        order_date: new Date().toISOString(),
        items,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });
  });

  describe('update', () => {
    it('should update order status', async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: PurchaseOrderData = {
        supplier_id: testSupplierId,
        order_date: new Date().toISOString(),
        items,
      };

      const id = await service.create(data);

      await service.update(id, { status: 'CONFIRMED' });

      const order = await service.findById(id);
      expect(order?.status).toBe('CONFIRMED');
    });

    it('should update expected_date', async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: PurchaseOrderData = {
        supplier_id: testSupplierId,
        order_date: '2024-01-01T00:00:00.000Z',
        items,
      };

      const id = await service.create(data);

      await service.update(id, { expected_date: '2024-01-15T00:00:00.000Z' });

      const order = await service.findById(id);
      expect(order?.expected_date).toBe('2024-01-15T00:00:00.000Z');
    });

    it('should throw NotFoundError for non-existent order', async () => {
      await expect(
        service.update('non-existent-id', { status: 'CONFIRMED' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessLogicError when updating received order', async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: PurchaseOrderData = {
        supplier_id: testSupplierId,
        order_date: new Date().toISOString(),
        status: 'RECEIVED',
        items,
      };

      const id = await service.create(data);

      await expect(
        service.update(id, { status: 'CANCELLED' })
      ).rejects.toThrow(BusinessLogicError);
    });

    it('should throw ValidationError for invalid status', async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: PurchaseOrderData = {
        supplier_id: testSupplierId,
        order_date: new Date().toISOString(),
        items,
      };

      const id = await service.create(data);

      await expect(
        service.update(id, { status: 'INVALID' as any })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('delete', () => {
    it('should delete order successfully', async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: PurchaseOrderData = {
        supplier_id: testSupplierId,
        order_date: new Date().toISOString(),
        items,
      };

      const id = await service.create(data);
      await service.delete(id);

      const order = await service.findById(id);
      expect(order).toBeNull();
    });

    it('should throw NotFoundError for non-existent order', async () => {
      await expect(service.delete('non-existent-id')).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessLogicError when deleting received order', async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: PurchaseOrderData = {
        supplier_id: testSupplierId,
        order_date: new Date().toISOString(),
        status: 'RECEIVED',
        items,
      };

      const id = await service.create(data);

      await expect(service.delete(id)).rejects.toThrow(BusinessLogicError);
    });

    it('should throw BusinessLogicError when order has receiving', async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: PurchaseOrderData = {
        supplier_id: testSupplierId,
        order_date: new Date().toISOString(),
        items,
      };

      const id = await service.create(data);

      // Create a receiving for this order
      db.prepare(`
        INSERT INTO receiving (id, receiving_no, order_id, receiving_date, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'recv-001',
        'RCV000001',
        id,
        new Date().toISOString(),
        'PENDING',
        new Date().toISOString(),
        new Date().toISOString()
      );

      await expect(service.delete(id)).rejects.toThrow(BusinessLogicError);
    });
  });

  describe('findById', () => {
    it('should find order by id', async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: PurchaseOrderData = {
        supplier_id: testSupplierId,
        order_date: new Date().toISOString(),
        items,
      };

      const id = await service.create(data);
      const order = await service.findById(id);

      expect(order).toBeDefined();
      expect(order?.id).toBe(id);
      expect(order?.supplier_id).toBe(testSupplierId);
    });

    it('should return null for non-existent order', async () => {
      const order = await service.findById('non-existent-id');
      expect(order).toBeNull();
    });
  });

  describe('findByOrderNo', () => {
    it('should find order by order number', async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: PurchaseOrderData = {
        order_no: 'PO999999',
        supplier_id: testSupplierId,
        order_date: new Date().toISOString(),
        items,
      };

      await service.create(data);
      const order = await service.findByOrderNo('PO999999');

      expect(order).toBeDefined();
      expect(order?.order_no).toBe('PO999999');
    });

    it('should return null for non-existent order number', async () => {
      const order = await service.findByOrderNo('NONEXISTENT');
      expect(order).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const orders: PurchaseOrderData[] = [
        {
          supplier_id: testSupplierId,
          order_date: '2024-01-01T00:00:00.000Z',
          status: 'PENDING',
          items,
        },
        {
          supplier_id: testSupplierId,
          order_date: '2024-01-02T00:00:00.000Z',
          status: 'CONFIRMED',
          items,
        },
        {
          supplier_id: testSupplierId,
          order_date: '2024-01-03T00:00:00.000Z',
          status: 'PENDING',
          items,
        },
      ];

      for (const order of orders) {
        await service.create(order);
      }
    });

    it('should find all orders', async () => {
      const orders = await service.findAll();
      expect(orders.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by supplier_id', async () => {
      const orders = await service.findAll({ supplier_id: testSupplierId });
      expect(orders.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by status', async () => {
      const orders = await service.findAll({ status: 'PENDING' });
      expect(orders.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by date range', async () => {
      const orders = await service.findAll({
        start_date: '2024-01-01T00:00:00.000Z',
        end_date: '2024-01-02T00:00:00.000Z',
      });
      expect(orders.length).toBeGreaterThanOrEqual(2);
    });

    it('should support pagination', async () => {
      const orders = await service.findAll({ limit: 2, offset: 0 });
      expect(orders.length).toBeLessThanOrEqual(2);
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const orders: PurchaseOrderData[] = [
        {
          supplier_id: testSupplierId,
          order_date: new Date().toISOString(),
          status: 'PENDING',
          items,
        },
        {
          supplier_id: testSupplierId,
          order_date: new Date().toISOString(),
          status: 'CONFIRMED',
          items,
        },
        {
          supplier_id: testSupplierId,
          order_date: new Date().toISOString(),
          status: 'PENDING',
          items,
        },
      ];

      for (const order of orders) {
        await service.create(order);
      }
    });

    it('should count all orders', async () => {
      const count = await service.count();
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it('should count by status', async () => {
      const count = await service.count({ status: 'PENDING' });
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getSupplierOrders', () => {
    it('should get orders for a specific supplier', async () => {
      const items: PurchaseOrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 1,
          unit_price: 1000,
        },
      ];

      await service.create({
        supplier_id: testSupplierId,
        order_date: new Date().toISOString(),
        items,
      });

      const orders = await service.getSupplierOrders(testSupplierId, 10);
      expect(orders.length).toBeGreaterThan(0);
      expect(orders[0].supplier_id).toBe(testSupplierId);
    });
  });
});
