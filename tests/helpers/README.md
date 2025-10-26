# Testing Framework Helpers

**Version**: 1.0.0
**Task**: B1.1 - Testing Framework Enhancements
**Phase**: Phase 1, Week 1 (Testing Infrastructure & Coverage)

## Overview

This directory contains reusable test utilities and helpers for Playwright E2E tests, reducing boilerplate and improving test maintainability.

## Files

### test-utils.js (30+ utilities)

Common patterns and helpers for Playwright tests:

**Waiting Utilities:**
- `waitForCondition()` - Custom polling with configurable interval
- `waitForNetworkIdle()` - Wait for all network requests to complete
- `waitForAttributeValue()` - Wait for element attribute to match value
- `waitForApiResponse()` - Wait for specific API response

**UI Interaction:**
- `scrollIntoView()` - Smooth scroll element into viewport
- `isInViewport()` - Check if element is visible in viewport
- `fillForm()` - Fill multiple form fields from object
- `pressKeys()` - Press key combinations (e.g., 'Control+C')

**Content & Assertions:**
- `getTextContent()` - Get trimmed text content
- `getAllTextContent()` - Get all matching elements' text
- `hasClass()` - Check if element has specific class
- `assertAccessibility()` - Basic a11y checks (alt text, ARIA labels)

**Screenshot & Debugging:**
- `takeScreenshot()` - Full-page screenshot with auto-naming
- `captureConsoleLogs()` - Record console messages during test
- `captureNetworkErrors()` - Record failed network requests

**API Mocking:**
- `mockApiResponse()` - Mock API responses with custom data
- `waitForApiResponse()` - Wait for and capture API responses

**Test Context:**
- `createTestContext()` - Create test context with metadata
- `generateTestId()` - Generate unique test identifiers
- `clearBrowserData()` - Clear cookies and storage

**Retry Logic:**
- `retryAction()` - Retry actions with exponential backoff

### database-helpers.js (15+ utilities)

Supabase integration for test data management:

**Setup Utilities:**
- `getSupabaseClient()` - Get or create Supabase client
- `createTestDirective()` - Create test strategic directive
- `createTestPRD()` - Create test product requirement
- `createTestUserStory()` - Create test user story
- `createTestHandoff()` - Create test handoff
- `createTestVenture()` - Create test venture

**Teardown Utilities:**
- `deleteTestDirective()` - Delete directive and all related data
- `deleteTestVenture()` - Delete venture
- `cleanupTestData()` - Clean up all test data by prefix

**Query Utilities:**
- `getDirectiveWithRelations()` - Get directive with PRD, stories, deliverables
- `updateDirectiveStatus()` - Update directive status
- `getTestDatabaseStats()` - Get database statistics

**Async Utilities:**
- `waitForDatabaseCondition()` - Poll database until condition met

## Usage Examples

### Basic Test with Utilities

```javascript
import { test, expect } from '@playwright/test';
import {
  waitForNetworkIdle,
  takeScreenshot,
  fillForm
} from '../helpers/test-utils.js';

test('create new directive', async ({ page }) => {
  await page.goto('/directives');
  await waitForNetworkIdle(page);

  // Fill form using helper
  await fillForm(page, {
    '#title': 'Test Directive',
    '#description': 'Test description',
    '#priority': 'high',
  });

  await page.click('button[type="submit"]');
  await waitForNetworkIdle(page);

  // Take screenshot
  await takeScreenshot(page, 'directive-created');

  // Assert
  await expect(page.locator('.success-message')).toBeVisible();
});
```

### Test with Database Setup/Teardown

```javascript
import { test, expect } from '@playwright/test';
import {
  createTestDirective,
  deleteTestDirective,
  createTestPRD,
} from '../helpers/database-helpers.js';

test('view directive details', async ({ page }) => {
  // Setup: Create test data
  const directive = await createTestDirective({
    title: 'Test Directive',
    status: 'active',
    phase: 'PLAN',
  });

  const prd = await createTestPRD(directive.id, {
    title: 'Test PRD',
    overview: 'Test PRD overview',
  });

  try {
    // Test: Navigate and verify
    await page.goto(`/directives/${directive.id}`);
    await expect(page.locator('h1')).toHaveText('Test Directive');
    await expect(page.locator('.prd-title')).toHaveText('Test PRD');
  } finally {
    // Teardown: Clean up test data
    await deleteTestDirective(directive.id);
  }
});
```

### Test with API Mocking

```javascript
import { test, expect } from '@playwright/test';
import { mockApiResponse, waitForApiResponse } from '../helpers/test-utils.js';

test('handle API error gracefully', async ({ page }) => {
  // Mock API to return error
  await mockApiResponse(page, '**/api/directives',
    { error: 'Database error' },
    { status: 500 }
  );

  await page.goto('/directives');

  // Verify error handling
  await expect(page.locator('.error-message')).toBeVisible();
  await expect(page.locator('.error-message')).toContainText('Database error');
});
```

### Test with Console/Network Capture

