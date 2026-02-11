import { DatabaseConnection } from '../../src/db/connection';
import { OrdersService, SalesOrderData, OrderItemData } from '../../src/sales/orders';
import { CustomersService, CustomerData } from '../../src/sales/customers';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../src/utils/helpers';

describe('OrdersService', () => {
  let db: any;
  let service: OrdersService;
  let customersService: CustomersService;
  let testCustomerId: string;

  beforeAll(async () => {
    db = DatabaseConnection.getInstance();
    await DatabaseConnection.initialize();
    service = new OrdersService(db);
    customersService = new CustomersService(db);
  });

  beforeEach(async () => {
    // Delete in correct order due to foreign key constraints
    db.prepare('DELETE FROM invoice_items').run();
    db.prepare('DELETE FROM invoices').run();
    db.prepare('DELETE FROM shipment_items').run();
    db.prepare('DELETE FROM shipments').run();
    db.prepare('DELETE FROM sales_order_items').run();
    db.prepare('DELETE FROM sales_orders').run();
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
    db.prepare(`
      INSERT INTO products (id, code, name, category, unit, cost_price, selling_price, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'prod-001',
      'PRD000001',
      'Test Product',
      'ELECTRONICS',
      'EA',
      1000,
      1500,
      1,
      new Date().toISOString(),
      new Date().toISOString()
    );
  });

  afterEach(() => {
    // Delete in correct order due to foreign key constraints
    db.prepare('DELETE FROM invoice_items').run();
    db.prepare('DELETE FROM invoices').run();
    db.prepare('DELETE FROM shipment_items').run();
    db.prepare('DELETE FROM shipments').run();
    db.prepare('DELETE FROM sales_order_items').run();
    db.prepare('DELETE FROM sales_orders').run();
    db.prepare('DELETE FROM inventory_stock').run();
    db.prepare('DELETE FROM products').run();
    db.prepare('DELETE FROM customers').run();
  });

  afterAll(() => {
    DatabaseConnection.close();
  });

  describe('create', () => {
    it('should create a new sales order with items', async () => {
      const items: OrderItemData[] = [
        {
          product_id: 'prod-001',
          quantity: 10,
          unit_price: 1500,
          tax_rate: 0.10,
        },
      ];

      const data: SalesOrderData = {
        customer_id: testCustomerId,
        order_date: new Date().toISOString(),
        delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        items,
      };

      const id = await service.create(data);

      expect(id).toBeDefined();

      const order = await service.findById(id);
      expect(order).toBeDefined();
      expect(order?.customer_id).toBe(testCustomerId);
      expect(order?.items).toHaveLength(1);
      expect(order?.items[0].quantity).toBe(10);
    });

    it('should calculate order totals correctly', async () => {
      const items: OrderItemData[] = [
        {
          product_id: 'prod-001',
          quantity: 10,
          unit_price: 1000,
          tax_rate: 0.10,
        },
      ];

      const data: SalesOrderData = {
        customer_id: testCustomerId,
        order_date: new Date().toISOString(),
        items,
      };

      const id = await service.create(data);
      const order = await service.findById(id);

      // Subtotal: 10 * 1000 = 10000
      // Tax: 10000 * 0.10 = 1000
      // Total: 11000
      expect(order?.items[0].quantity).toBe(10);
    });

    it('should throw ValidationError when customer_id is missing', async () => {
      const data: SalesOrderData = {
        customer_id: '',
        order_date: new Date().toISOString(),
        items: [],
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError for non-existent customer', async () => {
      const items: OrderItemData[] = [
        {
          product_id: 'prod-001',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: SalesOrderData = {
        customer_id: 'non-existent',
        order_date: new Date().toISOString(),
        items,
      };

      await expect(service.create(data)).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError for empty items', async () => {
      const data: SalesOrderData = {
        customer_id: testCustomerId,
        order_date: new Date().toISOString(),
        items: [],
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when delivery_date is before order_date', async () => {
      const items: OrderItemData[] = [
        {
          product_id: 'prod-001',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: SalesOrderData = {
        customer_id: testCustomerId,
        order_date: '2024-01-10T00:00:00.000Z',
        delivery_date: '2024-01-01T00:00:00.000Z',
        items,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid quantity', async () => {
      const items: OrderItemData[] = [
        {
          product_id: 'prod-001',
          quantity: 0,
          unit_price: 1000,
        },
      ];

      const data: SalesOrderData = {
        customer_id: testCustomerId,
        order_date: new Date().toISOString(),
        items,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid discount_rate', async () => {
      const items: OrderItemData[] = [
        {
          product_id: 'prod-001',
          quantity: 1,
          unit_price: 1000,
          discount_rate: 1.5,
        },
      ];

      const data: SalesOrderData = {
        customer_id: testCustomerId,
        order_date: new Date().toISOString(),
        items,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });
  });

  describe('update', () => {
    it('should update order status', async () => {
      const items: OrderItemData[] = [
        {
          product_id: 'prod-001',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: SalesOrderData = {
        customer_id: testCustomerId,
        order_date: new Date().toISOString(),
        items,
      };

      const id = await service.create(data);

      await service.update(id, { status: 'CONFIRMED' });

      const order = await service.findById(id);
      expect(order?.status).toBe('CONFIRMED');
    });

    it('should update delivery_date', async () => {
      const items: OrderItemData[] = [
        {
          product_id: 'prod-001',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: SalesOrderData = {
        customer_id: testCustomerId,
        order_date: '2024-01-01T00:00:00.000Z',
        items,
      };

      const id = await service.create(data);

      await service.update(id, { delivery_date: '2024-01-15T00:00:00.000Z' });

      const order = await service.findById(id);
      expect(order?.delivery_date).toBe('2024-01-15T00:00:00.000Z');
    });

    it('should throw NotFoundError for non-existent order', async () => {
      await expect(
        service.update('non-existent-id', { status: 'CONFIRMED' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessLogicError when updating shipped order', async () => {
      const items: OrderItemData[] = [
        {
          product_id: 'prod-001',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: SalesOrderData = {
        customer_id: testCustomerId,
        order_date: new Date().toISOString(),
        status: 'SHIPPED',
        items,
      };

      const id = await service.create(data);

      await expect(
        service.update(id, { status: 'CANCELLED' })
      ).rejects.toThrow(BusinessLogicError);
    });

    it('should throw ValidationError for invalid status', async () => {
      const items: OrderItemData[] = [
        {
          product_id: 'prod-001',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: SalesOrderData = {
        customer_id: testCustomerId,
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
      const items: OrderItemData[] = [
        {
          product_id: 'prod-001',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: SalesOrderData = {
        customer_id: testCustomerId,
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

    it('should throw BusinessLogicError when deleting shipped order', async () => {
      const items: OrderItemData[] = [
        {
          product_id: 'prod-001',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: SalesOrderData = {
        customer_id: testCustomerId,
        order_date: new Date().toISOString(),
        status: 'SHIPPED',
        items,
      };

      const id = await service.create(data);

      await expect(service.delete(id)).rejects.toThrow(BusinessLogicError);
    });

    it('should throw BusinessLogicError when order has shipments', async () => {
      const items: OrderItemData[] = [
        {
          product_id: 'prod-001',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: SalesOrderData = {
        customer_id: testCustomerId,
        order_date: new Date().toISOString(),
        items,
      };

      const id = await service.create(data);

      // Create a shipment for this order
      db.prepare(`
        INSERT INTO shipments (id, shipment_no, order_id, shipment_date, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'ship-001',
        'SH000001',
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
      const items: OrderItemData[] = [
        {
          product_id: 'prod-001',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: SalesOrderData = {
        customer_id: testCustomerId,
        order_date: new Date().toISOString(),
        items,
      };

      const id = await service.create(data);
      const order = await service.findById(id);

      expect(order).toBeDefined();
      expect(order?.id).toBe(id);
      expect(order?.customer_id).toBe(testCustomerId);
    });

    it('should return null for non-existent order', async () => {
      const order = await service.findById('non-existent-id');
      expect(order).toBeNull();
    });
  });

  describe('findByOrderNo', () => {
    it('should find order by order number', async () => {
      const items: OrderItemData[] = [
        {
          product_id: 'prod-001',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const data: SalesOrderData = {
        order_no: 'SO999999',
        customer_id: testCustomerId,
        order_date: new Date().toISOString(),
        items,
      };

      await service.create(data);
      const order = await service.findByOrderNo('SO999999');

      expect(order).toBeDefined();
      expect(order?.order_no).toBe('SO999999');
    });

    it('should return null for non-existent order number', async () => {
      const order = await service.findByOrderNo('NONEXISTENT');
      expect(order).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      const items: OrderItemData[] = [
        {
          product_id: 'prod-001',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const orders: SalesOrderData[] = [
        {
          customer_id: testCustomerId,
          order_date: '2024-01-01T00:00:00.000Z',
          status: 'PENDING',
          items,
        },
        {
          customer_id: testCustomerId,
          order_date: '2024-01-02T00:00:00.000Z',
          status: 'CONFIRMED',
          items,
        },
        {
          customer_id: testCustomerId,
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

    it('should filter by customer_id', async () => {
      const orders = await service.findAll({ customer_id: testCustomerId });
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
      const items: OrderItemData[] = [
        {
          product_id: 'prod-001',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      const orders: SalesOrderData[] = [
        {
          customer_id: testCustomerId,
          order_date: new Date().toISOString(),
          status: 'PENDING',
          items,
        },
        {
          customer_id: testCustomerId,
          order_date: new Date().toISOString(),
          status: 'CONFIRMED',
          items,
        },
        {
          customer_id: testCustomerId,
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

  describe('getCustomerOrders', () => {
    it('should get orders for a specific customer', async () => {
      const items: OrderItemData[] = [
        {
          product_id: 'prod-001',
          quantity: 1,
          unit_price: 1000,
        },
      ];

      await service.create({
        customer_id: testCustomerId,
        order_date: new Date().toISOString(),
        items,
      });

      const orders = await service.getCustomerOrders(testCustomerId, 10);
      expect(orders.length).toBeGreaterThan(0);
      expect(orders[0].customer_id).toBe(testCustomerId);
    });
  });
});
