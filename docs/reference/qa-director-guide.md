# Enhanced QA Engineering Director v2.2.0 - MCP-First Edition

## Overview
**Mission-Critical Testing Automation** - Comprehensive E2E validation with MCP browser automation as the PREFERRED method.

**Philosophy**: **Do it right, not fast.** E2E testing is MANDATORY, not optional.

**Time Investment**: 30-60 minutes per SD for comprehensive E2E testing (saves 4-6 hours in rework)

**NEW in v2.2.0**: Playwright MCP and Puppeteer MCP integration for interactive browser automation

---

## 🤖 MCP Browser Automation (PREFERRED METHOD)

### Why MCP is Preferred

**⚡ Claude Code MCP Servers** - Use these for ALL browser automation and testing tasks.

**Benefits**:
- **No manual setup**: MCP handles browser lifecycle automatically
- **Real-time interaction**: See the browser, interact manually if needed
- **Claude-driven**: Natural language commands drive browser actions
- **Screenshot automation**: Capture evidence without custom Playwright code
- **Faster feedback**: No test script writing - just describe what to test
- **Visual verification**: Human-in-the-loop validation for UI changes

### Playwright MCP (PRIMARY CHOICE - ALWAYS PREFER THIS)

**Best for**: Modern web apps, React/Vue/Vite applications, cross-browser testing, ALL E2E testing scenarios

**Why Playwright over Puppeteer**:
- Better cross-browser support (Chrome, Firefox, Safari, Edge)
- More reliable auto-wait mechanisms
- Superior React/Vue component interaction
- Modern web standards compliance
- Active development and Microsoft backing

**Installation**: Already configured in Claude Code
```bash
claude mcp list  # Verify "playwright" is connected
```

**Usage Examples**:

**1. Basic Navigation & Screenshot**
```
Use Playwright MCP to:
- Navigate to http://localhost:3000/chairman-analytics
- Wait for the page to load completely
- Take a screenshot and save as "chairman-analytics-before.png"
```

**2. User Flow Testing**
```
Use Playwright MCP to test the login flow:
1. Navigate to http://localhost:3000
2. Click the "Sign In" button
3. Fill email field with "test@example.com"
4. Fill password field with "password123"
5. Click "Submit"
6. Verify we're redirected to /dashboard
7. Take screenshot as evidence
```

**3. Component Interaction**
```
Use Playwright MCP to:
- Navigate to http://localhost:3000/settings
- Click the "Dark Mode" toggle
- Verify theme changes
- Take before/after screenshots
```

**4. Form Validation Testing**
```
Use Playwright MCP to test form validation:
- Navigate to http://localhost:3000/ventures/create
- Click "Submit" without filling required fields
- Verify error messages appear
- Fill all required fields
- Submit and verify success
```

**5. E2E User Story Validation** (MANDATORY)
```
Use Playwright MCP to validate US-001 (User can create new venture):
1. Navigate to /ventures
2. Click "New Venture" button
3. Fill venture name: "Test Venture"
4. Fill description: "Test Description"
5. Select category: "Technology"
6. Click "Create"
7. Verify venture appears in list
8. Take screenshot as evidence
```

### Puppeteer MCP (FALLBACK - Use only when Playwright unavailable)

**Best for**: Simple screenshot tasks, Chrome-only scenarios, legacy browser requirements

**When to use Puppeteer instead of Playwright** (rare):
- Playwright MCP is unavailable or broken
- Chrome-specific DevTools Protocol features needed
- Legacy Chrome-only testing requirements
- **Otherwise**: Always prefer Playwright MCP

**Installation**: Already configured in Claude Code
```bash
claude mcp list  # Verify "puppeteer" is connected
```

**Usage Examples**:

**1. Quick Screenshot**
```
Use Puppeteer MCP to:
- Open http://localhost:3000
- Take full-page screenshot
- Save as "dashboard-current-state.png"
```

