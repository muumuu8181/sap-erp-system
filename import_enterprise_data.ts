/**
 * エンタープライズデータをmini-sapに取り込むスクリプト
 */

import * as fs from 'fs';
import * as path from 'path';
import { DatabaseConnection } from './src/db/connection';
import { CustomersService } from './src/sales/customers';
import { SuppliersService } from './src/purchasing/suppliers';
import { ProductsService } from './src/inventory/products';
import { OrdersService } from './src/sales/orders';
import { PurchaseOrdersService } from './src/purchasing/purchase-orders';

// エンタープライズデータのパス
const ENTERPRISE_DATA_DIR = path.join(
  'C:',
  'Users',
  'user',
  'sync_project',
  '20260201',
  'enterprise_data_simulator',
  'data',
  'sap_export'
);

function loadJSON(filename: string): any {
  const filePath = path.join(ENTERPRISE_DATA_DIR, filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

async function importSuppliers(db: any) {
  console.log('\n=== サプライヤー取り込み ===');
  const service = new SuppliersService(db);
  const suppliers = loadJSON('suppliers.json');

  const imported: string[] = [];
  for (const supplier of suppliers) {
    try {
      const supplierId = await service.create({
        code: supplier.code,
        name: supplier.name,
        category: supplier.category,
        payment_term: supplier.payment_term,
        email: supplier.email,
        phone: supplier.phone,
        address: supplier.address,
        city: supplier.city,
        postal_code: supplier.postal_code,
        country: supplier.country,
        tax_id: supplier.tax_id,
      });
      imported.push(supplierId);
      console.log(`  ✓ ${supplier.name} (ID: ${supplierId})`);
    } catch (error: any) {
      console.log(`  ✗ ${supplier.name}: ${error.message}`);
    }
  }

  return imported;
}

async function importCustomers(db: any) {
  console.log('\n=== 顧客取り込み ===');
  const service = new CustomersService(db);
  const customers = loadJSON('customers.json');

  const imported: string[] = [];
  for (const customer of customers) {
    try {
      const customerId = await service.create({
        code: customer.code,
        name: customer.name,
        category: customer.category,
        payment_term: customer.payment_term,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
        postal_code: customer.postal_code,
        country: customer.country,
        tax_id: customer.tax_id,
        credit_limit: customer.credit_limit,
      });
      imported.push(customerId);
      console.log(`  ✓ ${customer.name} (ID: ${customerId})`);
    } catch (error: any) {
      console.log(`  ✗ ${customer.name}: ${error.message}`);
    }
  }

  return imported;
}

async function importProducts(db: any) {
  console.log('\n=== 製品取り込み ===');
  const service = new ProductsService(db);
  const products = loadJSON('products.json');

  const imported: string[] = [];
  for (const product of products) {
    try {
      const productId = await service.create({
        code: product.code,
        name: product.name,
        category: product.category,
        unit: product.unit,
        cost_price: product.cost_price,
        selling_price: product.selling_price || 0,
        is_sellable: product.is_sellable !== undefined ? product.is_sellable : true,
      });
      imported.push(productId);
      console.log(`  ✓ ${product.name} (ID: ${productId})`);
    } catch (error: any) {
      console.log(`  ✗ ${product.name}: ${error.message}`);
    }
  }

  return imported;
}

async function importPurchaseOrders(db: any) {
  console.log('\n=== 発注取り込み ===');

  // マッピング作成
  const suppliersService = new SuppliersService(db);
  const productsService = new ProductsService(db);

  const supplierMap = new Map<string, string>();
  const suppliers = await suppliersService.findAll();
  for (const supplier of suppliers) {
    supplierMap.set(supplier.code, supplier.id!);
  }

  const productMap = new Map<string, string>();
  const products = await productsService.findAll();
  for (const product of products) {
    productMap.set(product.code, product.id!);
  }

  // 発注取り込み
  const service = new PurchaseOrdersService(db);
  const purchaseOrders = loadJSON('purchase_orders.json');

  const imported: string[] = [];
  for (const po of purchaseOrders) {
    try {
      const supplierId = supplierMap.get(po.supplier_code);
      if (!supplierId) {
        console.log(`  ✗ ${po.order_no}: サプライヤー ${po.supplier_code} が見つかりません`);
        continue;
      }

      const items: any[] = [];
      for (const item of po.items) {
        const productId = productMap.get(item.product_code);
        if (!productId) {
          console.log(`  ✗ 製品 ${item.product_code} が見つかりません`);
          continue;
        }

        items.push({
          product_id: productId,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate || 0.10,
        });
      }

      if (items.length === 0) {
        console.log(`  ✗ ${po.order_no}: 有効な明細がありません`);
        continue;
      }

      const poId = await service.create({
        supplier_id: supplierId,
        order_date: po.order_date,
        status: po.status || 'PENDING',
        items: items,
      });
      imported.push(poId);
      console.log(`  ✓ ${po.order_no} (ID: ${poId})`);
    } catch (error: any) {
      console.log(`  ✗ ${po.order_no}: ${error.message}`);
    }
  }

  return imported;
}

async function importSalesOrders(db: any) {
  console.log('\n=== 受注取り込み ===');

  // マッピング作成
  const customersService = new CustomersService(db);
  const productsService = new ProductsService(db);

  const customerMap = new Map<string, string>();
  const customers = await customersService.findAll();
  for (const customer of customers) {
    customerMap.set(customer.code, customer.id!);
  }

  const productMap = new Map<string, string>();
  const products = await productsService.findAll();
  for (const product of products) {
    productMap.set(product.code, product.id!);
  }

  // 受注取り込み
  const service = new OrdersService(db);
  const salesOrders = loadJSON('sales_orders.json');

  const imported: string[] = [];
  for (const so of salesOrders) {
    try {
      const customerId = customerMap.get(so.customer_code);
      if (!customerId) {
        console.log(`  ✗ ${so.order_no}: 顧客 ${so.customer_code} が見つかりません`);
        continue;
      }

      const items: any[] = [];
      for (const item of so.items) {
        const productId = productMap.get(item.product_code);
        if (!productId) {
          console.log(`  ✗ 製品 ${item.product_code} が見つかりません`);
          continue;
        }

        items.push({
          product_id: productId,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate || 0.10,
        });
      }

      if (items.length === 0) {
        console.log(`  ✗ ${so.order_no}: 有効な明細がありません`);
        continue;
      }

      const soId = await service.create({
        customer_id: customerId,
        order_date: so.order_date,
        delivery_date: so.delivery_date,
        status: so.status || 'PENDING',
        items: items,
      });
      imported.push(soId);
      console.log(`  ✓ ${so.order_no} (ID: ${soId})`);
    } catch (error: any) {
      console.log(`  ✗ ${so.order_no}: ${error.message}`);
    }
  }

  return imported;
}

async function verifyData(db: any) {
  console.log('\n' + '='.repeat(60));
  console.log('データ検証');
  console.log('='.repeat(60));

  // レコード数確認
  const counts = {
    'サプライヤー': db.prepare('SELECT COUNT(*) as count FROM suppliers').get().count,
    '顧客': db.prepare('SELECT COUNT(*) as count FROM customers').get().count,
    '製品': db.prepare('SELECT COUNT(*) as count FROM products').get().count,
    '発注': db.prepare('SELECT COUNT(*) as count FROM purchase_orders').get().count,
    '受注': db.prepare('SELECT COUNT(*) as count FROM sales_orders').get().count,
  };

  for (const [name, count] of Object.entries(counts)) {
    console.log(`  ${name}: ${count}件`);
  }

  // サンプルデータ表示
  console.log('\n【サプライヤー一覧】');
  const suppliers = db.prepare('SELECT code, name, category FROM suppliers').all();
  for (const s of suppliers) {
    console.log(`  ${s.code}: ${s.name} (${s.category})`);
  }

  console.log('\n【顧客一覧】');
  const customers = db.prepare('SELECT code, name, category FROM customers').all();
  for (const c of customers) {
    console.log(`  ${c.code}: ${c.name} (${c.category})`);
  }

  console.log('\n【製品一覧】');
  const products = db.prepare('SELECT code, name, category, cost_price, selling_price FROM products').all();
  for (const p of products) {
    console.log(`  ${p.code}: ${p.name} (${p.category}) - 原価: ¥${p.cost_price.toLocaleString()}, 販売: ¥${p.selling_price.toLocaleString()}`);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('エンタープライズデータ取り込み');
  console.log('='.repeat(60));
  console.log(`データソース: ${ENTERPRISE_DATA_DIR}`);
  console.log();

  // データベース接続
  const db = DatabaseConnection.getInstance();
  await DatabaseConnection.initialize();

  try {
    // データ取り込み
    await importSuppliers(db);
    await importCustomers(db);
    await importProducts(db);
    await importPurchaseOrders(db);
    await importSalesOrders(db);

    // 検証
    await verifyData(db);

    console.log('\n' + '='.repeat(60));
    console.log('取り込み完了！');
    console.log('='.repeat(60));
  } catch (error: any) {
    console.error(`\nエラー: ${error.message}`);
    console.error(error.stack);
  } finally {
    DatabaseConnection.close();
  }
}

main().catch(console.error);
