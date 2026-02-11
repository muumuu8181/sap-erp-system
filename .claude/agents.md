# Codex Review Guidelines

## Project Overview

This is a mini-SAP ERP system built with TypeScript, SQLite, and Express.js.

## Code Review Focus Areas

### 1. TypeScript Type Safety
- Ensure proper type annotations for all functions and variables
- Check for `any` types and suggest more specific types
- Verify interface definitions match actual usage

### 2. Database Operations
- Review SQL queries for potential injection vulnerabilities
- Check transaction handling and error recovery
- Verify foreign key constraints are respected

### 3. Business Logic Validation
- Ensure proper validation for financial calculations (prices, taxes, totals)
- Check for edge cases in inventory management (negative quantities, stock allocation)
- Verify proper handling of is_sellable flag (sellable vs non-sellable products)

### 4. Error Handling
- Check that all async operations have proper error handling
- Verify meaningful error messages are provided
- Ensure errors are logged appropriately

### 5. Test Coverage
- Highlight areas lacking test coverage
- Suggest additional test cases for critical business logic
- Review existing tests for completeness

### 6. Code Quality
- Check for code duplication
- Suggest opportunities for refactoring
- Review naming conventions and code clarity

## Specific Patterns to Check

### Product Validation
- `is_sellable=true`: Must have valid `selling_price >= cost_price`
- `is_sellable=false`: Can have `selling_price=0`, skip price validation
- Non-sellable products should not appear in sales orders

### Financial Calculations
- Use `floorToDecimal()` for monetary values
- Verify tax calculations are accurate
- Check subtotal + tax = total_amount

### Database Consistency
- Verify created_at and updated_at timestamps are set
- Check that soft deletes are used where appropriate
- Ensure referential integrity is maintained

## Review Tone
- Be constructive and educational
- Provide code examples for suggested improvements
- Prioritize critical issues (security, correctness) over style
- Acknowledge good practices when found