**2. Performance Measurement**
```
Use Puppeteer MCP to:
- Navigate to http://localhost:3000/chairman-analytics
- Measure page load time
- Report metrics
```

### When to Use MCP vs Manual Playwright

**✅ USE MCP (Preferred)**:
- Quick verification of UI changes (screenshot evidence for handoffs)
- Interactive testing during EXEC implementation
- Visual regression checks (before/after screenshots)
- Manual exploratory testing with automation assist
- User story validation with human verification
- Evidence collection for PRs and handoffs

**⚙️ USE Manual Playwright Scripts**:
- Automated CI/CD test suites (npm run test:e2e)
- Regression test suites that run on every commit
- Comprehensive test coverage across all user stories
- Tests that need to run headless in GitHub Actions
- Performance benchmarking with consistent conditions

**🎯 RECOMMENDED WORKFLOW**:
1. **Development**: Use Playwright MCP for quick iteration and verification
2. **Pre-Handoff**: Use Playwright MCP to capture screenshot evidence
3. **Verification**: Run manual Playwright suite (npm run test:e2e) for comprehensive validation
4. **CI/CD**: Automated Playwright runs in GitHub Actions on every push

---

## Core Capabilities

1. **MCP Browser Automation** (**NEW - PREFERRED**)
   - Playwright MCP for modern web app testing
   - Puppeteer MCP for quick screenshots and Chrome testing
   - Natural language browser control via Claude Code
   - Real-time visual verification with human-in-the-loop
   - Automatic screenshot capture for evidence collection
   - Interactive testing during EXEC implementation

2. **Professional Test Case Generation from User Stories**
   - Queries `user_stories` table for SD requirements
   - Creates comprehensive Given-When-Then test scenarios
   - Maps each user story to ≥1 E2E test case
   - Generates Playwright test suites with proper selectors
   - Documents test coverage percentage

3. **Pre-test Build Validation** (saves 2-3 hours)
   - Validates build before testing
   - Parses build errors and provides fix recommendations
   - Blocks test execution if build fails

4. **Database Migration Verification** (prevents 1-2 hours debugging)
   - Checks if migrations are applied before testing
   - Identifies pending migrations by SD ID
   - Provides automated and manual execution options

5. **Component Integration Checking** (saves 30-60 minutes)
   - Verifies components are actually imported and used
   - Detects "built but not integrated" gaps
   - Prevents unused code accumulation

6. **Mandatory E2E Test Tier**
   - Tier 1 (Smoke): Basic sanity checks (3-5 tests, <60s) - NOT sufficient alone
   - **Tier 2 (E2E via Playwright or MCP): MANDATORY** (10-30 tests, <10min) - **REQUIRED FOR APPROVAL**
   - Tier 3 (Manual): Only for complex edge cases (rare)
   - **Standard**: Smoke tests check "does it load?", E2E tests prove "does it work?"

7. **Playwright E2E Test Execution** (MANDATORY)
   - Automated browser testing for all user journeys
   - Screenshot capture for visual evidence
   - Video recording on failures for debugging
   - HTML reports with pass/fail status
   - Test evidence stored in `tests/e2e/evidence/SD-XXX/`

8. **Test Infrastructure Discovery** (saves 30-60 minutes)
   - Discovers existing auth helpers, test fixtures
   - Recommends reuse of authenticateUser() and other helpers
   - Prevents recreation of existing infrastructure

9. **Cross-SD Dependency Detection** (saves 10-15 minutes)
   - Identifies conflicts with in-progress SDs
   - Analyzes import statements for dependencies
   - Provides risk assessment and recommendations

10. **Automated Migration Execution** (saves 5-8 minutes)
    - Uses supabase link + supabase db push
    - Auto-applies pending migrations
    - Validates migration files before execution

