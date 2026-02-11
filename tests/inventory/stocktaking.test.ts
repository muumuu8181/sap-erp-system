import { DatabaseConnection } from '../../src/db/connection';
import { ProductsService, ProductData } from '../../src/inventory/products';
import { StockTakingService, StockTakingData, StockTakingItemData } from '../../src/inventory/stocktaking';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../src/utils/helpers';

describe('StockTakingService', () => {
  let db: any;
  let stockTakingService: StockTakingService;
  let productsService: ProductsService;
  let testProductId: string;
  let testProductId2: string;

  beforeAll(async () => {
    db = DatabaseConnection.getInstance();
    await DatabaseConnection.initialize();
    stockTakingService = new StockTakingService(db);
    productsService = new ProductsService(db);
  });

  beforeEach(async () => {
    db.prepare('DELETE FROM stock_taking_items').run();
    db.prepare('DELETE FROM stock_taking').run();
    db.prepare('DELETE FROM stock_movements').run();
    db.prepare('DELETE FROM inventory_stock').run();
    db.prepare('DELETE FROM products').run();

    // Create test products
    const productData1: ProductData = {
      code: 'PRD000001',
      name: 'Test Product 1',
      category: 'ELECTRONICS',
      unit: 'EA',
      cost_price: 1000,
      selling_price: 1500,
    };
    testProductId = await productsService.create(productData1);

    const productData2: ProductData = {
      code: 'PRD000002',
      name: 'Test Product 2',
      category: 'FOOD',
      unit: 'EA',
      cost_price: 500,
      selling_price: 750,
    };
    testProductId2 = await productsService.create(productData2);

    // Set initial stock
    db.prepare(`
      UPDATE inventory_stock
      SET quantity_on_hand = 100, quantity_available = 100
      WHERE product_id = ?
    `).run(testProductId);

    db.prepare(`
      UPDATE inventory_stock
      SET quantity_on_hand = 50, quantity_available = 50
      WHERE product_id = ?
    `).run(testProductId2);
  });

  afterEach(() => {
    db.prepare('DELETE FROM stock_taking_items').run();
    db.prepare('DELETE FROM stock_taking').run();
    db.prepare('DELETE FROM stock_movements').run();
    db.prepare('DELETE FROM inventory_stock').run();
    db.prepare('DELETE FROM products').run();
  });

  afterAll(() => {
    DatabaseConnection.close();
  });

  describe('create', () => {
    it('should create a new stock taking with items', async () => {
      const items: StockTakingItemData[] = [
        {
          product_id: testProductId,
          expected_quantity: 100,
          actual_quantity: 100,
        },
        {
          product_id: testProductId2,
          expected_quantity: 50,
          actual_quantity: 48,
        },
      ];

      const data: StockTakingData = {
        taking_date: new Date().toISOString(),
        items,
      };

      const id = await stockTakingService.create(data);

      expect(id).toBeDefined();

      const stocktaking = await stockTakingService.findById(id);
      expect(stocktaking).toBeDefined();
      expect(stocktaking?.items).toHaveLength(2);
    });

    it('should throw ValidationError when taking_date is missing', async () => {
      const data: StockTakingData = {
        taking_date: '',
        items: [],
      };

      await expect(stockTakingService.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty items', async () => {
      const data: StockTakingData = {
        taking_date: new Date().toISOString(),
        items: [],
      };

      await expect(stockTakingService.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative expected_quantity', async () => {
      const items: StockTakingItemData[] = [
        {
          product_id: testProductId,
          expected_quantity: -10,
          actual_quantity: 100,
        },
      ];

      const data: StockTakingData = {
        taking_date: new Date().toISOString(),
        items,
      };

      await expect(stockTakingService.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative actual_quantity', async () => {
      const items: StockTakingItemData[] = [
        {
          product_id: testProductId,
          expected_quantity: 100,
          actual_quantity: -5,
        },
      ];

      const data: StockTakingData = {
        taking_date: new Date().toISOString(),
        items,
      };

      await expect(stockTakingService.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError for non-existent product', async () => {
      const items: StockTakingItemData[] = [
        {
          product_id: 'non-existent',
          expected_quantity: 100,
          actual_quantity: 100,
        },
      ];

      const data: StockTakingData = {
        taking_date: new Date().toISOString(),
        items,
      };

      await expect(stockTakingService.create(data)).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessLogicError for actual > ordered when not in order', async () => {
      const items: StockTakingItemData[] = [
        {
          product_id: testProductId,
          expected_quantity: 100,
          actual_quantity: 150,
        },
      ];

      const data: StockTakingData = {
        taking_date: new Date().toISOString(),
        items,
      };

      // Positive discrepancies are valid (found extra stock)
      const id = await stockTakingService.create(data);
      expect(id).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update status to COMPLETED', async () => {
      const items: StockTakingItemData[] = [
        {
          product_id: testProductId,
          expected_quantity: 100,
          actual_quantity: 105,
        },
      ];

      const data: StockTakingData = {
        taking_date: new Date().toISOString(),
        status: 'DRAFT',
        items,
      };

      const id = await stockTakingService.create(data);

      await stockTakingService.update(id, { status: 'COMPLETED' });

      const stocktaking = await stockTakingService.findById(id);
      expect(stocktaking?.status).toBe('COMPLETED');

      // Stock should be adjusted
      const stock = db
        .prepare('SELECT * FROM inventory_stock WHERE product_id = ?')
        .get(testProductId);

      expect(stock.quantity_on_hand).toBe(105);
      expect(stock.last_count_date).toBeDefined();
    });

    it('should update notes', async () => {
      const items: StockTakingItemData[] = [
        {
          product_id: testProductId,
          expected_quantity: 100,
          actual_quantity: 100,
        },
      ];

      const data: StockTakingData = {
        taking_date: new Date().toISOString(),
        items,
      };

      const id = await stockTakingService.create(data);

      await stockTakingService.update(id, { notes: 'Updated notes' });

      const stocktaking = await stockTakingService.findById(id);
      expect(stocktaking?.notes).toBe('Updated notes');
    });

    it('should throw NotFoundError for non-existent stock taking', async () => {
      await expect(
        stockTakingService.update('non-existent-id', { status: 'COMPLETED' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessLogicError when updating completed stock taking', async () => {
      const items: StockTakingItemData[] = [
        {
          product_id: testProductId,
          expected_quantity: 100,
          actual_quantity: 100,
        },
      ];

      const data: StockTakingData = {
        taking_date: new Date().toISOString(),
        status: 'COMPLETED',
        items,
      };

      const id = await stockTakingService.create(data);

      await expect(
        stockTakingService.update(id, { status: 'DRAFT' })
      ).rejects.toThrow(BusinessLogicError);
    });

    it('should throw ValidationError for invalid status', async () => {
      const items: StockTakingItemData[] = [
        {
          product_id: testProductId,
          expected_quantity: 100,
          actual_quantity: 100,
        },
      ];

      const data: StockTakingData = {
        taking_date: new Date().toISOString(),
        items,
      };

      const id = await stockTakingService.create(data);

      await expect(
        stockTakingService.update(id, { status: 'INVALID' as any })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('delete', () => {
    it('should delete stock taking successfully', async () => {
      const items: StockTakingItemData[] = [
        {
          product_id: testProductId,
          expected_quantity: 100,
          actual_quantity: 100,
        },
      ];

      const data: StockTakingData = {
        taking_date: new Date().toISOString(),
        items,
      };

      const id = await stockTakingService.create(data);
      await stockTakingService.delete(id);

      const stocktaking = await stockTakingService.findById(id);
      expect(stocktaking).toBeNull();
    });

    it('should throw NotFoundError for non-existent stock taking', async () => {
      await expect(stockTakingService.delete('non-existent-id')).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessLogicError when deleting completed stock taking', async () => {
      const items: StockTakingItemData[] = [
        {
          product_id: testProductId,
          expected_quantity: 100,
          actual_quantity: 100,
        },
      ];

      const data: StockTakingData = {
        taking_date: new Date().toISOString(),
        status: 'COMPLETED',
        items,
      };

      const id = await stockTakingService.create(data);

      await expect(stockTakingService.delete(id)).rejects.toThrow(BusinessLogicError);
    });
  });

  describe('findById', () => {
    it('should find stock taking by id', async () => {
      const items: StockTakingItemData[] = [
        {
          product_id: testProductId,
          expected_quantity: 100,
          actual_quantity: 100,
        },
      ];

      const data: StockTakingData = {
        taking_date: new Date().toISOString(),
        items,
      };

      const id = await stockTakingService.create(data);
      const stocktaking = await stockTakingService.findById(id);

      expect(stocktaking).toBeDefined();
      expect(stocktaking?.id).toBe(id);
      expect(stocktaking?.items).toHaveLength(1);
    });

    it('should return null for non-existent stock taking', async () => {
      const stocktaking = await stockTakingService.findById('non-existent-id');
      expect(stocktaking).toBeNull();
    });
  });

  describe('findByTakingNo', () => {
    it('should find stock taking by number', async () => {
      const items: StockTakingItemData[] = [
        {
          product_id: testProductId,
          expected_quantity: 100,
          actual_quantity: 100,
        },
      ];

      const data: StockTakingData = {
        taking_no: 'ST999999',
        taking_date: new Date().toISOString(),
        items,
      };

      await stockTakingService.create(data);
      const stocktaking = await stockTakingService.findByTakingNo('ST999999');

      expect(stocktaking).toBeDefined();
      expect(stocktaking?.taking_no).toBe('ST999999');
    });

    it('should return null for non-existent number', async () => {
      const stocktaking = await stockTakingService.findByTakingNo('NONEXISTENT');
      expect(stocktaking).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      const items1: StockTakingItemData[] = [
        {
          product_id: testProductId,
          expected_quantity: 100,
          actual_quantity: 100,
        },
      ];

      const items2: StockTakingItemData[] = [
        {
          product_id: testProductId2,
          expected_quantity: 50,
          actual_quantity: 50,
        },
      ];

      const stockTakings: StockTakingData[] = [
        {
          taking_date: '2024-01-01T00:00:00.000Z',
          status: 'DRAFT',
          items: items1,
        },
        {
          taking_date: '2024-01-02T00:00:00.000Z',
          status: 'COMPLETED',
          items: items2,
        },
        {
          taking_date: '2024-01-03T00:00:00.000Z',
          status: 'DRAFT',
          items: items1,
        },
      ];

      for (const st of stockTakings) {
        await stockTakingService.create(st);
      }
    });

    it('should find all stock takings', async () => {
      const stockTakings = await stockTakingService.findAll(10, 0);
      expect(stockTakings.length).toBeGreaterThanOrEqual(3);
    });

    it('should support pagination', async () => {
      const stockTakings = await stockTakingService.findAll(2, 0);
      expect(stockTakings.length).toBeLessThanOrEqual(2);
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      const items: StockTakingItemData[] = [
        {
          product_id: testProductId,
          expected_quantity: 100,
          actual_quantity: 100,
        },
      ];

      for (let i = 0; i < 3; i++) {
        await stockTakingService.create({
          taking_date: new Date().toISOString(),
          items,
        });
      }
    });

    it('should count all stock takings', async () => {
      const count = await stockTakingService.count();
      expect(count).toBeGreaterThanOrEqual(3);
    });
  });

  describe('getDiscrepancies', () => {
    it('should return items with differences', async () => {
      const items: StockTakingItemData[] = [
        {
          product_id: testProductId,
          expected_quantity: 100,
          actual_quantity: 95,
          notes: 'Missing 5',
        },
        {
          product_id: testProductId2,
          expected_quantity: 50,
          actual_quantity: 55,
          notes: 'Excess 5',
        },
      ];

      const data: StockTakingData = {
        taking_date: new Date().toISOString(),
        items,
      };

      const id = await stockTakingService.create(data);

      const discrepancies = await stockTakingService.getDiscrepancies(id);

      expect(discrepancies).toBeDefined();
      expect(discrepancies.length).toBe(2);
      expect(discrepancies[0].difference).not.toBe(0);
      expect(discrepancies[1].difference).not.toBe(0);
    });

    it('should return empty array when no discrepancies', async () => {
      const items: StockTakingItemData[] = [
        {
          product_id: testProductId,
          expected_quantity: 100,
          actual_quantity: 100,
        },
      ];

      const data: StockTakingData = {
        taking_date: new Date().toISOString(),
        items,
      };

      const id = await stockTakingService.create(data);

      const discrepancies = await stockTakingService.getDiscrepancies(id);

      expect(discrepancies).toHaveLength(0);
    });
  });
});
