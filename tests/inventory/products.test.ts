import { DatabaseConnection } from '../../src/db/connection';
import { ProductsService, ProductData } from '../../src/inventory/products';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../src/utils/helpers';

describe('ProductsService', () => {
  let db: any;
  let service: ProductsService;

  beforeAll(async () => {
    db = DatabaseConnection.getInstance();
    await DatabaseConnection.initialize();
    service = new ProductsService(db);
  });

  beforeEach(() => {
    db.prepare('DELETE FROM sales_order_items').run();
    db.prepare('DELETE FROM sales_orders').run();
    db.prepare('DELETE FROM inventory_stock').run();
    db.prepare('DELETE FROM products').run();
    db.prepare('DELETE FROM customers').run();
  });

  afterEach(() => {
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
    it('should create a new product with auto-generated code', async () => {
      const data: ProductData = {
        code: 'PRD000001',
        name: 'Test Product',
        category: 'ELECTRONICS',
        unit: 'EA',
        cost_price: 1000,
        selling_price: 1500,
        tax_rate: 0.10,
      };

      const id = await service.create(data);

      expect(id).toBeDefined();

      const product = await service.findById(id);
      expect(product).toBeDefined();
      expect(product?.name).toBe('Test Product');
      expect(product?.code).toBe('PRD000001');
    });

    it('should create inventory stock entry automatically', async () => {
      const data: ProductData = {
        code: 'PRD000002',
        name: 'Test Product',
        category: 'ELECTRONICS',
        unit: 'EA',
        cost_price: 1000,
        selling_price: 1500,
      };

      const id = await service.create(data);

      const stock = db
        .prepare('SELECT * FROM inventory_stock WHERE product_id = ?')
        .get(id);

      expect(stock).toBeDefined();
      expect(stock.quantity_on_hand).toBe(0);
      expect(stock.quantity_available).toBe(0);
    });

    it('should throw ValidationError when name is empty', async () => {
      const data: ProductData = {
        code: 'PRD000003',
        name: '',
        category: 'ELECTRONICS',
        unit: 'EA',
        cost_price: 1000,
        selling_price: 1500,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when category is empty', async () => {
      const data: ProductData = {
        code: 'PRD000004',
        name: 'Test Product',
        category: '',
        unit: 'EA',
        cost_price: 1000,
        selling_price: 1500,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative cost_price', async () => {
      const data: ProductData = {
        code: 'PRD000005',
        name: 'Test Product',
        category: 'ELECTRONICS',
        unit: 'EA',
        cost_price: -100,
        selling_price: 1500,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when selling_price < cost_price', async () => {
      const data: ProductData = {
        code: 'PRD000006',
        name: 'Test Product',
        category: 'ELECTRONICS',
        unit: 'EA',
        cost_price: 1500,
        selling_price: 1000,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid tax_rate', async () => {
      const data: ProductData = {
        code: 'PRD000007',
        name: 'Test Product',
        category: 'ELECTRONICS',
        unit: 'EA',
        cost_price: 1000,
        selling_price: 1500,
        tax_rate: 1.5,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw BusinessLogicError for duplicate code', async () => {
      const data: ProductData = {
        code: 'PRD000008',
        name: 'Product 1',
        category: 'ELECTRONICS',
        unit: 'EA',
        cost_price: 1000,
        selling_price: 1500,
      };

      await service.create(data);

      const data2: ProductData = {
        code: 'PRD000008',
        name: 'Product 2',
        category: 'FOOD',
        unit: 'EA',
        cost_price: 500,
        selling_price: 750,
      };

      await expect(service.create(data2)).rejects.toThrow(BusinessLogicError);
    });
  });

  describe('update', () => {
    it('should update product details', async () => {
      const data: ProductData = {
        code: 'PRD000009',
        name: 'Original Name',
        category: 'ELECTRONICS',
        unit: 'EA',
        cost_price: 1000,
        selling_price: 1500,
      };

      const id = await service.create(data);

      await service.update(id, {
        name: 'Updated Name',
        category: 'FOOD',
        selling_price: 2000,
      });

      const product = await service.findById(id);
      expect(product?.name).toBe('Updated Name');
      expect(product?.category).toBe('FOOD');
      expect(product?.selling_price).toBe(2000);
    });

    it('should throw NotFoundError for non-existent product', async () => {
      await expect(
        service.update('non-existent-id', { name: 'Test' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError for negative cost_price on update', async () => {
      const data: ProductData = {
        code: 'PRD000010',
        name: 'Test Product',
        category: 'ELECTRONICS',
        unit: 'EA',
        cost_price: 1000,
        selling_price: 1500,
      };

      const id = await service.create(data);

      await expect(
        service.update(id, { cost_price: -100 })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when selling_price < cost_price on update', async () => {
      const data: ProductData = {
        code: 'PRD000011',
        name: 'Test Product',
        category: 'ELECTRONICS',
        unit: 'EA',
        cost_price: 1000,
        selling_price: 1500,
      };

      const id = await service.create(data);

      await expect(
        service.update(id, { cost_price: 2000 })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('delete', () => {
    it('should delete product successfully', async () => {
      const data: ProductData = {
        code: 'PRD000012',
        name: 'Test Product',
        category: 'ELECTRONICS',
        unit: 'EA',
        cost_price: 1000,
        selling_price: 1500,
      };

      const id = await service.create(data);
      await service.delete(id);

      const product = await service.findById(id);
      expect(product).toBeNull();

      // Stock should also be deleted
      const stock = db
        .prepare('SELECT * FROM inventory_stock WHERE product_id = ?')
        .get(id);
      expect(stock).toBeUndefined();
    });

    it('should throw NotFoundError for non-existent product', async () => {
      await expect(service.delete('non-existent-id')).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessLogicError when product has orders', async () => {
      const data: ProductData = {
        code: 'PRD000013',
        name: 'Test Product',
        category: 'ELECTRONICS',
        unit: 'EA',
        cost_price: 1000,
        selling_price: 1500,
      };

      const id = await service.create(data);

      // Create a customer first
      const customerId = 'test-customer-id';
      db.prepare(`
        INSERT INTO customers (id, code, name, category, payment_term, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        customerId,
        'CUS000001',
        'Test Customer',
        'RETAIL',
        30,
        new Date().toISOString(),
        new Date().toISOString()
      );

      // Create a sales order item for this product
      db.prepare(`
        INSERT INTO sales_orders (id, order_no, customer_id, order_date, status, subtotal, tax_amount, total_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test-order-id',
        'SO000001',
        customerId,
        new Date().toISOString(),
        'PENDING',
        10000,
        1000,
        11000,
        new Date().toISOString(),
        new Date().toISOString()
      );

      db.prepare(`
        INSERT INTO sales_order_items (id, order_id, product_id, quantity, unit_price, tax_rate, subtotal, tax_amount, total_amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test-item-id',
        'test-order-id',
        id,
        10,
        1000,
        0.10,
        10000,
        1000,
        11000,
        new Date().toISOString()
      );

      await expect(service.delete(id)).rejects.toThrow(BusinessLogicError);
    });
  });

  describe('findById', () => {
    it('should find product by id', async () => {
      const data: ProductData = {
        code: 'PRD000014',
        name: 'Test Product',
        category: 'ELECTRONICS',
        unit: 'EA',
        cost_price: 1000,
        selling_price: 1500,
      };

      const id = await service.create(data);
      const product = await service.findById(id);

      expect(product).toBeDefined();
      expect(product?.id).toBe(id);
      expect(product?.name).toBe('Test Product');
    });

    it('should return null for non-existent product', async () => {
      const product = await service.findById('non-existent-id');
      expect(product).toBeNull();
    });
  });

  describe('findByCode', () => {
    it('should find product by code', async () => {
      const data: ProductData = {
        code: 'PRD000015',
        name: 'Test Product',
        category: 'ELECTRONICS',
        unit: 'EA',
        cost_price: 1000,
        selling_price: 1500,
      };

      await service.create(data);
      const product = await service.findByCode('PRD000015');

      expect(product).toBeDefined();
      expect(product?.name).toBe('Test Product');
    });

    it('should return null for non-existent code', async () => {
      const product = await service.findByCode('NONEXISTENT');
      expect(product).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      const products: ProductData[] = [
        { code: 'PRD000016', name: 'Product A', category: 'ELECTRONICS', unit: 'EA', cost_price: 1000, selling_price: 1500, is_active: true },
        { code: 'PRD000017', name: 'Product B', category: 'FOOD', unit: 'EA', cost_price: 500, selling_price: 750, is_active: true },
        { code: 'PRD000018', name: 'Product C', category: 'ELECTRONICS', unit: 'EA', cost_price: 2000, selling_price: 3000, is_active: false },
      ];

      for (const product of products) {
        await service.create(product);
      }
    });

    it('should find all products', async () => {
      const products = await service.findAll();
      expect(products).toHaveLength(3);
    });

    it('should filter by category', async () => {
      const products = await service.findAll({ category: 'ELECTRONICS' });
      expect(products).toHaveLength(2);
    });

    it('should filter by is_active', async () => {
      const products = await service.findAll({ is_active: true });
      expect(products).toHaveLength(2);
    });

    it('should search by name', async () => {
      const products = await service.findAll({ search: 'Product A' });
      expect(products).toHaveLength(1);
      expect(products[0].name).toBe('Product A');
    });

    it('should support pagination', async () => {
      const products = await service.findAll({ limit: 2, offset: 0 });
      expect(products).toHaveLength(2);
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      const products: ProductData[] = [
        { code: 'PRD000019', name: 'Product A', category: 'ELECTRONICS', unit: 'EA', cost_price: 1000, selling_price: 1500, is_active: true },
        { code: 'PRD000020', name: 'Product B', category: 'FOOD', unit: 'EA', cost_price: 500, selling_price: 750, is_active: true },
        { code: 'PRD000021', name: 'Product C', category: 'ELECTRONICS', unit: 'EA', cost_price: 2000, selling_price: 3000, is_active: false },
      ];

      for (const product of products) {
        await service.create(product);
      }
    });

    it('should count all products', async () => {
      const count = await service.count();
      expect(count).toBe(3);
    });

    it('should count by category', async () => {
      const count = await service.count({ category: 'ELECTRONICS' });
      expect(count).toBe(2);
    });

    it('should count by is_active', async () => {
      const count = await service.count({ is_active: true });
      expect(count).toBe(2);
    });
  });

  describe('getCategories', () => {
    it('should return unique categories', async () => {
      const products: ProductData[] = [
        { code: 'PRD000022', name: 'Product A', category: 'ELECTRONICS', unit: 'EA', cost_price: 1000, selling_price: 1500 },
        { code: 'PRD000023', name: 'Product B', category: 'FOOD', unit: 'EA', cost_price: 500, selling_price: 750 },
        { code: 'PRD000024', name: 'Product C', category: 'ELECTRONICS', unit: 'EA', cost_price: 2000, selling_price: 3000 },
      ];

      for (const product of products) {
        await service.create(product);
      }

      const categories = await service.getCategories();
      expect(categories).toHaveLength(2);
      expect(categories).toContain('ELECTRONICS');
      expect(categories).toContain('FOOD');
    });
  });

  describe('getProductStats', () => {
    it('should return product statistics with stock levels', async () => {
      const data: ProductData = {
        code: 'PRD000025',
        name: 'Test Product',
        category: 'ELECTRONICS',
        unit: 'EA',
        cost_price: 1000,
        selling_price: 1500,
      };

      const id = await service.create(data);

      // Add stock
      db.prepare(`
        UPDATE inventory_stock
        SET quantity_on_hand = 100, quantity_available = 100
        WHERE product_id = ?
      `).run(id);

      const stats = await service.getProductStats(id);

      expect(stats).toBeDefined();
      expect(stats.product).toBeDefined();
      expect(stats.product.id).toBe(id);
      expect(stats.stock).toBeDefined();
      expect(stats.stock?.quantity_on_hand).toBe(100);
      expect(stats.stock?.quantity_available).toBe(100);
    });

    it('should throw NotFoundError for non-existent product', async () => {
      await expect(
        service.getProductStats('non-existent-id')
      ).rejects.toThrow(NotFoundError);
    });
  });
});
