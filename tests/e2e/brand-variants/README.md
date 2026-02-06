# Brand Variants E2E Test Suite
**SD-STAGE-12-001: Adaptive Naming - Domain & Legal Validation**

## Overview

This directory contains comprehensive E2E and unit tests for the Brand Variant Management System. Tests cover all 16 test scenarios specified in the PRD, plus additional edge cases.

## Test Coverage Summary

### E2E Tests (Playwright) - 4 Files

| File | Test Scenarios | Coverage |
|------|----------------|----------|
| `manual-entry.spec.ts` | TS-001, TS-002 | Manual variant creation, validation errors |
| `domain-validation.spec.ts` | TS-003 | Domain availability checks, parallel TLD queries |
| `chairman-approval.spec.ts` | TS-006, TS-007, TS-008 | Approve, reject, request revision |
| `lifecycle-transitions.spec.ts` | TS-009, TS-010, TS-014 | State machine validation, deletion rules |
| `table-operations.spec.ts` | TS-011, TS-012, TS-013 | Filtering, sorting, pagination |

**Total E2E Tests**: 26 tests covering all 12 PRD scenarios + 14 edge cases

### Unit Tests (Vitest) - 3 Files

| File | Coverage |
|------|----------|
| `tests/unit/brand-variants.validation.test.js` | Zod schemas, input validation, security functions |
| `tests/unit/brand-variants.service.test.js` | Business logic, state machine, CRUD operations |
| `tests/unit/domain-validation.service.test.js` | Domain sanitization, parallel checks, MockDomainProvider |

**Total Unit Tests**: 45+ tests covering validation, service logic, and domain checking

## Running Tests

### Prerequisites

1. **Database Setup**: Run migration
   ```bash
   # Apply brand variants migration
   psql $DATABASE_URL -f database/migrations/20251205_brand_variants_security_schema.sql
   ```

2. **Environment Variables**: Ensure `.env` contains:
   ```bash
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   NAMECHEAP_API_KEY=your_api_key  # For production domain validation
   ```

3. **Test User**: Create a chairman user in Supabase
   ```sql
   UPDATE auth.users
   SET raw_user_meta_data = jsonb_set(raw_user_meta_data, '{role}', '"chairman"')
   WHERE email = 'test@example.com';
   ```

### Run E2E Tests

```bash
# All brand variant E2E tests
npm run test:e2e -- tests/e2e/brand-variants/

# Single test file
npm run test:e2e -- tests/e2e/brand-variants/manual-entry.spec.ts

# With headed browser (see UI)
npm run test:e2e -- tests/e2e/brand-variants/ --headed

# Specific test by name
npm run test:e2e -- tests/e2e/brand-variants/ --grep "TS-001"

# Debug mode
npm run test:e2e -- tests/e2e/brand-variants/ --debug
```

### Run Unit Tests

```bash
# All unit tests
npm run test:unit

# Specific test file
npm run test:unit -- tests/unit/brand-variants.validation.test.js

# Watch mode (auto-rerun on changes)
npm run test:watch

# With coverage report
npm run test:coverage
```

## Test Scenarios Mapping

### TS-001: Manual Brand Variant Entry (Happy Path)
- **File**: `manual-entry.spec.ts`
- **Test**: "should create brand variant with valid data (happy path)"
- **Validates**: Form submission, database insert, status = DRAFT

### TS-002: Manual Variant Entry (Validation Errors)
- **File**: `manual-entry.spec.ts`
- **Tests**:
  - "should show validation errors for invalid data"
  - "should validate improvement hypothesis length"
  - "should validate allowed characters in variant name"
- **Validates**: Empty form, length limits, special characters, confidence_delta range

### TS-003: Domain Availability Check (Parallel TLD Queries)
- **File**: `domain-validation.spec.ts`
- **Test**: "should check domain availability for multiple TLDs in parallel"
- **Validates**: .com/.io/.ai checked simultaneously, execution time < 150ms

### TS-006: Chairman Approval - Approve Variant
- **File**: `chairman-approval.spec.ts`
- **Test**: "should approve variant with optional feedback"
- **Validates**: Status → APPROVED, approved_at timestamp, chairman_feedback stored

### TS-007: Chairman Approval - Reject with Feedback
- **File**: `chairman-approval.spec.ts`
- **Tests**:
  - "should reject variant with feedback"
  - "should require feedback when rejecting"
- **Validates**: Status → REJECTED, feedback required, terminal state

### TS-008: Chairman Approval - Request Revision
- **File**: `chairman-approval.spec.ts`
- **Test**: "should request revision and reset status to GENERATED"
- **Validates**: Status → GENERATED, feedback stored, variant editable again

### TS-009: Lifecycle State Transitions - Valid Flow
- **File**: `lifecycle-transitions.spec.ts`
- **Test**: "should allow valid lifecycle flow (DRAFT → GENERATED → AWAITING_APPROVAL → APPROVED)"
- **Validates**: State machine progression, approved_at set

