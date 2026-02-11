import Database from 'better-sqlite3';
import { Logger } from '../utils/logger';

const logger = new Logger('FinancialReportsService');

export interface IncomeStatement {
  revenue: number;
  cost_of_goods_sold: number;
  gross_profit: number;
  operating_expenses: number;
  operating_income: number;
  other_income: number;
  net_income: number;
}

export interface BalanceSheet {
  assets: {
    current: number;
    fixed: number;
    total: number;
  };
  liabilities: {
    current: number;
    long_term: number;
    total: number;
  };
  equity: number;
}

export interface CashFlowItem {
  category: string;
  amount: number;
}

export class FinancialReportsService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async getIncomeStatement(startDate: string, endDate: string): Promise<IncomeStatement> {
    try {
      const revenueRow = this.db
        .prepare(`
          SELECT COALESCE(SUM(total_amount), 0) as revenue
          FROM sales_orders
          WHERE order_date >= ? AND order_date <= ? AND status != 'CANCELLED'
        `)
        .get(startDate, endDate) as any;

      const costRow = this.db
        .prepare(`
          SELECT COALESCE(SUM(soi.quantity * p.cost_price), 0) as cost
          FROM sales_order_items soi
          JOIN sales_orders so ON soi.order_id = so.id
          JOIN products p ON soi.product_id = p.id
          WHERE so.order_date >= ? AND so.order_date <= ? AND so.status != 'CANCELLED'
        `)
        .get(startDate, endDate) as any;

      const expensesRow = this.db
        .prepare(`
          SELECT COALESCE(SUM(amount), 0) as expenses
          FROM journal_entry_lines
          JOIN journal_entries je ON journal_entry_lines.entry_id = je.id
          WHERE je.entry_date >= ? AND je.entry_date <= ?
            AND je.status = 'POSTED'
            AND account_code LIKE '6%'
            AND debit_amount > 0
        `)
        .get(startDate, endDate) as any;

      const revenue = revenueRow.revenue || 0;
      const costOfGoodsSold = costRow.cost || 0;
      const grossProfit = revenue - costOfGoodsSold;
      const operatingExpenses = expensesRow.expenses || 0;
      const operatingIncome = grossProfit - operatingExpenses;
      const otherIncome = 0;
      const netIncome = operatingIncome + otherIncome;

      return {
        revenue,
        cost_of_goods_sold: costOfGoodsSold,
        gross_profit: grossProfit,
        operating_expenses: operatingExpenses,
        operating_income: operatingIncome,
        other_income: otherIncome,
        net_income,
      };
    } catch (error) {
      logger.error('Error getting income statement', error);
      throw error;
    }
  }

  async getBalanceSheet(asOfDate: string): Promise<BalanceSheet> {
    try {
      const accountsReceivable = this.db
        .prepare(`
          SELECT COALESCE(SUM(balance), 0) as amount
          FROM accounts_receivable
          WHERE status IN ('OPEN', 'PARTIAL')
        `)
        .get() as any;

      const inventoryValue = this.db
        .prepare(`
          SELECT COALESCE(SUM(quantity_on_hand * p.cost_price), 0) as amount
          FROM inventory_stock is
          JOIN products p ON is.product_id = p.id
        `)
        .get() as any;

      const cashValue = this.db
        .prepare(`
          SELECT COALESCE(SUM(amount), 0) as amount
          FROM journal_entry_lines
          WHERE account_code = '1000'
        `)
        .get() as any;

      const currentAssets = (accountsReceivable.amount || 0) + (inventoryValue.amount || 0) + (cashValue.amount || 0);

      const fixedAssets = this.db
        .prepare(`
          SELECT COALESCE(SUM(amount), 0) as amount
          FROM journal_entry_lines
          WHERE account_code LIKE '15%'
        `)
        .get() as any;

      const totalAssets = currentAssets + (fixedAssets.amount || 0);

      const accountsPayable = this.db
        .prepare(`
          SELECT COALESCE(SUM(balance), 0) as amount
          FROM accounts_payable
          WHERE status IN ('OPEN', 'PARTIAL')
        `)
        .get() as any;

      const currentLiabilities = accountsPayable.amount || 0;

      const longTermLiabilities = this.db
        .prepare(`
          SELECT COALESCE(SUM(amount), 0) as amount
          FROM journal_entry_lines
          WHERE account_code LIKE '22%'
        `)
        .get() as any;

      const totalLiabilities = currentLiabilities + (longTermLiabilities.amount || 0);

      const equity = totalAssets - totalLiabilities;

      return {
        assets: {
          current: currentAssets,
          fixed: fixedAssets.amount || 0,
          total: totalAssets,
        },
        liabilities: {
          current: currentLiabilities,
          long_term: longTermLiabilities.amount || 0,
          total: totalLiabilities,
        },
        equity,
      };
    } catch (error) {
      logger.error('Error getting balance sheet', error);
      throw error;
    }
  }

  async getCashFlow(startDate: string, endDate: string): Promise<CashFlowItem[]> {
    try {
      const cashFlowItems: CashFlowItem[] = [];

      const operatingCashInflow = this.db
        .prepare(`
          SELECT COALESCE(SUM(amount), 0) as amount
          FROM journal_entry_lines
          JOIN journal_entries je ON journal_entry_lines.entry_id = je.id
          WHERE je.entry_date >= ? AND je.entry_date <= ?
            AND je.status = 'POSTED'
            AND account_code = '1000'
            AND debit_amount > 0
        `)
        .get(startDate, endDate) as any;

      const operatingCashOutflow = this.db
        .prepare(`
          SELECT COALESCE(SUM(amount), 0) as amount
          FROM journal_entry_lines
          JOIN journal_entries je ON journal_entry_lines.entry_id = je.id
          WHERE je.entry_date >= ? AND je.entry_date <= ?
            AND je.status = 'POSTED'
            AND account_code = '1000'
            AND credit_amount > 0
        `)
        .get(startDate, endDate) as any;

      cashFlowItems.push({
        category: 'Operating Cash Flow',
        amount: (operatingCashInflow.amount || 0) - (operatingCashOutflow.amount || 0),
      });

      return cashFlowItems;
    } catch (error) {
      logger.error('Error getting cash flow', error);
      throw error;
    }
  }

  async getRevenueByMonth(year: number): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            CAST(strftime("%m", order_date) AS INTEGER) as month,
            COALESCE(SUM(total_amount), 0) as revenue
          FROM sales_orders
          WHERE strftime("%Y", order_date) = ? AND status != 'CANCELLED'
          GROUP BY strftime("%m", order_date)
          ORDER BY month
        `)
        .all(String(year)) as any[];

      return rows.map(row => ({
        month: row.month,
        revenue: row.revenue,
      }));
    } catch (error) {
      logger.error('Error getting revenue by month', error);
      throw error;
    }
  }

  async getExpenseByMonth(year: number): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            CAST(strftime("%m", je.entry_date) AS INTEGER) as month,
            SUBSTR(jel.account_code, 1, 4) as expense_category,
            COALESCE(SUM(jel.debit_amount), 0) as amount
          FROM journal_entry_lines jel
          JOIN journal_entries je ON jel.entry_id = je.id
          WHERE strftime("%Y", je.entry_date) = ?
            AND je.status = 'POSTED'
            AND jel.account_code LIKE '6%'
            AND jel.debit_amount > 0
          GROUP BY strftime("%m", je.entry_date), SUBSTR(jel.account_code, 1, 4)
          ORDER BY month, expense_category
        `)
        .all(String(year)) as any[];

      return rows.map(row => ({
        month: row.month,
        expense_category: row.expense_category,
        amount: row.amount,
      }));
    } catch (error) {
      logger.error('Error getting expense by month', error);
      throw error;
    }
  }

  async getProfitabilityMetrics(startDate: string, endDate: string): Promise<any> {
    try {
      const incomeStatement = await this.getIncomeStatement(startDate, endDate);

      const grossProfitMargin = incomeStatement.revenue > 0
        ? (incomeStatement.gross_profit / incomeStatement.revenue) * 100
        : 0;

      const operatingProfitMargin = incomeStatement.revenue > 0
        ? (incomeStatement.operating_income / incomeStatement.revenue) * 100
        : 0;

      const netProfitMargin = incomeStatement.revenue > 0
        ? (incomeStatement.net_income / incomeStatement.revenue) * 100
        : 0;

      return {
        gross_profit_margin: Math.round(grossProfitMargin * 100) / 100,
        operating_profit_margin: Math.round(operatingProfitMargin * 100) / 100,
        net_profit_margin: Math.round(netProfitMargin * 100) / 100,
        return_on_sales: Math.round(netProfitMargin * 100) / 100,
      };
    } catch (error) {
      logger.error('Error getting profitability metrics', error);
      throw error;
    }
  }

  async getLiquidityRatios(asOfDate: string): Promise<any> {
    try {
      const balanceSheet = await this.getBalanceSheet(asOfDate);

      const currentRatio = balanceSheet.liabilities.current > 0
        ? balanceSheet.assets.current / balanceSheet.liabilities.current
        : 0;

      const quickAssets = balanceSheet.assets.current - 0;
      const quickRatio = balanceSheet.liabilities.current > 0
        ? quickAssets / balanceSheet.liabilities.current
        : 0;

      return {
        current_ratio: Math.round(currentRatio * 100) / 100,
        quick_ratio: Math.round(quickRatio * 100) / 100,
        working_capital: balanceSheet.assets.current - balanceSheet.liabilities.current,
      };
    } catch (error) {
      logger.error('Error getting liquidity ratios', error);
      throw error;
    }
  }

  async getAccountsReceivableTurnover(startDate: string, endDate: string): Promise<any> {
    try {
      const revenueRow = this.db
        .prepare(`
          SELECT COALESCE(SUM(total_amount), 0) as revenue
          FROM sales_orders
          WHERE order_date >= ? AND order_date <= ? AND status != 'CANCELLED'
        `)
        .get(startDate, endDate) as any;

      const avgReceivables = this.db
        .prepare(`
          SELECT COALESCE(AVG(balance), 0) as avg_balance
          FROM accounts_receivable
          WHERE status IN ('OPEN', 'PARTIAL')
        `)
        .get() as any;

      const revenue = revenueRow.revenue || 0;
      const avgReceivablesBalance = avgReceivables.avg_balance || 0;

      const turnoverRatio = avgReceivablesBalance > 0 ? revenue / avgReceivablesBalance : 0;
      const daysSalesOutstanding = turnoverRatio > 0 ? 365 / turnoverRatio : 0;

      return {
        turnover_ratio: Math.round(turnoverRatio * 100) / 100,
        days_sales_outstanding: Math.round(daysSalesOutstanding * 100) / 100,
        average_receivables: avgReceivablesBalance,
      };
    } catch (error) {
      logger.error('Error getting accounts receivable turnover', error);
      throw error;
    }
  }
}

export default FinancialReportsService;