11. **Testing Learnings for Continuous Improvement**
    - Captures testing effectiveness after each SD
    - Documents what worked, what didn't with Playwright/MCP
    - Identifies test infrastructure improvements needed
    - Feeds retrospective for sub-agent enhancement
    - Tracks evolution: v2.2 (MCP-first) → v2.5 (automated generation) → v3.0 (AI-assisted + self-healing)

---

## 5-Phase Execution Workflow (UPDATED with MCP)

### Phase 1: Pre-flight Checks
- Build validation
- Database migration verification
- Cross-SD dependency check
- Component integration check (if UI SD)
- **MCP server availability check** (**NEW**)
- **Dev server availability** (check port 5173 or 8080)

### Phase 2: Professional Test Case Generation (MANDATORY)
- Query `user_stories` table for SD
- For each user story, create Given-When-Then test scenarios
- Generate Playwright test files with proper test IDs
- **Prepare MCP test commands** for interactive validation (**NEW**)
- Define test data requirements and fixtures
- Map user stories to test coverage (must be 100%)

### Phase 3: E2E Test Execution (MANDATORY, NOT CONDITIONAL)

**Option A: MCP Interactive Testing** (PREFERRED for EXEC phase) (**NEW**)
- Use Playwright MCP for real-time user story validation
- Capture screenshots for each user story acceptance criteria
- Human verification of UI/UX correctness
- Evidence collection for handoff deliverables
- Faster iteration cycles during development

**Option B: Automated Playwright Suite** (REQUIRED for CI/CD)
- Execute Playwright E2E tests (ALL user stories)
- Capture screenshots on success
- Capture videos on failures
- Generate HTML test reports
- Store evidence in database

**Hybrid Approach** (RECOMMENDED):
1. During EXEC: Use MCP for interactive testing & verification
2. Before handoff: Run automated Playwright suite for comprehensive coverage
3. In CI/CD: Automated Playwright on every commit

### Phase 4: Evidence Collection
- Screenshots proving features work (MCP or automated)
- Test execution logs
- Playwright HTML reports
- Coverage metrics (user story validation %)
- Test infrastructure notes
- **MCP test session recordings** (**NEW**)

### Phase 5: Verdict & Testing Learnings
- Aggregate all results
- Calculate final verdict: PASS / CONDITIONAL_PASS / BLOCKED
- Generate recommendations for PLAN
- Document testing learnings for retrospective
- **Document MCP effectiveness** (**NEW**): What MCP commands worked best? What patterns emerged?
- Store in `sub_agent_execution_results` table with testing_learnings field

---

## Activation

**Automatic Triggers**:
- "coverage" keyword in any context
- "protected route" keyword
- "build error" keyword
- "test infrastructure" keyword
- "testing evidence" keyword
- "user stories" keyword
- "playwright" keyword
- **"mcp" keyword** (**NEW**)
- **"browser automation" keyword** (**NEW**)

**Manual Execution**:
```bash
# Standard E2E execution (MANDATORY)
node scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e

# Options (use sparingly)
--skip-build             # Skip build validation
--skip-migrations        # Skip migration checks
--no-auto-migrations     # Don't auto-execute migrations
```

---

## Success Criteria (UPDATED)

**PASS Verdict** requires:
- ✅ Build successful (or skipped)
- ✅ All migrations applied
- ✅ **ALL E2E tests pass (100% user stories validated via MCP OR automated tests)** (**MANDATORY**)
- ✅ Test evidence collected (MCP screenshots AND/OR Playwright report)
- ✅ No critical integration gaps

**CONDITIONAL_PASS** if:
- ⚠️ E2E tests pass but minor issues in edge cases
- ⚠️ Non-critical integration warnings
- ⚠️ Test infrastructure improvements identified but not blocking

**BLOCKED** if:
- ❌ Build fails
- ❌ Pending migrations not applied
- ❌ **ANY E2E test failures** (user stories not validated)
- ❌ Critical dependency conflicts
- ❌ MCP servers unavailable (fallback to manual Playwright)

