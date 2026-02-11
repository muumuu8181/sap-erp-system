import { Request, Response } from 'express';
import { ProductsService } from './products';
import { StockService } from './stock';
import { StockTakingService } from './stocktaking';
import { InventoryReportsService } from './inventory-reports';
import { DatabaseConnection } from '../db/connection';
import { Logger } from '../utils/logger';
import { NotFoundError, ValidationError, asyncHandler } from '../middleware/error';

const logger = new Logger('InventoryControllers');
const db = DatabaseConnection.getInstance();

export const productsService = new ProductsService(db);
export const stockService = new StockService(db);
export const stockTakingService = new StockTakingService(db);
export const inventoryReportsService = new InventoryReportsService(db);

export const productsControllers = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const id = await productsService.create(req.body);
    res.status(201).json({
      success: true,
      data: { id },
      message: 'Product created successfully',
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await productsService.update(id, req.body);
    res.json({
      success: true,
      message: 'Product updated successfully',
    });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await productsService.delete(id);
    res.json({
      success: true,
      message: 'Product deleted successfully',
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const product = await productsService.findById(id);
    if (!product) {
      throw new NotFoundError('Product', id);
    }
    res.json({
      success: true,
      data: product,
    });
  }),

  getByCode: asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.params;
    const product = await productsService.findByCode(code);
    if (!product) {
      throw new NotFoundError(`Product with code ${code}`);
    }
    res.json({
      success: true,
      data: product,
    });
  }),

  getAll: asyncHandler(async (req: Request, res: Response) => {
    const query = {
      category: req.query.category as string,
      is_active: req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined,
      search: req.query.search as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };
    const products = await productsService.findAll(query);
    const count = await productsService.count(query);
    res.json({
      success: true,
      data: products,
      meta: { total: count, limit: query.limit, offset: query.offset },
    });
  }),

  getCategories: asyncHandler(async (req: Request, res: Response) => {
    const categories = await productsService.getCategories();
    res.json({
      success: true,
      data: categories,
    });
  }),

  getStats: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const stats = await productsService.getProductStats(id);
    res.json({
      success: true,
      data: stats,
    });
  }),
};

export const stockControllers = {
  createMovement: asyncHandler(async (req: Request, res: Response) => {
    const id = await stockService.createMovement(req.body);
    res.status(201).json({
      success: true,
      data: { id },
      message: 'Stock movement created successfully',
    });
  }),

  getStockLevels: asyncHandler(async (req: Request, res: Response) => {
    const query = {
      product_id: req.query.product_id as string,
      low_stock: req.query.low_stock === 'true',
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };
    const stockLevels = await stockService.getStockLevels(query);
    res.json({
      success: true,
      data: stockLevels,
    });
  }),

  getLowStockProducts: asyncHandler(async (req: Request, res: Response) => {
    const products = await stockService.getLowStockProducts();
    res.json({
      success: true,
      data: products,
    });
  }),

  getMovements: asyncHandler(async (req: Request, res: Response) => {
    const { productId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const movements = await stockService.getMovements(productId, limit);
    res.json({
      success: true,
      data: movements,
    });
  }),

  updateReorderLevel: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { reorder_level } = req.body;
    await stockService.updateReorderLevel(id, reorder_level);
    res.json({
      success: true,
      message: 'Reorder level updated successfully',
    });
  }),

  getStockValue: asyncHandler(async (req: Request, res: Response) => {
    const value = await stockService.getStockValue();
    res.json({
      success: true,
      data: value,
    });
  }),

  getMovementSummary: asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      throw new ValidationError('Start date and end date are required');
    }
    const summary = await stockService.getStockMovementSummary(start_date as string, end_date as string);
    res.json({
      success: true,
      data: summary,
    });
  }),

  allocateStock: asyncHandler(async (req: Request, res: Response) => {
    const { productId } = req.params;
    const { quantity, reference_id } = req.body;
    await stockService.allocateStock(productId, quantity, reference_id);
    res.json({
      success: true,
      message: 'Stock allocated successfully',
    });
  }),

  releaseStock: asyncHandler(async (req: Request, res: Response) => {
    const { productId } = req.params;
    const { quantity, reference_id } = req.body;
    await stockService.releaseStock(productId, quantity, reference_id);
    res.json({
      success: true,
      message: 'Stock released successfully',
    });
  }),

  adjustStock: asyncHandler(async (req: Request, res: Response) => {
    const { productId } = req.params;
    const { quantity, reason } = req.body;
    await stockService.adjustStock(productId, quantity, reason);
    res.json({
      success: true,
      message: 'Stock adjusted successfully',
    });
  }),
};