### TS-010: Lifecycle State Transitions - Invalid Prevention
- **File**: `lifecycle-transitions.spec.ts`
- **Tests**:
  - "should prevent invalid transition (DRAFT → APPROVED)"
  - "should prevent transition from REJECTED to PROMOTED"
- **Validates**: Invalid transitions blocked, error messages shown

### TS-011: Variants Table - Filtering by Status
- **File**: `table-operations.spec.ts`
- **Tests**:
  - "should filter variants by status"
  - "should filter variants by multiple statuses"
- **Validates**: Filter dropdown, only matching variants shown

### TS-012: Variants Table - Sorting by confidence_delta
- **File**: `table-operations.spec.ts`
- **Tests**:
  - "should sort variants by confidence_delta ascending"
  - "should sort variants by confidence_delta descending"
- **Validates**: Column header click, sort indicator, correct order

### TS-013: Variants Table - Pagination
- **File**: `table-operations.spec.ts`
- **Tests**:
  - "should paginate through variants (25 per page)"
  - "should change page size dynamically"
  - "should persist filter and sort across pagination"
- **Validates**: Page size dropdown, next/prev buttons, pagination info

### TS-014: Delete Variant - Editable Status Only
- **File**: `lifecycle-transitions.spec.ts`
- **Tests**:
  - "should delete variant in DRAFT/GENERATED status"
  - "should prevent deletion of APPROVED variant"
  - "should prevent deletion of PROMOTED variant"
- **Validates**: Delete button visibility, confirmation dialog, RLS enforcement

## Required data-testid Attributes

### Form Components (BrandVariantForm)
```typescript
// Buttons
"create-brand-variant-btn"
"submit-variant-btn"
"cancel-variant-btn"

// Form fields
"brand-variant-form"
"variant-name-input"
"variant-type-select"
"improvement-hypothesis-input"
"confidence-delta-input"
"target-market-input"

// Error messages
"variant-name-error"
"hypothesis-error"
"confidence-delta-error"
```

### Table Components (VariantsTable)
```typescript
// Table structure
"variants-table"
"variant-row"
"variant-name-cell"
"variant-status-cell"
"variant-type-cell"

// Table controls
"status-filter-dropdown"
"status-filter-option-{status}"
"clear-status-filter-btn"
"active-filters-badge"

// Sorting
"sort-confidence-delta-header"
"sort-created-at-header"
"sort-confidence-delta-indicator"

// Pagination
"page-size-dropdown"
"pagination-info"
"next-page-btn"
"prev-page-btn"
```

### Chairman Approval (ChairmanApprovalCard)
```typescript
// Approval card
"chairman-approval-card"
"approval-card-variant-name"
"approval-card-hypothesis"
"chairman-feedback-input"
"feedback-error"

// Action buttons
"approve-variant-btn"
"reject-variant-btn"
"request-revision-btn"

// Confirmation dialogs
"approve-confirmation-dialog"
"reject-confirmation-dialog"
"revision-confirmation-dialog"
"confirm-approve-btn"
"confirm-reject-btn"
"confirm-revision-btn"

// Display elements
"approved-at-display"
"chairman-feedback-preview"
"generation-cycle-badge"
"variant-notes"
```

### Domain Validation
```typescript
// Domain check UI
"check-domain-btn"
"domain-check-loading"
"domain-check-results"
"domain-check-error"
"close-domain-results-btn"

// Domain results
"domain-result-com"
"domain-result-io"
"domain-result-ai"
"availability-badge"
"execution-time"

// Additional info
"sanitized-domain-notice"
"cached-results-badge"
```

### Lifecycle Actions
```typescript
// State transitions
"submit-for-approval-btn"
"submit-confirmation-dialog"
"confirm-submit-btn"
"promote-variant-btn"

// Status indicators
"promoted-badge"
"terminal-state-notice"
"status-transition-error"
"approval-error"

// Delete operations
"delete-variant-btn"
"delete-confirmation-dialog"
"confirm-delete-btn"
```

### General UI
```typescript
"success-message"
"error-message"
"loading-spinner"
```

## Mock Data Providers

### MockDomainProvider (Unit Tests)
Located in: `tests/unit/domain-validation.service.test.js`

Provides deterministic domain availability results based on name hash:
- Same input always returns same result
- ~50% availability rate
- Simulates 10-50ms network delay
- No external API calls

**Usage in tests**:
```javascript
const provider = new MockDomainProvider();
const service = new MockDomainValidationService(provider);

const result = await service.checkAllTLDs('testco', ['com', 'io', 'ai']);
// Result is deterministic and repeatable
```

### E2E Domain Validation Mocking
In E2E tests, use Playwright's `page.route()` to mock the API:

