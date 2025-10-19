# User Story E2E Test Mapping (MANDATORY)

## User Story E2E Test Mapping (MANDATORY)

**Evidence**: SD-EVA-MEETING-001 - "Initial testing focused on E2E without explicit user story mapping" and "E2E tests without user stories miss the acceptance criteria linkage"

**CRITICAL**: E2E tests MUST map to user stories explicitly.

### Problem Statement

From retrospectives:
- **SD-EVA-MEETING-001**: "User stories should have been created BEFORE implementation (not retroactively)"
- **Gap**: "Protocol gap existed: no enforcement of user story validation"
- **Impact**: Can't verify if requirements are actually met without user story linkage

### Test Naming Convention

**MANDATORY**: Every E2E test must reference a user story.

```typescript
// ✅ CORRECT: Explicit user story reference
test('US-001: User can create new venture', async ({ page }) => {
  // Given: User is on ventures page
  await page.goto('/ventures');

  // When: User clicks "New Venture" button
  await page.click('[data-testid="new-venture-button"]');

  // Then: Create venture modal appears
  await expect(page.locator('[data-testid="venture-modal"]')).toBeVisible();
});

// ✅ CORRECT: Multiple user stories in one test file
test('US-002: User can edit venture name', async ({ page }) => {
  // Test implementation
});

// ❌ WRONG: Generic test without user story link
test('Create venture works', async ({ page }) => {
  // Test implementation - MISSING US-XXX reference
});

// ❌ WRONG: Implementation detail test (not user-facing)
test('VentureService.create() returns UUID', async () => {
  // This is a unit test, not E2E - doesn't validate user story
});
```

### Coverage Calculation

```javascript
// Formula
User Story Coverage = (E2E Tests with US-XXX / Total User Stories) × 100

// Example
Total User Stories: 6
E2E Tests: 6 (US-001, US-002, US-003, US-004, US-005, US-006)
Coverage: 6/6 × 100 = 100% ✅

// Minimum Requirement
Coverage: 100% (every user story MUST have ≥1 E2E test)
```

### QA Director Verification

QA Engineering Director sub-agent will:

1. **Query user_stories table** for SD
   ```javascript
   const { data: userStories } = await supabase
     .from('user_stories')
     .select('*')
     .eq('sd_id', sd_id);
   ```

2. **Count E2E tests** with US-XXX references
   ```javascript
   // Scan tests/e2e/**/*.spec.ts for test('US-XXX: ...') patterns
   const e2eTests = await scanForUserStoryTests('tests/e2e');
   ```

3. **Calculate coverage** percentage
   ```javascript
   const coverage = (e2eTests.length / userStories.length) * 100;
   ```

4. **BLOCK if coverage < 100%**
   ```javascript
   if (coverage < 100) {
     return {
       verdict: 'BLOCKED',
       reason: `User story coverage is ${coverage}% (requires 100%)`,
       missing_stories: userStories.filter(us =>
         !e2eTests.some(test => test.includes(us.story_id))
       )
     };
   }
   ```

### File Organization

```
tests/e2e/
├── ventures/
│   ├── venture-creation.spec.ts     # US-001, US-002, US-003
│   ├── venture-editing.spec.ts      # US-004, US-005
│   └── venture-deletion.spec.ts     # US-006
├── analytics/
│   └── export-analytics.spec.ts     # US-007, US-008
└── settings/
    └── user-settings.spec.ts        # US-009, US-010
```

### Example Test File

```typescript
// tests/e2e/ventures/venture-creation.spec.ts
import { test, expect } from '@playwright/test';
import { authenticateUser } from '../fixtures/auth';

test.describe('Venture Creation User Stories', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateUser(page);
  });

  test('US-001: User can navigate to ventures page', async ({ page }) => {
    // Given: User is logged in (from beforeEach)

    // When: User navigates to ventures
    await page.goto('/ventures');

    // Then: Ventures page loads successfully
    await expect(page.locator('h1')).toContainText('Ventures');
    await expect(page).toHaveURL('/ventures');
  });

  test('US-002: User can open create venture modal', async ({ page }) => {
    // Given: User is on ventures page
    await page.goto('/ventures');

    // When: User clicks "New Venture" button
    await page.click('[data-testid="new-venture-button"]');

    // Then: Modal appears with correct fields
    await expect(page.locator('[data-testid="venture-modal"]')).toBeVisible();
    await expect(page.locator('[name="venture-name"]')).toBeVisible();
    await expect(page.locator('[name="venture-stage"]')).toBeVisible();
  });

  test('US-003: User can submit venture with valid data', async ({ page }) => {
    // Given: User has modal open
    await page.goto('/ventures');
    await page.click('[data-testid="new-venture-button"]');

    // When: User fills form and submits
    await page.fill('[name="venture-name"]', 'Test Venture');
    await page.selectOption('[name="venture-stage"]', 'ideation');
    await page.click('[data-testid="submit-venture"]');

    // Then: Venture appears in list
    await expect(page.locator('text=Test Venture')).toBeVisible();
    await expect(page.locator('[data-testid="venture-modal"]')).not.toBeVisible();
  });
});
```

### Success Criteria

- **100%** user story coverage (no exceptions)
- **Every** E2E test has `US-XXX:` prefix
- **QA Director** blocks handoff if coverage < 100%
- **Zero** E2E tests without user story reference

### ROI from Retrospectives

- **SD-EVA-MEETING-001**: Retroactive user story creation avoided → saves 1-2 hours per SD
- **Quality**: 100% coverage requirement ensures all requirements validated
- **Clarity**: Explicit linkage between tests and requirements improves communication

### Anti-Patterns

❌ **Creating E2E tests before user stories** - Reversed order
❌ **Generic test names** without US-XXX - Can't track coverage
❌ **Partial coverage** claiming "most important ones tested" - Requires 100%
❌ **Manual coverage tracking** - QA Director automates this

✅ **User stories created FIRST** (during PLAN phase)
✅ **E2E tests reference user stories explicitly**
✅ **QA Director validates 100% coverage automatically**
✅ **Handoff blocked if coverage incomplete**
