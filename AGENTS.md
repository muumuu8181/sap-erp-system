# Review Guidelines

## Security (P0)
- SQL injection vulnerabilities
- Authentication/authorization bypass
- Sensitive data exposure in logs
- Command injection vulnerabilities

## Correctness (P0)
- Logic errors that affect core functionality
- Off-by-one errors
- Null/undefined reference errors
- Race conditions and deadlocks

## Performance (P1)
- O(n²) or worse algorithms where O(n) is possible
- Memory leaks
- Inefficient data structures
- Unnecessary blocking operations

## Code Quality (P1)
- **TypeScript style violations are P1** (spacing, naming, line length)
- Missing error handling
- Code duplication (DRY violations)
- Missing input validation
- Hardcoded values that should be configurable

## Documentation (P2)
- Missing JSDoc for public functions/classes
- Unclear variable names
- Missing type annotations
