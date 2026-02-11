import { Request, Response } from 'express';
import { AccountsReceivableService } from './accounts-receivable';
import { AccountsPayableService } from './accounts-payable';
import { JournalEntriesService } from './journal-entries';
import { FinancialReportsService } from './financial-reports';
import { DatabaseConnection } from '../db/connection';
import { Logger } from '../utils/logger';
import { NotFoundError, ValidationError, asyncHandler } from '../middleware/error';

const logger = new Logger('AccountingControllers');
const db = DatabaseConnection.getInstance();

export const accountsReceivableService = new AccountsReceivableService(db);
export const accountsPayableService = new AccountsPayableService(db);
export const journalEntriesService = new JournalEntriesService(db);
export const financialReportsService = new FinancialReportsService(db);

export const accountsReceivableControllers = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const id = await accountsReceivableService.create(req.body);
    res.status(201).json({
      success: true,
      data: { id },
      message: 'Accounts receivable created successfully',
    });
  }),

  applyPayment: asyncHandler(async (req: Request, res: Response) => {
    const id = await accountsReceivableService.applyPayment(req.body);
    res.json({
      success: true,
      data: { id },
      message: 'Payment applied successfully',
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const receivable = await accountsReceivableService.findById(id);
    if (!receivable) {
      throw new NotFoundError('Accounts Receivable', id);
    }
    res.json({
      success: true,
      data: receivable,
    });
  }),

  getAll: asyncHandler(async (req: Request, res: Response) => {
    const query = {
      customer_id: req.query.customer_id as string,
      invoice_id: req.query.invoice_id as string,
      status: req.query.status as string,
      due_start: req.query.due_start as string,
      due_end: req.query.due_end as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };
    const receivables = await accountsReceivableService.findAll(query);
    const count = await accountsReceivableService.count(query);
    res.json({
      success: true,
      data: receivables,
      meta: { total: count, limit: query.limit, offset: query.offset },
    });
  }),

  getCustomerReceivables: asyncHandler(async (req: Request, res: Response) => {
    const { customerId } = req.params;
    const receivables = await accountsReceivableService.getCustomerReceivables(customerId);
    res.json({
      success: true,
      data: receivables,
    });
  }),

  getOverdueReceivables: asyncHandler(async (req: Request, res: Response) => {
    const receivables = await accountsReceivableService.getOverdueReceivables();
    res.json({
      success: true,
      data: receivables,
    });
  }),

  getAgingReport: asyncHandler(async (req: Request, res: Response) => {
    const report = await accountsReceivableService.getAgingReport();
    res.json({
      success: true,
      data: report,
    });
  }),

  getSummary: asyncHandler(async (req: Request, res: Response) => {
    const summary = await accountsReceivableService.getSummary();
    res.json({
      success: true,
      data: summary,
    });
  }),
};

export const accountsPayableControllers = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const id = await accountsPayableService.create(req.body);
    res.status(201).json({
      success: true,
      data: { id },
      message: 'Accounts payable created successfully',
    });
  }),

  applyPayment: asyncHandler(async (req: Request, res: Response) => {
    const id = await accountsPayableService.applyPayment(req.body);
    res.json({
      success: true,
      data: { id },
      message: 'Payment applied successfully',
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const payable = await accountsPayableService.findById(id);
    if (!payable) {
      throw new NotFoundError('Accounts Payable', id);
    }
    res.json({
      success: true,
      data: payable,
    });
  }),

  getAll: asyncHandler(async (req: Request, res: Response) => {
    const query = {
      supplier_id: req.query.supplier_id as string,
      reference_id: req.query.reference_id as string,
      status: req.query.status as string,
      due_start: req.query.due_start as string,
      due_end: req.query.due_end as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };
    const payables = await accountsPayableService.findAll(query);
    const count = await accountsPayableService.count(query);
    res.json({
      success: true,
      data: payables,
      meta: { total: count, limit: query.limit, offset: query.offset },
    });
  }),

  getSupplierPayables: asyncHandler(async (req: Request, res: Response) => {
    const { supplierId } = req.params;
    const payables = await accountsPayableService.getSupplierPayables(supplierId);
    res.json({
      success: true,
      data: payables,
    });
  }),

  getOverduePayables: asyncHandler(async (req: Request, res: Response) => {
    const payables = await accountsPayableService.getOverduePayables();
    res.json({
      success: true,
      data: payables,
    });
  }),

  getAgingReport: asyncHandler(async (req: Request, res: Response) => {
    const report = await accountsPayableService.getAgingReport();
    res.json({
      success: true,
      data: report,
    });
  }),

  getSummary: asyncHandler(async (req: Request, res: Response) => {
    const summary = await accountsPayableService.getSummary();
    res.json({
      success: true,
      data: summary,
    });
  }),
};

export const journalEntriesControllers = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const id = await journalEntriesService.create(req.body);
    res.status(201).json({
      success: true,
      data: { id },
      message: 'Journal entry created successfully',
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await journalEntriesService.update(id, req.body);
    res.json({
      success: true,
      message: 'Journal entry updated successfully',
    });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await journalEntriesService.delete(id);
    res.json({
      success: true,
      message: 'Journal entry deleted successfully',
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const entry = await journalEntriesService.findById(id);
    if (!entry) {
      throw new NotFoundError('Journal Entry', id);
    }
    res.json({
      success: true,
      data: entry,
    });
  }),

  getByEntryNo: asyncHandler(async (req: Request, res: Response) => {
    const { entryNo } = req.params;
    const entry = await journalEntriesService.findByEntryNo(entryNo);
    if (!entry) {
      throw new NotFoundError(`Journal Entry with number ${entryNo}`);
    }
    res.json({
      success: true,
      data: entry,
    });
  }),

  getAll: asyncHandler(async (req: Request, res: Response) => {
    const query = {
      status: req.query.status as string,
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
      account_code: req.query.account_code as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };
    const entries = await journalEntriesService.findAll(query);
    const count = await journalEntriesService.count(query);
    res.json({
      success: true,
      data: entries,
      meta: { total: count, limit: query.limit, offset: query.offset },
    });
  }),

  getTrialBalance: asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      throw new ValidationError('Start date and end date are required');
    }
    const trialBalance = await journalEntriesService.getTrialBalance(start_date as string, end_date as string);
    res.json({
      success: true,
      data: trialBalance,
    });
  }),
};

