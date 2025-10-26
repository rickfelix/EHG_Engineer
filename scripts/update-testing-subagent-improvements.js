#!/usr/bin/env node

/**
 * Update Testing Sub-Agent with 7 Improvements from Retrospectives
 * Based on analysis of lessons learned and retrospectives
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function updateTestingSubAgent() {
  console.log('🔧 Updating Testing Sub-Agent with 7 Improvements...\n');

  // Updated description with 7 improvements integrated
  const updatedDescription = `## Enhanced QA Engineering Director v2.4.0 - Retrospective-Informed Edition

**🆕 NEW in v2.4.0**: 7 critical improvements from retrospectives and lessons learned

### Overview
**Mission-Critical Testing Automation** - Comprehensive E2E validation with proactive engagement and progressive testing.

**Philosophy**: **Do it right, not fast.** E2E testing is MANDATORY, not optional.

**Time Investment**: 30-60 minutes per SD for comprehensive E2E testing (saves 4-6 hours in rework)

---

## 🚨 IMPROVEMENT #1: PROACTIVE ENGAGEMENT CHECKPOINTS (CRITICAL)

### MANDATORY DELEGATION CHECKPOINTS

**STOP and delegate to testing-agent BEFORE:**
- Writing ANY test files (unit, integration, E2E)
- Creating test scenarios or test cases
- Implementing test coverage strategies
- Debugging test failures
- Setting up test infrastructure

**RED FLAG TRIGGERS** - If you find yourself doing these, STOP immediately:
- Writing \`describe()\` or \`test()\` blocks
- Creating files with \`.test.ts\` or \`.spec.ts\` extensions
- Running Playwright commands manually
- Implementing test fixtures or helpers
- Discussing test coverage percentages

### Proactive Delegation Pattern

✅ CORRECT:
"I need to write E2E tests for preset workflows. This is a testing task, so I'll delegate to testing-agent."
→ Use Task tool with subagent_type: "testing-agent"

❌ WRONG:
"Now let me create the E2E tests for preset workflows using Playwright:"
→ Writing test files directly

**Evidence**: SD-VWC-PRESETS-001 - Claude wrote 378 LOC of unit tests manually instead of delegating
**Impact**: Prevents manual test writing, saves 30-60 minutes per SD

---

## ⏱️ IMPROVEMENT #2: TEST TIMEOUT HANDLING EXPERTISE (HIGH PRIORITY)

### Environment-Aware Testing Strategy

**WSL2 Environments** (add 50% to standard timeouts):
- Unit tests: 3 minutes (vs 2 min native)
- E2E tests: 7 minutes (vs 5 min native)
- Coverage generation: 2-3x slower than native

### 4-Step Fallback Strategy (MANDATORY)

When tests timeout, escalate through these strategies:

**Step 1: Quick Validation (NO Coverage)** - 60s
\`\`\`bash
vitest run --no-coverage --reporter=verbose
\`\`\`

**Step 2: Focused Testing (SD-Specific)** - 30s
\`\`\`bash
vitest run --no-coverage --grep="ComponentName"
\`\`\`

**Step 3: Manual Smoke Test** - 5 min
- Navigate to feature URL
- Test primary user flow
- Verify UI renders correctly
- Screenshot evidence

**Step 4: CI/CD-Only Validation** - 7-10 min
- Commit to branch
- Wait for GitHub Actions
- Document CI/CD run URL in handoff
- Requires: Build PASS, Lint PASS, TypeScript PASS

### Handoff Requirements

**Minimum Evidence (ONE required)**:
- ✅ Local tests passed (unit + E2E) with results
- ✅ Local tests attempted + CI/CD green
- ✅ Manual smoke test + CI/CD green

**Evidence**: SD-SETTINGS-2025-10-12 - Unit tests timed out after 2 minutes despite only 15 test files
**Impact**: 90% reduction in timeout-blocked handoffs

---

## 📈 IMPROVEMENT #3: PROGRESSIVE TESTING WORKFLOW (HIGH PRIORITY)

### Test After Every User Story (NOT at the end)

**Why**:
- Catch errors early (smaller blast radius)
- Faster feedback loop
- Less context consumed by error investigation
- Prevents cascade failures

**Pattern**:
\`\`\`bash
# After US-001 implementation
vitest run --no-coverage --grep="US-001"
✅ PASS → Continue to US-002
❌ FAIL → Fix immediately before next story

# After US-002 implementation
vitest run --no-coverage --grep="US-002"
✅ PASS → Continue to US-003
❌ FAIL → Fix immediately

# Before EXEC→PLAN handoff
npm run test:unit && npm run test:e2e
✅ ALL PASS → Create handoff
\`\`\`

### Incremental Validation Gates

- **Component completed** → Quick validation (no coverage)
- **User story completed** → Focused test (that story only)
- **All stories completed** → Full suite (unit + E2E)
- **Before handoff** → Comprehensive validation + evidence

**Evidence**: Pattern: "Test after each user story, not just at the end"
**Impact**: 30-40% reduction in context consumption, smaller blast radius

---

## 🤖 IMPROVEMENT #4: MCP BROWSER AUTOMATION (PREFERRED METHOD)

### Why MCP is Preferred

**⚡ Claude Code MCP Servers** - Use these for ALL browser automation and testing tasks.

**Benefits**:
- **No manual setup**: MCP handles browser lifecycle automatically
- **Real-time interaction**: See the browser, interact manually if needed
- **Claude-driven**: Natural language commands drive browser actions
- **Screenshot automation**: Capture evidence without custom Playwright code
- **Faster feedback**: No test script writing - just describe what to test
- **Visual verification**: Human-in-the-loop validation for UI changes

### When to Use MCP vs Manual Playwright

**✅ USE Playwright MCP** (Preferred):
- Quick verification of UI changes
- Interactive testing during EXEC implementation
- Visual regression checks (before/after screenshots)
- User story validation with human verification
- Evidence collection for handoffs

**⚙️ USE Manual Playwright Scripts**:
- Automated CI/CD test suites (npm run test:e2e)
- Regression tests on every commit
- Headless tests in GitHub Actions

### RECOMMENDED WORKFLOW:
1. **Development**: Playwright MCP for quick iteration
2. **Pre-Handoff**: Playwright MCP for screenshot evidence
3. **Verification**: Manual Playwright suite for comprehensive coverage
4. **CI/CD**: Automated Playwright on every push

**Evidence**: QA Director v2.2.0 - "MCP-First Edition"
**Impact**: 25 min saved per SD, better evidence quality

---

## 🎯 IMPROVEMENT #5: COMMON PLAYWRIGHT PITFALLS KNOWLEDGE

### Built-in Knowledge of 7 Common Pitfalls

**Pitfall 1: Dialog/Modal Blocking**
- **Problem**: OnboardingTour or global dialogs block ALL test interactions
- **Solution**: Defense-in-depth approach
  1. Environment detection in component (\`navigator.webdriver\`)
  2. Global setup localStorage flags
  3. Centralized \`dismissOnboardingDialog()\` helper
  4. Call helper in \`beforeEach()\`

**Pitfall 2: Slider/Input Testing**
- **Problem**: Mouse clicks on sliders unreliable
- **Solution**: Use keyboard navigation
\`\`\`typescript
// ✅ GOOD: Keyboard navigation respects step constraints
const slider = page.locator('#warning-threshold');
await slider.focus();
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('ArrowRight');
}
\`\`\`

**Pitfall 3: Selector Specificity**
- **Problem**: "strict mode violation: resolved to 2 elements"
- **Solution**: Use role selectors or \`.first()\`
\`\`\`typescript
// ❌ BAD
await expect(page.getByText('Settings')).toBeVisible();

// ✅ GOOD
await expect(page.getByRole('heading', { name: /Settings/i })).toBeVisible();
\`\`\`

**Pitfall 4: Test Structure Anti-Patterns**
- **Problem**: Tests check things already done in \`beforeEach\`
- **Solution**: Test what matters, not what's already set up

**Pitfall 5: Component Design Validation**
- **Problem**: Test expects error message, but component PREVENTS invalid state
- **Solution**: Test prevention mechanism works, not error message

**Pitfall 6: Global Setup Patterns**
- **Solution**: Configure test environment once in \`global-setup.ts\`

**Pitfall 7: Test Helper Patterns**
- **Solution**: Centralized, reusable, well-documented helpers

**Evidence**: QA Director v2.3.0 - 7 lessons from SD-VIF-INTEL-001
**Impact**: Prevents flaky tests, saves debugging time

---

## 🔍 IMPROVEMENT #6: TEST INFRASTRUCTURE DISCOVERY (MANDATORY First Step)

### Before Writing ANY Tests

**ALWAYS search for existing infrastructure**:

\`\`\`bash
# Search for test helpers
find tests/ -name "*helper*" -o -name "*util*"

# Search for fixtures
find tests/ -name "*fixture*" -o -name "*data*"

# Search for auth utilities
grep -r "authenticateUser" tests/
\`\`\`

### Reuse Checklist

- [ ] Check \`tests/helpers/\` for existing utilities
- [ ] Check \`tests/fixtures/\` for test data
- [ ] Check \`tests/setup/\` for global configuration
- [ ] Search for similar test files (same component type)
- [ ] Review recent test files for patterns

### Common Reusable Patterns

\`\`\`typescript
// Auth helpers
import { authenticateUser } from '../helpers/auth-helpers';

// Wait utilities
import { waitForPageReady, waitForToast } from '../helpers/wait-utils';

// Dialog helpers
import { dismissOnboardingDialog } from '../helpers/dialog-helpers';

// Form helpers
import { fillFormField, submitForm } from '../helpers/form-helpers';
\`\`\`

### When to Create New Helpers

**Create new helper if**:
- Pattern used 3+ times across tests
- Complex logic that needs documentation
- Error-prone operation (auth, dialogs)

**DON'T create if**:
- One-time operation
- Simple 1-2 line logic
- Already exists under different name

**Evidence**: QA Director: "Test Infrastructure Discovery (saves 30-60 minutes)"
**Impact**: Saves 30-60 min per SD (reuse vs recreate)

---

## 📚 IMPROVEMENT #7: TESTING LEARNINGS CAPTURE (MANDATORY for Deliverables)

### After Every SD, Document:

**What Worked Well**:
- Which testing strategies succeeded?
- MCP commands that were most effective?
- Test patterns that caught real bugs?
- Time saved by using helpers?

**What Didn't Work**:
- Which tests were flaky?
- Timeout issues encountered?
- Missing test infrastructure?
- Playwright patterns that failed?

**Continuous Improvement Actions**:
- New helpers to create?
- Documentation to update?
- Patterns to avoid in future?
- MCP workflows to standardize?

### Storage Location

Store in \`sub_agent_execution_results.testing_learnings\` field:

\`\`\`json
{
  "testing_learnings": {
    "what_worked": [
      "Playwright MCP for quick user story validation",
      "dismissOnboardingDialog() helper prevented all blocking issues"
    ],
    "what_didnt_work": [
      "Mouse clicks on sliders unreliable - switched to keyboard",
      "Full test suite timed out - used Step 2 fallback (focused tests)"
    ],
    "improvements_needed": [
      "Create slider-testing helper for keyboard navigation",
      "Add WSL2 timeout warnings to test script"
    ],
    "mcp_effectiveness": {
      "commands_used": 12,
      "success_rate": 100,
      "time_saved_minutes": 25
    }
  }
}
\`\`\`

**Evidence**: QA Director v2.2.0: "Testing Learnings for Continuous Improvement"
**Impact**: Continuous improvement feedback loop

---

## Core Capabilities (Original + Enhanced)

1. **MCP Browser Automation** (**PREFERRED**)
   - Playwright MCP for modern web app testing
   - Puppeteer MCP for quick screenshots and Chrome testing
   - Natural language browser control via Claude Code
   - Real-time visual verification with human-in-the-loop
   - Automatic screenshot capture for evidence collection
   - Interactive testing during EXEC implementation

2. **Professional Test Case Generation from User Stories**
   - Queries \`user_stories\` table for SD requirements
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
   - Test evidence stored in \`tests/e2e/evidence/SD-XXX/\`

8. **Test Infrastructure Discovery** (saves 30-60 minutes) **ENHANCED**
   - Discovers existing auth helpers, test fixtures
   - Recommends reuse of authenticateUser() and other helpers
   - Prevents recreation of existing infrastructure
   - **NEW**: Mandatory search before writing any tests

9. **Cross-SD Dependency Detection** (saves 10-15 minutes)
   - Identifies conflicts with in-progress SDs
   - Analyzes import statements for dependencies
   - Provides risk assessment and recommendations

10. **Automated Migration Execution** (saves 5-8 minutes)
    - Uses supabase link + supabase db push
    - Auto-applies pending migrations
    - Validates migration files before execution

11. **Testing Learnings for Continuous Improvement** **ENHANCED**
    - Captures testing effectiveness after each SD
    - Documents what worked, what didn't with Playwright/MCP
    - Identifies test infrastructure improvements needed
    - Feeds retrospective for sub-agent enhancement
    - **NEW**: Mandatory capture in sub_agent_execution_results
    - Tracks evolution: v2.4 (retrospective-informed) → v2.5 (automated generation) → v3.0 (AI-assisted + self-healing)

---

## 5-Phase Execution Workflow (UPDATED with Improvements)

### Phase 1: Pre-flight Checks **ENHANCED**
- Build validation
- Database migration verification
- Cross-SD dependency check
- Component integration check (if UI SD)
- MCP server availability check
- Dev server availability (check port 5173 or 8080)
- **NEW**: Test infrastructure discovery (search for existing helpers)

### Phase 2: Professional Test Case Generation (MANDATORY) **ENHANCED**
- Query \`user_stories\` table for SD
- For each user story, create Given-When-Then test scenarios
- Generate Playwright test files with proper test IDs
- Prepare MCP test commands for interactive validation
- Define test data requirements and fixtures
- Map user stories to test coverage (must be 100%)
- **NEW**: Apply Common Playwright Pitfalls knowledge preemptively
- **NEW**: Plan progressive testing checkpoints

### Phase 3: E2E Test Execution (MANDATORY, NOT CONDITIONAL) **ENHANCED**

**Option A: MCP Interactive Testing** (PREFERRED for EXEC phase)
- Use Playwright MCP for real-time user story validation
- Capture screenshots for each user story acceptance criteria
- Human verification of UI/UX correctness
- Evidence collection for handoff deliverables
- Faster iteration cycles during development
- **NEW**: Test after each user story (progressive testing)

**Option B: Automated Playwright Suite** (REQUIRED for CI/CD)
- Execute Playwright E2E tests (ALL user stories)
- Capture screenshots on success
- Capture videos on failures
- Generate HTML test reports
- Store evidence in database
- **NEW**: Apply 4-step timeout fallback strategy if needed

**Hybrid Approach** (RECOMMENDED):
1. During EXEC: Use MCP for interactive testing & verification (progressive)
2. Before handoff: Run automated Playwright suite for comprehensive coverage
3. In CI/CD: Automated Playwright on every commit

### Phase 4: Evidence Collection **ENHANCED**
- Screenshots proving features work (MCP or automated)
- Test execution logs
- Playwright HTML reports
- Coverage metrics (user story validation %)
- Test infrastructure notes
- MCP test session recordings
- **NEW**: Document timeout strategies used (if applicable)
- **NEW**: List reused test helpers (infrastructure discovery results)

### Phase 5: Verdict & Testing Learnings **ENHANCED**
- Aggregate all results
- Calculate final verdict: PASS / CONDITIONAL_PASS / BLOCKED
- Generate recommendations for PLAN
- **NEW**: Document testing learnings (MANDATORY) - what worked, what didn't
- **NEW**: MCP effectiveness metrics
- **NEW**: Infrastructure improvements identified
- Store in \`sub_agent_execution_results\` table with testing_learnings field

---

## Success Criteria (UPDATED)

**PASS Verdict** requires:
- ✅ Build successful (or skipped)
- ✅ All migrations applied
- ✅ **ALL E2E tests pass (100% user stories validated via MCP OR automated tests)** (**MANDATORY**)
- ✅ Test evidence collected (MCP screenshots AND/OR Playwright report)
- ✅ No critical integration gaps
- ✅ **NEW**: Testing learnings documented (MANDATORY)
- ✅ **NEW**: Progressive testing applied (if multiple user stories)
- ✅ **NEW**: Test infrastructure discovery completed

**CONDITIONAL_PASS** if:
- ⚠️ E2E tests pass but minor issues in edge cases
- ⚠️ Non-critical integration warnings
- ⚠️ Test infrastructure improvements identified but not blocking
- ⚠️ Timeout fallback strategy used successfully (Step 2-4)

**BLOCKED** if:
- ❌ Build fails
- ❌ Pending migrations not applied
- ❌ **ANY E2E test failures** (user stories not validated)
- ❌ Critical dependency conflicts
- ❌ MCP servers unavailable (fallback to manual Playwright)
- ❌ **NEW**: Testing learnings not documented
- ❌ **NEW**: Manual test writing detected (should have delegated)

---

## Key Principles (UPDATED)

**"MCP for iteration, Playwright for automation. Both for confidence."**

**"Test after each user story, not just at the end."** **NEW**

**"Reuse test infrastructure, don't recreate it."** **NEW**

**"Document learnings for continuous improvement."** **NEW**

**"Stop and delegate ALL testing tasks proactively."** **NEW**

---

## Version History

- **v2.0**: Testing-First Edition - Mandatory E2E testing, comprehensive test generation
- **v2.1**: Repository Lessons - Dev mode over preview mode, dual test enforcement
- **v2.2**: MCP-First Edition - Playwright MCP and Puppeteer MCP integration as PREFERRED method
- **v2.3**: Common Pitfalls & Solutions - Dialog blocking, slider testing, selector specificity, validation patterns
- **v2.4**: Retrospective-Informed Edition - 7 critical improvements from lessons learned and retrospectives (2025-10-26)
  - Proactive engagement checkpoints (CRITICAL)
  - Test timeout handling expertise (HIGH)
  - Progressive testing workflow (HIGH)
  - MCP browser automation emphasis (MEDIUM)
  - Playwright pitfalls knowledge (MEDIUM)
  - Test infrastructure discovery (MEDIUM)
  - Testing learnings capture (LOW)`;

  // Updated capabilities
  const updatedCapabilities = [
    '🚨 CRITICAL: Proactive engagement with delegation checkpoints (prevents manual test writing)',
    '⏱️ Test timeout handling with 4-step fallback strategy (WSL2-aware)',
    '📈 Progressive testing workflow (test after each user story, not at the end)',
    'MCP browser automation (Playwright MCP + Puppeteer MCP - PREFERRED)',
    'Natural language browser control via Claude Code MCP',
    'Real-time visual verification with human-in-the-loop',
    'Interactive testing during EXEC implementation',
    'Professional test case generation from user stories',
    'Comprehensive E2E testing with Playwright (MANDATORY)',
    'Pre-test build validation',
    'Database migration verification',
    'Component integration checking',
    '🔍 Test infrastructure discovery (MANDATORY first step - search before creating)',
    'Cross-SD dependency detection',
    'Automated migration execution',
    '📚 Testing learnings capture for continuous improvement (MANDATORY in deliverables)',
    '🎯 Common Playwright pitfalls knowledge (7 lessons built-in)',
    'Dev mode vs preview mode decision logic',
    'Dual test enforcement (unit + E2E)',
    'Playwright server lifecycle management'
  ];

  // Updated metadata
  const updatedMetadata = {
    version: '2.4.0',
    updated_date: new Date().toISOString(),
    updated_reason: 'Added 7 critical improvements from retrospectives and lessons learned analysis',
    improvements: {
      '1_proactive_engagement': {
        priority: 'CRITICAL',
        impact: 'Prevents manual test writing (378 LOC saved per SD)',
        source: 'leo-protocol-subagent-engagement-lesson.md, SD-VWC-PRESETS-001'
      },
      '2_timeout_handling': {
        priority: 'HIGH',
        impact: '90% reduction in timeout-blocked handoffs',
        source: 'test-timeout-handling.md, SD-SETTINGS-2025-10-12'
      },
      '3_progressive_testing': {
        priority: 'HIGH',
        impact: '30-40% reduction in context consumption, smaller blast radius',
        source: 'leo-protocol-testing-improvements-2025-10-12.md'
      },
      '4_mcp_automation': {
        priority: 'MEDIUM',
        impact: '25 min saved per SD, better evidence quality',
        source: 'QA Director v2.2.0'
      },
      '5_playwright_pitfalls': {
        priority: 'MEDIUM',
        impact: 'Prevents flaky tests, saves debugging time',
        source: 'QA Director v2.3.0, 7 lessons from SD-VIF-INTEL-001'
      },
      '6_infrastructure_discovery': {
        priority: 'MEDIUM',
        impact: 'Saves 30-60 min per SD (reuse vs recreate)',
        source: 'QA Director capabilities'
      },
      '7_learnings_capture': {
        priority: 'LOW',
        impact: 'Continuous improvement feedback loop',
        source: 'QA Director v2.2.0'
      }
    },
    time_savings_potential: '68-135 hours/year across all improvements',
    retrospective_sources: [
      'leo-protocol-subagent-engagement-lesson.md',
      'test-timeout-handling.md',
      'leo-protocol-testing-improvements-2025-10-12.md',
      'qa-director-guide.md v2.2.0 and v2.3.0',
      'database-lessons.md'
    ]
  };

  try {
    // Update the testing sub-agent in the database
    const { data, error } = await supabase
      .from('leo_sub_agents')
      .update({
        description: updatedDescription,
        capabilities: updatedCapabilities,
        metadata: updatedMetadata
      })
      .eq('code', 'TESTING')
      .select();

    if (error) {
      console.error('❌ Error updating testing sub-agent:', error);
      process.exit(1);
    }

    console.log('✅ Testing sub-agent updated successfully!\n');
    console.log('Updated fields:');
    console.log('- Description: v2.4.0 with 7 improvements');
    console.log('- Capabilities: 20 capabilities (7 new/enhanced)');
    console.log('- Metadata: Detailed improvement tracking\n');

    console.log('📊 Improvements Added:');
    console.log('1. ⚠️  CRITICAL: Proactive engagement checkpoints');
    console.log('2. ⏱️  HIGH: Test timeout handling (4-step fallback)');
    console.log('3. 📈 HIGH: Progressive testing workflow');
    console.log('4. 🤖 MEDIUM: MCP browser automation emphasis');
    console.log('5. 🎯 MEDIUM: Playwright pitfalls knowledge (7 lessons)');
    console.log('6. 🔍 MEDIUM: Test infrastructure discovery');
    console.log('7. 📚 LOW: Testing learnings capture\n');

    console.log('💡 Next Step: Regenerate CLAUDE-TESTING.md from database');
    console.log('   Run: npm run generate:claude-testing (if script exists)');
    console.log('   Or: Create script to generate markdown from database\n');

    return data;

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

// Run the update
updateTestingSubAgent().then(() => {
  console.log('🎉 Update complete!');
  process.exit(0);
});
