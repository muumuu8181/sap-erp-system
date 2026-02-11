import { Request, Response } from 'express';
import { CustomersService } from './customers';
import { OrdersService } from './orders';
import { ShipmentsService } from './shipments';
import { InvoicesService } from './invoices';
import { SalesReportsService } from './sales-reports';
import { DatabaseConnection } from '../db/connection';
import { Logger } from '../utils/logger';
import { NotFoundError, ValidationError, asyncHandler } from '../middleware/error';

const logger = new Logger('SalesControllers');
const db = DatabaseConnection.getInstance();

export const customersService = new CustomersService(db);
export const ordersService = new OrdersService(db);
export const shipmentsService = new ShipmentsService(db);
export const invoicesService = new InvoicesService(db);
export const salesReportsService = new SalesReportsService(db);

export const customersControllers = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const id = await customersService.create(req.body);
    res.status(201).json({
      success: true,
      data: { id },
      message: 'Customer created successfully',
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await customersService.update(id, req.body);
    res.json({
      success: true,
      message: 'Customer updated successfully',
    });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await customersService.delete(id);
    res.json({
      success: true,
      message: 'Customer deleted successfully',
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const customer = await customersService.findById(id);
    if (!customer) {
      throw new NotFoundError('Customer', id);
    }
    res.json({
      success: true,
      data: customer,
    });
  }),

  getByCode: asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.params;
    const customer = await customersService.findByCode(code);
    if (!customer) {
      throw new NotFoundError(`Customer with code ${code}`);
    }
    res.json({
      success: true,
      data: customer,
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
    const customers = await customersService.findAll(query);
    const count = await customersService.count(query);
    res.json({
      success: true,
      data: customers,
      meta: { total: count, limit: query.limit, offset: query.offset },
    });
  }),

  getStats: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const stats = await customersService.getCustomerStats(id);
    res.json({
      success: true,
      data: stats,
    });
  }),
};

