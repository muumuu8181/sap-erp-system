"""
エンタープライズデータをmini-sapに取り込むスクリプト

enterprise_data_simulator/data/sap_export/
から生成されたデータを読み込み、mini-sapのデータベースに挿入する。
"""

import json
import sys
from pathlib import Path
from datetime import datetime

# プロジェクトルートをパスに追加
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / "src"))

from db.connection import DatabaseConnection
from sales.customers import CustomersService
from purchasing.suppliers import SuppliersService
from inventory.products import ProductsService
from sales.orders import OrdersService
from purchasing.purchase_orders import PurchaseOrdersService

# エンタープライズデータのパス
ENTERPRISE_DATA_DIR = Path(r"C:\Users\user\sync_project\20260201\enterprise_data_simulator\data\sap_export")


def load_json(filename):
    """JSONファイルを読み込む"""
    path = ENTERPRISE_DATA_DIR / filename
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def import_suppliers(db):
    """サプライヤーデータを取り込む"""
    print("\n=== サプライヤー取り込み ===")
    service = SuppliersService(db)
    suppliers = load_json("suppliers.json")

    imported = []
    for supplier in suppliers:
        try:
            supplier_id = service.create({
                "code": supplier["code"],
                "name": supplier["name"],
                "category": supplier["category"],
                "payment_term": supplier["payment_term"],
                "contact_person": supplier.get("contact_person"),
                "email": supplier.get("email"),
                "phone": supplier.get("phone"),
                "address": supplier.get("address"),
                "city": supplier.get("city"),
                "postal_code": supplier.get("postal_code"),
                "country": supplier.get("country"),
                "tax_id": supplier.get("tax_id"),
            })
            imported.append(supplier_id)
            print(f"  ✓ {supplier['name']} (ID: {supplier_id})")
        except Exception as e:
            print(f"  ✗ {supplier['name']}: {str(e)}")

    return imported


def import_customers(db):
    """顧客データを取り込む"""
    print("\n=== 顧客取り込み ===")
    service = CustomersService(db)
    customers = load_json("customers.json")

    imported = []
    for customer in customers:
        try:
            customer_id = service.create({
                "code": customer["code"],
                "name": customer["name"],
                "category": customer["category"],
                "payment_term": customer["payment_term"],
                "contact_person": customer.get("contact_person"),
                "email": customer.get("email"),
                "phone": customer.get("phone"),
                "address": customer.get("address"),
                "city": customer.get("city"),
                "postal_code": customer.get("postal_code"),
                "country": customer.get("country"),
                "tax_id": customer.get("tax_id"),
                "credit_limit": customer.get("credit_limit"),
            })
            imported.append(customer_id)
            print(f"  ✓ {customer['name']} (ID: {customer_id})")
        except Exception as e:
            print(f"  ✗ {customer['name']}: {str(e)}")

    return imported


def import_products(db):
    """製品データを取り込む"""
    print("\n=== 製品取り込み ===")
    service = ProductsService(db)
    products = load_json("products.json")

    imported = []
    for product in products:
        try:
            product_id = service.create({
                "code": product["code"],
                "name": product["name"],
                "category": product["category"],
                "unit": product["unit"],
                "cost_price": product["cost_price"],
                "selling_price": product.get("selling_price", 0),
                "min_stock_level": product.get("min_stock", 0),
            })
            imported.append(product_id)
            print(f"  ✓ {product['name']} (ID: {product_id})")
        except Exception as e:
            print(f"  ✗ {product['name']}: {str(e)}")

    return imported


def import_purchase_orders(db):
    """発注データを取り込む"""
    print("\n=== 発注取り込み ===")

    # まずサプライヤーと製品のマッピングを取得
    suppliers_service = SuppliersService(db)
    products_service = ProductsService(db)

    # コードからIDへのマッピング
    supplier_map = {}
    for supplier in suppliers_service.findAll():
        supplier_map[supplier["code"]] = supplier["id"]

    product_map = {}
    for product in products_service.findAll():
        product_map[product["code"]] = product["id"]

    # 発注データ取り込み
    service = PurchaseOrdersService(db)
    purchase_orders = load_json("purchase_orders.json")

    imported = []
    for po in purchase_orders:
        try:
            supplier_id = supplier_map.get(po["supplier_code"])
            if not supplier_id:
                print(f"  ✗ {po['order_no']}: サプライヤー {po['supplier_code']} が見つかりません")
                continue

            items = []
            for item in po["items"]:
                product_id = product_map.get(item["product_code"])
                if not product_id:
                    print(f"  ✗ 製品 {item['product_code']} が見つかりません")
                    continue

                items.append({
                    "product_id": product_id,
                    "quantity": item["quantity"],
                    "unit_price": item["unit_price"],
                    "tax_rate": item.get("tax_rate", 0.10),
                })

            if not items:
                print(f"  ✗ {po['order_no']}: 有効な明細がありません")
                continue

            po_id = service.create({
                "supplier_id": supplier_id,
                "order_date": po["order_date"],
                "delivery_date": po["delivery_date"],
                "status": po.get("status", "PENDING"),
                "items": items,
            })
            imported.append(po_id)
            print(f"  ✓ {po['order_no']} (ID: {po_id})")
        except Exception as e:
            print(f"  ✗ {po['order_no']}: {str(e)}")

    return imported


