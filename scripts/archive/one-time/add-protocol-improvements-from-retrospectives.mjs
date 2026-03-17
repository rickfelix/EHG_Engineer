#!/usr/bin/env node
/**
 * Add Protocol Improvements from Retrospective Analysis
 *
 * Based on analysis of 15 recent retrospectives (79 total), this script implements
 * 5 critical protocol improvements addressing the 3 most common gaps:
 * 1. Testing enforcement (12 mentions)
 * 2. User story validation (multiple SDs)
 * 3. Sub-agent auto-triggering (2 SDs)
 *
 * Evidence: SD-EXPORT-001, SD-EVA-MEETING-001, SD-EVA-MEETING-002, SD-AGENT-ADMIN-002
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function addProtocolImprovements() {
  console.log('🔧 Adding Protocol Improvements from Retrospective Analysis\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Evidence: 15 retrospectives analyzed');
  console.log('Critical Gaps: Testing (12x), User Stories (3x), Sub-agents (2x)');
  console.log('═══════════════════════════════════════════════════════════\n');

  let successCount = 0;
  let errorCount = 0;

  // ============================================================================
  // 1. UPDATE: Enhance EXEC Dual Test Requirement (ID: 34)
  // ============================================================================

  console.log('1️⃣  Updating EXEC Dual Test Requirement section...');

  const enhancedDualTestContent = `## EXEC Dual Test Requirement


### ⚠️ MANDATORY: Dual Test Execution

**CRITICAL**: "Smoke tests" means BOTH test types, not just one!

**Evidence**: SD-EXPORT-001 - Tests existed but weren't executed. 30-minute gap between "complete" and validation. SD-EVA-MEETING-002 - 67% E2E failure rate when finally run.

Before creating EXEC→PLAN handoff, EXEC MUST run:

#### 1. Unit Tests (Business Logic Validation)
\`\`\`bash
cd ../ehg
npm run test:unit
\`\`\`
- **What it validates**: Service layer, business logic, data transformations
- **Failure means**: Core functionality is broken
- **Required for**: EXEC→PLAN handoff
- **Framework**: Vitest

#### 2. E2E Tests (UI/Integration Validation)
\`\`\`bash
cd ../ehg
npm run test:e2e
\`\`\`
- **What it validates**: User flows, component rendering, integration
- **Failure means**: User-facing features don't work
- **Required for**: EXEC→PLAN handoff
- **Framework**: Playwright

#### Verification Checklist
- [ ] Unit tests executed: \`npm run test:unit\`
- [ ] Unit tests passed: [X/X tests]
- [ ] E2E tests executed: \`npm run test:e2e\`
- [ ] E2E tests passed: [X/X tests]
- [ ] Both test types documented in EXEC→PLAN handoff
- [ ] Screenshots captured for E2E test evidence
- [ ] Test results included in handoff "Deliverables Manifest"

**❌ BLOCKING**: Cannot create EXEC→PLAN handoff without BOTH test types passing.

**Common Mistakes** (from SD-EXPORT-001):
- ❌ "Tests exist" ≠ "Tests passed"
- ❌ Running only E2E tests and claiming "all tests passed"
- ❌ Marking SD complete before running any tests
- ❌ Creating handoff without test evidence documentation
- ✅ Run BOTH unit AND E2E tests explicitly
- ✅ Document pass/fail counts in handoff
- ✅ Include screenshots for visual evidence

### Why This Matters
- **SD-EXPORT-001**: 30-minute gap between marking "complete" and discovering tests weren't run
- **SD-EVA-MEETING-002**: 67% E2E failure rate revealed only when tests finally executed
- **Impact**: Testing enforcement prevents claiming "done" without proof`;

  try {
    const { error: updateError1 } = await supabase
      .from('leo_protocol_sections')
      .update({ content: enhancedDualTestContent })
      .eq('id', 34);

    if (updateError1) {
      console.error('   ❌ Error:', updateError1.message);
      errorCount++;
    } else {
      console.log('   ✅ Updated EXEC Dual Test Requirement (ID: 34)');
      successCount++;
    }
  } catch (err) {
    console.error('   ❌ Exception:', err.message);
    errorCount++;
  }

  // ============================================================================
  // 2. UPDATE: Expand 5-Step SD Evaluation to 6 Steps (ID: 19)
  // ============================================================================

  console.log('\n2️⃣  Expanding 5-Step SD Evaluation Checklist to 6 Steps...');

  const expandedChecklistContent = `## 5-Step SD Evaluation Checklist

**MANDATORY**: All agents (LEAD, PLAN) MUST complete these steps when evaluating a Strategic Directive:

### Step 1: Query SD Metadata
\`\`\`javascript
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', 'SD-XXX')
  .single();
\`\`\`

**Extract**: title, status, priority, progress, current_phase, scope, category, target_application

### Step 2: Check for Existing PRD
\`\`\`javascript
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('directive_id', 'SD-XXX');
\`\`\`

**If exists**: Review PRD objectives, features, acceptance criteria
**If missing**: PRD creation required (PLAN responsibility)

### Step 3: Query Backlog Items ✅ CRITICAL
\`\`\`javascript
const { data: backlogItems } = await supabase
  .from('sd_backlog_map')
  .select('*')
  .eq('sd_id', 'SD-XXX')
  .order('priority', { ascending: false })
  .order('sequence_no', { ascending: true });
\`\`\`

**Review for EACH item**:
- \`backlog_title\`: Short description
- \`item_description\`: Additional context
- \`extras.Description_1\`: **Detailed feature description** (MOST IMPORTANT)
- \`priority\`: High/Medium/Low
- \`description_raw\`: Must Have/Nice to Have/Future
- \`completion_status\`: NOT_STARTED/IN_PROGRESS/COMPLETED
- \`phase\`: Discovery/Planning/Development/Launch
- \`stage_number\`: Sequence in overall backlog
- \`extras.Page Category_1\`: Feature category
- \`extras.Category\`: Business category

**Why Critical**: Backlog items contain the ACTUAL requirements. SD metadata may be generic; backlog items have specifics.

### Step 4: Search Codebase for Existing Infrastructure
\`\`\`bash
# Search for related services
find . -name "*service*.ts" -o -name "*Service.ts" | grep -i [feature-name]

# Search for UI components
find . -name "*.tsx" -o -name "*.jsx" | grep -i [feature-name]

# Check routing
grep -r "/[route-name]" src/App.tsx src/routes/
\`\`\`

**Document**:
- Existing files (paths, line counts, capabilities)
- Mock data vs real data
- Database tables expected vs existing
- UI components complete vs partial

### Step 5: Gap Analysis
**Compare**: Backlog requirements vs Existing infrastructure

**Identify**:
1. ✅ **Satisfied**: Backlog items fully met by existing code
2. ⚠️ **Partial**: Existing code needs integration/configuration
3. ❌ **Missing**: Backlog items require new implementation
4. 🔄 **Mismatch**: Existing code does different things than backlog requests

**Output**: Scope recommendation
- **Option A**: Implement all backlog items (high effort)
- **Option B**: Connect/configure existing infrastructure (low effort)
- **Option C**: Hybrid (phase existing code, defer new features)

### Step 6: Execute QA Smoke Tests ✅ NEW

**Evidence**: SD-EXPORT-001 - "5-step checklist comprehensive but missing testing"

**CRITICAL**: Before approving ANY SD as complete, verify tests have been executed.

\`\`\`javascript
// For LEAD or PLAN agents evaluating SD completion
const { data: testResults } = await supabase
  .from('sub_agent_execution_results')
  .select('*')
  .eq('sd_id', sd_id)
  .eq('sub_agent_code', 'TESTING')
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

if (!testResults || testResults.verdict !== 'PASS') {
  throw new Error('Cannot approve SD without passing test evidence');
}
\`\`\`

**Checklist**:
- [ ] Unit tests executed and passed
- [ ] E2E tests executed and passed
- [ ] Test evidence documented (screenshots, reports)
- [ ] Coverage meets minimum threshold (50% unit, 100% user story coverage for E2E)
- [ ] QA Engineering Director sub-agent executed
- [ ] Test results stored in database

**Why Added**:
- **SD-EXPORT-001**: "Done-done definition ignored" - tests existed but weren't run before approval
- **Impact**: Prevents 30-minute gap between claiming complete and discovering test failures

---

## Common Mistakes to Avoid

❌ **Skipping backlog review**: Leads to scope misunderstandings
❌ **Assuming SD description = full scope**: Backlog has the details
❌ **Not checking completion_status**: May duplicate completed work
❌ **Ignoring priority conflicts**: \`priority: High\` but \`description_raw: Nice to Have\`
❌ **Missing extras.Description_1**: This field has the most detailed requirements
❌ **Approving SD without test evidence**: Step 6 MANDATORY (added based on retrospectives)

## Example: SD-041 Analysis

**Step 1**: SD-041 = "Knowledge Base: Consolidated", status: active, priority: high, 30% complete
**Step 2**: No PRD exists
**Step 3**: 2 backlog items found:
  - Item #62: "Define Cloning Process for Venture Ideation" (Low priority, Must Have)
  - Item #290: "AI-Powered Knowledge Base & Help Docs" (High priority, Nice to Have)
**Step 4**: Found 698-line knowledgeManagementService.ts + 1,300 lines UI (mock data)
**Step 5**: Gap = Backlog requests competitive intelligence + AI docs; existing code does pattern recognition
**Step 6**: No test evidence found → BLOCKS approval

**Result**: Scope mismatch identified + Testing gap → LEAD decision required before proceeding`;

  try {
    const { error: updateError2 } = await supabase
      .from('leo_protocol_sections')
      .update({
        title: '6-Step SD Evaluation Checklist',
        content: expandedChecklistContent
      })
      .eq('id', 19);

    if (updateError2) {
      console.error('   ❌ Error:', updateError2.message);
      errorCount++;
    } else {
      console.log('   ✅ Updated SD Evaluation Checklist to 6 Steps (ID: 19)');
      successCount++;
    }
  } catch (err) {
    console.error('   ❌ Exception:', err.message);
    errorCount++;
  }

  // ============================================================================
  // 3. INSERT: Sub-Agent Auto-Trigger Enforcement (NEW)
  // ============================================================================

  console.log('\n3️⃣  Adding Sub-Agent Auto-Trigger Enforcement section...');

  const subAgentEnforcementSection = {
    protocol_id: 'leo-v4-2-0-story-gates',
    title: 'Sub-Agent Auto-Trigger Enforcement (MANDATORY)',
    section_type: 'guide',
    order_index: 156,
    content: `## Sub-Agent Auto-Trigger Enforcement (MANDATORY)

**Evidence**: SD-EXPORT-001, SD-EVA-MEETING-001 - "QA sub-agent never triggered during initial evaluation" and "No automatic trigger for Product Requirements Expert sub-agent"

**CRITICAL**: Sub-agents MUST be triggered automatically, not manually.

### Problem Statement

From retrospectives:
- **SD-EXPORT-001**: "Protocol says 'trigger sub-agents' but wasn't enforced"
- **Impact**: Manual human intervention required to remember testing
- **Result**: 30-minute gap between "complete" and discovering no tests run

### Automated Sub-Agent Triggers

#### EXEC Phase Completion Checklist
Before creating EXEC→PLAN handoff:

1. **QA Engineering Director** - MANDATORY ⚠️
   - **Trigger**: \`EXEC_IMPLEMENTATION_COMPLETE\`
   - **Must run**: Before handoff creation
   - **Blocks**: Handoff if tests fail
   - **Script**: \`node scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e\`

2. **Product Requirements Expert** - AUTO
   - **Trigger**: PRD creation event
   - **Validates**: User stories exist
   - **Blocks**: PLAN→EXEC handoff if missing
   - **Script**: Auto-triggered on PRD insert

3. **Continuous Improvement Coach** - AUTO
   - **Trigger**: SD status = completed
   - **Generates**: Retrospective
   - **Required**: For final closure
   - **Script**: Auto-triggered on SD completion

### Enforcement Mechanism

#### EXEC→PLAN Handoff Script Verification

\`\`\`javascript
// In unified-handoff-system.js or create-exec-to-plan-handoff.js

// MANDATORY: Check for QA execution before allowing handoff
const { data: qaResults } = await supabase
  .from('sub_agent_execution_results')
  .select('*')
  .eq('sd_id', sd_id)
  .eq('sub_agent_code', 'TESTING')
  .order('created_at', { ascending: false })
  .limit(1);

if (!qaResults || qaResults.length === 0) {
  console.error('❌ BLOCKED: QA Engineering Director must run before EXEC→PLAN handoff');
  console.error('   Run: node scripts/qa-engineering-director-enhanced.js ' + sd_id + ' --full-e2e');
  process.exit(1);
}

if (qaResults[0].verdict === 'BLOCKED') {
  console.error('❌ BLOCKED: QA Director verdict is BLOCKED - cannot proceed with handoff');
  console.error('   Reason:', qaResults[0].recommendations);
  process.exit(1);
}

console.log('✅ QA Director verification passed');
\`\`\`

### Anti-Patterns

❌ **"I'll manually trigger QA later"** - Never acceptable
❌ **"Tests can wait until after handoff"** - Blocks handoff creation
❌ **"QA is optional for small changes"** - MANDATORY for ALL implementations
❌ **"I'll just document that tests are needed"** - Tests must be EXECUTED, not planned

✅ **QA sub-agent runs automatically via trigger**
✅ **Handoff creation blocked if QA not run**
✅ **Manual override requires LEAD approval**

### Manual Override (Emergency Only)

If absolutely necessary (infrastructure issues, test environment down):

\`\`\`bash
# Create handoff with override flag
node scripts/unified-handoff-system.js execute EXEC-to-PLAN <SD-ID> --override-qa

# Requires:
# 1. LEAD explicit approval
# 2. Documentation of why QA couldn't run
# 3. Plan to run QA before PLAN→LEAD handoff
\`\`\`

### Success Criteria

- **Zero** SDs approved without test evidence
- **Zero** "I forgot to run QA" incidents
- **100%** QA sub-agent execution before EXEC→PLAN handoffs

### ROI from Retrospectives

- **Time saved**: 30 minutes per SD (avoids gap between "complete" and validation)
- **Quality improvement**: 67% E2E failure rate caught earlier (SD-EVA-MEETING-002)
- **Protocol compliance**: Reduces "worked outside protocol" incidents from 3 to 0`,
    metadata: {
      evidence_sds: ['SD-EXPORT-001', 'SD-EVA-MEETING-001'],
      lesson_learned: 'Sub-agents must trigger automatically with enforcement, not rely on memory',
      impact: 'Prevents testing gaps that cause 30-60 minute rework cycles'
    }
  };

  try {
    const { data: insertData1, error: insertError1 } = await supabase
      .from('leo_protocol_sections')
      .insert(subAgentEnforcementSection)
      .select();

    if (insertError1) {
      console.error('   ❌ Error:', insertError1.message);
      errorCount++;
    } else {
      console.log('   ✅ Added Sub-Agent Auto-Trigger Enforcement (ID: ' + insertData1[0].id + ')');
      successCount++;
    }
  } catch (err) {
    console.error('   ❌ Exception:', err.message);
    errorCount++;
  }

  // ============================================================================
  // 4. INSERT: User Story E2E Test Mapping (NEW)
  // ============================================================================

  console.log('\n4️⃣  Adding User Story E2E Test Mapping section...');

  const userStoryMappingSection = {
    protocol_id: 'leo-v4-2-0-story-gates',
    title: 'User Story E2E Test Mapping (MANDATORY)',
    section_type: 'guide',
    order_index: 157,
    content: `## User Story E2E Test Mapping (MANDATORY)

**Evidence**: SD-EVA-MEETING-001 - "Initial testing focused on E2E without explicit user story mapping" and "E2E tests without user stories miss the acceptance criteria linkage"

**CRITICAL**: E2E tests MUST map to user stories explicitly.

### Problem Statement

From retrospectives:
- **SD-EVA-MEETING-001**: "User stories should have been created BEFORE implementation (not retroactively)"
- **Gap**: "Protocol gap existed: no enforcement of user story validation"
- **Impact**: Can't verify if requirements are actually met without user story linkage

### Test Naming Convention

**MANDATORY**: Every E2E test must reference a user story.

\`\`\`typescript
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
\`\`\`

### Coverage Calculation

\`\`\`javascript
// Formula
User Story Coverage = (E2E Tests with US-XXX / Total User Stories) × 100

// Example
Total User Stories: 6
E2E Tests: 6 (US-001, US-002, US-003, US-004, US-005, US-006)
Coverage: 6/6 × 100 = 100% ✅

// Minimum Requirement
Coverage: 100% (every user story MUST have ≥1 E2E test)
\`\`\`

### QA Director Verification

QA Engineering Director sub-agent will:

1. **Query user_stories table** for SD
   \`\`\`javascript
   const { data: userStories } = await supabase
     .from('user_stories')
     .select('*')
     .eq('sd_id', sd_id);
   \`\`\`

2. **Count E2E tests** with US-XXX references
   \`\`\`javascript
   // Scan tests/e2e/**/*.spec.ts for test('US-XXX: ...') patterns
   const e2eTests = await scanForUserStoryTests('tests/e2e');
   \`\`\`

3. **Calculate coverage** percentage
   \`\`\`javascript
   const coverage = (e2eTests.length / userStories.length) * 100;
   \`\`\`

4. **BLOCK if coverage < 100%**
   \`\`\`javascript
   if (coverage < 100) {
     return {
       verdict: 'BLOCKED',
       reason: \`User story coverage is \${coverage}% (requires 100%)\`,
       missing_stories: userStories.filter(us =>
         !e2eTests.some(test => test.includes(us.story_id))
       )
     };
   }
   \`\`\`

### File Organization

\`\`\`
tests/e2e/
├── ventures/
│   ├── venture-creation.spec.ts     # US-001, US-002, US-003
│   ├── venture-editing.spec.ts      # US-004, US-005
│   └── venture-deletion.spec.ts     # US-006
├── analytics/
│   └── export-analytics.spec.ts     # US-007, US-008
└── settings/
    └── user-settings.spec.ts        # US-009, US-010
\`\`\`

### Example Test File

\`\`\`typescript
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
\`\`\`

### Success Criteria

- **100%** user story coverage (no exceptions)
- **Every** E2E test has \`US-XXX:\` prefix
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
✅ **Handoff blocked if coverage incomplete**`,
    metadata: {
      evidence_sds: ['SD-EVA-MEETING-001', 'SD-AGENT-ADMIN-002'],
      lesson_learned: 'E2E tests without user story mapping miss acceptance criteria linkage',
      impact: 'Ensures 100% requirements validation, saves 1-2 hours of retroactive work'
    }
  };

  try {
    const { data: insertData2, error: insertError2 } = await supabase
      .from('leo_protocol_sections')
      .insert(userStoryMappingSection)
      .select();

    if (insertError2) {
      console.error('   ❌ Error:', insertError2.message);
      errorCount++;
    } else {
      console.log('   ✅ Added User Story E2E Test Mapping (ID: ' + insertData2[0].id + ')');
      successCount++;
    }
  } catch (err) {
    console.error('   ❌ Exception:', err.message);
    errorCount++;
  }

  // ============================================================================
  // 5. UPDATE: EXEC→PLAN Handoff Template Test Evidence
  // ============================================================================

  console.log('\n5️⃣  Updating EXEC→PLAN handoff template with test evidence...');

  try {
    // Get current EXEC→PLAN template
    const { data: currentTemplate, error: fetchError } = await supabase
      .from('leo_handoff_templates')
      .select('*')
      .eq('from_agent', 'EXEC')
      .eq('to_agent', 'PLAN')
      .single();

    if (fetchError) {
      console.error('   ❌ Error fetching template:', fetchError.message);
      errorCount++;
    } else {
      // Add test evidence requirements
      const updatedRequiredElements = [
        ...(currentTemplate.required_elements || []),
        {
          element: 'Unit Test Results',
          required: true,
          format: 'Command + pass/fail count + coverage %',
          evidence: 'SD-EXPORT-001'
        },
        {
          element: 'E2E Test Results',
          required: true,
          format: 'Command + pass/fail count + screenshot URL + Playwright report',
          evidence: 'SD-EXPORT-001, SD-EVA-MEETING-002'
        },
        {
          element: 'User Story Coverage',
          required: true,
          format: 'Total stories / Validated stories / Coverage % (must be 100%)',
          evidence: 'SD-EVA-MEETING-001'
        }
      ];

      const { error: updateError } = await supabase
        .from('leo_handoff_templates')
        .update({ required_elements: updatedRequiredElements })
        .eq('from_agent', 'EXEC')
        .eq('to_agent', 'PLAN');

      if (updateError) {
        console.error('   ❌ Error updating template:', updateError.message);
        errorCount++;
      } else {
        console.log('   ✅ Updated EXEC→PLAN handoff template with test evidence requirements');
        successCount++;
      }
    }
  } catch (err) {
    console.error('   ❌ Exception:', err.message);
    errorCount++;
  }

  // ============================================================================
  // Summary
  // ============================================================================

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 PROTOCOL IMPROVEMENTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`✅ Successful operations: ${successCount}/5`);
  console.log(`❌ Failed operations: ${errorCount}/5\n`);

  if (successCount === 5) {
    console.log('🎉 All protocol improvements applied successfully!\n');
    console.log('🎯 Next Step: Regenerate CLAUDE.md from database');
    console.log('   Run: node scripts/generate-claude-md-from-db.js\n');
    console.log('📈 Expected Outcomes:');
    console.log('   • Testing compliance enforced (fixes 12 mentions in retrospectives)');
    console.log('   • User story validation automated (100% coverage requirement)');
    console.log('   • Sub-agent auto-triggering enforced (fixes 2 mentions)');
    console.log('   • 30-minute validation gap eliminated');
    console.log('   • 67% E2E failure rate prevented\n');
  } else {
    console.log('⚠️  Some operations failed. Review errors above.');
    console.log('   You may need to manually apply failed updates.\n');
  }
}

addProtocolImprovements();
