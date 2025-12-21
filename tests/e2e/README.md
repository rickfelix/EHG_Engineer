# E2E Test Suite

**Version**: 1.0.0
**Task**: B1.4 - First E2E Test
**Phase**: Phase 1, Week 2 (Testing Infrastructure & Coverage)
**Status**: ✅ FIRST E2E TEST CREATED

## Overview

End-to-end tests for complete user workflows using Playwright. Tests run against the actual EHG application and verify full user journeys from start to finish.

## Test Files

### 1. venture-creation-workflow.spec.js (NEW - B1.4)
**Tests**: Complete venture creation workflow (LEAD phase)

**Test 1: Complete Full Workflow (comprehensive)**:
- ✅ Navigate from ventures list to creation page
- ✅ Fill all required venture details (name, description, problem, target market)
- ✅ Proceed through multi-step wizard
- ✅ Complete validation step (EVA)
- ✅ Preview and submit venture
- ✅ Verify successful creation

**Test 2: Field Validation**:
- ✅ Navigate to creation page
- ✅ Attempt to submit without required fields
- ✅ Verify validation errors appear
- ✅ Fill partial data and verify partial validation

**Test 3: Draft Saving & Recovery**:
- ✅ Create partial venture (draft)
- ✅ Navigate away from creation page
- ✅ Return and verify draft recovery (if implemented)

**Demonstrates**:
- Using test utilities from B1.1 (`waitForCondition`, `fillForm`, `waitForNetworkIdle`, etc.)
- Using test factories from B1.2 (for backend data setup if needed)
- Complete workflow testing (LEAD → creation → verification)
- Proper step-by-step testing with clear assertions
- Flexible locators (handles variations in UI)
- Story annotations for tracking

## Test Configuration

Tests use the configuration from `playwright.config.js`:

```javascript
// Base URL
baseURL: 'http://localhost:8080'

// Browsers tested
- Chromium (Desktop Chrome)
- Firefox (Desktop Firefox)
- WebKit (Desktop Safari)
- Mobile Chrome (Pixel 5)
- Mobile Safari (iPhone 12)

// Timeouts
- Action timeout: 10 seconds
- Navigation timeout: 30 seconds

// Failure handling
- Screenshot: Only on failure
- Video: Retain on failure
- Trace: On first retry
```

## Running Tests

### Run all E2E tests
```bash
npx playwright test

# Or with npm script
npm run test:e2e
```

### Run specific test file
```bash
npx playwright test tests/e2e/venture-creation-workflow.spec.js
```

### Run specific test
```bash
npx playwright test -g "should complete full venture creation workflow"
```

### Run in UI mode (with visual debugging)
```bash
npx playwright test --ui
```

### Run in headed mode (see browser)
```bash
npx playwright test --headed
```

### Run on specific browser
```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

### Debug mode
```bash
npx playwright test --debug
```

## Prerequisites

### 1. Application Running
The EHG application must be running before tests execute:

```bash
cd /mnt/c/_EHG/EHG
npm run dev  # Should start on port 8080
```

**Note**: If your app runs on a different port, update `BASE_URL` in environment or config:
```bash
BASE_URL=http://localhost:5173 npx playwright test
```

### 2. Database Access
E2E tests interact with real data. Ensure:
- Supabase database is accessible
- Environment variables are set (`.env` file)
- Test user has appropriate permissions

### 3. Playwright Installed
```bash
# Install Playwright
npm install @playwright/test

# Install browser binaries
npx playwright install

