# Review Guidelines for mini-SAP ERP System

## Critical Checks (P0)
- Don't log PII (customer data, payment information)
- Verify authentication middleware wraps every API route
- Check for SQL injection vulnerabilities in all database queries
- Ensure financial calculations use `floorToDecimal()` for precision
- Validate that `subtotal + tax_amount = total_amount` in all transactions

## Important Checks (P1)
- Products with `is_sellable=true` must have `selling_price >= cost_price`
- Products with `is_sellable=false` cannot appear in sales orders
- Stock quantities cannot be negative
- All monetary fields must use proper decimal precision
- TypeScript: avoid `any` types, use specific interfaces
- Treat typos in API documentation as P1

## Code Quality (P2)
- Check for code duplication in service classes
- Verify proper error handling in async operations
- Ensure all database operations set `created_at` and `updated_at`
- Use soft deletes where appropriate (is_active flag)

## Business Logic
- Inventory: allocated stock cannot exceed on-hand stock
- Sales: verify customer credit limits before order confirmation
- Purchasing: ensure supplier payment terms are respected
- Accounting: all journal entries must balance (debit = credit)

<!-- CODEX_SCORECARD_POLICY_START -->
## Codex Scorecard Review Policy
When requesting Codex pull request reviews, require this output format.

1. Findings (sorted by severity high to low)
- Include all priority levels: P0, P1, P2, P3.
- For each finding include:
  - Risk score: 1-10
  - Problem summary
  - What is wrong
  - Impact
  - Recommended fix
  - Relevant code snippet
  - Suggested fixed code snippet
- If a finding may be a false positive, state that clearly.

2. Scorecard (10-point scale)
- Security: X/10
- Correctness: X/10
- Performance: X/10
- Reliability: X/10
- Maintainability: X/10
- Test Coverage: X/10
- Overall: X/10

3. Scoring rationale
- Provide 1-3 short reasons for each score deduction.

4. Top 5 fix priorities
- List the five most important fixes in strict priority order.
<!-- CODEX_SCORECARD_POLICY_END -->
