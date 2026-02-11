import { DatabaseConnection } from '../../src/db/connection';
import { ProductsService, ProductData } from '../../src/inventory/products';
import { StockService, StockMovementData } from '../../src/inventory/stock';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../src/utils/helpers';

describe('StockService', () => {
  let db: any;
  let stockService: StockService;
  let productsService: ProductsService;
  let testProductId: string;

  beforeAll(async () => {
    db = DatabaseConnection.getInstance();
    await DatabaseConnection.initialize();
    stockService = new StockService(db);
    productsService = new ProductsService(db);
  });

  beforeEach(async () => {
    db.prepare('DELETE FROM stock_movements').run();
    db.prepare('DELETE FROM inventory_stock').run();
    db.prepare('DELETE FROM products').run();

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

    // Set initial stock
    db.prepare(`
      UPDATE inventory_stock
      SET quantity_on_hand = 100, quantity_available = 100
      WHERE product_id = ?
    `).run(testProductId);
  });

  afterEach(() => {
    db.prepare('DELETE FROM stock_movements').run();
    db.prepare('DELETE FROM inventory_stock').run();
    db.prepare('DELETE FROM products').run();
  });

  afterAll(() => {
    DatabaseConnection.close();
  });

  describe('getStockLevel', () => {
    it('should return stock level for product', () => {
      const stock = stockService.getStockLevel(testProductId);

      expect(stock).toBeDefined();
      expect(stock.product_id).toBe(testProductId);
      expect(stock.quantity_on_hand).toBe(100);
      expect(stock.quantity_available).toBe(100);
      expect(stock.quantity_allocated).toBe(0);
    });

    it('should throw NotFoundError for non-existent product', () => {
      expect(() => {
        stockService.getStockLevel('non-existent-id');
      }).toThrow(NotFoundError);
    });
  });

  describe('createMovement', () => {
    it('should create IN movement and increase stock', async () => {
      const data: StockMovementData = {
        product_id: testProductId,
        movement_type: 'IN',
        quantity: 50,
        notes: 'Initial stock',
      };

      const id = await stockService.createMovement(data);

      expect(id).toBeDefined();

      const stock = stockService.getStockLevel(testProductId);
      expect(stock.quantity_on_hand).toBe(150);
      expect(stock.quantity_available).toBe(150);
    });

    it('should create OUT movement and decrease stock', async () => {
      const data: StockMovementData = {
        product_id: testProductId,
        movement_type: 'OUT',
        quantity: 30,
        notes: 'Sale',
      };

      await stockService.createMovement(data);

      const stock = stockService.getStockLevel(testProductId);
      expect(stock.quantity_on_hand).toBe(70);
      expect(stock.quantity_available).toBe(70);
    });

    it('should create TRANSFER movement and allocate stock', async () => {
      const data: StockMovementData = {
        product_id: testProductId,
        movement_type: 'TRANSFER',
        quantity: 20,
        notes: 'Allocation',
      };

      await stockService.createMovement(data);

      const stock = stockService.getStockLevel(testProductId);
      expect(stock.quantity_on_hand).toBe(100);
      expect(stock.quantity_allocated).toBe(20);
      expect(stock.quantity_available).toBe(80);
    });

    it('should create RETURN movement and release allocation', async () => {
      // First allocate
      await stockService.createMovement({
        product_id: testProductId,
        movement_type: 'TRANSFER',
        quantity: 20,
      });

      // Then return
      const data: StockMovementData = {
        product_id: testProductId,
        movement_type: 'RETURN',
        quantity: 10,
        notes: 'Return',
      };

      await stockService.createMovement(data);

      const stock = stockService.getStockLevel(testProductId);
      expect(stock.quantity_on_hand).toBe(100);
      expect(stock.quantity_allocated).toBe(10);
      expect(stock.quantity_available).toBe(90);
    });

    it('should create ADJUSTMENT movement and set exact quantity', async () => {
      const data: StockMovementData = {
        product_id: testProductId,
        movement_type: 'ADJUSTMENT',
        quantity: 200,
        notes: 'Stock count',
      };

      await stockService.createMovement(data);

      const stock = stockService.getStockLevel(testProductId);
      expect(stock.quantity_on_hand).toBe(200);
      expect(stock.quantity_available).toBe(200);
    });

    it('should throw ValidationError for non-existent product', async () => {
      const data: StockMovementData = {
        product_id: 'non-existent',
        movement_type: 'IN',
        quantity: 10,
      };

      await expect(stockService.createMovement(data)).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError for invalid movement_type', async () => {
      const data: StockMovementData = {
        product_id: testProductId,
        movement_type: 'INVALID' as any,
        quantity: 10,
      };

      await expect(stockService.createMovement(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for zero quantity', async () => {
      const data: StockMovementData = {
        product_id: testProductId,
        movement_type: 'IN',
        quantity: 0,
      };

      await expect(stockService.createMovement(data)).rejects.toThrow(ValidationError);
    });

    it('should throw BusinessLogicError for insufficient stock on OUT', async () => {
      const data: StockMovementData = {
        product_id: testProductId,
        movement_type: 'OUT',
        quantity: 150,
      };

      await expect(stockService.createMovement(data)).rejects.toThrow(BusinessLogicError);
    });

    it('should throw BusinessLogicError for insufficient available stock on TRANSFER', async () => {
      const data: StockMovementData = {
        product_id: testProductId,
        movement_type: 'TRANSFER',
        quantity: 150,
      };

      await expect(stockService.createMovement(data)).rejects.toThrow(BusinessLogicError);
    });

    it('should create stock movement record', async () => {
      const data: StockMovementData = {
        product_id: testProductId,
        movement_type: 'IN',
        quantity: 10,
        reference_id: 'ref-001',
        reference_type: 'RECEIVING',
      };

      const id = await stockService.createMovement(data);

      const movement = db
        .prepare('SELECT * FROM stock_movements WHERE id = ?')
        .get(id);

      expect(movement).toBeDefined();
      expect(movement.product_id).toBe(testProductId);
      expect(movement.movement_type).toBe('IN');
      expect(movement.quantity).toBe(10);
      expect(movement.reference_id).toBe('ref-001');
      expect(movement.reference_type).toBe('RECEIVING');
    });
  });

  describe('allocateStock', () => {
    it('should allocate stock for an order', async () => {
      await stockService.allocateStock(testProductId, 'MAIN', 25, 'order-123');

      const stock = stockService.getStockLevel(testProductId);
      expect(stock.quantity_on_hand).toBe(100);
      expect(stock.quantity_allocated).toBe(25);
      expect(stock.quantity_available).toBe(75);
    });

    it('should throw BusinessLogicError for insufficient stock', async () => {
      await expect(
        stockService.allocateStock(testProductId, 'MAIN', 150, 'order-456')
      ).rejects.toThrow(BusinessLogicError);
    });
  });

  describe('releaseStock', () => {
    it('should release allocated stock', async () => {
      // First allocate
      await stockService.allocateStock(testProductId, 'MAIN', 30, 'order-789');

      // Then release
      await stockService.releaseStock(testProductId, 'MAIN', 20, 'order-789');

      const stock = stockService.getStockLevel(testProductId);
      expect(stock.quantity_on_hand).toBe(100);
      expect(stock.quantity_allocated).toBe(10);
      expect(stock.quantity_available).toBe(90);
    });
  });

  describe('adjustStock', () => {
    it('should adjust stock to new quantity', async () => {
      await stockService.adjustStock(testProductId, 250, 'Stock correction');

      const stock = stockService.getStockLevel(testProductId);
      expect(stock.quantity_on_hand).toBe(250);
      expect(stock.quantity_available).toBe(250);
    });
  });

  describe('getStockLevels', () => {
    beforeEach(async () => {
      // Create another product
      const productData2: ProductData = {
        code: 'PRD000002',
        name: 'Product 2',
        category: 'FOOD',
        unit: 'EA',
        cost_price: 500,
        selling_price: 750,
      };
      const product2Id = await productsService.create(productData2);

      db.prepare(`
        UPDATE inventory_stock
        SET quantity_available = 5, reorder_level = 10
        WHERE product_id = ?
      `).run(product2Id);
    });

    it('should get all stock levels', async () => {
      const levels = await stockService.getStockLevels({});

      expect(levels.length).toBeGreaterThanOrEqual(2);
      expect(levels[0].product_id).toBeDefined();
      expect(levels[0].quantity_on_hand).toBeDefined();
    });

    it('should filter low stock products', async () => {
      const levels = await stockService.getStockLevels({ low_stock: true });

      expect(levels.length).toBeGreaterThan(0);
      expect(levels[0].is_low_stock).toBe(true);
    });

    it('should support pagination', async () => {
      const levels = await stockService.getStockLevels({ limit: 1, offset: 0 });

      expect(levels.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getLowStockProducts', () => {
    it('should return products below reorder level', async () => {
      db.prepare(`
        UPDATE inventory_stock
        SET quantity_available = 5, reorder_level = 10
        WHERE product_id = ?
      `).run(testProductId);

      const products = await stockService.getLowStockProducts();

      expect(products.length).toBeGreaterThan(0);
      expect(products[0].is_low_stock).toBe(true);
    });
  });

  describe('getMovements', () => {
    it('should get movements for a product', async () => {
      await stockService.createMovement({
        product_id: testProductId,
        movement_type: 'IN',
        quantity: 10,
        notes: 'Test movement',
      });

      const movements = await stockService.getMovements(testProductId, 10);

      expect(movements.length).toBeGreaterThan(0);
      expect(movements[0].product_id).toBe(testProductId);
      expect(movements[0].movement_type).toBe('IN');
    });

    it('should respect limit parameter', async () => {
      // Create multiple movements
      for (let i = 0; i < 5; i++) {
        await stockService.createMovement({
          product_id: testProductId,
          movement_type: 'IN',
          quantity: 10,
        });
      }

      const movements = await stockService.getMovements(testProductId, 3);
      expect(movements.length).toBe(3);
    });
  });

  describe('updateReorderLevel', () => {
    it('should update reorder level', async () => {
      await stockService.updateReorderLevel(testProductId, 50);

      const stock = stockService.getStockLevel(testProductId);
      expect(stock.reorder_level).toBe(50);
    });

    it('should throw ValidationError for negative reorder_level', async () => {
      await expect(
        stockService.updateReorderLevel(testProductId, -10)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getStockValue', () => {
    it('should calculate total stock value', async () => {
      const value = await stockService.getStockValue();

      expect(value).toBeDefined();
      expect(value.total_products).toBeGreaterThan(0);
      expect(value.total_value).toBeGreaterThan(0);
    });
  });

  describe('getStockMovementSummary', () => {
    it('should get movement summary by date range', async () => {
      const startDate = '2024-01-01T00:00:00.000Z';
      const endDate = '2024-12-31T23:59:59.999Z';

      await stockService.createMovement({
        product_id: testProductId,
        movement_type: 'IN',
        quantity: 100,
      });

      const summary = await stockService.getStockMovementSummary(startDate, endDate);

      expect(summary).toBeDefined();
      expect(Array.isArray(summary)).toBe(true);
    });
  });
});