```javascript
import { test, expect } from '@playwright/test';
import {
  captureConsoleLogs,
  captureNetworkErrors
} from '../helpers/test-utils.js';

test('verify no console errors', async ({ page }) => {
  const logs = captureConsoleLogs(page);
  const networkErrors = captureNetworkErrors(page);

  await page.goto('/directives');

  // Verify no errors
  const errors = logs.filter(log => log.type === 'error');
  expect(errors).toHaveLength(0);
  expect(networkErrors).toHaveLength(0);
});
```

### Test with Accessibility Checks

```javascript
import { test, expect } from '@playwright/test';
import { assertAccessibility } from '../helpers/test-utils.js';

test('verify page accessibility', async ({ page }) => {
  await page.goto('/directives');

  // Assert basic a11y compliance
  await assertAccessibility(page, {
    checkAriaLabels: true,
    checkContrast: false, // More advanced, optional
  });
});
```

### Complete End-to-End Test

```javascript
import { test, expect } from '@playwright/test';
import {
  waitForNetworkIdle,
  fillForm,
  takeScreenshot,
  createTestContext,
} from '../helpers/test-utils.js';
import {
  createTestDirective,
  deleteTestDirective,
  getDirectiveWithRelations,
} from '../helpers/database-helpers.js';

test('complete directive workflow', async ({ page }) => {
  const ctx = createTestContext({ prefix: 'workflow' });
  let directive;

  try {
    // Setup
    directive = await createTestDirective({
      title: 'Workflow Test',
      phase: 'LEAD',
    });

    // Navigate to directive
    await page.goto(`/directives/${directive.id}`);
    await waitForNetworkIdle(page);
    await takeScreenshot(page, 'directive-initial');

    // Create PRD
    await page.click('[data-test="create-prd"]');
    await fillForm(page, {
      '#prd-title': 'Test PRD',
      '#prd-overview': 'Test overview',
    });
    await page.click('button[type="submit"]');
    await waitForNetworkIdle(page);
    await takeScreenshot(page, 'prd-created');

    // Verify in database
    const updated = await getDirectiveWithRelations(directive.id);
    expect(updated.prd).toBeDefined();
    expect(updated.prd.title).toBe('Test PRD');

    // Create handoff
    await page.click('[data-test="create-handoff"]');
    await page.click('[data-test="submit-handoff"]');
    await waitForNetworkIdle(page);

    // Verify completion
    await expect(page.locator('.success-message')).toBeVisible();
    await takeScreenshot(page, 'workflow-complete');

  } finally {
    // Cleanup
    if (directive) {
      await deleteTestDirective(directive.id);
    }
  }
});
```

## Best Practices

### 1. Always Clean Up Test Data

```javascript
test('my test', async ({ page }) => {
  const directive = await createTestDirective();

  try {
    // Test code here
  } finally {
    // Always clean up, even if test fails
    await deleteTestDirective(directive.id);
  }
});
```

### 2. Use Test Prefixes

```javascript
// Makes cleanup easier
const directive = await createTestDirective({
  title: 'Test - My Feature', // Clear test prefix
});

// Later, cleanup all test data:
await cleanupTestData('Test');
```

### 3. Wait for Network Idle

```javascript
// After navigation or actions that trigger API calls
await page.goto('/directives');
await waitForNetworkIdle(page); // Ensures page is fully loaded
```

### 4. Take Screenshots on Key Steps

```javascript
await takeScreenshot(page, 'before-action');
await page.click('.important-button');
await takeScreenshot(page, 'after-action');
```

### 5. Use Test Context for Metadata

```javascript
const ctx = createTestContext({
  prefix: 'my-test',
  metadata: { feature: 'directives', story: 'SD-001' },
});

// Access throughout test
console.log(`Running test ${ctx.testId}`);
```

## Error Handling

All helper functions throw descriptive errors:

```javascript
try {
  await waitForCondition(() => false, {
    timeout: 1000,
    timeoutMessage: 'Custom timeout message'
  });
} catch (error) {
  console.error('Test failed:', error.message);
}
```

## Performance Tips

1. **Reuse Supabase Client**: Client is lazy-loaded and cached
2. **Batch Operations**: Create multiple test records in single transaction
3. **Use Network Idle**: Prevents flaky tests from timing issues
4. **Minimal Screenshots**: Only on key steps, not every action

## Future Enhancements

**Planned for Phase 2**:
- Visual regression testing utilities
- Performance testing helpers
- Mobile device simulation utilities
- Advanced a11y testing (contrast, keyboard nav)
- Test data factories (B1.2)
- Fixture system for common scenarios

## Troubleshooting

### Supabase Connection Issues
```javascript
// Check environment variables
console.log(process.env.SUPABASE_URL); // Should be defined
console.log(process.env.SUPABASE_ANON_KEY); // Should be defined
```

### Timeout Issues
```javascript
// Increase timeout for slow operations
await waitForCondition(condition, { timeout: 30000 }); // 30 seconds
```

### Network Idle Not Working
```javascript
// Use specific API wait instead
await waitForApiResponse(page, '/api/directives');
```

---

**Version**: 1.0.0
**Created**: 2025-10-26
**Part of**: Phase 1 Testing Infrastructure Enhancement
**Next**: B1.2 - Test Data Factory
