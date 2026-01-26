# BMAD Method User Guide for LEO Protocol


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-20
- **Tags**: database, api, testing, e2e

**Version**: 1.0
**Last Updated**: 2025-10-13
**Protocol**: LEO v4.2.0 (Story Gates)

## Table of Contents

1. [Introduction](#introduction)
2. [Core Principles](#core-principles)
3. [Six BMAD Enhancements](#six-bmad-enhancements)
4. [Validation Gates](#validation-gates)
5. [Sub-Agent Usage](#sub-agent-usage)
6. [Integration Points](#integration-points)
7. [Troubleshooting](#troubleshooting)
8. [Metrics & Impact](#metrics-impact)

---

## Introduction

**BMAD** (Build-Measure-Adapt-Document) Method principles are integrated into LEO Protocol to:
- Reduce context consumption by 30-40%
- Enable early error detection (saves 4-6 hours per SD)
- Improve implementation quality through structured validation
- Enforce 100% test coverage requirements

### What BMAD Adds to LEO Protocol

BMAD enhances the existing 5-phase LEO workflow with:
- **Risk assessment** during LEAD pre-approval
- **Context engineering** for user stories during PLAN PRD
- **Checkpoint patterns** for large SDs (>8 stories)
- **Automated test planning** with 4 strategies
- **Validation gates** at PLAN→EXEC and EXEC→PLAN handoffs
- **Lean context** optimization for EXEC agents

### Who Should Read This Guide

- **LEAD Agents**: Risk assessment, retrospective review, validation enforcement
- **PLAN Agents**: User story context engineering, checkpoint generation, test planning
- **EXEC Agents**: Understanding BMAD requirements, checkpoint execution
- **All Agents**: Validation gates, sub-agent usage, troubleshooting

---

## Core Principles

### 1. Dev Agents Must Be Lean
**Principle**: Minimize context consumption throughout workflow

**Impact**:
- EXEC agents consume 30-40% less context with engineered user stories
- Checkpoint pattern reduces context by breaking large SDs into manageable pieces
- Lean EXEC_CONTEXT.md (90% reduction from 5000+ lines to ~500 lines)

**How to Apply**:
- Use checkpoint pattern for SDs with >8 user stories
- Front-load implementation details in user stories (STORIES sub-agent)
- Reference `docs/EXEC_CONTEXT.md` instead of full CLAUDE.md during EXEC

---

### 2. Natural Language First
**Principle**: Reduce code-heavy implementation guidance

**Impact**:
- User stories include plain English implementation context
- Architecture references instead of full code dumps
- Example patterns instead of complete implementations

**How to Apply**:
- STORIES sub-agent generates natural language guidance
- Focus on "what" and "why" in user stories
- Code examples are illustrative, not prescriptive

---

### 3. Context-Engineered Stories
**Principle**: Front-load implementation details to reduce EXEC confusion

**Impact**:
- 30-40% reduction in EXEC confusion/rework
- ≥80% implementation context coverage required
- PLAN→EXEC handoff blocked if coverage insufficient

**How to Apply**:
- Run STORIES sub-agent during PLAN PRD phase
- Validate coverage: `node scripts/modules/bmad-validation.js validateUserStoryContext <SD-ID>`
- Each story gets: implementation_context, architecture_references, example_code_patterns, testing_scenarios

---

### 4. Risk Assessment
**Principle**: Multi-domain analysis during LEAD pre-approval

**Impact**:
- Early risk identification prevents 4-6 hours rework
- 6-domain scoring: Technical, Security, Performance, Integration, Data Migration, UI/UX
- Risk-informed decision making before approval

**How to Apply**:
- Run RISK sub-agent during LEAD_PRE_APPROVAL
- Command: `node scripts/execute-subagent.js --code RISK --sd-id <SD-ID>`
- Review risk scores before approving SD

---

### 5. Mid-Development Quality Gates
**Principle**: Checkpoint pattern for large SDs

**Impact**:
- 30-40% context reduction per large SD
- 50% faster debugging (smaller change sets)
- Incremental progress visibility

**How to Apply**:
- Auto-generates for SDs with >8 user stories
- Command: `node scripts/generate-checkpoint-plan.js <SD-ID>`
- Execute checkpoints sequentially, validate after each

---

### 6. Early Validation
**Principle**: Catch issues at gates, not during final testing

**Impact**:
- Issues caught at PLAN→EXEC gate vs discovered during PLAN verification
- Validation failures block handoff progress
- 85% gate pass rate target

**How to Apply**:
- PLAN→EXEC gate validates: user story context (≥80%), checkpoint plan, risk assessment
- EXEC→PLAN gate validates: test plan exists, 100% user story → E2E mapping
- Validation runs automatically during handoff creation

---

## Six BMAD Enhancements

### Enhancement 1: Risk Assessment Sub-Agent (RISK)

**Phase**: LEAD_PRE_APPROVAL (mandatory for all SDs)

**Purpose**: Multi-domain risk scoring before approval

**Execution**:
```bash
node scripts/execute-subagent.js --code RISK --sd-id <SD-ID>
```

**Output**: Risk assessment stored in `risk_assessments` table with:
- **Overall Risk Score**: 1-10 scale (1=low, 10=high)
- **Domain Scores**: Technical Complexity, Security, Performance, Integration, Data Migration, UI/UX
- **Mitigations**: Recommended risk mitigation strategies
- **Verdict**: PASS/CONDITIONAL_PASS/FAIL with confidence percentage

**Example Output**:
```
Overall Risk: 4.17/10 (MEDIUM)
Domain Scores:
  - Technical Complexity: 3/10 (LOW)
  - Security Risk: 1/10 (LOW)
  - Performance Risk: 7/10 (MEDIUM)
  - Integration Risk: 1/10 (LOW)
  - Data Migration Risk: 5/10 (MEDIUM)
  - UI/UX Risk: 8/10 (HIGH)

Verdict: PASS (85% confidence)
```

**When to Use**:
- Mandatory for all SDs during LEAD_PRE_APPROVAL
- Before making strategic approval decision
- To inform resource allocation

**Integration**: Auto-triggers via orchestration during LEAD_PRE_APPROVAL phase

---

### Enhancement 2: User Story Context Engineering (STORIES)

**Phase**: PLAN_PRD (after PRD creation, before EXEC)

**Purpose**: Hyper-detailed implementation context for each user story

**Execution**:
```bash
node scripts/execute-subagent.js --code STORIES --sd-id <SD-ID>
```

**Output**: Enhances each user story with:
- **implementation_context** (JSONB): Natural language guidance (~500 chars)
- **architecture_references** (TEXT[]): Relevant files/patterns to reference
- **example_code_patterns** (TEXT[]): Illustrative code examples
- **testing_scenarios** (TEXT[]): Expected test scenarios

**Example Enhancement**:
```json
{
  "implementation_context": {
    "approach": "Add settings navigation item to main sidebar",
    "key_files": ["src/components/Sidebar.tsx", "src/routes/settings/index.tsx"],
    "considerations": "Ensure proper permission checks, mobile responsive"
  },
  "architecture_references": [
    "src/components/Sidebar.tsx:42-67 (existing navigation pattern)",
    "src/routes/dashboard/index.tsx (route structure example)"
  ],
  "example_code_patterns": [
    "Navigation item: <NavItem icon={Settings} label='Settings' route='/settings' />",
    "Route definition: { path: '/settings', component: SettingsPage, auth: true }"
  ],
  "testing_scenarios": [
    "User clicks settings icon, navigates to /settings route",
    "Settings page renders with proper authentication",
    "Mobile view collapses navigation appropriately"
  ]
}
```

**Coverage Requirement**: ≥80% of user stories must have implementation context

**Validation**: PLAN→EXEC handoff checks coverage automatically

**Benefits**:
- 30-40% reduction in EXEC confusion
- Faster implementation (clear guidance)
- Fewer rework cycles

---

### Enhancement 3: Retrospective Review for LEAD

**Phase**: LEAD_PRE_APPROVAL (before approving new SDs)

**Purpose**: Learn from similar completed SDs

**Execution**:
```bash
node scripts/retrospective-review-for-lead.js <SD-ID>
```

**Analysis**:
- Success patterns from similar SDs
- Failure patterns to avoid
- Effort adjustments based on history
- Risk mitigations that worked

**Storage**: Queries `retrospectives` table

**Output Example**:
```
Similar SDs Analyzed: 3
  - SD-UAT-020: Used existing Supabase Auth (saved 8-10 hours)
  - SD-UAT-002: Code review rejected false claims (saved 3-4 hours)
  - SD-UAT-003: Database blocker documented early (saved 4-6 hours)

Patterns Identified:
  - Leverage existing infrastructure (3/3 SDs)
  - Verify claims with code review (2/3 SDs)
  - Early database validation (2/3 SDs)

Recommendations:
  - Check for existing auth solutions before custom build
  - Validate UI/UX claims with actual code inspection
  - Run database schema validation during PLAN phase
```

**When to Use**:
- Before approving SDs that may duplicate existing work
- When similar SDs have been completed recently
- To inform effort estimates and risk assessments

**Integration**: Manual execution during LEAD_PRE_APPROVAL, insights inform approval decision

---

### Enhancement 4: Checkpoint Pattern Generator

**Phase**: PLAN_PRD (for SDs with >8 user stories)

**Purpose**: Break large SDs into 3-4 manageable checkpoints

**Execution**:
```bash
node scripts/generate-checkpoint-plan.js <SD-ID>
```

**Automatic Trigger**: SDs with >8 user stories automatically recommended for checkpoint plan

**Output**: Checkpoint plan stored in `strategic_directives_v2.checkpoint_plan` (JSONB) with:
- **total_checkpoints**: Number of checkpoints (typically 3-4)
- **total_user_stories**: Total stories divided across checkpoints
- **checkpoints**: Array of checkpoint objects

**Example Checkpoint Plan** (12 stories):
```json
{
  "total_checkpoints": 3,
  "total_user_stories": 12,
  "checkpoints": [
    {
      "id": 1,
      "name": "Checkpoint 1",
      "user_stories": ["US-001", "US-002", "US-003", "US-004"],
      "story_count": 4,
      "milestone": "Foundation & Core Components",
      "estimated_hours": 12,
      "validation_required": true,
      "test_coverage_required": "≥1 E2E test per user story (4 tests)"
    },
    {
      "id": 2,
      "name": "Checkpoint 2",
      "user_stories": ["US-005", "US-006", "US-007", "US-008"],
      "story_count": 4,
      "milestone": "Feature Implementation",
      "estimated_hours": 12,
      "validation_required": true,
      "test_coverage_required": "≥1 E2E test per user story (4 tests)"
    },
    {
      "id": 3,
      "name": "Checkpoint 3",
      "user_stories": ["US-009", "US-010", "US-011", "US-012"],
      "story_count": 4,
      "milestone": "Integration & Testing",
      "estimated_hours": 12,
      "validation_required": true,
      "test_coverage_required": "≥1 E2E test per user story (4 tests)"
    }
  ]
}
```

**Benefits**:
- **30-40% context reduction**: Smaller working sets
- **50% faster debugging**: Errors isolated to checkpoint
- **Incremental progress**: Clear milestones
- **Flexibility**: Can pause/resume between checkpoints

**Validation**: PLAN→EXEC handoff requires checkpoint plan for large SDs

**Execution Pattern**:
1. Complete checkpoint 1 fully (implement + test)
2. Run unit + E2E tests for checkpoint 1
3. Commit and push checkpoint 1
4. Proceed to checkpoint 2 (repeat)
5. Create EXEC→PLAN handoff only after final checkpoint

---

### Enhancement 5: Test Architecture Phase Enhancement

**Phase**: PLAN_PRD and PLAN_VERIFY (QA Director integration)

**Purpose**: Structured test planning with 4 strategies

**Execution**:
```bash
node scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e
```

**Automatic Trigger**: During PLAN_PRD phase when PRD created

**Test Strategies**:
1. **Unit Tests**: Business logic, services, utilities
2. **E2E Tests**: User flows, component integration (100% user story mapping REQUIRED)
3. **Integration Tests**: API validation, database operations
4. **Performance Tests**: Load time, response time benchmarks

**Output**: Test plan stored in `test_plans` table with:
- Test case IDs and descriptions
- Test strategy (unit/e2e/integration/performance)
- User story mapping (which US each test covers)
- Expected results
- Priority level

**Example Test Plan** (12 user stories):
```
Test Plan Generated:
  - Unit Tests: 15 test cases
    - Settings service validation
    - Navigation helper functions
    - Form validation logic

  - E2E Tests: 13 test cases
    - US-001: User navigates to settings page
    - US-002: User updates profile information
    - US-003: User changes notification preferences
    - ... (12 user story tests + 1 integration test)

  - Integration Tests: 1 test case
    - Settings API endpoint validation

  - Performance Tests: 1 test case
    - Settings page load time <2 seconds

Total: 30 test cases
User Story Coverage: 100% (12/12 stories mapped)
```

**Validation**: EXEC→PLAN handoff checks:
- Test plan exists in database
- 100% user story → E2E test mapping
- Test plan includes all 4 strategies (if applicable)

**Benefits**:
- 100% user story coverage enforced
- Structured test planning (not ad-hoc)
- Saves 2-3 hours per SD (no manual test planning)

---

### Enhancement 6: Lean EXEC_CONTEXT.md

**Phase**: EXEC_IMPLEMENTATION (context optimization)

**Purpose**: Reduced CLAUDE.md for EXEC agents (~500 lines vs 5000+)

**Location**: `docs/EXEC_CONTEXT.md`

**Content**:
- EXEC-specific guidance only
- Pre-implementation checklist
- Testing requirements
- Commit guidelines
- Common patterns

**What's Excluded** (LEAD/PLAN operations):
- Strategic validation processes
- PRD creation guidance
- Sub-agent orchestration details
- Handoff templates

**Benefits**:
- **90% context reduction** during EXEC phase
- Faster reference lookup (500 lines vs 5000+)
- Focused guidance (no irrelevant content)

**Usage**:
```bash
# During EXEC phase, reference lean context
cat docs/EXEC_CONTEXT.md

# Full protocol still available if needed
cat CLAUDE.md
```

**Note**: Lean context is a reference optimization, not a replacement for CLAUDE.md. Full protocol remains the source of truth.

---

## Validation Gates

### PLAN→EXEC Handoff Validation

**Purpose**: Ensure implementation readiness before EXEC begins

**Validation Checks**:

1. **User Story Context Engineering (≥80% coverage)**
   - Each user story has `implementation_context`
   - Architecture references provided
   - Example code patterns included
   - Testing scenarios defined

2. **Checkpoint Plan (if SD has >8 stories)**
   - Checkpoint plan exists in `strategic_directives_v2.checkpoint_plan`
   - Stories distributed across 3-4 checkpoints
   - Each checkpoint has milestone and estimated hours

3. **Risk Assessment (exists)**
   - Risk assessment record in `risk_assessments` table
   - Overall risk score calculated
   - Domain scores provided

**Validation Script**:
```bash
node scripts/modules/bmad-validation.js validatePlanToExec <SD-ID>
```

**Output**:
```
PLAN→EXEC Validation for SD-SETTINGS-2025-10-12

User Story Context Coverage: 100% (12/12 stories) ✅
Checkpoint Plan: EXISTS (3 checkpoints) ✅
Risk Assessment: EXISTS (Risk: 4.17/10 MEDIUM) ✅

BMAD Validation Score: 100/100 ✅
Verdict: PASS - Ready for EXEC phase
```

**Failure Handling** (100% Compliance Enforcement):
- Score <100: BLOCKED (handoff cannot proceed)
- Score 100: PASS (proceed to EXEC)

**Strict Requirements**:
- User Story Context Coverage: ≥80% REQUIRED (no partial credit)
- Checkpoint Plan: REQUIRED for SDs with >8 stories (no exceptions)

**Integration**: Automatic validation during `unified-handoff-system.js` execution

---

### EXEC→PLAN Handoff Validation

**Purpose**: Ensure implementation completeness before PLAN verification

**Validation Checks**:

1. **Test Plan Generated (unit + E2E strategies)**
   - Test plan exists in `test_plans` table
   - Unit test strategy included
   - E2E test strategy included

2. **User Story → E2E Mapping (100% requirement)**
   - Every user story has ≥1 E2E test
   - Test naming convention: `US-XXX: Description`
   - Mapping documented in test plan

3. **Test Plan Stored in Database**
   - Test plan record exists
   - Test cases populated
   - User story mapping validated

**Validation Script**:
```bash
node scripts/modules/bmad-validation.js validateExecToPlan <SD-ID>
```

**Output**:
```
EXEC→PLAN Validation for SD-SETTINGS-2025-10-12

Test Plan Exists: YES ✅
Test Strategies:
  - Unit Tests: 15 test cases ✅
  - E2E Tests: 13 test cases ✅
  - Integration Tests: 1 test case ✅
  - Performance Tests: 1 test case ✅

User Story Coverage: 100% (12/12 stories mapped to E2E tests) ✅

BMAD Validation Score: 100/100 ✅
Verdict: PASS - Ready for PLAN verification
```

**Failure Handling** (100% Compliance Enforcement):
- Missing test plan: BLOCKED
- <100% user story coverage: BLOCKED (strict requirement)
- Missing test strategies: BLOCKED

**Strict Requirements**:
- User Story → E2E Test Mapping: 100% REQUIRED (no partial credit)
- Test Plan: REQUIRED (unit + E2E strategies minimum)

**Integration**: Automatic validation during `unified-handoff-system.js` execution

---

## Sub-Agent Usage

### When to Use Sub-Agents

**Automatic Triggers** (orchestration handles):
- RISK: During LEAD_PRE_APPROVAL phase
- STORIES: During PLAN_PRD phase (if user story context missing)
- Checkpoint Generator: During PLAN_PRD (if >8 stories)
- Test Plan Generator: During PLAN_VERIFY phase

**Manual Execution** (when needed):
```bash
# Risk assessment
node scripts/execute-subagent.js --code RISK --sd-id <SD-ID>

# User story context engineering
node scripts/execute-subagent.js --code STORIES --sd-id <SD-ID>

# Checkpoint plan generation
node scripts/generate-checkpoint-plan.js <SD-ID>

# Test plan generation
node scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e
```

### Sub-Agent Output Storage

**Database Tables**:
- **risk_assessments**: Risk scores and domain analysis
- **user_stories**: Enhanced with BMAD columns (implementation_context, etc.)
- **strategic_directives_v2.checkpoint_plan**: Checkpoint structure (JSONB)
- **test_plans**: Test strategies and user story mapping

**Verification**:
```bash
# Verify risk assessment exists
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
supabase.from('risk_assessments').select('*').eq('sd_id', 'SD-XXX').then(r => console.log(r.data));
"

# Verify user story context exists
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
supabase.from('user_stories').select('id, implementation_context').eq('sd_id', 'SD-XXX').then(r => console.log(r.data));
"

# Verify checkpoint plan exists
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
supabase.from('strategic_directives_v2').select('checkpoint_plan').eq('id', 'SD-XXX').single().then(r => console.log(r.data));
"

# Verify test plan exists
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
supabase.from('test_plans').select('*').eq('sd_id', 'SD-XXX').then(r => console.log(r.data));
"
```

---

## Integration Points

### LEAD Phase Integration

**Pre-Approval Checklist**:
1. Run RISK sub-agent: `node scripts/execute-subagent.js --code RISK --sd-id <SD-ID>`
2. Review risk scores and mitigations
3. (Optional) Run retrospective review: `node scripts/retrospective-review-for-lead.js <SD-ID>`
4. Make approval decision based on risk profile

**Example Workflow**:
```bash
# Step 1: Risk assessment
node scripts/execute-subagent.js --code RISK --sd-id SD-NEW-FEATURE-001

# Step 2: Review output
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
supabase.from('risk_assessments').select('*').eq('sd_id', 'SD-NEW-FEATURE-001').order('created_at', { ascending: false }).limit(1).single().then(r => {
  console.log('Overall Risk:', r.data.overall_risk_score, '/10');
  console.log('Verdict:', r.data.verdict);
  console.log('Confidence:', r.data.confidence_percentage, '%');
});
"

# Step 3: If risk acceptable, approve SD
# Update SD status to 'active'
```

---

### PLAN Phase Integration

**PRD Creation Checklist**:
1. Create PRD in `product_requirements_v2` table
2. Run STORIES sub-agent: `node scripts/execute-subagent.js --code STORIES --sd-id <SD-ID>`
3. If >8 stories, run Checkpoint Generator: `node scripts/generate-checkpoint-plan.js <SD-ID>`
4. Validate BMAD requirements: `node scripts/modules/bmad-validation.js validatePlanToExec <SD-ID>`
5. Create PLAN→EXEC handoff only if validation passes

**Example Workflow**:
```bash
# Step 1: User stories generated (automatic during PRD creation)

# Step 2: Context engineering
node scripts/execute-subagent.js --code STORIES --sd-id SD-NEW-FEATURE-001

# Step 3: Check story count
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
supabase.from('user_stories').select('id', { count: 'exact', head: true }).eq('sd_id', 'SD-NEW-FEATURE-001').then(r => {
  const count = r.count;
  console.log('Story count:', count);
  if (count > 8) {
    console.log('Checkpoint plan REQUIRED');
  }
});
"

# Step 4: Generate checkpoint plan (if needed)
node scripts/generate-checkpoint-plan.js SD-NEW-FEATURE-001

# Step 5: Validate BMAD requirements
node scripts/modules/bmad-validation.js validatePlanToExec SD-NEW-FEATURE-001

# Step 6: Create handoff (if validation passes)
node scripts/unified-handoff-system.js execute PLAN-to-EXEC SD-NEW-FEATURE-001
```

---

### EXEC Phase Integration

**Implementation Checklist**:
1. Read PLAN→EXEC handoff (includes BMAD context)
2. Reference user story implementation context during coding
3. If checkpoint plan exists, execute checkpoints sequentially
4. After each checkpoint: commit, push, validate tests
5. Generate test plan: `node scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e`
6. Validate BMAD requirements: `node scripts/modules/bmad-validation.js validateExecToPlan <SD-ID>`
7. Create EXEC→PLAN handoff only if validation passes

**Example Workflow (with Checkpoints)**:
```bash
# Step 1: Read checkpoint plan
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
supabase.from('strategic_directives_v2').select('checkpoint_plan').eq('id', 'SD-NEW-FEATURE-001').single().then(r => {
  console.log('Checkpoint Plan:');
  console.log(JSON.stringify(r.data.checkpoint_plan, null, 2));
});
"

# Step 2: Implement Checkpoint 1 (US-001 to US-004)
# ... implementation work ...

# Step 3: Test Checkpoint 1
npm run test:unit
npm run test:e2e

# Step 4: Commit Checkpoint 1
git add .
git commit -m "feat(SD-NEW-FEATURE-001): Checkpoint 1 complete - Foundation & Core Components"
git push

# Step 5: Repeat for Checkpoint 2 and 3

# Step 6: After final checkpoint, generate test plan
node scripts/qa-engineering-director-enhanced.js SD-NEW-FEATURE-001 --full-e2e

# Step 7: Validate BMAD requirements
node scripts/modules/bmad-validation.js validateExecToPlan SD-NEW-FEATURE-001

# Step 8: Create handoff
node scripts/unified-handoff-system.js execute EXEC-to-PLAN SD-NEW-FEATURE-001
```

---

### PLAN Verification Phase Integration

**Verification Checklist**:
1. Review EXEC→PLAN handoff
2. Verify test plan exists and covers all user stories
3. Run QA Director validation: `node scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e`
4. Check BMAD validation scores
5. Create PLAN→LEAD handoff with verification results

**Example Workflow**:
```bash
# Step 1: Verify test plan exists
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
supabase.from('test_plans').select('id, test_case_count').eq('sd_id', 'SD-NEW-FEATURE-001').single().then(r => {
  console.log('Test Plan ID:', r.data.id);
  console.log('Test Cases:', r.data.test_case_count);
});
"

# Step 2: Run QA validation
node scripts/qa-engineering-director-enhanced.js SD-NEW-FEATURE-001 --full-e2e

# Step 3: Check BMAD validation
node scripts/modules/bmad-validation.js validateExecToPlan SD-NEW-FEATURE-001

# Step 4: Create handoff
node scripts/unified-handoff-system.js execute PLAN-to-LEAD SD-NEW-FEATURE-001
```

---

## Troubleshooting

### Issue 1: PLAN→EXEC Validation Fails (User Story Context <80%)

**Error**:
```
PLAN→EXEC Validation FAILED
User Story Context Coverage: 33% (4/12 stories) ❌
BMAD Validation Score: 33/100
Verdict: BLOCKED - Cannot proceed to EXEC
```

**Cause**: STORIES sub-agent not executed OR execution failed

**Solution**:
```bash
# Step 1: Run STORIES sub-agent manually
node scripts/execute-subagent.js --code STORIES --sd-id SD-XXX

# Step 2: Verify context added
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
supabase.from('user_stories').select('id, implementation_context').eq('sd_id', 'SD-XXX').then(r => {
  const withContext = r.data.filter(s => s.implementation_context).length;
  console.log('Stories with context:', withContext, '/', r.data.length);
});
"

# Step 3: Re-validate
node scripts/modules/bmad-validation.js validatePlanToExec SD-XXX
```

---

### Issue 2: EXEC→PLAN Validation Fails (User Story Coverage <100%)

**Error**:
```
EXEC→PLAN Validation FAILED
User Story Coverage: 83% (10/12 stories mapped to E2E tests) ❌
Missing Mapping: US-011, US-012
BMAD Validation Score: 50/100
Verdict: BLOCKED - Cannot proceed to PLAN verification
```

**Cause**: E2E tests missing for some user stories

**Solution**:
```bash
# Step 1: Identify missing tests
node scripts/qa-engineering-director-enhanced.js SD-XXX --check-coverage

# Step 2: Generate test plan (includes missing test cases)
node scripts/qa-engineering-director-enhanced.js SD-XXX --full-e2e

# Step 3: Implement missing E2E tests
# Create test files for US-011 and US-012

# Step 4: Re-validate
node scripts/modules/bmad-validation.js validateExecToPlan SD-XXX
```

---

### Issue 3: Checkpoint Plan Not Generated for Large SD

**Error**:
```
PLAN→EXEC Validation FAILED
SD has 12 user stories but no checkpoint plan
BMAD Validation Score: 50/100
Verdict: BLOCKED
```

**Cause**: Checkpoint generator not executed

**Solution**:
```bash
# Step 1: Generate checkpoint plan manually
node scripts/generate-checkpoint-plan.js SD-XXX

# Step 2: Verify checkpoint plan exists
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
supabase.from('strategic_directives_v2').select('checkpoint_plan').eq('id', 'SD-XXX').single().then(r => {
  if (r.data.checkpoint_plan) {
    console.log('Checkpoint plan exists:', r.data.checkpoint_plan.total_checkpoints, 'checkpoints');
  } else {
    console.log('Checkpoint plan MISSING');
  }
});
"

# Step 3: Re-validate
node scripts/modules/bmad-validation.js validatePlanToExec SD-XXX
```

---

### Issue 4: Risk Assessment Missing

**Error**:
```
PLAN→EXEC Validation WARNING
Risk assessment not found for SD-XXX
BMAD Validation Score: 67/100
Verdict: CONDITIONAL PASS (missing risk assessment)
```

**Cause**: RISK sub-agent not executed during LEAD_PRE_APPROVAL

**Solution**:
```bash
# Step 1: Run RISK sub-agent manually
node scripts/execute-subagent.js --code RISK --sd-id SD-XXX

# Step 2: Verify risk assessment exists
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
supabase.from('risk_assessments').select('*').eq('sd_id', 'SD-XXX').order('created_at', { ascending: false }).limit(1).single().then(r => {
  console.log('Risk Assessment:', r.data.overall_risk_score, '/10');
});
"

# Step 3: Re-validate
node scripts/modules/bmad-validation.js validatePlanToExec SD-XXX
```

---

### Issue 5: Sub-Agent Execution Fails

**Error**:
```
Error: column user_stories.strategic_directive_id does not exist
```

**Cause**: Database schema uses `sd_id` not `strategic_directive_id` (known fixed issue)

**Solution**: Verify you're using latest version of sub-agent scripts (fixes applied on 2025-10-13)

**Verification**:
```bash
# Check scripts/modules/qa/test-plan-generator.js line 49
grep "sd_id" scripts/modules/qa/test-plan-generator.js

# Check lib/sub-agents/stories.js lines 69 and 93
grep "sd_id" lib/sub-agents/stories.js

# Check scripts/generate-checkpoint-plan.js line 72
grep "sd_id" scripts/generate-checkpoint-plan.js
```

**Expected**: All queries should use `.eq('sd_id', ...)` not `.eq('strategic_directive_id', ...)`

---

## Metrics & Impact

### Expected Context Savings

**User Story Context Engineering**: 30-40% reduction in EXEC confusion
- Before: EXEC agent spends 2-3 hours figuring out implementation approach
- After: Implementation context provided, EXEC starts coding immediately
- Savings: 1-2 hours per SD

**Checkpoint Pattern**: 30-40% reduction in total context per large SD
- Before: Large SD consumes 150K-180K tokens (approaching limits)
- After: Each checkpoint consumes 50K-60K tokens (3 checkpoints = 150K-180K total, but spread across time)
- Benefit: Smaller working sets, less context thrashing

**Lean EXEC_CONTEXT.md**: 90% reduction during EXEC phase
- Before: EXEC references 5000+ line CLAUDE.md
- After: EXEC references 500 line EXEC_CONTEXT.md
- Savings: 4500 lines not loaded into context

**Combined Impact**: 50-60% overall context reduction per SD through BMAD optimizations

---

### Expected Time Savings

**Risk Assessment**: 4-6 hours saved per SD (early issue detection)
- Before: Issues discovered during EXEC implementation
- After: Issues identified during LEAD pre-approval
- Example: SD-UAT-020 discovered existing Supabase Auth during implementation (should have caught during approval)

**Test Architecture**: 2-3 hours saved per SD (structured planning)
- Before: Manual test planning, ad-hoc coverage
- After: Automated test plan with 100% user story mapping
- Example: 30 test cases generated in 5 seconds vs 2-3 hours manual planning

**Retrospective Review**: 3-4 hours saved per SD (informed decisions)
- Before: Unknown whether similar work done before
- After: Leverage existing patterns, avoid duplicate work
- Example: SD-UAT-002 code review saved 3-4 hours by rejecting false claims

**Checkpoint Pattern**: 2-3 hours saved per large SD (faster debugging)
- Before: 50% debugging time due to large change sets
- After: 50% reduction in debugging time (smaller checkpoints)
- Example: Error in checkpoint 1 doesn't affect checkpoint 2 or 3

**Combined Impact**: 11-16 hours saved per SD through BMAD enhancements

---

### Expected Quality Improvements

**Early Validation Gates**: Catch issues before late-stage rework
- Before: Issues discovered during PLAN verification (after EXEC complete)
- After: Issues caught at PLAN→EXEC gate (before EXEC starts)
- Impact: 4-6 hours rework avoided

**Structured Test Planning**: 100% user story coverage enforced
- Before: Ad-hoc testing, inconsistent coverage
- After: Every user story has ≥1 E2E test
- Impact: Fewer production bugs, higher confidence

**Context Engineering**: Reduced implementation ambiguity
- Before: EXEC interprets requirements differently than PLAN intended
- After: Implementation guidance front-loaded in user stories
- Impact: Fewer rework cycles, faster implementation

**Checkpoint Pattern**: Incremental validation
- Before: All-or-nothing testing at end
- After: Validate after each checkpoint
- Impact: Earlier error detection, smaller blast radius

**Combined Impact**: 85%+ gate pass rate target, fewer rework cycles, higher quality deliverables

---

### Monitoring BMAD Effectiveness

**Metrics to Track**:

1. **Gate Pass Rate**: % of SDs that pass PLAN→EXEC gate on first try
   - Target: ≥85%
   - Query: `SELECT COUNT(*) ... WHERE bmad_validation_score >= 100`

2. **Context Consumption**: Token usage per SD
   - Target: 30-40% reduction vs pre-BMAD baseline
   - Track: Context health reports in handoffs

3. **Rework Hours**: Time spent fixing issues found late
   - Target: 50% reduction vs pre-BMAD baseline
   - Track: Retrospectives "hours_saved" field

4. **Test Coverage**: % of user stories with E2E tests
   - Target: 100%
   - Query: `SELECT (e2e_test_count / user_story_count) * 100 FROM test_plans`

5. **Risk-Informed Decisions**: % of SDs with risk assessment before approval
   - Target: 100%
   - Query: `SELECT COUNT(*) FROM risk_assessments WHERE created_at < sd.approved_at`

**Dashboard Integration** (Future):
- BMAD compliance score per SD
- Context savings trend over time
- Gate pass rate visualization
- Test coverage heatmap

---

## Appendix

### Quick Reference Commands

```bash
# Risk Assessment (LEAD phase)
node scripts/execute-subagent.js --code RISK --sd-id <SD-ID>

# User Story Context Engineering (PLAN phase)
node scripts/execute-subagent.js --code STORIES --sd-id <SD-ID>

# Checkpoint Plan Generation (PLAN phase, if >8 stories)
node scripts/generate-checkpoint-plan.js <SD-ID>

# Test Plan Generation (EXEC phase)
node scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e

# PLAN→EXEC Validation
node scripts/modules/bmad-validation.js validatePlanToExec <SD-ID>

# EXEC→PLAN Validation
node scripts/modules/bmad-validation.js validateExecToPlan <SD-ID>

# Unified Handoff System (auto-validates BMAD)
node scripts/unified-handoff-system.js execute PLAN-to-EXEC <SD-ID>
node scripts/unified-handoff-system.js execute EXEC-to-PLAN <SD-ID>
```

---

### Database Schema Reference

**Tables**:
- `risk_assessments` (20 columns): Risk scores and domain analysis
- `test_plans` (18 columns): Test strategies and user story mapping
- `user_stories` (BMAD columns): implementation_context, architecture_references, example_code_patterns, testing_scenarios
- `strategic_directives_v2.checkpoint_plan` (JSONB): Checkpoint structure

**Queries**:
```sql
-- Check risk assessment
SELECT * FROM risk_assessments WHERE sd_id = 'SD-XXX' ORDER BY created_at DESC LIMIT 1;

-- Check user story context coverage
SELECT
  COUNT(*) as total_stories,
  COUNT(implementation_context) as with_context,
  (COUNT(implementation_context)::float / COUNT(*)::float * 100) as coverage_percentage
FROM user_stories
WHERE sd_id = 'SD-XXX';

-- Check checkpoint plan
SELECT checkpoint_plan FROM strategic_directives_v2 WHERE id = 'SD-XXX';

-- Check test plan
SELECT * FROM test_plans WHERE sd_id = 'SD-XXX' ORDER BY created_at DESC LIMIT 1;
```

---

### Further Reading

- **BMAD Principles**: See retrospectives from SD-UAT-002, SD-UAT-020, SD-EXPORT-001
- **Implementation Guide**: docs/bmad-implementation-guide.md (if exists)
- **Validation Gates**: docs/reference/handoff-validation.md (if exists)
- **Sub-Agent System**: docs/leo/sub-agents/sub-agent-system.md
- **LEO Protocol**: CLAUDE.md (main protocol document)

---

**Last Updated**: 2025-10-13
**Version**: 1.0
**Feedback**: Report issues or suggestions via Strategic Directives