---

## Database Integration (UPDATED)

Results stored in `sub_agent_execution_results` table:
- Overall verdict and confidence score
- Phase results (pre-flight, test generation, execution, evidence, learnings)
- Recommendations for EXEC agent
- **Testing learnings** (for continuous improvement, including MCP effectiveness)
- Test evidence URLs (MCP screenshots, Playwright reports, videos)
- User story coverage percentage (must be 100%)
- **MCP usage statistics** (**NEW**): Which MCP commands were used, success rates

---

## Continuous Improvement Framework (UPDATED)

**Goal**: Perfect the testing sub-agent through iterative learning

**Mechanisms**:
1. **Retrospective capture**: Testing learnings after each SD execution (including MCP usage)
2. **Script enhancement**: Improve `qa-engineering-director-enhanced.js` based on patterns
3. **Infrastructure building**: Add reusable Playwright helpers, fixtures, page objects, **and MCP command templates**
4. **Best practices documentation**: Capture effective test patterns (MCP + Playwright) in wiki
5. **Tooling improvements**: Add new Playwright reporters, visual regression, trace viewer usage, **MCP workflow optimization**

**Feedback Loop**:
```
SD Execution → Testing Challenges → Retrospective Captured →
Script Enhanced → Better Testing Next SD → Repeat
```

**Expected Evolution**:
- **v2.2** (current): MCP-first testing with manual Playwright fallback
- **v2.5** (next): Automated test generation from user stories with MCP command templates
- **v3.0** (future): AI-assisted test case creation, self-healing tests, visual regression automation with MCP orchestration

---

## Integration with Product Requirements Expert

**Workflow**:
1. **PLAN Phase**: Product Requirements Expert generates user stories → Stores in `user_stories` table
2. **PLAN Verification**: QA Director queries user stories → Creates professional test cases → Validates with MCP or Playwright
3. **Evidence**: Each user story must have corresponding passing E2E test(s) or MCP validation session
4. **Approval**: LEAD cannot approve SD without 100% user story validation

---

## Key Principles

**"MCP for iteration, Playwright for automation. Both for confidence."**

**"Smoke tests tell you if it loads. E2E tests tell you if it works. We require BOTH, with emphasis on E2E."**

**"Interactive testing (MCP) during development, automated testing (Playwright) for CI/CD, both for comprehensive coverage."**

---

---

## Common Playwright Pitfalls & Solutions (v2.3 Learnings)

### Lesson 1: Dialog/Modal Blocking All Tests

**Problem**: OnboardingTour or other global dialogs block ALL test interactions, causing 100% failure rate.

**Symptoms**:
```
Error: locator.click: Test timeout of 60000ms exceeded
<div data-state="open"...DialogOverlay... intercepts pointer events>
```

**Root Cause**: Dialog overlay intercepts all pointer events, preventing clicks on any element beneath it.

**Solution - Defense-in-Depth Approach**:

**Layer 1: Environment Detection in Component**
```typescript
// In OnboardingTour.tsx or similar dialog component
useEffect(() => {
  // Skip tour entirely in test/CI environments
  const isTestEnvironment =
    typeof window !== 'undefined' &&
    (window.Cypress ||
     navigator.webdriver ||  // ✅ CORRECT: Playwright sets this
     process.env.NODE_ENV === 'test');

  if (isTestEnvironment) {
    console.info('[OnboardingTour] Skipping tour in test environment');
    return; // Don't render dialog at all
  }

  // ... rest of dialog logic
}, []);
```