export const stockTakingControllers = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const id = await stockTakingService.create(req.body);
    res.status(201).json({
      success: true,
      data: { id },
      message: 'Stock taking created successfully',
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await stockTakingService.update(id, req.body);
    res.json({
      success: true,
      message: 'Stock taking updated successfully',
    });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await stockTakingService.delete(id);
    res.json({
      success: true,
      message: 'Stock taking deleted successfully',
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const stockTaking = await stockTakingService.findById(id);
    if (!stockTaking) {
      throw new NotFoundError('Stock Taking', id);
    }
    res.json({
      success: true,
      data: stockTaking,
    });
  }),

  getByTakingNo: asyncHandler(async (req: Request, res: Response) => {
    const { takingNo } = req.params;
    const stockTaking = await stockTakingService.findByTakingNo(takingNo);
    if (!stockTaking) {
      throw new NotFoundError(`Stock Taking with number ${takingNo}`);
    }
    res.json({
      success: true,
      data: stockTaking,
    });
  }),

  getAll: asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    const stockTakings = await stockTakingService.findAll(limit, offset);
    const count = await stockTakingService.count();
    res.json({
      success: true,
      data: stockTakings,
      meta: { total: count, limit, offset },
    });
  }),

  getDiscrepancies: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const discrepancies = await stockTakingService.getDiscrepancies(id);
    res.json({
      success: true,
      data: discrepancies,
    });
  }),
};

export const inventoryReportsControllers = {
  getInventorySummary: asyncHandler(async (req: Request, res: Response) => {
    const summary = await inventoryReportsService.getInventorySummary();
    res.json({
      success: true,
      data: summary,
    });
  }),

  getLowStockProducts: asyncHandler(async (req: Request, res: Response) => {
    const products = await inventoryReportsService.getLowStockProducts();
    res.json({
      success: true,
      data: products,
    });
  }),

  getOutOfStockProducts: asyncHandler(async (req: Request, res: Response) => {
    const products = await inventoryReportsService.getOutOfStockProducts();
    res.json({
      success: true,
      data: products,
    });
  }),

  getStockByCategory: asyncHandler(async (req: Request, res: Response) => {
    const stock = await inventoryReportsService.getStockByCategory();
    res.json({
      success: true,
      data: stock,
    });
  }),

  getInventoryTurnover: asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date } = req.query;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    if (!start_date || !end_date) {
      throw new ValidationError('Start date and end date are required');
    }
    const turnover = await inventoryReportsService.getInventoryTurnover(start_date as string, end_date as string, limit);
    res.json({
      success: true,
      data: turnover,
    });
  }),

  getStockMovementSummary: asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      throw new ValidationError('Start date and end date are required');
    }
    const summary = await inventoryReportsService.getStockMovementSummary(start_date as string, end_date as string);
    res.json({
      success: true,
      data: summary,
    });
  }),

  getProductPerformance: asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date } = req.query;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    if (!start_date || !end_date) {
      throw new ValidationError('Start date and end date are required');
    }
    const performance = await inventoryReportsService.getProductPerformance(start_date as string, end_date as string, limit);
    res.json({
      success: true,
      data: performance,
    });
  }),

  getABCAnalysis: asyncHandler(async (req: Request, res: Response) => {
    const analysis = await inventoryReportsService.getABCAnalysis();
    res.json({
      success: true,
      data: analysis,
    });
  }),

  getExpiringProducts: asyncHandler(async (req: Request, res: Response) => {
    const products = await inventoryReportsService.getExpiringProducts();
    res.json({
      success: true,
      data: products,
    });
  }),

  getWarehouseLocationSummary: asyncHandler(async (req: Request, res: Response) => {
    const summary = await inventoryReportsService.getWarehouseLocationSummary();
    res.json({
      success: true,
      data: summary,
    });
  }),
};

export default {
  productsControllers,
  stockControllers,
  stockTakingControllers,
  inventoryReportsControllers,
};