export const ordersControllers = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const id = await ordersService.create(req.body);
    res.status(201).json({
      success: true,
      data: { id },
      message: 'Sales order created successfully',
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await ordersService.update(id, req.body);
    res.json({
      success: true,
      message: 'Sales order updated successfully',
    });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await ordersService.delete(id);
    res.json({
      success: true,
      message: 'Sales order deleted successfully',
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const order = await ordersService.findById(id);
    if (!order) {
      throw new NotFoundError('Sales Order', id);
    }
    res.json({
      success: true,
      data: order,
    });
  }),

  getByOrderNo: asyncHandler(async (req: Request, res: Response) => {
    const { orderNo } = req.params;
    const order = await ordersService.findByOrderNo(orderNo);
    if (!order) {
      throw new NotFoundError(`Sales Order with number ${orderNo}`);
    }
    res.json({
      success: true,
      data: order,
    });
  }),

  getAll: asyncHandler(async (req: Request, res: Response) => {
    const query = {
      customer_id: req.query.customer_id as string,
      status: req.query.status as string,
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };
    const orders = await ordersService.findAll(query);
    const count = await ordersService.count(query);
    res.json({
      success: true,
      data: orders,
      meta: { total: count, limit: query.limit, offset: query.offset },
    });
  }),

  getCustomerOrders: asyncHandler(async (req: Request, res: Response) => {
    const { customerId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const orders = await ordersService.getCustomerOrders(customerId, limit);
    res.json({
      success: true,
      data: orders,
    });
  }),
};

export const shipmentsControllers = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const id = await shipmentsService.create(req.body);
    res.status(201).json({
      success: true,
      data: { id },
      message: 'Shipment created successfully',
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await shipmentsService.update(id, req.body);
    res.json({
      success: true,
      message: 'Shipment updated successfully',
    });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await shipmentsService.delete(id);
    res.json({
      success: true,
      message: 'Shipment deleted successfully',
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const shipment = await shipmentsService.findById(id);
    if (!shipment) {
      throw new NotFoundError('Shipment', id);
    }
    res.json({
      success: true,
      data: shipment,
    });
  }),

  getByShipmentNo: asyncHandler(async (req: Request, res: Response) => {
    const { shipmentNo } = req.params;
    const shipment = await shipmentsService.findByShipmentNo(shipmentNo);
    if (!shipment) {
      throw new NotFoundError(`Shipment with number ${shipmentNo}`);
    }
    res.json({
      success: true,
      data: shipment,
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
    const shipments = await shipmentsService.findAll(query);
    const count = await shipmentsService.count(query);
    res.json({
      success: true,
      data: shipments,
      meta: { total: count, limit: query.limit, offset: query.offset },
    });
  }),

  getOrderShipments: asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const shipments = await shipmentsService.getOrderShipments(orderId);
    res.json({
      success: true,
      data: shipments,
    });
  }),
};

export const invoicesControllers = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const id = await invoicesService.create(req.body);
    res.status(201).json({
      success: true,
      data: { id },
      message: 'Invoice created successfully',
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await invoicesService.update(id, req.body);
    res.json({
      success: true,
      message: 'Invoice updated successfully',
    });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await invoicesService.delete(id);
    res.json({
      success: true,
      message: 'Invoice deleted successfully',
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const invoice = await invoicesService.findById(id);
    if (!invoice) {
      throw new NotFoundError('Invoice', id);
    }
    res.json({
      success: true,
      data: invoice,
    });
  }),

  getByInvoiceNo: asyncHandler(async (req: Request, res: Response) => {
    const { invoiceNo } = req.params;
    const invoice = await invoicesService.findByInvoiceNo(invoiceNo);
    if (!invoice) {
      throw new NotFoundError(`Invoice with number ${invoiceNo}`);
    }
    res.json({
      success: true,
      data: invoice,
    });
  }),

  getAll: asyncHandler(async (req: Request, res: Response) => {
    const query = {
      customer_id: req.query.customer_id as string,
      order_id: req.query.order_id as string,
      status: req.query.status as string,
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
      due_start: req.query.due_start as string,
      due_end: req.query.due_end as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };
    const invoices = await invoicesService.findAll(query);
    const count = await invoicesService.count(query);
    res.json({
      success: true,
      data: invoices,
      meta: { total: count, limit: query.limit, offset: query.offset },
    });
  }),

  getCustomerInvoices: asyncHandler(async (req: Request, res: Response) => {
    const { customerId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const invoices = await invoicesService.getCustomerInvoices(customerId, limit);
    res.json({
      success: true,
      data: invoices,
    });
  }),

  getOverdueInvoices: asyncHandler(async (req: Request, res: Response) => {
    const invoices = await invoicesService.getOverdueInvoices();
    res.json({
      success: true,
      data: invoices,
    });
  }),
};

export const salesReportsControllers = {
  getSalesSummary: asyncHandler(async (req: Request, res: Response) => {
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const summary = await salesReportsService.getSalesSummary(startDate, endDate);
    res.json({
      success: true,
      data: summary,
    });
  }),

  getDailySales: asyncHandler(async (req: Request, res: Response) => {
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    if (!startDate || !endDate) {
      throw new ValidationError('Start date and end date are required');
    }
    const dailySales = await salesReportsService.getDailySales(startDate, endDate);
    res.json({
      success: true,
      data: dailySales,
    });
  }),

  getCustomerSalesRanking: asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const ranking = await salesReportsService.getCustomerSalesRanking(limit, startDate, endDate);
    res.json({
      success: true,
      data: ranking,
    });
  }),

  getProductSalesRanking: asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const ranking = await salesReportsService.getProductSalesRanking(limit, startDate, endDate);
    res.json({
      success: true,
      data: ranking,
    });
  }),

  getMonthlySales: asyncHandler(async (req: Request, res: Response) => {
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const monthlySales = await salesReportsService.getMonthlySales(year);
    res.json({
      success: true,
      data: monthlySales,
    });
  }),

  getOutstandingInvoicesByCustomer: asyncHandler(async (req: Request, res: Response) => {
    const outstanding = await salesReportsService.getOutstandingInvoicesByCustomer();
    res.json({
      success: true,
      data: outstanding,
    });
  }),

  getOrderStatusSummary: asyncHandler(async (req: Request, res: Response) => {
    const summary = await salesReportsService.getOrderStatusSummary();
    res.json({
      success: true,
      data: summary,
    });
  }),

  getSalesByCategory: asyncHandler(async (req: Request, res: Response) => {
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const sales = await salesReportsService.getSalesByCategory(startDate, endDate);
    res.json({
      success: true,
      data: sales,
    });
  }),

  getTopProductsByQuantity: asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const products = await salesReportsService.getTopProductsByQuantity(limit, startDate, endDate);
    res.json({
      success: true,
      data: products,
    });
  }),

  getRevenueByPaymentTerm: asyncHandler(async (req: Request, res: Response) => {
    const revenue = await salesReportsService.getRevenueByPaymentTerm();
    res.json({
      success: true,
      data: revenue,
    });
  }),
};

export default {
  customersControllers,
  ordersControllers,
  shipmentsControllers,
  invoicesControllers,
  salesReportsControllers,
};