**⚠️ CRITICAL**: Use `navigator.webdriver` NOT `window.playwright` (doesn't exist!)

**Layer 2: Global Setup localStorage Flags**
```typescript
// In tests/setup/global-setup.ts
await page.evaluate(() => {
  localStorage.setItem('onboarding-tour-completed', 'true');
  localStorage.setItem('onboarding-tour-dont-show', 'true');
});
console.info('✅ Onboarding tour suppressed for E2E tests');
```

**Layer 3: Centralized Helper Function**
```typescript
// In tests/helpers/dialog-helpers.ts
export async function dismissOnboardingDialog(page: Page): Promise<void> {
  try {
    const dialog = page
      .locator('[role="dialog"]')
      .filter({ hasText: /welcome to the enhanced navigation/i });

    const isVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);

    if (isVisible) {
      console.info('[Dialog Helper] Onboarding dialog detected, dismissing...');
      const skipButton = page.getByRole('button', { name: /skip tour/i });
      await skipButton.click();

      // CRITICAL: Wait for dialog to actually disappear
      await dialog.waitFor({ state: 'hidden', timeout: 5000 });
      await page.waitForTimeout(500); // Animation complete

      console.info('[Dialog Helper] Onboarding dialog dismissed successfully');
    } else {
      console.info('[Dialog Helper] No onboarding dialog found');
    }
  } catch (error) {
    console.info('[Dialog Helper] Dialog already dismissed or not present');
  }
}
```

**Layer 4: Use Helper in Tests**
```typescript
import { dismissOnboardingDialog } from '../helpers/dialog-helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/settings');
  await waitForPageReady(page);

  // Dismiss onboarding dialog if present (blocks all interactions)
  await dismissOnboardingDialog(page);

  // Now safe to interact with page
});
```

**Why Defense-in-Depth Works**:
- Component check: Prevents dialog from rendering (fastest)
- localStorage: Backup if component check fails
- Helper function: Last resort if dialog still appears
- Proper waiting: Ensures dialog is fully dismissed before continuing

---

### Lesson 2: Slider/Input Testing - Keyboard > Mouse

**Problem**: Mouse clicks on sliders are unreliable, especially with discrete steps.

**Why Mouse Clicks Fail**:
```typescript
// ❌ BAD: Mouse click coordinates don't account for step constraints
const sliderBox = await slider.boundingBox();
await page.mouse.click(sliderBox.x + sliderBox.width * 0.8, ...);
// Expects 80% but slider has step={5}, so only 75%, 80%, 85% valid
// Click at "80% of width" ≠ "80% value" due to padding/margins
```

**Solution: Use Keyboard Navigation**
```typescript
// ✅ GOOD: Keyboard navigation respects step constraints
const warningSlider = page.locator('#warning-threshold');
await warningSlider.focus();
await page.waitForTimeout(200);

// Each ArrowRight moves by step value (e.g., 5%)
// From 50% to 80% with step={5} requires 6 presses
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
}

// Verify with range to account for discrete steps
await expect(page.getByText(/7[05]%|80%|8[05]%/)).toBeVisible();
```

**Input Fields: Direct Focus > Tab Navigation**
```typescript
// ❌ BAD: Tab navigation is fragile
await page.keyboard.press('Tab');
await page.keyboard.press('Tab'); // Might land on wrong element

// ✅ GOOD: Direct focus is reliable
const input = page.locator('#monthly-limit');
await input.waitFor({ state: 'visible', timeout: 10000 });
await input.focus();
await input.selectText(); // Clear existing value
await page.keyboard.type('125');
```

---

### Lesson 3: Selector Specificity & Strict Mode Violations

**Problem**: Text appears multiple times on page, causing "strict mode violation" errors.

**Symptoms**:
```
Error: strict mode violation: getByText('Monthly Budget Limit') resolved to 2 elements
```

**Solution Strategies**:

**Strategy 1: Use More Specific Role Selectors**
```typescript
// ❌ BAD: Generic text selector
await expect(page.getByText('LLM Budget Management')).toBeVisible();

// ✅ GOOD: Role-based selector
await expect(page.getByRole('heading', { name: /LLM Budget Management/i })).toBeVisible();
```

**Strategy 2: Use .first() for Known Duplicates**
```typescript
// ✅ GOOD: Acknowledge duplicates exist, test the first occurrence
await expect(page.getByText('Monthly Budget Limit').first()).toBeVisible();
await expect(page.getByText('Alert Thresholds').first()).toBeVisible();
```

**Strategy 3: Use Container Locators**
```typescript
// ✅ BEST: Scope to specific container
const budgetSection = page.locator('[data-testid="budget-section"]');
await expect(budgetSection.getByText('Monthly Budget Limit')).toBeVisible();
```

> **Complete Selector Guidelines**: For comprehensive selector best practices,
> naming conventions, and migration patterns, see:
> [`tests/e2e/SELECTOR-GUIDELINES.md`](../../tests/e2e/SELECTOR-GUIDELINES.md)
>
> This guide provides:
> - Full selector priority hierarchy (4 tiers)
> - data-testid naming conventions
> - Before/after refactoring examples
> - Anti-pattern catalog with alternatives
> - ESLint rules for automated enforcement

---

### Lesson 4: Test Structure Anti-Patterns

**Problem**: Tests check things already done in `beforeEach`, creating redundancy and timing issues.

**❌ BAD: Redundant Checks**
```typescript
test.beforeEach(async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('tab', { name: /LLM Budget/i }).click();
  await page.waitForTimeout(1000);
});

test('should display LLM Budget tab', async ({ page }) => {
  // ❌ Tab already clicked in beforeEach - this is redundant!
  await expect(page.getByRole('tab', { name: /LLM Budget/i })).toBeVisible();
});
```

**✅ GOOD: Test What Matters**
```typescript
test.beforeEach(async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('tab', { name: /LLM Budget/i }).click();
  await page.waitForTimeout(1000); // Tab content loads
});

test('should display LLM Budget tab content', async ({ page }) => {
  // ✅ Tab already clicked in beforeEach - verify content loads
  await expect(page.getByRole('heading', { name: /LLM Budget Management/i })).toBeVisible();
  await expect(page.getByText('Monthly Budget Limit').first()).toBeVisible();
  await expect(page.getByText('Alert Thresholds').first()).toBeVisible();
});
```

---

### Lesson 5: Component Design Validation Tests

**Problem**: Test expects error message, but component PREVENTS invalid state by design.

**Example: Dynamic Slider Constraints**
```typescript
// Component code (LLMBudgetSettings.tsx)
<Slider
  id="critical-threshold"
  min={warningThreshold + 5}  // Dynamic minimum prevents invalid state
  max={100}
  step={5}
  value={[criticalThreshold]}
/>

{criticalThreshold <= warningThreshold && (
  <Alert variant="destructive">
    Critical threshold must be higher than warning threshold
  </Alert>
)}
```

**❌ BAD: Test Expects Error Message (Impossible)**
```typescript
test('should validate threshold ordering', async ({ page }) => {
  // Try to set critical below warning
  // ... set critical to 70%, warning to 75% ...

  // ❌ This will never appear because slider prevents it!
  await expect(page.getByText(/Critical threshold must be higher/i)).toBeVisible();
});
```

**✅ GOOD: Test Prevention Mechanism Works**
```typescript
test('should validate threshold ordering', async ({ page }) => {
  // Set warning to 80%
  const warningSlider = page.locator('#warning-threshold');
  await warningSlider.focus();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('ArrowRight');
  }

  // Try to decrease critical below 85% (warning + 5%)
  const criticalSlider = page.locator('#critical-threshold');
  await criticalSlider.focus();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('ArrowLeft'); // Try to go lower
  }

  // ✅ Verify slider stopped at minimum allowed value (85%)
  await expect(page.getByText(/85%/)).toBeVisible();
});
```

**Key Insight**: When testing form validation, test BOTH:
1. **Preventive UX**: Component prevents invalid input (sliders with constraints, disabled buttons)
2. **Reactive Validation**: Component shows error messages when invalid input submitted

---

### Lesson 6: Global Setup Patterns for Test Environment

**Pattern: Configure Test Environment Once**

**File**: `tests/setup/global-setup.ts`

```typescript
async function globalSetup(config: FullConfig) {
  const authStatePath = path.join(__dirname, '../../.auth/user.json');

  // 1. Launch browser
  const browser = await chromium.launch({ headless: true, timeout: 60000 });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1366, height: 768 }
  });
  const page = await context.newPage();

  // 2. Authenticate (once for all tests)
  await authenticateUser(page, 3); // Retry mechanism

  // 3. Verify authentication works
  await page.goto('/ventures', { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/login')) {
    throw new Error('Authentication verification failed');
  }

  // 4. Configure test environment (localStorage flags)
  await page.evaluate(() => {
    localStorage.setItem('onboarding-tour-completed', 'true');
    localStorage.setItem('onboarding-tour-dont-show', 'true');
    // Add other test-specific flags here
  });
  console.info('✅ Test environment configured');

  // 5. Save auth state for all tests
  await saveAuthState(context, authStatePath);

  await browser.close();
}
```

**Benefits**:
- Authenticate once, reuse for all tests (saves 30-60s per test)
- Configure test environment globally (localStorage flags)
- Verify auth works before running tests
- Single source of truth for test configuration

---

### Lesson 7: Test Helper Patterns

**Pattern: Centralized, Reusable, Well-Documented**

**Structure**:
```
tests/
  ├── helpers/
  │   ├── dialog-helpers.ts      # Dialog dismissal, modal handling
  │   ├── wait-utils.ts          # Custom wait conditions
  │   ├── auth-helpers.ts        # Authentication utilities
  │   └── form-helpers.ts        # Form filling, validation checks
  ├── fixtures/
  │   ├── auth.ts               # Auth fixtures (credentials, tokens)
  │   └── test-data.ts          # Seed data for tests
  └── setup/
      ├── global-setup.ts       # Run once before all tests
      └── global-teardown.ts    # Run once after all tests
```

**Example: wait-utils.ts**
```typescript
export async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
    console.warn('Network not idle after 10s, proceeding anyway');
  });
}

export async function waitForToast(page: Page, message: RegExp, timeout = 10000): Promise<void> {
  await expect(page.getByText(message)).toBeVisible({ timeout });
}
```

**Benefits**:
- Don't reinvent the wheel in every test
- Consistent behavior across all tests
- Easy to update (change once, fixes everywhere)
- Self-documenting through function names

---

### Quick Reference: Test Debugging Checklist

When tests fail unexpectedly, check these common issues:

- [ ] **Dialog blocking interactions?** → Add `dismissOnboardingDialog()` to beforeEach
- [ ] **Slider not responding to mouse?** → Use keyboard navigation instead
- [ ] **"Strict mode violation" error?** → Use `.first()` or more specific role selectors
- [ ] **Test checking redundant things?** → Remove checks for actions done in beforeEach
- [ ] **Expecting error message that never appears?** → Component may prevent invalid state
- [ ] **Tab navigation landing on wrong element?** → Use direct `.focus()` instead
- [ ] **Toast not appearing?** → Increase timeout to 15s, check API is actually called
- [ ] **Auth redirects to login?** → Verify `.auth/user.json` has correct origin (localhost:8080)
- [ ] **Environment detection not working?** → Use `navigator.webdriver` not `window.playwright`

---

## Version History

- **v2.0**: Testing-First Edition - Mandatory E2E testing, comprehensive test generation
- **v2.1**: Repository Lessons - Dev mode over preview mode, dual test enforcement
- **v2.2**: MCP-First Edition - Playwright MCP and Puppeteer MCP integration as PREFERRED method
- **v2.3**: Common Pitfalls & Solutions - Dialog blocking, slider testing, selector specificity, validation patterns (based on SD-VIF-INTEL-001 testing learnings)
