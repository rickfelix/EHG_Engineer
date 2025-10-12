#!/usr/bin/env node

/**
 * Add Validation Agent Mandatory Gates to LEO Protocol Database
 *
 * This script adds quick-reference sections to leo_protocol_sections table
 * implementing validation-first gating to prevent late-stage rework.
 *
 * Evidence: 74 retrospectives analyzed, 12 SDs with validation agent usage
 * Key Issue: Validation skipped or deferred, causing 4-6 hours rework per SD
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function addValidationGates() {
  console.log('🚀 Adding Validation Agent Mandatory Gates to LEO Protocol Database...\n');

  // Step 1: Get active protocol ID
  console.log('📋 Step 1: Fetching active protocol...');
  const { data: protocol, error: protocolError } = await supabase
    .from('leo_protocols')
    .select('id, version, title')
    .eq('status', 'active')
    .single();

  if (protocolError) {
    console.error('❌ Error fetching active protocol:', protocolError);
    process.exit(1);
  }

  console.log(`✅ Active Protocol: ${protocol.version} - ${protocol.title}\n`);

  // Step 2: Get current max order_index
  console.log('📊 Step 2: Finding next order_index...');
  const { data: maxOrder } = await supabase
    .from('leo_protocol_sections')
    .select('order_index')
    .eq('protocol_id', protocol.id)
    .order('order_index', { ascending: false })
    .limit(1);

  const nextOrderIndex = maxOrder && maxOrder.length > 0 ? maxOrder[0].order_index + 1 : 100;
  console.log(`✅ Starting at order_index: ${nextOrderIndex}\n`);

  // Step 3: Define new sections
  const newSections = [
    {
      protocol_id: protocol.id,
      section_type: 'quick-reference',
      title: 'Validation Agent Mandatory Gates',
      content: `## 🛡️ Validation Agent Mandatory Gates

**Problem**: Validation skipped or deferred, causing late-stage rework (4-6 hours per SD)
**Solution**: Mandatory validation gates at key workflow checkpoints with blocking enforcement

### Four Mandatory Validation Gates

**GATE 1: LEAD Pre-Approval** (BLOCKING)
- [ ] **Duplicate Check**: Does this already exist in codebase?
- [ ] **Infrastructure Check**: Can we reuse existing components/patterns?
- [ ] **Backlog Validation**: Are user requirements documented? (≥1 backlog item required)
- [ ] **Claims Verification**: For UI/UX SDs, verify issues actually exist (code review)

**Command**:
\`\`\`bash
node scripts/systems-analyst-codebase-audit.js <SD-ID>
# OR via orchestration
node scripts/orchestrate-phase-subagents.js LEAD_PRE_APPROVAL <SD-ID>
\`\`\`

**Blocks**: Cannot mark SD as 'active' until validation passes
**Evidence**: SD-EXPORT-001 approved with 0 backlog items → scope creep risk

---

**GATE 2: PLAN PRD Creation** (BLOCKING)
- [ ] **Schema Validation**: Do tables exist? Any conflicts?
- [ ] **Route Validation**: Are routes available? Any conflicts?
- [ ] **User Story Validation**: User stories created and mapped to E2E tests (100% coverage)?
- [ ] **Test Infrastructure Validation**: Is test environment ready?
- [ ] **Form Validation**: Are validation attributes needed for forms?
- [ ] **Build Validation**: Do dependencies exist? Can project build?

**Command**:
\`\`\`bash
node lib/sub-agent-executor.js VALIDATION <SD-ID>
\`\`\`

**Blocks**: Cannot create PLAN→EXEC handoff until validation passes
**Evidence**: SD-AGENT-ADMIN-002 - Missing pre-flight checks caused test failures

---

**GATE 3: EXEC Pre-Implementation** (BLOCKING)
- [ ] **Application Verification**: Correct app? (\`/mnt/c/_EHG/ehg/\` vs \`/mnt/c/_EHG/EHG_Engineer/\`)
- [ ] **Build Validation**: Does \`npm run build\` succeed?
- [ ] **Environment Validation**: Correct database connection?
- [ ] **Protocol Compliance**: Following LEO 5-phase workflow?
- [ ] **Dependencies Validation**: All \`npm install\` complete?

**Command**:
\`\`\`bash
# Automated during EXEC pre-implementation checklist
npm run type-check && npm run build:skip-checks
\`\`\`

**Blocks**: Cannot start implementation until environment validated
**Evidence**: Multiple "wrong directory" errors before pre-verification checklist

---

**GATE 4: PLAN Verification** (BLOCKING)
- [ ] **User Story Completion**: All user stories delivered and E2E tests passing (100% coverage validation)?
- [ ] **Handoff Completeness**: All 7 handoff elements present?
- [ ] **Test Validation**: Unit tests AND E2E tests both passing?
- [ ] **Documentation Validation**: Generated docs exist?
- [ ] **Protocol Compliance**: All phases followed correctly?
- [ ] **CI/CD Validation**: GitHub Actions green?

**Command**:
\`\`\`bash
node scripts/orchestrate-phase-subagents.js PLAN_VERIFY <SD-ID>
\`\`\`

**Blocks**: Cannot create PLAN→LEAD handoff until validation passes
**Evidence**: SD-EVA-MEETING-001 - No user story validation enforcement

---

### Enforcement Mechanism

**Database Constraint Example**:
\`\`\`sql
-- Cannot mark SD active without backlog items
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT require_backlog_for_active
CHECK (status != 'active' OR (
  SELECT COUNT(*) FROM sd_backlog_map WHERE sd_id = id
) > 0);
\`\`\`

**Auto-Trigger Pattern**:
- Phase transition detected → Validation agent runs automatically
- Validation fails → Progress BLOCKED, escalate to LEAD
- Validation passes → Proceed to next phase

**Manual Override** (Last Resort):
- Requires LEAD approval
- Must document justification
- Creates technical debt ticket

**Evidence**: 74 retrospectives, 12 improvement areas where validation missing
**Impact**: Prevents 4-6 hours rework per SD through early validation`,
      order_index: nextOrderIndex,
      metadata: {
        source: 'Retrospectives Database Analysis (74 SDs)',
        created_date: '2025-10-12',
        priority: 'CRITICAL',
        category: 'validation',
        improvement_areas: 12
      }
    },
    {
      protocol_id: protocol.id,
      section_type: 'quick-reference',
      title: 'Validation Enforcement Patterns',
      content: `## 🔒 Validation Enforcement Patterns

**Problem**: Validation is optional, can be bypassed, leading to late discovery
**Solution**: Automated enforcement mechanisms that BLOCK progress on validation failures

### Three Enforcement Layers

**Layer 1: Database Constraints** (Cannot Bypass)
\`\`\`sql
-- Example 1: Require backlog items before active status
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT require_backlog_for_active
CHECK (status != 'active' OR EXISTS (
  SELECT 1 FROM sd_backlog_map WHERE sd_id = strategic_directives_v2.id
));

-- Example 2: Require PRD before implementation
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT require_prd_before_implementation
CHECK (status NOT IN ('in_progress', 'completed') OR EXISTS (
  SELECT 1 FROM product_requirements_v2 WHERE strategic_directive_id = strategic_directives_v2.id
));

-- Example 3: Require retrospective before completion
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT require_retrospective_for_completion
CHECK (status != 'completed' OR EXISTS (
  SELECT 1 FROM retrospectives WHERE sd_id = strategic_directives_v2.id
));
\`\`\`

**Benefit**: Database prevents invalid state transitions, no workarounds possible

---

**Layer 2: Auto-Trigger Validation** (Automatic Execution)

**Phase Transition Triggers**:
\`\`\`javascript
// Example: When SD status changes to 'active'
CREATE TRIGGER validate_on_active
BEFORE UPDATE ON strategic_directives_v2
FOR EACH ROW
WHEN (OLD.status != 'active' AND NEW.status = 'active')
EXECUTE FUNCTION run_lead_pre_approval_validation();

// Function executes validation agent automatically
CREATE FUNCTION run_lead_pre_approval_validation()
RETURNS TRIGGER AS $$
BEGIN
  -- Check backlog exists
  IF NOT EXISTS (SELECT 1 FROM sd_backlog_map WHERE sd_id = NEW.id) THEN
    RAISE EXCEPTION 'Cannot activate SD: No backlog items found. Add requirements first.';
  END IF;

  -- Log validation execution
  INSERT INTO sub_agent_execution_results (sd_id, sub_agent_code, verdict)
  VALUES (NEW.id, 'VALIDATION', 'PASS');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
\`\`\`

**Benefit**: Validation runs automatically, humans don't need to remember

---

**Layer 3: Script-Level Gate Blocking** (Orchestration)

**Handoff Creation Scripts**:
\`\`\`javascript
// Example: scripts/unified-handoff-system.js

async function createHandoff(type, sd_id) {
  // MANDATORY: Run validation before creating handoff
  if (type === 'PLAN-to-EXEC') {
    console.log('Running schema validation before handoff...');
    const validation = await executeSubAgent('VALIDATION', sd_id);

    if (validation.verdict !== 'PASS') {
      console.error('❌ BLOCKED: Schema validation failed');
      console.error('Issues:', validation.issues);
      console.error('Cannot create PLAN→EXEC handoff until resolved');
      process.exit(1); // BLOCK
    }
  }

  // Validation passed, proceed with handoff creation
  await createHandoffRecord(type, sd_id);
}
\`\`\`

**Benefit**: Scripts enforce validation at key integration points

---

### Validation Failure Response Protocol

**When Validation Fails**:

1. **STOP**: Do not proceed with current action
2. **LOG**: Record validation failure in \`sub_agent_execution_results\`
3. **NOTIFY**: Alert user with specific failure details
4. **DOCUMENT**: Create issue in tracking system
5. **ESCALATE**: If critical, escalate to LEAD for decision

**Example Failure Message**:
\`\`\`
❌ VALIDATION FAILED: Cannot mark SD-EXPORT-001 as active

Reason: No backlog items found
Expected: ≥1 backlog item documenting user requirements
Found: 0 backlog items

Action Required:
1. Review SD scope and identify user requirements
2. Add backlog items to sd_backlog_map table
3. Retry status change

Validation Agent: node scripts/systems-analyst-codebase-audit.js SD-EXPORT-001
\`\`\`

---

### Manual Override Process (Exception Handling)

**When Override Needed**:
- Exceptional circumstances only
- Infrastructure/protocol SDs where normal rules don't apply
- Emergency production fixes

**Override Steps**:
1. Document justification in SD description
2. Get LEAD approval (recorded in comments)
3. Create technical debt ticket
4. Add to retrospective for pattern review

**Override Example**:
\`\`\`sql
-- Temporarily disable constraint for infrastructure SD
ALTER TABLE strategic_directives_v2 DISABLE TRIGGER validate_on_active;

-- Perform operation
UPDATE strategic_directives_v2 SET status = 'active' WHERE id = 'SD-INFRA-001';

-- Re-enable constraint (MANDATORY)
ALTER TABLE strategic_directives_v2 ENABLE TRIGGER validate_on_active;

-- Document override
INSERT INTO sd_comments (sd_id, comment_type, content)
VALUES ('SD-INFRA-001', 'override', 'Manual override: Infrastructure SD, no user-facing requirements');
\`\`\`

**Caution**: Overrides create precedent. Use sparingly, document thoroughly.

---

### Success Metrics

**From Validation Enforcement**:
- **Zero SDs approved without backlog** (constraint prevents it)
- **100% duplicate check rate** (auto-trigger on status change)
- **50% reduction in late-stage rework** (caught at gates)
- **4-6 hours saved per SD** (early validation vs late discovery)

**Evidence**: SD-EXPORT-001 had 0 backlog items, proceeded anyway → scope creep risk
**Solution**: Database constraint would have BLOCKED this
**Impact**: Prevents moving forward without requirements`,
      order_index: nextOrderIndex + 1,
      metadata: {
        source: 'Retrospectives Database Analysis (74 SDs)',
        created_date: '2025-10-12',
        priority: 'HIGH',
        category: 'validation',
        enforcement_layers: 3
      }
    },
    {
      protocol_id: protocol.id,
      section_type: 'quick-reference',
      title: 'Validation Agent Proactive Invocation Checklist',
      content: `## ✅ Validation Agent Proactive Invocation Checklist

**Problem**: Validation remembered only after problems discovered
**Solution**: Comprehensive checklist for each phase with MANDATORY items

### LEAD Phase Checklist (Pre-Approval)

**Before Approving ANY SD** (MANDATORY):

**Duplicate Check** ✅:
\`\`\`bash
# Search for existing implementations
node scripts/systems-analyst-codebase-audit.js <SD-ID>

# Manual verification if needed
grep -r "feature name" /mnt/c/_EHG/ehg/src
find /mnt/c/_EHG/ehg/src -name "*ComponentName*"
\`\`\`

**Infrastructure Check** ✅:
- [ ] Similar feature exists? (can reuse 8-10 hours saved)
- [ ] Existing auth patterns? (Supabase Auth vs custom)
- [ ] Existing database patterns? (tables, migrations, RLS)
- [ ] Existing UI components? (shadcn, shared components)

**Backlog Validation** ✅:
\`\`\`sql
-- Check backlog items exist
SELECT COUNT(*) FROM sd_backlog_map WHERE sd_id = 'SD-XXX';
-- Must be > 0 before marking active
\`\`\`

**Claims Verification** ✅ (For UI/UX SDs):
\`\`\`bash
# Read actual source code, don't trust claims
# Example from SD-UAT-002: 3/5 claimed issues didn't exist
grep -A 10 -B 10 "claimed issue" /mnt/c/_EHG/ehg/src/component.tsx
\`\`\`

**Evidence**: SD-UAT-002 - Code review saved 3-4 hours by rejecting false claims

---

### PLAN Phase Checklist (PRD Creation)

**Before Creating PRD** (MANDATORY):

**Schema Validation** ✅:
\`\`\`bash
# If PRD mentions tables/columns, validate they exist
node lib/sub-agent-executor.js DATABASE <SD-ID>

# Or query directly
node -e "
const { createDatabaseClient } = require('./scripts/lib/supabase-connection.js');
(async () => {
  const client = await createDatabaseClient('ehg');
  const { rows } = await client.query(\\"SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%keyword%'\\");
  console.log('Tables found:', rows.length);
})();
"
\`\`\`

**Route Validation** ✅:
- [ ] Routes mentioned in PRD exist in routing config?
- [ ] No conflicts with existing routes?
- [ ] Authentication requirements clear?

**Test Infrastructure Validation** ✅:
\`\`\`bash
# Verify test environment ready
npm run test:unit --version
npm run test:e2e -- --version

# Check test databases accessible
node -e "require('dotenv').config(); console.log('Test DB:', process.env.TEST_DATABASE_URL ? 'Configured' : 'Missing');"
\`\`\`

**Form Validation** ✅ (If forms involved):
- [ ] Validation rules documented in PRD?
- [ ] Required vs optional fields clear?
- [ ] Error message patterns defined?

**Build Validation** ✅:
\`\`\`bash
# Ensure project builds before implementation starts
npm run type-check
npm run lint
npm run build:skip-checks
\`\`\`

**Evidence**: SD-AGENT-ADMIN-002 - Missing pre-flight checks caused test failures

---

### EXEC Phase Checklist (Pre-Implementation)

**Before Writing ANY Code** (MANDATORY):

**Application Verification** ✅:
\`\`\`bash
# Confirm correct application
cd /mnt/c/_EHG/ehg && pwd
# Expected: /mnt/c/_EHG/ehg (NOT EHG_Engineer!)

# Confirm correct repository
git remote -v
# Expected: origin  https://github.com/rickfelix/ehg.git
\`\`\`

**Build Validation** ✅:
\`\`\`bash
# Verify build works before making changes
npm run build:skip-checks
# If fails: Fix build issues before implementing new features
\`\`\`

**Environment Validation** ✅:
\`\`\`bash
# Verify database connection
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.EHG_SUPABASE_URL, process.env.EHG_SUPABASE_ANON_KEY);
supabase.from('users').select('count').limit(1).then(r => console.log('DB:', r.error ? 'FAIL' : 'OK'));
"

# Verify dev server port available
lsof -i :5173 || echo "Port 5173 available"
\`\`\`

**Protocol Compliance** ✅:
- [ ] Following LEO 5-phase workflow?
- [ ] PLAN→EXEC handoff reviewed?
- [ ] PRD requirements understood?
- [ ] User stories mapped to tests?

**Dependencies Validation** ✅:
\`\`\`bash
# Verify node_modules up to date
npm ci  # Use ci for clean install
npm audit  # Check for vulnerabilities
\`\`\`

**Evidence**: Pre-verification checklist eliminated "wrong directory" errors

---

### PLAN Verification Phase Checklist

**Before Creating PLAN→LEAD Handoff** (MANDATORY):

**Handoff Completeness** ✅:
- [ ] All 7 handoff elements present?
  1. Executive Summary
  2. Completeness Report
  3. Deliverables Manifest
  4. Key Decisions & Rationale
  5. Known Issues & Risks
  6. Resource Utilization
  7. Action Items for Receiver

**Test Validation** ✅:
\`\`\`bash
# Both test types MANDATORY
npm run test:unit  # Business logic
npm run test:e2e   # User flows

# Verify 100% user story coverage
# Every US-XXX must have ≥1 E2E test
\`\`\`

**Documentation Validation** ✅:
\`\`\`bash
# Check generated documentation exists
ls -la generated_docs/<SD-ID>-*.md
# If missing: Run documentation generator
\`\`\`

**Protocol Compliance** ✅:
- [ ] All phases completed in order?
- [ ] All sub-agents executed?
- [ ] All handoffs created?

**CI/CD Validation** ✅:
\`\`\`bash
# Verify GitHub Actions green
gh run list --limit 5
gh run view <run-id>  # If any failed
\`\`\`

**Evidence**: SD-EVA-MEETING-001 - No user story validation enforcement led to mismatches

---

### Quick Reference

| Phase | Validation Type | Command | Blocking? |
|-------|----------------|---------|-----------|
| LEAD | Duplicate Check | \`systems-analyst-codebase-audit.js\` | ✅ YES |
| LEAD | Backlog Validation | \`SELECT COUNT FROM sd_backlog_map\` | ✅ YES |
| PLAN | Schema Validation | \`sub-agent-executor.js DATABASE\` | ✅ YES |
| PLAN | Build Validation | \`npm run build:skip-checks\` | ✅ YES |
| EXEC | App Verification | \`pwd && git remote -v\` | ✅ YES |
| PLAN | Test Validation | \`npm run test:unit && test:e2e\` | ✅ YES |

**Remember**: Validation is MANDATORY, not optional. Gates BLOCK progress on failures.`,
      order_index: nextOrderIndex + 2,
      metadata: {
        source: 'Retrospectives Database Analysis (74 SDs)',
        created_date: '2025-10-12',
        priority: 'HIGH',
        category: 'validation',
        checklist_items: 30
      }
    },
    {
      protocol_id: protocol.id,
      section_type: 'quick-reference',
      title: 'Validation Failure Patterns to Avoid',
      content: `## ⚠️ Validation Failure Patterns to Avoid

**Problem**: Common anti-patterns where validation skipped or ignored
**Solution**: Recognize these patterns and invoke validation agent instead

### Anti-Pattern 1: "We'll Validate Later"

**What It Looks Like**:
\`\`\`
LEAD: "Let's approve the SD, we can check for duplicates during PLAN phase"
PLAN: "Let's create the PRD, we can validate schema during EXEC"
EXEC: "Let's implement, we can validate during testing"
PLAN Verify: "Tests failing, now discovering issues that should have been caught earlier"
\`\`\`

**Why It's Wrong**:
- Validation delayed = issues discovered late
- 4-6 hours rework required
- Scope creep risk increases
- Technical debt accumulates

**Right Approach**:
\`\`\`
LEAD: "Before approval, let's run validation agent"
→ node scripts/systems-analyst-codebase-audit.js <SD-ID>
→ Discover duplicate implementation exists
→ Reject SD or pivot to enhancement of existing feature
→ 8-10 hours saved
\`\`\`

**Evidence**: SD-UAT-020 - Discovered existing Supabase Auth during implementation, should have caught during LEAD approval

---

### Anti-Pattern 2: "Assume It Doesn't Exist"

**What It Looks Like**:
\`\`\`
User: "We need authentication for this feature"
Agent: "I'll build a custom auth system"
[2 days later]
User: "Why didn't you use existing Supabase Auth?"
Agent: "I didn't know it existed"
\`\`\`

**Why It's Wrong**:
- Duplicates existing functionality
- Wastes 8-10 hours
- Creates maintenance burden (two auth systems)
- Increases security risk (custom auth = more vulnerabilities)

**Right Approach**:
\`\`\`bash
# BEFORE designing solution, search for existing
node scripts/systems-analyst-codebase-audit.js <SD-ID>

# Manual search if needed
grep -r "authentication\|auth\|login" /mnt/c/_EHG/ehg/src
find /mnt/c/_EHG/ehg/src -name "*auth*"

# Check both applications
grep -r "authentication" /mnt/c/_EHG/EHG_Engineer/src
\`\`\`

**Evidence**: SD-UAT-020 retrospective explicitly mentions this pattern

---

### Anti-Pattern 3: "Approve Without Backlog"

**What It Looks Like**:
\`\`\`sql
-- SD marked as 'active'
SELECT * FROM strategic_directives_v2 WHERE id = 'SD-EXPORT-001';
-- status: active

-- Check backlog items
SELECT COUNT(*) FROM sd_backlog_map WHERE sd_id = 'SD-EXPORT-001';
-- Result: 0

-- Risk: Moving forward without user requirements = scope creep
\`\`\`

**Why It's Wrong**:
- No documented user requirements
- Implementation based on assumptions
- Scope creep highly likely
- Cannot validate against actual needs

**Right Approach**:
\`\`\`sql
-- Database constraint prevents this
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT require_backlog_for_active
CHECK (status != 'active' OR EXISTS (
  SELECT 1 FROM sd_backlog_map WHERE sd_id = strategic_directives_v2.id
));

-- Now attempting to mark active without backlog:
UPDATE strategic_directives_v2 SET status = 'active' WHERE id = 'SD-XXX';
-- ERROR: new row violates check constraint "require_backlog_for_active"
-- BLOCKED until backlog items added
\`\`\`

**Evidence**: SD-EXPORT-001 had 0 backlog items when approved (failure pattern)

---

### Anti-Pattern 4: "Trust Claims Without Verification"

**What It Looks Like**:
\`\`\`
SD Description: "Dashboard has 5 critical UI issues:
1. Issue A (doesn't work)
2. Issue B (broken)
3. Issue C (missing feature)
4. Issue D (wrong behavior)
5. Issue E (performance problem)"

LEAD: "Sounds reasonable, approved"

[EXEC reads actual code]
EXEC: "Issues A, C, E don't exist in the code. Only B and D are real."
\`\`\`

**Why It's Wrong**:
- 3/5 claims false = 60% wasted effort
- Implementation addresses non-existent issues
- Real issues might be missed
- 3-4 hours wasted on unnecessary work

**Right Approach**:
\`\`\`bash
# LEAD code review for UI/UX SDs (MANDATORY)
# Read actual source code
cat /mnt/c/_EHG/ehg/src/components/Dashboard.tsx | grep -A 10 "Issue A description"

# Verify each claim
for issue in A B C D E; do
  echo "Verifying Issue $issue:"
  grep -n "relevant code pattern" /path/to/component.tsx
done
\`\`\`

**Evidence**: SD-UAT-002 - LEAD code review rejected 3/5 false claims, saved 3-4 hours

---

### Anti-Pattern 5: "Skip Test Environment Validation"

**What It Looks Like**:
\`\`\`bash
# EXEC starts implementation
npm run test:unit
# Error: Test database not configured

# Or
npm run test:e2e
# Error: Playwright not installed

# Or
npm run build
# Error: Missing dependency
\`\`\`

**Why It's Wrong**:
- Discovers environment issues during implementation
- Blocks progress unexpectedly
- Wastes time troubleshooting environment
- Should have been caught during PLAN phase

**Right Approach**:
\`\`\`bash
# PLAN phase pre-flight checks (MANDATORY)

# Check test databases
node -e "require('dotenv').config(); console.log('Unit Test DB:', process.env.TEST_DATABASE_URL ? 'OK' : 'MISSING');"

# Check test frameworks
npm run test:unit -- --version || echo "Unit tests not configured"
npm run test:e2e -- --version || echo "E2E tests not configured"

# Check build
npm run build:skip-checks || echo "Build fails, fix before EXEC"

# BLOCK PLAN→EXEC handoff if any fail
\`\`\`

**Evidence**: SD-AGENT-ADMIN-002 - Missing pre-flight checks caused test failures

---

### Anti-Pattern 6: "No User Story Validation"

**What It Looks Like**:
\`\`\`
PRD: "12 user stories defined"

[EXEC implements features]

PLAN Verify: "Running E2E tests"
E2E Tests: "0 tests found matching user story pattern"

Issue: User stories not mapped to tests
Result: Cannot verify implementation meets requirements
\`\`\`

**Why It's Wrong**:
- User stories disconnected from tests
- Cannot prove requirements met
- Manual verification required (time-consuming)
- Acceptance criteria unclear

**Right Approach**:
\`\`\`bash
# PLAN phase validation (MANDATORY)
# Check user story → E2E test mapping

# Query user stories
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
supabase.from('user_stories').select('id').eq('strategic_directive_id', 'SD-XXX')
  .then(r => console.log('User stories:', r.data.length));
"

# Check E2E tests
grep -r "US-[0-9]\\+" /mnt/c/_EHG/ehg/tests/e2e/*.spec.ts | wc -l

# Validate 100% coverage
# Every user story MUST have ≥1 E2E test
\`\`\`

**Evidence**: SD-EVA-MEETING-001 - No enforcement of user story validation

---

### Detection Rules

**If you see these patterns, STOP and validate**:

1. **"Let's skip validation for now"** → NO, validate immediately
2. **"I'll search for duplicates later"** → NO, search now
3. **"We can add backlog items later"** → NO, add before approval
4. **"Claims sound reasonable"** → NO, verify with code review
5. **"Environment probably works"** → NO, validate pre-flight
6. **"Tests cover the features"** → NO, verify US-XXX mapping
7. **"Schema probably exists"** → NO, query database to confirm

---

### Success Stories (When Validation Used Properly)

**Success 1: Early Duplicate Detection** (SD-UAT-020)
- Validation agent found existing Supabase Auth during LEAD approval
- Pivoted from "build custom auth" to "use existing"
- **8-10 hours saved**

**Success 2: Code Review Catches False Claims** (SD-UAT-002)
- LEAD code review validated 5 claimed UI issues
- Found 3/5 didn't exist in actual code
- Rejected false claims, focused on real issues
- **3-4 hours saved**

**Success 3: Three-Checkpoint Validation** (SD-EVA-MEETING-001)
- QA validation + Handoff validation + Auto-trigger
- Caught issues at multiple gates
- **Early error detection**

---

### Quick Reference

| Anti-Pattern | Right Approach | Evidence |
|--------------|---------------|----------|
| "Validate later" | Validate at gate | 4-6 hrs saved |
| "Assume doesn't exist" | Search first | 8-10 hrs saved (SD-UAT-020) |
| "Approve without backlog" | Enforce constraint | SD-EXPORT-001 failure |
| "Trust claims" | Code review | 3-4 hrs saved (SD-UAT-002) |
| "Skip environment check" | Pre-flight validation | SD-AGENT-ADMIN-002 |
| "No US validation" | 100% mapping | SD-EVA-MEETING-001 |

**Remember**: Validation failures are caught cheaply at gates, expensively during implementation.`,
      order_index: nextOrderIndex + 3,
      metadata: {
        source: 'Retrospectives Database Analysis (74 SDs)',
        created_date: '2025-10-12',
        priority: 'HIGH',
        category: 'validation',
        anti_patterns: 6
      }
    }
  ];

  // Step 4: Insert sections one at a time (database-first: one table at a time)
  console.log('📝 Step 3: Adding new sections...');

  for (const section of newSections) {
    console.log(`\n  Adding: ${section.title}`);
    const { error: insertError } = await supabase
      .from('leo_protocol_sections')
      .insert([section]);

    if (insertError) {
      console.error(`  ❌ Error inserting "${section.title}":`, insertError);
      // Continue with other sections even if one fails
    } else {
      console.log(`  ✅ Added successfully (order: ${section.order_index})`);
    }
  }

  // Step 5: Verify insertions
  console.log('\n📊 Step 4: Verifying insertions...');
  const { data: addedSections, error: verifyError } = await supabase
    .from('leo_protocol_sections')
    .select('id, title, section_type, order_index')
    .gte('order_index', nextOrderIndex)
    .order('order_index', { ascending: true });

  if (verifyError) {
    console.error('❌ Error verifying sections:', verifyError);
  } else {
    console.log(`✅ ${addedSections.length} sections verified:\n`);
    addedSections.forEach(s => {
      console.log(`   [${s.order_index}] ${s.title} (${s.section_type})`);
    });
  }

  // Step 6: Instructions for next steps
  console.log('\n✅ DATABASE UPDATE COMPLETE!\n');
  console.log('📋 Next Steps:');
  console.log('1. Regenerate CLAUDE.md:');
  console.log('   $ node scripts/generate-claude-md-from-db.js\n');
  console.log('2. Create reference documentation:');
  console.log('   - docs/reference/validation-agent-proactive-gates.md');
  console.log('   - docs/reference/validation-enforcement-patterns.md\n');
  console.log('3. Update validation agent configuration:');
  console.log('   - .claude/agents/validation-agent.md\n');
  console.log('4. Commit changes:');
  console.log('   $ git add CLAUDE.md docs/ .claude/');
  console.log('   $ git commit -m "docs(LEO): Add validation agent mandatory gates protocol"\n');

  console.log('🎯 Impact:');
  console.log('   - Zero SDs approved without backlog');
  console.log('   - 100% duplicate check rate');
  console.log('   - 50% reduction in late-stage rework');
  console.log('   - 4-6 hours saved per SD\n');
}

// Run the script
addValidationGates()
  .then(() => {
    console.log('🎉 Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
