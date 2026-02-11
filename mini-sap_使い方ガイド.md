# GitHub Actions - 仕組みと使い方

## 📋 基本情報

- **プロジェクト**: sap-erp-system
- **リポジトリ**: https://github.com/muumuu8181/sap-erp-system
- **Actions URL**: https://github.com/muumuu8181/sap-erp-system/actions
- **テスト数**: 569テスト（21テストスイート）
- **実行時間**: 10-12秒

---

## 🔧 GitHub Actionsの仕組み

### 概要
GitHub Actionsは、GitHubリポジトリに対する**イベント**（push、PR等）をトリガーに、自動的に**ワークフロー**を実行する仕組み。

### ワークフロー構成

```yaml
name: Test                           # ワークフロー名

on:                                  # トリガー条件
  push:
    branches: [ main, master ]       # masterブランチへのpush
  pull_request:
    branches: [ main, master ]       # masterへのPR

jobs:                                # 実行するジョブ
  test:
    runs-on: ubuntu-latest           # Ubuntu最新版で実行

    strategy:
      matrix:
        node-version: [18.x, 20.x]   # Node.js 18と20で並列実行

    steps:
    - uses: actions/checkout@v4      # コードをチェックアウト
    - uses: actions/setup-node@v4    # Node.js環境をセットアップ
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'                 # npm キャッシュを有効化
    - run: npm ci                    # 依存関係をインストール
    - run: npm test                  # テストを実行
```

### 実行フロー

1. **トリガー**: コードをpush
2. **GitHub Actions起動**: ワークフローファイル（.github/workflows/test.yml）を読み込み
3. **環境構築**: Ubuntu VMを起動、Node.jsをインストール
4. **依存関係**: `npm ci`で依存パッケージをインストール
5. **テスト実行**: `npm test`でJestを実行
6. **結果報告**: 成功/失敗をGitHubに報告

---

## ⚡ 高速な理由（569テストが10秒で完了）

### 1. インメモリデータベース（最大の要因）
```typescript
DATABASE_PATH=:memory:
```

- **SQLiteのメモリモード**を使用
- ディスクI/Oが**一切ない**
- 全てのデータベース操作がRAM上で完結
- **通常のSQLiteの10-100倍高速**

### 2. Jest並列実行

```
21テストファイルを同時並行で実行
├── PASS tests/hr/attendance.test.ts
├── PASS tests/hr/payroll.test.ts (5.738 s)
├── PASS tests/sales/invoices.test.ts (5.862 s)
├── PASS tests/inventory/products.test.ts
└── ... (他17ファイルも同時実行)
```

- Jestがデフォルトで**並列実行**
- CPUコアを最大限活用
- 21ファイルを順次実行なら60秒以上 → 並列で10秒

### 3. GitHub Actionsの高スペックマシン

- **Ubuntu latest VM**（仮想マシン）
- 複数CPUコア（2-4コア）
- 高速SSD
- 大容量RAM（7GB+）
- 高速ネットワーク

### 4. npmキャッシュ

```yaml
cache: 'npm'
```

- node_modulesをキャッシュ
- 2回目以降の実行がさらに高速化
- 依存関係のインストール時間を短縮

### 5. 軽量なテスト設計

- 単体テストが主体（統合テストは一部のみ）
- 各テストが独立して高速
- モックを適切に使用

---

## 📊 パフォーマンス指標

| 指標 | 値 | 備考 |
|------|-----|------|
| **総テスト数** | 569 | 21テストスイート |
| **実行時間** | 10.936秒 | Node.js 20.x |
| **実行時間** | 12.242秒 | Node.js 18.x |
| **1秒あたり** | 約57テスト | 非常に高速 |
| **カバレッジ** | 80.93% | Statements |
| **並列度** | 21ファイル | 同時実行 |

---

## 🚀 実際に触ってみる・テストする手順

### ステップ1: リポジトリをクローン

```bash
cd C:\Users\user\projects
git clone https://github.com/muumuu8181/sap-erp-system.git
cd sap-erp-system
```

### ステップ2: 依存関係をインストール

```bash
npm install
```

**または**（より高速・確実）：
```bash
npm ci
```

### ステップ3: ローカルでテストを実行

```bash
# 全テストを実行
npm test

# カバレッジ付きでテスト実行
npm test -- --coverage

# 特定のテストファイルのみ実行
npm test tests/hr/attendance.test.ts

# ウォッチモード（ファイル変更を監視）
npm test -- --watch
```

### ステップ4: 開発サーバーを起動

```bash
# 開発モード（ホットリロード付き）
npm run dev
```