```typescript
await page.route('**/api/domain-validation/check', async (route) => {
  await route.fulfill({
    status: 200,
    body: JSON.stringify({
      success: true,
      domain: 'testco',
      results: [
        { domain: 'testco.com', available: false, price: null },
        { domain: 'testco.io', available: true, price: 12.99 }
      ]
    })
  });
});
```

## Database Seeding

For E2E tests, seed data is created in `beforeAll()` hooks:

```typescript
test.beforeAll(async () => {
  // Create test venture
  const { data: venture } = await supabase
    .from('ventures')
    .insert({ name: 'Test Venture', stage: 12 })
    .select()
    .single();

  testVentureId = venture?.id;

  // Create test variants
  const { data: variant } = await supabase
    .from('brand_variants')
    .insert({
      venture_id: testVentureId,
      variant_details: { /* ... */ },
      status: 'generated'
    })
    .select()
    .single();

  createdVariantIds.push(variant?.id);
});
```

Cleanup in `afterAll()`:
```typescript
test.afterAll(async () => {
  await supabase.from('brand_variants').delete().in('id', createdVariantIds);
  await supabase.from('ventures').delete().eq('id', testVentureId);
});
```

## Debugging Tips

### E2E Test Debugging

1. **Run with headed browser**:
   ```bash
   npm run test:e2e -- tests/e2e/brand-variants/ --headed
   ```

2. **Use debug mode** (pauses before each action):
   ```bash
   npm run test:e2e -- tests/e2e/brand-variants/ --debug
   ```

3. **View test artifacts**:
   - Screenshots: `test-results/artifacts/`
   - Videos: `test-results/artifacts/`
   - Traces: `test-results/artifacts/`

4. **Use Playwright Inspector**:
   ```bash
   PWDEBUG=1 npm run test:e2e -- tests/e2e/brand-variants/manual-entry.spec.ts
   ```

### Unit Test Debugging

1. **Run single test with verbose output**:
   ```bash
   npm run test:unit -- tests/unit/brand-variants.validation.test.js --verbose
   ```

2. **Use Node debugger**:
   ```bash
   node --inspect-brk node_modules/.bin/vitest tests/unit/brand-variants.validation.test.js
   ```

3. **Add console.log statements** (mocked functions log to console)

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Brand Variants Tests

on:
  pull_request:
    paths:
      - 'lib/validation/brand-variants-validation.ts'
      - 'lib/brandVariantsService.ts'
      - 'lib/domainValidationService.ts'
      - 'tests/e2e/brand-variants/**'
      - 'tests/unit/brand-variants*.test.js'

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:unit

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npx playwright install --with-deps
      - run: npm run test:e2e -- tests/e2e/brand-variants/
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

## Test Maintenance

### Adding New Tests

1. **Create test file** in appropriate directory:
   - E2E: `tests/e2e/brand-variants/{feature}.spec.ts`
   - Unit: `tests/unit/brand-variants.{module}.test.js`

2. **Follow naming convention**:
   - E2E: `TS-XXX: description` (reference PRD test scenario)
   - Unit: `should [action] when [condition]`

3. **Use existing patterns**:
   - Seed data in `beforeAll()`
   - Cleanup in `afterAll()`
   - Use `data-testid` attributes
   - Mock external APIs

4. **Update this README** with new test coverage

### Updating Tests After Schema Changes

1. **Update database seed data** if columns change
2. **Update validation tests** if Zod schemas change
3. **Update service tests** if business logic changes
4. **Update data-testid mappings** if UI components change

## Known Issues

1. **Timing Issues**: Some E2E tests use `waitForTimeout()` for UI state changes. Consider replacing with `waitForSelector()` or `waitForLoadState()` for more reliability.

2. **Mock Data Consistency**: MockDomainProvider uses a hash function for deterministic results. If hash implementation changes, test expectations may need updating.

3. **RLS Policies**: E2E tests use service role key which bypasses RLS. For true RLS testing, use authenticated user context.

## Success Criteria

- ✅ All 26 E2E tests pass
- ✅ All 45+ unit tests pass
- ✅ Test coverage > 80% for validation, service, and domain modules
- ✅ No flaky tests (all tests pass consistently 10 times in a row)
- ✅ E2E tests complete in < 5 minutes
- ✅ Unit tests complete in < 30 seconds

## Support

For questions or issues with tests:
1. Check test output and error messages
2. Review test artifacts (screenshots, videos)
3. Consult implementation notes in test files
4. Check database schema migration file
5. Review PRD for expected behavior

## References

- **PRD**: `docs/SD-STAGE-12-001-PRD.md`
- **Database Schema**: `database/migrations/20251205_brand_variants_security_schema.sql`
- **Validation Schemas**: `lib/validation/brand-variants-validation.ts`
- **LEO Protocol Testing Standards**: `docs/testing/qa-director-guide.md`
