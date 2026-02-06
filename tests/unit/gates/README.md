# Gate 0: Static Analysis Verification - Test Suite

**Strategic Directive**: SD-VERIFY-LADDER-001
**PRD**: PRD-SD-VERIFY-LADDER-001
**Status**: Complete

## Overview

This directory contains comprehensive unit and integration tests for Gate 0 (Static Analysis Verification), the first gate in the LEO Protocol verification ladder.

## Test Coverage

### Unit Tests (`gate0.test.js`)
Tests individual check functions with mocked `execSync` calls.

**Test Scenarios (TS-1 to TS-6)**:
- TS-1: `hasESLintPass` returns true when eslint validation succeeds (zero errors)
- TS-2: `hasESLintPass` returns false when eslint validation fails (with errors)
- TS-3: `hasTypeScriptPass` returns true when tsc compilation succeeds (zero type errors)
- TS-4: `hasTypeScriptPass` returns false when tsc compilation fails (with type errors)
- TS-5: `hasImportsPass` returns true when all imports resolve successfully
- TS-6: `hasImportsPass` returns false when import resolution fails (missing dependency)

**Additional Coverage**:
- Security features (PRD_ID validation, timeout handling, command injection prevention)
- Weighted scoring (40% ESLint, 40% TypeScript, 20% Imports)
- Error parsing and count extraction
- Timeout enforcement on all checks

### Integration Tests (`../integration/gate0.test.js`)
Tests full gate execution with real database integration.

**Test Scenarios (TS-7 to TS-10)**:
- TS-7: Full gate execution passes (score ≥85%) when all checks pass
- TS-8: Full gate execution fails (score <85%) when critical check fails
- TS-9: Gate results stored correctly in `leo_gate_reviews` table with all metadata
- TS-10: Gate 0 executes in CI/CD and blocks merge when score <85%

**Additional Coverage**:
- Database review storage and retrieval
- Multiple gate runs (review history)
- Exit code validation (0 = pass, 1 = fail, 2 = error)
- Error handling (missing PRD, invalid PRD_ID, database errors)
- Validation rules verification

## Running Tests

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### All Tests
```bash
npm test
```

### Watch Mode (during development)
```bash
npm run test:watch
```

## Database Setup

Before running integration tests, ensure Gate 0 validation rules are seeded:

```bash
psql $DATABASE_URL -f database/seed/leo_validation_rules_gate0.sql
```

This creates 3 validation rules:
- `hasESLintPass`: 40% weight, required
- `hasTypeScriptPass`: 40% weight, required
- `hasImportsPass`: 20% weight, non-blocking

## Test Dependencies

- **Vitest**: Test runner (native ES module support)
- **@supabase/supabase-js**: Database client for integration tests
- **dotenv**: Environment variable loading
- **child_process**: Command execution (mocked in unit tests)

## Gate 0 Implementation

**Main File**: `/tools/gates/gate0.ts`
**Helper**: `/tools/gates/lib/check-imports.js`
**Libraries**:
- `/tools/gates/lib/score.ts` - Scoring engine
- `/tools/gates/lib/rules.ts` - Rule fetching and review storage
- `/tools/gates/lib/db.ts` - Database client

## Weighted Scoring

Gate 0 uses a weighted scoring system:

```typescript
hasESLintPass:     40%  (required)
hasTypeScriptPass: 40%  (required)
hasImportsPass:    20%  (non-blocking)
----------------------------------
Total:            100%

Pass threshold: ≥85%
```

**Passing Scenarios**:
- All 3 checks pass: 100% (PASS)
- ESLint + TypeScript pass, Imports fail: 80% (FAIL - below 85%)
- ESLint + Imports pass, TypeScript fails: 60% (FAIL)
- TypeScript + Imports pass, ESLint fails: 60% (FAIL)

**Key Insight**: Even though `hasImportsPass` is non-blocking (not required), the gate still needs ≥85% to pass. With only ESLint + TypeScript passing (80%), the gate fails. All 3 checks must pass to achieve ≥85%.

## Security Features

1. **PRD_ID Validation**: Regex check prevents command injection
   ```typescript
   const UUID_REGEX = /^PRD-[A-Z0-9-]+$/;
   ```

2. **Hardcoded Commands**: No string interpolation in exec calls
   ```typescript
   execSync('npx eslint .', { ... })  // ✓ Safe
   execSync(`npx eslint ${userInput}`)  // ✗ Unsafe (not used)
   ```

3. **Timeout Enforcement**: All checks have timeouts
   - ESLint: 30 seconds
   - TypeScript: 30 seconds
   - Import checker: 10 seconds

## CI/CD Integration

Gate 0 can be run in CI/CD pipelines:

```yaml
- name: Run Gate 0
  run: PRD_ID=PRD-YOUR-ID node tools/gates/gate0.ts
  env:
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

**Exit Codes**:
- `0`: Gate passed (score ≥85%)
- `1`: Gate failed (score <85%) - blocks merge
- `2`: System error (missing PRD_ID, database error, etc.)

## Test Fixtures

The integration tests create temporary test data:
- Strategic Directive: `SD-TEST-GATE0-{timestamp}`
- PRD: `PRD-TEST-GATE0-{timestamp}`

All test data is cleaned up in `afterAll()` hooks.

## Known Issues

None currently.

## Future Enhancements

1. **Enhanced Import Checker**: Full AST parsing to extract all import statements
2. **Caching**: Cache ESLint/TypeScript results for unchanged files
3. **Parallel Execution**: Run all 3 checks in parallel for faster results
4. **Incremental Checks**: Only check files changed since last run

## References

- PRD: `/PRD-SD-VERIFY-LADDER-001.md`
- Gate 0 Implementation: `/tools/gates/gate0.ts`
- LEO Protocol Documentation: `/docs/reference/leo-protocol.md`
- Gate Architecture: `/docs/reference/gate-architecture.md`