サーバーが起動したら、ブラウザまたはcurlでアクセス：
```bash
# ヘルスチェック
curl http://localhost:3000/health

# 顧客一覧を取得
curl http://localhost:3000/api/sales/customers

# 製品一覧を取得
curl http://localhost:3000/api/inventory/products
```

### ステップ5: APIをテスト（Postman/Thunder Client）

#### 顧客を作成
```http
POST http://localhost:3000/api/sales/customers
Content-Type: application/json

{
  "name": "テスト株式会社",
  "tax_id": "1234567890",
  "email": "test@example.com",
  "phone": "03-1234-5678",
  "address": "東京都渋谷区",
  "city": "渋谷区",
  "postal_code": "150-0001",
  "country": "Japan"
}
```

#### 製品を作成
```http
POST http://localhost:3000/api/inventory/products
Content-Type: application/json

{
  "name": "テスト商品",
  "sku": "TEST-001",
  "description": "テスト用の商品です",
  "unit_price": 1000,
  "cost": 600,
  "unit": "個",
  "category": "テスト"
}
```

### ステップ6: コードを変更してみる

例：新しいテストを追加

```typescript
// tests/sales/customers.test.ts に追加
describe('CustomerService', () => {
  it('should validate Japanese postal code', async () => {
    const service = new CustomerService(db);
    const customer = await service.create({
      name: 'テスト会社',
      postal_code: '150-0001'  // 日本の郵便番号形式
    });
    expect(customer.postal_code).toBe('150-0001');
  });
});
```

### ステップ7: テストが通ることを確認

```bash
npm test
```

### ステップ8: GitHubにプッシュしてActionsを確認

```bash
# 変更をコミット
git add .
git commit -m "Add postal code validation test"

# GitHubにプッシュ
git push origin master
```

**GitHub Actionsが自動実行される**：
1. https://github.com/muumuu8181/sap-erp-system/actions にアクセス
2. 最新のワークフロー実行を確認
3. 緑のチェックマーク✓が表示されればテスト成功

---

## 🧪 おすすめの実験

### 1. わざとテストを失敗させてみる

```typescript
// tests/sales/customers.test.ts
it('should fail on purpose', () => {
  expect(1 + 1).toBe(3);  // わざと間違った値
});
```

→ GitHubにプッシュして、赤い×マークが表示されることを確認

### 2. カバレッジを確認

```bash
npm test -- --coverage
```

→ `coverage/lcov-report/index.html` をブラウザで開く

### 3. パフォーマンスを計測

```bash
time npm test
```

→ ローカル環境での実行時間を確認

### 4. 新機能を追加

例：顧客検索機能を追加
1. `src/sales/customers.ts` に検索メソッドを追加
2. `tests/sales/customers.test.ts` にテストを追加
3. テストが通ることを確認
4. GitHubにプッシュしてActionsで確認

---

## 🔍 トラブルシューティング

### テストが失敗する場合

```bash
# キャッシュをクリア
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# テストを再実行
npm test
```

### ポートが使用中の場合

```bash
# 別のポートで起動
PORT=3001 npm run dev
```

### データベースエラーの場合

プロジェクトはインメモリDBを使用しているため、サーバー再起動でデータはクリアされます。

---

## 📚 参考情報

### プロジェクト構成
- **src/**: ソースコード
  - **accounting/**: 会計モジュール
  - **sales/**: 販売モジュール
  - **inventory/**: 在庫モジュール
  - **purchasing/**: 購買モジュール
  - **hr/**: 人事モジュール
- **tests/**: テストコード（srcと同じ構造）
- **.github/workflows/**: GitHub Actionsワークフロー

### 主要なコマンド
```bash
npm run dev      # 開発サーバー起動
npm run build    # TypeScriptコンパイル
npm start        # 本番モード起動
npm test         # テスト実行
npm run lint     # ESLint実行
```

### 環境変数
```bash
# .env.example を .env にコピー
cp .env.example .env

# 必要に応じて編集
NODE_ENV=development
DATABASE_PATH=:memory:
PORT=3000
```

---

## ✅ チェックリスト

- [ ] リポジトリをクローンした
- [ ] 依存関係をインストールした
- [ ] ローカルでテストを実行した（全テスト通過）
- [ ] 開発サーバーを起動した
- [ ] curlまたはPostmanでAPIをテストした
- [ ] コードを変更してテストを追加した
- [ ] 変更をGitHubにプッシュした
- [ ] GitHub Actionsでテストが通ることを確認した

---

**作成日**: 2026-02-11
**プロジェクト**: sap-erp-system
**最終更新**: 2026-02-11
