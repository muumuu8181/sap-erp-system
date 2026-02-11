import { Request, Response } from 'express';
import { SuppliersService } from './suppliers';
import { PurchaseOrdersService } from './purchase-orders';
import { ReceivingService } from './receiving';
import { PurchasingReportsService } from './purchasing-reports';
import { DatabaseConnection } from '../db/connection';
import { Logger } from '../utils/logger';
import { NotFoundError, ValidationError, asyncHandler } from '../middleware/error';

const logger = new Logger('PurchasingControllers');
const db = DatabaseConnection.getInstance();

export const suppliersService = new SuppliersService(db);
export const purchaseOrdersService = new PurchaseOrdersService(db);
export const receivingService = new ReceivingService(db);
export const purchasingReportsService = new PurchasingReportsService(db);

export const suppliersControllers = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const id = await suppliersService.create(req.body);
    res.status(201).json({
      success: true,
      data: { id },
      message: 'Supplier created successfully',
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await suppliersService.update(id, req.body);
    res.json({
      success: true,
      message: 'Supplier updated successfully',
    });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await suppliersService.delete(id);
    res.json({
      success: true,
      message: 'Supplier deleted successfully',
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const supplier = await suppliersService.findById(id);
    if (!supplier) {
      throw new NotFoundError('Supplier', id);
    }
    res.json({
      success: true,
      data: supplier,
    });
  }),

  getByCode: asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.params;
    const supplier = await suppliersService.findByCode(code);
    if (!supplier) {
      throw new NotFoundError(`Supplier with code ${code}`);
    }
    res.json({
      success: true,
      data: supplier,
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
    const suppliers = await suppliersService.findAll(query);
    const count = await suppliersService.count(query);
    res.json({
      success: true,
      data: suppliers,
      meta: { total: count, limit: query.limit, offset: query.offset },
    });
  }),

  getStats: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const stats = await suppliersService.getSupplierStats(id);
    res.json({
      success: true,
      data: stats,
    });
  }),
};

export const purchaseOrdersControllers = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const id = await purchaseOrdersService.create(req.body);
    res.status(201).json({
      success: true,
      data: { id },
      message: 'Purchase order created successfully',
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await purchaseOrdersService.update(id, req.body);
    res.json({
      success: true,
      message: 'Purchase order updated successfully',
    });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await purchaseOrdersService.delete(id);
    res.json({
      success: true,
      message: 'Purchase order deleted successfully',
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const order = await purchaseOrdersService.findById(id);
    if (!order) {
      throw new NotFoundError('Purchase Order', id);
    }
    res.json({
      success: true,
      data: order,
    });
  }),

  getByOrderNo: asyncHandler(async (req: Request, res: Response) => {
    const { orderNo } = req.params;
    const order = await purchaseOrdersService.findByOrderNo(orderNo);
    if (!order) {
      throw new NotFoundError(`Purchase Order with number ${orderNo}`);
    }
    res.json({
      success: true,
      data: order,
    });
  }),

  getAll: asyncHandler(async (req: Request, res: Response) => {
    const query = {
      supplier_id: req.query.supplier_id as string,
      status: req.query.status as string,
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };
    const orders = await purchaseOrdersService.findAll(query);
    const count = await purchaseOrdersService.count(query);
    res.json({
      success: true,
      data: orders,
      meta: { total: count, limit: query.limit, offset: query.offset },
    });
  }),

  getSupplierOrders: asyncHandler(async (req: Request, res: Response) => {
    const { supplierId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const orders = await purchaseOrdersService.getSupplierOrders(supplierId, limit);
    res.json({
      success: true,
      data: orders,
    });
  }),
};

export const receivingControllers = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const id = await receivingService.create(req.body);
    res.status(201).json({
      success: true,
      data: { id },
      message: 'Receiving created successfully',
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await receivingService.update(id, req.body);
    res.json({
      success: true,
      message: 'Receiving updated successfully',
    });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await receivingService.delete(id);
    res.json({
      success: true,
      message: 'Receiving deleted successfully',
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const receiving = await receivingService.findById(id);
    if (!receiving) {
      throw new NotFoundError('Receiving', id);
    }
    res.json({
      success: true,
      data: receiving,
    });
  }),

  getByReceivingNo: asyncHandler(async (req: Request, res: Response) => {
    const { receivingNo } = req.params;
    const receiving = await receivingService.findByReceivingNo(receivingNo);
    if (!receiving) {
      throw new NotFoundError(`Receiving with number ${receivingNo}`);
    }
    res.json({
      success: true,
      data: receiving,
    });
  }),

  getAll: asyncHandler(async (req: Request, res: Response) => {
    const query = {
      order_id: req.query.order_id as string,
      status: req.query.status as string,
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };
    const receivings = await receivingService.findAll(query);
    const count = await receivingService.count(query);
    res.json({
      success: true,
      data: receivings,
      meta: { total: count, limit: query.limit, offset: query.offset },
    });
  }),

  getOrderReceiving: asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const receivings = await receivingService.getOrderReceiving(orderId);
    res.json({
      success: true,
      data: receivings,
    });
  }),
};

export const purchasingReportsControllers = {
  getPurchasingSummary: asyncHandler(async (req: Request, res: Response) => {
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const summary = await purchasingReportsService.getPurchasingSummary(startDate, endDate);
    res.json({
      success: true,
      data: summary,
    });
  }),

  getSupplierSpending: asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const spending = await purchasingReportsService.getSupplierSpending(limit, startDate, endDate);
    res.json({
      success: true,
      data: spending,
    });
  }),

  getPurchaseByCategory: asyncHandler(async (req: Request, res: Response) => {
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const purchases = await purchasingReportsService.getPurchaseByCategory(startDate, endDate);
    res.json({
      success: true,
      data: purchases,
    });
  }),

  getTopPurchasedProducts: asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const products = await purchasingReportsService.getTopPurchasedProducts(limit, startDate, endDate);
    res.json({
      success: true,
      data: products,
    });
  }),

  getOutstandingPayments: asyncHandler(async (req: Request, res: Response) => {
    const payments = await purchasingReportsService.getOutstandingPayments();
    res.json({
      success: true,
      data: payments,
    });
  }),

  getOrderStatusSummary: asyncHandler(async (req: Request, res: Response) => {
    const summary = await purchasingReportsService.getOrderStatusSummary();
    res.json({
      success: true,
      data: summary,
    });
  }),

  getMonthlyPurchases: asyncHandler(async (req: Request, res: Response) => {
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const purchases = await purchasingReportsService.getMonthlyPurchases(year);
    res.json({
      success: true,
      data: purchases,
    });
  }),

  getSupplierPerformance: asyncHandler(async (req: Request, res: Response) => {
    const performance = await purchasingReportsService.getSupplierPerformance();
    res.json({
      success: true,
      data: performance,
    });
  }),

  getPendingDelivery: asyncHandler(async (req: Request, res: Response) => {
    const delivery = await purchasingReportsService.getPendingDelivery();
    res.json({
      success: true,
      data: delivery,
    });
  }),
};

export default {
  suppliersControllers,
  purchaseOrdersControllers,
  receivingControllers,
  purchasingReportsControllers,
};