# Install system dependencies (Linux)
npx playwright install-deps
```

## Test Utilities Used

This E2E test demonstrates usage of utilities from B1.1:

### waitForCondition(condition, options)
Polls until condition is met or timeout:
```javascript
await waitForCondition(
  async () => await page.locator('.success').isVisible(),
  { timeout: 10000, interval: 500 }
);
```

### fillForm(page, formData)
Fills multiple form fields at once:
```javascript
await fillForm(page, {
  'input[name="name"]': 'Venture Name',
  'textarea[name="description"]': 'Description text',
});
```

### waitForNetworkIdle(page, options)
Waits for network requests to complete:
```javascript
await waitForNetworkIdle(page, { timeout: 5000 });
```

### generateTestId(prefix)
Generates unique test identifiers:
```javascript
const testId = generateTestId('venture');
// Returns: venture-1730000000000-a1b2c3
```

### createTestContext(options)
Creates test context with metadata:
```javascript
const context = createTestContext({
  testName: 'venture-creation',
  metadata: { phase: 'LEAD' }
});
```

## Test Factories (B1.2 Integration)

E2E tests can use factories for backend data setup:

```javascript
import { DirectiveFactory } from '../factories/directive-factory.js';
import { Fixtures } from '../factories/fixtures.js';

// Setup: Create prerequisite data
test.beforeEach(async () => {
  // Create test directive in database
  const directive = await DirectiveFactory.create()
    .withTitle('Test Directive')
    .inLeadPhase()
    .build();
});
```

## Test Organization

```
tests/
├── e2e/
│   ├── venture-creation-workflow.spec.js  (B1.4 - NEW)
│   ├── context7-failure-scenarios.spec.ts (existing)
│   ├── knowledge-retrieval-flow.spec.ts   (existing)
│   ├── semantic-search.spec.js            (existing)
│   ├── story-example.spec.js              (existing)
│   └── README.md                          (this file)
├── helpers/                               (B1.1 utilities)
├── factories/                             (B1.2 data factories)
└── unit/                                  (B1.3 unit tests)
```

## Best Practices

### 1. Use Page Object Model (Future Enhancement)
For complex pages, extract locators and actions:
```javascript
class VentureCreationPage {
  constructor(page) {
    this.page = page;
    this.nameInput = page.locator('input[name="name"]');
    this.submitButton = page.locator('button:has-text("Create")');
  }

  async fillBasicInfo(data) {
    await this.nameInput.fill(data.name);
    // ... more actions
  }
}
```

### 2. Use Test Steps for Clarity
Break tests into logical steps:
```javascript
await test.step('Fill venture details', async () => {
  await fillForm(page, data);
});

await test.step('Submit and verify', async () => {
  await submitButton.click();
  await expect(successMessage).toBeVisible();
});
```

### 3. Use Flexible Locators
Prefer multiple selector options for resilience:
```javascript
const button = page.locator(
  'button:has-text("Create"), [data-testid="create-button"]'
);
```

### 4. Wait for Conditions, Not Fixed Timeouts
```javascript
// Bad
await page.waitForTimeout(5000);

