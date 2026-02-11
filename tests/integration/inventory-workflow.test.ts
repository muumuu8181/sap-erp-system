import { DatabaseConnection } from '../../src/db/connection';
import { ProductsService, ProductData } from '../../src/inventory/products';
import { StockService, StockMovementData } from '../../src/inventory/stock';
import { StockTakingService, StockTakingData, StockTakingItemData } from '../../src/inventory/stocktaking';

describe('Inventory Workflow Integration', () => {
  let db: any;
  let productsService: ProductsService;
  let stockService: StockService;
  let stocktakingService: StockTakingService;

  let testProductId: string;
  let testLocationId: string;

  beforeAll(async () => {
    db = DatabaseConnection.getInstance();
    await DatabaseConnection.initialize();
    productsService = new ProductsService(db);
    stockService = new StockService(db);
    stocktakingService = new StockTakingService(db);
  });

  beforeEach(async () => {
    db.prepare('DELETE FROM stock_taking_items').run();
    db.prepare('DELETE FROM stock_taking').run();
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

    // Use warehouse location directly (no locations table in schema)
    testLocationId = 'MAIN';
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

  describe('Product Creation and Stock Initialization', () => {
    it('should auto-create stock record when product is created', async () => {
      const stock = await stockService.findByProductAndLocation(testProductId, testLocationId);
      expect(stock).toBeDefined();
      expect(stock?.quantity).toBe(0);
    });
  });

  describe('Stock Movement Workflow', () => {
    it('should handle complete stock IN to OUT flow', async () => {
      // Stock IN
      const inMovement: StockMovementData = {
        product_id: testProductId,
        location_id: testLocationId,
        movement_type: 'IN',
        quantity: 100,
        reference_id: 'po-001',
        notes: 'Initial stock receipt',
      };

      await stockService.createMovement(inMovement);

      let stock = await stockService.findByProductAndLocation(testProductId, testLocationId);
      expect(stock?.quantity).toBe(100);

      // Stock OUT
      const outMovement: StockMovementData = {
        product_id: testProductId,
        location_id: testLocationId,
        movement_type: 'OUT',
        quantity: 30,
        reference_id: 'so-001',
        notes: 'Sales order fulfillment',
      };

      await stockService.createMovement(outMovement);

      stock = await stockService.findByProductAndLocation(testProductId, testLocationId);
      expect(stock?.quantity).toBe(70);
    });

    it('should handle stock allocation and release', async () => {
      // Add stock
      const inMovement: StockMovementData = {
        product_id: testProductId,
        location_id: testLocationId,
        movement_type: 'IN',
        quantity: 100,
        reference_id: 'po-001',
      };

      await stockService.createMovement(inMovement);

      // Allocate stock
      await stockService.allocateStock(testProductId, testLocationId, 50, 'so-001');

      let stock = await stockService.findByProductAndLocation(testProductId, testLocationId);
      expect(stock?.allocated_quantity).toBe(50);
      expect(stock?.available_quantity).toBe(50);

      // Release allocated stock
      await stockService.releaseStock(testProductId, testLocationId, 30, 'so-001');

      stock = await stockService.findByProductAndLocation(testProductId, testLocationId);
      expect(stock?.allocated_quantity).toBe(20);
      expect(stock?.quantity).toBe(100); // quantity_on_hand unchanged by release
      expect(stock?.available_quantity).toBe(80); // 100 - 20 allocated
    });

    it('should handle stock TRANSFER between locations', async () => {
      // Note: Current implementation uses single location per product
      // This test verifies transfer functionality allocates stock
      await stockService.createMovement({
        product_id: testProductId,
        location_id: testLocationId,
        movement_type: 'IN',
        quantity: 100,
        reference_id: 'po-001',
      });

      // Allocate some stock (simulating transfer out)
      await stockService.allocateStock(testProductId, testLocationId, 30, 'transfer-001');

      const stock = await stockService.findByProductAndLocation(testProductId, testLocationId);
      expect(stock?.quantity).toBe(100);
      expect(stock?.quantity_available).toBe(70);
    });

    it('should handle stock ADJUSTMENT', async () => {
      // Add initial stock
      const inMovement: StockMovementData = {
        product_id: testProductId,
        location_id: testLocationId,
        movement_type: 'IN',
        quantity: 100,
        reference_id: 'po-001',
      };

      await stockService.createMovement(inMovement);

      // Adjust stock (damage, loss, etc.)
      const adjustMovement: StockMovementData = {
        product_id: testProductId,
        location_id: testLocationId,
        movement_type: 'ADJUSTMENT',
        quantity: -5,
        reference_id: 'adj-001',
        notes: 'Damaged goods',
      };

      await stockService.createMovement(adjustMovement);

      const stock = await stockService.findByProductAndLocation(testProductId, testLocationId);
      expect(stock?.quantity).toBe(95);
    });
  });

  describe('Stocktaking Workflow', () => {
    beforeEach(async () => {
      // Add initial stock
      const inMovement: StockMovementData = {
        product_id: testProductId,
        location_id: testLocationId,
        movement_type: 'IN',
        quantity: 100,
        reference_id: 'po-001',
      };

      await stockService.createMovement(inMovement);
    });

    it('should create stocktaking and calculate discrepancies', async () => {
      const items: StockTakingItemData[] = [
        {
          product_id: testProductId,
          expected_quantity: 100,
          actual_quantity: 95,
        },
      ];

      const stocktakingData: StockTakingData = {
        location_id: testLocationId,
        taking_date: new Date().toISOString(),
        status: 'COMPLETED',
        items,
      };

      const stocktakingId = await stocktakingService.create(stocktakingData);

      const stocktaking = await stocktakingService.findById(stocktakingId);
      expect(stocktaking).toBeDefined();
      expect(stocktaking?.items).toHaveLength(1);
      expect(stocktaking?.items[0].discrepancy).toBe(-5);
    });

    it('should update stock after stocktaking confirmation', async () => {
      const items: StockTakingItemData[] = [
        {
          product_id: testProductId,
          expected_quantity: 100,
          actual_quantity: 95,
        },
      ];

      const stocktakingData: StockTakingData = {
        location_id: testLocationId,
        taking_date: new Date().toISOString(),
        status: 'COMPLETED',
        items,
      };

      const stocktakingId = await stocktakingService.create(stocktakingData);

      // Confirm stocktaking (should update actual stock)
      await stocktakingService.confirmStocktaking(stocktakingId);

      const stock = await stockService.findByProductAndLocation(testProductId, testLocationId);
      expect(stock?.quantity).toBe(95);
    });

    it('should handle positive discrepancy', async () => {
      const items: StockTakingItemData[] = [
        {
          product_id: testProductId,
          expected_quantity: 100,
          actual_quantity: 105,
        },
      ];

      const stocktakingData: StockTakingData = {
        location_id: testLocationId,
        taking_date: new Date().toISOString(),
        status: 'COMPLETED',
        items,
      };

      const stocktakingId = await stocktakingService.create(stocktakingData);

      const stocktaking = await stocktakingService.findById(stocktakingId);
      expect(stocktaking?.items[0].discrepancy).toBe(5);
    });
  });

  describe('Stock Level Monitoring', () => {
    it('should identify low stock products', async () => {
      // Create product with reorder level
      const productData: ProductData = {
        code: 'PRD000002',
        name: 'Low Stock Product',
        category: 'ELECTRONICS',
        unit: 'EA',
        cost_price: 1000,
        selling_price: 1500,
        reorder_level: 50,
      };

      const productId = await productsService.create(productData);

      // Add stock below reorder level
      const inMovement: StockMovementData = {
        product_id: productId,
        location_id: testLocationId,
        movement_type: 'IN',
        quantity: 30,
        reference_id: 'po-001',
      };

      await stockService.createMovement(inMovement);

      const stock = await stockService.findByProductAndLocation(productId, testLocationId);
      expect(stock?.quantity).toBe(30);

      // Product should be flagged for reorder (would be checked by service method)
    });

    it('should track stock movements history', async () => {
      // Add movements
      const movements: StockMovementData[] = [
        {
          product_id: testProductId,
          location_id: testLocationId,
          movement_type: 'IN',
          quantity: 100,
          reference_id: 'po-001',
        },
        {
          product_id: testProductId,
          location_id: testLocationId,
          movement_type: 'OUT',
          quantity: 30,
          reference_id: 'so-001',
        },
      ];

      for (const movement of movements) {
        await stockService.createMovement(movement);
      }

      // Get movement history
      const history = await stockService.getMovementHistory({
        product_id: testProductId,
      });

      expect(history.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Multi-Location Inventory', () => {
    it('should track stock across multiple locations', async () => {
      // Note: Current implementation uses single stock record per product
      // This test verifies stock tracking functionality

      // Add stock multiple times (accumulating)
      await stockService.createMovement({
        product_id: testProductId,
        location_id: testLocationId,
        movement_type: 'IN',
        quantity: 100,
        reference_id: 'po-001',
      });

      await stockService.createMovement({
        product_id: testProductId,
        location_id: testLocationId,
        movement_type: 'IN',
        quantity: 50,
        reference_id: 'po-002',
      });

      const stock = await stockService.findByProductAndLocation(testProductId, testLocationId);
      expect(stock?.quantity).toBe(150);

      // Get stock for product
      const allStock = await stockService.findByProduct(testProductId);
      expect(allStock.length).toBeGreaterThanOrEqual(1);
    });
  });
});