export const financialReportsControllers = {
  getIncomeStatement: asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      throw new ValidationError('Start date and end date are required');
    }
    const statement = await financialReportsService.getIncomeStatement(start_date as string, end_date as string);
    res.json({
      success: true,
      data: statement,
    });
  }),

  getBalanceSheet: asyncHandler(async (req: Request, res: Response) => {
    const { as_of_date } = req.query;
    if (!as_of_date) {
      throw new ValidationError('As of date is required');
    }
    const balanceSheet = await financialReportsService.getBalanceSheet(as_of_date as string);
    res.json({
      success: true,
      data: balanceSheet,
    });
  }),

  getCashFlow: asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      throw new ValidationError('Start date and end date are required');
    }
    const cashFlow = await financialReportsService.getCashFlow(start_date as string, end_date as string);
    res.json({
      success: true,
      data: cashFlow,
    });
  }),

  getRevenueByMonth: asyncHandler(async (req: Request, res: Response) => {
    const { year } = req.query;
    if (!year) {
      throw new ValidationError('Year is required');
    }
    const revenue = await financialReportsService.getRevenueByMonth(parseInt(year as string));
    res.json({
      success: true,
      data: revenue,
    });
  }),

  getExpenseByMonth: asyncHandler(async (req: Request, res: Response) => {
    const { year } = req.query;
    if (!year) {
      throw new ValidationError('Year is required');
    }
    const expenses = await financialReportsService.getExpenseByMonth(parseInt(year as string));
    res.json({
      success: true,
      data: expenses,
    });
  }),

  getProfitabilityMetrics: asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      throw new ValidationError('Start date and end date are required');
    }
    const metrics = await financialReportsService.getProfitabilityMetrics(start_date as string, end_date as string);
    res.json({
      success: true,
      data: metrics,
    });
  }),

  getLiquidityRatios: asyncHandler(async (req: Request, res: Response) => {
    const { as_of_date } = req.query;
    if (!as_of_date) {
      throw new ValidationError('As of date is required');
    }
    const ratios = await financialReportsService.getLiquidityRatios(as_of_date as string);
    res.json({
      success: true,
      data: ratios,
    });
  }),

  getAccountsReceivableTurnover: asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      throw new ValidationError('Start date and end date are required');
    }
    const turnover = await financialReportsService.getAccountsReceivableTurnover(start_date as string, end_date as string);
    res.json({
      success: true,
      data: turnover,
    });
  }),
};

export default {
  accountsReceivableControllers,
  accountsPayableControllers,
  journalEntriesControllers,
  financialReportsControllers,
};