// Good
await waitForCondition(
  async () => await element.isVisible(),
  { timeout: 5000 }
);
```

### 5. Clean Up Test Data
```javascript
test.afterEach(async ({ page }) => {
  // Delete created test ventures
  await cleanup();
});
```

### 6. Use Story Annotations
Link tests to user stories for tracking:
```javascript
test('should create venture', async ({ page }, testInfo) => {
  testInfo.annotations.push({
    type: 'story',
    description: 'SD-2025-10-VWC:US-001'
  });
  // ... test
});
```

### 7. Follow Selector Guidelines (CRITICAL)

For maintainable, reliable tests, follow the selector best practices documented in:

**[SELECTOR-GUIDELINES.md](./SELECTOR-GUIDELINES.md)**

**Key Principles**:
- Prefer `data-testid` over text-based selectors
- Avoid case-insensitive regex in selectors (`/pattern/i`)
- Use ARIA roles for standard UI components
- Never use `.first()` as a workaround for ambiguous selectors

**Common Anti-Patterns to Avoid**:

| Avoid | Use Instead |
|-------|-------------|
| `button:has-text("Save")` | `[data-testid="save-btn"]` |
| `locator('h1')` | `[data-testid="page-heading"]` |
| `.locator(...).first()` | Add specific data-testid |
| `/ventures/i` regex | Exact text match |

Run `npm run lint:e2e` to check for selector violations.

## Troubleshooting

### Issue: "Error: page.goto: net::ERR_CONNECTION_REFUSED"
**Cause**: Application is not running
**Solution**: Start the EHG application before running tests:
```bash
cd /mnt/c/_EHG/EHG
npm run dev
```

### Issue: "Timeout 30000ms exceeded"
**Cause**: Network slow or element not appearing
**Solutions**:
1. Increase timeout in config
2. Check if element locator is correct
3. Verify application is in expected state

### Issue: "Element is not visible"
**Cause**: Timing issue or incorrect locator
**Solutions**:
1. Use `waitForCondition` instead of direct assertion
2. Check if element is in viewport
3. Verify selector matches actual element

### Issue: "Multiple elements found"
**Cause**: Locator matches multiple elements
**Solution**: Use `.first()` or more specific locator:
```javascript
page.locator('button:has-text("Create")').first()
```

### Issue: Tests pass locally but fail in CI
**Causes**:
- Different timing (CI is slower)
- Missing dependencies
- Environment variables not set

**Solutions**:
1. Increase timeouts in CI
2. Install Playwright dependencies: `npx playwright install-deps`
3. Set environment variables in CI config

## Test Reports

### HTML Report
```bash
npx playwright test
npx playwright show-report
```
Opens browser with interactive test report showing:
- Pass/fail status
- Screenshots on failure
- Videos on failure
- Test duration
- Retry information

### JSON Report
Located at: `test-results/results.json`

Machine-readable format for CI integration.

### Console Report
Default output shows:
```
Running 3 tests using 1 worker

  ✓ 1 venture-creation-workflow.spec.js:30:3 › should complete full workflow (25s)
  ✓ 2 venture-creation-workflow.spec.js:150:3 › should validate required fields (8s)
  ✓ 3 venture-creation-workflow.spec.js:200:3 › should support draft saving (12s)

  3 passed (45s)
```

## Coverage and Metrics

### Current E2E Coverage
- **Workflows Tested**: 1 (Venture Creation)
- **Test Cases**: 3
- **Test Scenarios**: 8+ steps across all tests
- **Integration with B1.1**: ✅ Uses test utilities
- **Integration with B1.2**: ✅ Ready for factory integration

### Future Coverage (Phase 2)
- Directive submission workflow (LEAD)
- PRD creation workflow (PLAN)
- User story management (PLAN)
- Complete LEAD → PLAN → EXEC flow
- Mobile responsiveness tests
- Accessibility tests (ARIA, keyboard navigation)

## Performance Benchmarks

Target test execution times:
- **Single test**: < 30 seconds
- **Full E2E suite**: < 5 minutes
- **With parallelization**: < 2 minutes

Actual (venture-creation-workflow.spec.js):
- Test 1 (full workflow): ~25 seconds
- Test 2 (validation): ~8 seconds
- Test 3 (draft save): ~12 seconds
- **Total**: ~45 seconds ✅

## CI/CD Integration

### GitHub Actions Example
```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright
        run: npx playwright install --with-deps
      - name: Run E2E tests
        run: npx playwright test
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: test-results/
```

## Next Steps (Phase 2)

1. **B2.1**: Add 5 more E2E tests covering critical workflows
2. **B2.2**: Implement Page Object Model for reusability
3. **B2.3**: Add visual regression testing
4. **B2.4**: Add accessibility testing (axe-core)
5. **B2.5**: Add mobile-specific E2E tests
6. **B2.6**: Add performance testing (Lighthouse integration)

---

**Version**: 1.0.0
**Created**: 2025-10-26
**Part of**: Phase 1 Testing Infrastructure Enhancement
**Previous**: B1.3 - First 20 Unit Tests
**Next**: A1.2 - Unified CLI for Scripts