def import_sales_orders(db):
    """受注データを取り込む"""
    print("\n=== 受注取り込み ===")

    # まず顧客と製品のマッピングを取得
    customers_service = CustomersService(db)
    products_service = ProductsService(db)

    # コードからIDへのマッピング
    customer_map = {}
    for customer in customers_service.findAll():
        customer_map[customer["code"]] = customer["id"]

    product_map = {}
    for product in products_service.findAll():
        product_map[product["code"]] = product["id"]

    # 受注データ取り込み
    service = OrdersService(db)
    sales_orders = load_json("sales_orders.json")

    imported = []
    for so in sales_orders:
        try:
            customer_id = customer_map.get(so["customer_code"])
            if not customer_id:
                print(f"  ✗ {so['order_no']}: 顧客 {so['customer_code']} が見つかりません")
                continue

            items = []
            for item in so["items"]:
                product_id = product_map.get(item["product_code"])
                if not product_id:
                    print(f"  ✗ 製品 {item['product_code']} が見つかりません")
                    continue

                items.append({
                    "product_id": product_id,
                    "quantity": item["quantity"],
                    "unit_price": item["unit_price"],
                    "tax_rate": item.get("tax_rate", 0.10),
                })

            if not items:
                print(f"  ✗ {so['order_no']}: 有効な明細がありません")
                continue

            so_id = service.create({
                "customer_id": customer_id,
                "order_date": so["order_date"],
                "delivery_date": so.get("delivery_date"),
                "status": so.get("status", "PENDING"),
                "items": items,
            })
            imported.append(so_id)
            print(f"  ✓ {so['order_no']} (ID: {so_id})")
        except Exception as e:
            print(f"  ✗ {so['order_no']}: {str(e)}")

    return imported


def verify_data(db):
    """取り込んだデータを検証"""
    print("\n" + "=" * 60)
    print("データ検証")
    print("=" * 60)

    # 各テーブルのレコード数を確認
    counts = {
        "サプライヤー": db.prepare("SELECT COUNT(*) as count FROM suppliers").get()["count"],
        "顧客": db.prepare("SELECT COUNT(*) as count FROM customers").get()["count"],
        "製品": db.prepare("SELECT COUNT(*) as count FROM products").get()["count"],
        "発注": db.prepare("SELECT COUNT(*) as count FROM purchase_orders").get()["count"],
        "受注": db.prepare("SELECT COUNT(*) as count FROM sales_orders").get()["count"],
    }

    for name, count in counts.items():
        print(f"  {name}: {count}件")

    # サンプルデータを表示
    print("\n【サプライヤー一覧】")
    suppliers = db.prepare("SELECT code, name, category FROM suppliers").all()
    for s in suppliers:
        print(f"  {s['code']}: {s['name']} ({s['category']})")

    print("\n【顧客一覧】")
    customers = db.prepare("SELECT code, name, category FROM customers").all()
    for c in customers:
        print(f"  {c['code']}: {c['name']} ({c['category']})")

    print("\n【製品一覧】")
    products = db.prepare("SELECT code, name, category, cost_price, selling_price FROM products").all()
    for p in products:
        print(f"  {p['code']}: {p['name']} ({p['category']}) - 原価: ¥{p['cost_price']:,}, 販売: ¥{p['selling_price']:,}")


def main():
    """メイン処理"""
    print("=" * 60)
    print("エンタープライズデータ取り込み")
    print("=" * 60)
    print(f"データソース: {ENTERPRISE_DATA_DIR}")
    print()

    # データベース接続
    db = DatabaseConnection.getInstance()
    DatabaseConnection.initialize()

    try:
        # データ取り込み
        import_suppliers(db)
        import_customers(db)
        import_products(db)
        import_purchase_orders(db)
        import_sales_orders(db)

        # 検証
        verify_data(db)

        print("\n" + "=" * 60)
        print("取り込み完了！")
        print("=" * 60)

    except Exception as e:
        print(f"\nエラー: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        DatabaseConnection.close()


if __name__ == "__main__":
    main()
