# Code Review Prompt for mini-SAP ERP System

## Project Context
This is a mini-SAP ERP system built with TypeScript, SQLite, and Express.js. Focus on enterprise-grade code quality, data integrity, and business logic correctness.

## Review Priorities

### 1. Critical Issues (P0)
- **Security vulnerabilities**: SQL injection, XSS, authentication bypass
- **Data corruption risks**: Transaction failures, race conditions, incorrect calculations
- **Business logic errors**: Incorrect financial calculations, inventory miscounts

### 2. Important Issues (P1)
- **Type safety**: Missing type annotations, improper use of `any`
- **Error handling**: Unhandled promise rejections, missing try-catch blocks
- **Database integrity**: Missing foreign key checks, orphaned records

### 3. Code Quality (P2)
- **Code duplication**: Repeated logic that should be extracted
- **Naming conventions**: Unclear variable/function names
- **Test coverage**: Missing tests for critical paths

## Specific Validation Rules

### Product Management
- Products with `is_sellable=true` MUST have `selling_price >= cost_price`
- Products with `is_sellable=false` CAN have `selling_price=0`, skip price validation
- Non-sellable products should NOT appear in sales orders

### Financial Calculations
- ALL monetary values must use `floorToDecimal()` for precision
- Verify: `subtotal + tax_amount = total_amount`
- Tax rate must be between 0 and 1 (0% to 100%)

### Inventory Operations
- Stock quantities cannot be negative
- Allocated stock cannot exceed on-hand stock
- Stock movements must reference valid products

### Database Operations
- All tables must set `created_at` on INSERT
- All tables must update `updated_at` on UPDATE
- Soft deletes preferred over hard deletes where appropriate

## Review Tone
- Be constructive and educational
- Provide code examples for complex suggestions
- Acknowledge good practices when found
- Prioritize critical issues over style preferences

## Output Format
For each issue found:
1. **Severity**: P0/P1/P2
2. **Location**: File path and line number
3. **Issue**: Clear description of the problem
4. **Suggestion**: Concrete fix with code example
5. **Rationale**: Why this matters
