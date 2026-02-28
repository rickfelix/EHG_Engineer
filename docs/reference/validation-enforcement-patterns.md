---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Validation Enforcement Patterns Guide



## Table of Contents

- [Metadata](#metadata)
- [Executive Summary](#executive-summary)
- [Why Validation Gates Are Critical](#why-validation-gates-are-critical)
  - [The Failure Cycle (Without Gates)](#the-failure-cycle-without-gates)
  - [The Gate-Based Pattern (With Enforcement)](#the-gate-based-pattern-with-enforcement)
- [Validation Failure Patterns Catalog](#validation-failure-patterns-catalog)
  - [❌ Failure Pattern 1: No Backlog Validation](#-failure-pattern-1-no-backlog-validation)
  - [❌ Failure Pattern 2: Skipping Duplicate Check](#-failure-pattern-2-skipping-duplicate-check)
  - [❌ Failure Pattern 3: Trusting Claims Without Code Review](#-failure-pattern-3-trusting-claims-without-code-review)
- [UI/UX Claim Verification (MANDATORY for GATE 1)](#uiux-claim-verification-mandatory-for-gate-1)
  - [❌ Failure Pattern 4: Late-Stage Infrastructure Discovery](#-failure-pattern-4-late-stage-infrastructure-discovery)
  - [❌ Failure Pattern 5: Missing User Story Validation](#-failure-pattern-5-missing-user-story-validation)
  - [❌ Failure Pattern 6: Ignoring Existing Patterns](#-failure-pattern-6-ignoring-existing-patterns)
- [GATE 3: Pattern Validation (MANDATORY before EXEC)](#gate-3-pattern-validation-mandatory-before-exec)
- [Enforcement Mechanisms](#enforcement-mechanisms)
  - [1. Database Constraints (Automatic Enforcement)](#1-database-constraints-automatic-enforcement)
  - [2. Auto-Trigger System (Orchestration)](#2-auto-trigger-system-orchestration)
  - [3. Script-Level Blocking (Handoff System)](#3-script-level-blocking-handoff-system)
- [Detection Rules](#detection-rules)
  - [BLOCKED PATTERNS (Validation Agent Required)](#blocked-patterns-validation-agent-required)
  - [Auto-Trigger Keywords](#auto-trigger-keywords)
- [Success Stories (When Gates Used Properly)](#success-stories-when-gates-used-properly)
  - [Success 1: Duplicate Detection (SD-UAT-002)](#success-1-duplicate-detection-sd-uat-002)
  - [Success 2: Infrastructure Reuse (SD-UAT-020)](#success-2-infrastructure-reuse-sd-uat-020)
  - [Success 3: Backlog Enforcement (Database Constraint)](#success-3-backlog-enforcement-database-constraint)
- [Failure Stories (When Gates Missed)](#failure-stories-when-gates-missed)
  - [Failure 1: No Backlog Validation (SD-EXPORT-001)](#failure-1-no-backlog-validation-sd-export-001)
  - [Failure 2: Skipped Duplicate Check (SD-UAT-020 - before gates)](#failure-2-skipped-duplicate-check-sd-uat-020---before-gates)
- [Quick Reference](#quick-reference)
- [Related Documentation](#related-documentation)
- [Version History](#version-history)

## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-13
- **Tags**: database, testing, e2e, schema

**Status**: ACTIVE
**Last Updated**: 2025-10-12
**Evidence**: 74 retrospectives analyzed, 12 SDs with validation agent lessons

---

## Executive Summary

This guide documents **6 validation failure patterns** where agents skip validation gates, leading to duplicate work, scope ambiguity, and late-stage rework. Each pattern represents 2-10 hours of wasted effort per incident.

**Key Insight** (User Feedback):
> "I often need to remind myself to use the database subagent [validation subagent], as it's brilliant when working with Superbase."

**Impact of Skipping Gates**:
- Duplicate work: 8-10 hours wasted
- Scope ambiguity: 2-3 hours of rework
- Late-stage discovery: 4-6 hours wasted
- False assumptions: 3-4 hours wasted
- Missing validation: 2-3 hours post-hoc work

---

## Why Validation Gates Are Critical

### The Failure Cycle (Without Gates)

1. **LEAD approves SD without validation** (no duplicate check, no backlog items)
2. **PLAN creates PRD without infrastructure check** (assumes tables/routes available)
3. **EXEC discovers duplicate mid-implementation** (too late, already committed time)
4. **Late-stage rework required** (remove duplicate, adjust scope)
5. **User intervenes**: "Why didn't you check for existing implementations?"

**Total Time Wasted**: 6-12 hours

---

### The Gate-Based Pattern (With Enforcement)

1. **GATE 1 (LEAD)**: Validation agent checks for duplicates, validates backlog
2. **Duplicate found OR 0 backlog items**: SD rejected or scope adjusted BEFORE approval
3. **GATE 2 (PLAN)**: Infrastructure check identifies existing components/schemas
4. **PRD leverages existing infrastructure** (reuse > rebuild)
5. **GATE 3 (EXEC)**: Final check confirms using established patterns
6. **GATE 4 (PLAN Verify)**: SCOPE LOCK enforcement prevents creep
7. **Zero rework, proper reuse**

**Total Time Saved**: 6-12 hours per SD

---

## Validation Failure Patterns Catalog

### ❌ Failure Pattern 1: No Backlog Validation

**What It Looks Like**:
```javascript
// WRONG: Approve SD without checking backlog items
const { error } = await supabase
  .from('strategic_directives_v2')
  .update({ status: 'active', priority: 85 })
  .eq('id', sd_id);

// Result: SD has 0 backlog items
// Impact: Scope ambiguity, unclear requirements, late-stage rework
```

**Why It's Wrong**:
- No backlog items = no clear scope definition
- PRD creation becomes ambiguous (what to include?)
- EXEC phase lacks clear requirements
- Testing unclear (what are acceptance criteria?)
- **Time Wasted**: 2-3 hours of scope clarification discussions

**Right Approach**:
```bash
# GATE 1: Validate backlog items BEFORE approval
node scripts/orchestrate-phase-subagents.js LEAD_PRE_APPROVAL <SD-ID>

# Validation agent will:
# 1. Query sd_backlog_map table for backlog items
# 2. If 0 items: BLOCK SD approval
# 3. Escalate to LEAD: "SD cannot be activated without backlog items"
# 4. LEAD must add backlog items or close SD
```

**Database Constraint** (Automatic Enforcement):
```sql
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT require_backlog_for_active
CHECK (status != 'active' OR EXISTS (
  SELECT 1 FROM sd_backlog_map WHERE sd_id = strategic_directives_v2.id
));
```

**Evidence**: SD-EXPORT-001 - Approved with 0 backlog items → scope ambiguity, late-stage rework

---

### ❌ Failure Pattern 2: Skipping Duplicate Check

**What It Looks Like**:
```javascript
// WRONG: Assume feature doesn't exist without searching
// "We need a user authentication system"
// (Proceeds to build custom auth, Supabase Auth already exists)

// No codebase search performed
// No validation agent invoked
// Discovery happens mid-EXEC phase
```

**Why It's Wrong**:
- Wastes 8-10 hours building duplicate functionality
- Creates inconsistent patterns (two auth systems)
- Increases maintenance burden
- Ignores existing, tested infrastructure
- **Time Wasted**: 8-10 hours of development

**Right Approach**:
```bash
# GATE 1: Invoke validation agent BEFORE approval
node scripts/systems-analyst-codebase-audit.js <SD-ID>

# Validation agent will:
# 1. Search codebase for "auth", "authentication", "login"
# 2. Check existing database tables (users, sessions)
# 3. Identify Supabase Auth integration
# 4. Report: "Existing authentication system found"
# 5. Recommendation: "Leverage existing Supabase Auth"
```

**Search Pattern**:
```bash
# Manual duplicate check (if needed)
grep -r "authentication" ../ehg/src
grep -r "Supabase.*Auth" ../ehg/src
find ../ehg/src -name "*auth*"
```

**Evidence**: SD-UAT-020 - Discovered existing Supabase Auth mid-implementation → wasted effort on custom solution

---

### ❌ Failure Pattern 3: Trusting Claims Without Code Review

**What It Looks Like**:
```javascript
// WRONG: Accept UI/UX SD claims without verification
// SD Claims:
// - "Login form has 5 accessibility issues"
// - "Color contrast fails WCAG AA standards"
// - "Keyboard navigation broken"
// - "Screen reader incompatible"
// - "Focus indicators missing"

// LEAD approves without reading source code
// PLAN creates PRD for all 5 issues
// EXEC discovers only 2 issues actually exist
// Result: 3 issues are false claims
```

**Why It's Wrong**:
- Wastes 3-4 hours working on non-existent issues
- Creates unnecessary PRD content
- Misleads EXEC agent with false requirements
- Reduces trust in SD quality
- **Time Wasted**: 3-4 hours of unnecessary work

**Right Approach**:
```bash
# GATE 1: Code review MANDATORY for UI/UX SDs claiming issues
# Step 1: Read actual source code
cat ../ehg/src/components/auth/LoginForm.tsx

# Step 2: Verify EACH claim against implementation
# Claim 1: "Color contrast fails WCAG AA" → Check CSS, verify with tool
# Claim 2: "Keyboard navigation broken" → Check tabIndex, onKeyDown handlers
# Claim 3: "Screen reader incompatible" → Check aria-labels, roles

# Step 3: Document findings
# Result: 2/5 claims verified, 3/5 false claims rejected
```

**Verification Checklist**:
```markdown
## UI/UX Claim Verification (MANDATORY for GATE 1)
- [ ] Read source code for component mentioned in SD
- [ ] Verify accessibility claims with actual attributes (aria-*, role, tabIndex)
- [ ] Check color contrast with tool (not assumption)
- [ ] Test keyboard navigation manually (if claim made)
- [ ] Document which claims are TRUE vs FALSE
- [ ] Update SD scope to reflect verified issues only
```

**Evidence**: SD-UAT-002 - Code review rejected 3/5 false claims → saved 3-4 hours of unnecessary work

---

### ❌ Failure Pattern 4: Late-Stage Infrastructure Discovery

**What It Looks Like**:
```javascript
// WRONG: Discover existing infrastructure during EXEC phase
// PLAN creates PRD: "Build custom authentication system"
// EXEC starts implementation:
//   - Creates custom login component
//   - Creates custom session management
//   - Creates custom password hashing
//   - 4 hours into development...
//   - Discovers: Supabase Auth already configured

// Result: 4 hours wasted, need to rebuild using Supabase Auth
```

**Why It's Wrong**:
- Infrastructure check should happen in GATE 2 (PLAN), not GATE 3 (EXEC)
- Wasted development effort
- Creates technical debt (custom solution vs established pattern)
- Delays delivery
- **Time Wasted**: 4-6 hours rebuilding

**Right Approach**:
```bash
# GATE 2: Infrastructure check BEFORE PRD creation
node scripts/systems-analyst-codebase-audit.js <SD-ID>

# Validation agent will:
# 1. Search for existing authentication patterns
# 2. Check Supabase configuration: src/lib/supabase.ts
# 3. Query users table (indicates auth system exists)
# 4. Report: "Supabase Auth configured and in use"
# 5. PRD updated to leverage existing Supabase Auth
```

**Infrastructure Search Pattern**:
```bash
# Check configuration files
cat ../ehg/src/lib/supabase.ts
grep -r "createClient" ../ehg/src

# Check existing auth usage
grep -r "supabase.auth" ../ehg/src
grep -r "signIn\|signUp\|signOut" ../ehg/src

# Check database tables
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
supabase.from('users').select('id').limit(1).then(({ data }) => console.log('Users table exists:', !!data));
"
```

**Evidence**: SD-UAT-020 - Leveraged existing Supabase Auth after GATE 2 validation → saved 8-10 hours

---

### ❌ Failure Pattern 5: Missing User Story Validation

**What It Looks Like**:
```javascript
// WRONG: Create user stories without E2E test mapping
// PRD contains:
// - US-001: User can create new venture
// - US-002: User can edit venture details
// - US-003: User can delete venture
// - US-004: User can view venture list

// E2E tests directory: tests/e2e/
// Test files exist but no mapping to user stories
// Result: Unclear which tests cover which user stories
```

**Why It's Wrong**:
- No traceability (which test validates which story?)
- Manual testing required to verify stories
- Unclear acceptance criteria
- Post-hoc test creation burden
- **Time Wasted**: 2-3 hours creating tests after implementation

**Right Approach**:
```bash
# GATE 2: QA Director validates test infrastructure
node scripts/qa-engineering-director-enhanced.js <SD-ID>

# QA Director will:
# 1. Read PRD user stories
# 2. Check existing E2E tests for similar patterns
# 3. Validate 100% user story → E2E test mapping required
# 4. Block PRD if test infrastructure insufficient
# 5. Recommend test patterns to follow
```

**Test Naming Convention** (Enforcement):
```typescript
// MANDATORY: Every E2E test must reference user story
test('US-001: User can create new venture', async ({ page }) => {
  // Test implementation
});

test('US-002: User can edit venture details', async ({ page }) => {
  // Test implementation
});

// Coverage Formula:
// (E2E Tests with US-XXX / Total User Stories) × 100 = 100% (required)
```

**Evidence**: SD-EVA-MEETING-001 - User stories existed but no E2E tests → manual testing burden, unclear acceptance criteria

---

### ❌ Failure Pattern 6: Ignoring Existing Patterns

**What It Looks Like**:
```javascript
// WRONG: Create new pattern when established one exists
// Established pattern (scripts/lib/supabase-connection.js):
import { createDatabaseClient } from '../lib/supabase-connection.js';
const client = await createDatabaseClient('ehg', { verify: true });

// But EXEC creates custom connection:
const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.PROJECT:PASSWORD@aws-0-us-east-1...',
  ssl: { rejectUnauthorized: false }
});
await client.connect();

// Result: Inconsistent pattern, wrong region (aws-0 vs aws-1), manual SSL config
```

**Why It's Wrong**:
- Creates inconsistent codebase patterns
- Ignores validated connection helpers
- Increases maintenance burden ("Why do we have two connection patterns?")
- May introduce bugs (wrong region, incorrect SSL config)
- **Time Wasted**: 1-2 hours debugging connection issues

**Right Approach**:
```bash
# GATE 3: Pattern validation BEFORE writing code
# Step 1: Search for existing patterns
grep -r "createDatabaseClient" ../ehg/scripts
cat ../ehg/scripts/lib/supabase-connection.js

# Step 2: Use established pattern
import { createDatabaseClient } from '../lib/supabase-connection.js';
const client = await createDatabaseClient('ehg', { verify: true });

# Step 3: If custom pattern NEEDED, document why
// TODO: Using custom connection because [specific reason]
// Standard pattern insufficient due to [constraint]
```

**Pattern Validation Checklist**:
```markdown
## GATE 3: Pattern Validation (MANDATORY before EXEC)
- [ ] Search for existing patterns (connection helpers, UI components, utilities)
- [ ] Verify pattern applies to current use case
- [ ] Use established pattern if available
- [ ] If custom pattern needed: Document justification in code
- [ ] Update pattern library if new pattern is superior
```

**Evidence**: All successful database SDs use `createDatabaseClient` helper consistently

---

## Enforcement Mechanisms

### 1. Database Constraints (Automatic Enforcement)

**Backlog Requirement Constraint**:
```sql
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT require_backlog_for_active
CHECK (status != 'active' OR EXISTS (
  SELECT 1 FROM sd_backlog_map WHERE sd_id = strategic_directives_v2.id
));
```

**Impact**:
- Database-level enforcement (cannot be bypassed)
- Prevents SD activation without backlog items
- Forces LEAD to add backlog items before approval
- Eliminates scope ambiguity at source

**When Triggered**:
```javascript
// Attempt to activate SD without backlog items
const { error } = await supabase
  .from('strategic_directives_v2')
  .update({ status: 'active' })
  .eq('id', 'SD-XXX');

// Result: Error - Constraint "require_backlog_for_active" violated
// Message: Cannot activate SD without backlog items
```

---

### 2. Auto-Trigger System (Orchestration)

**Configuration** (`leo_sub_agent_triggers` table):
```javascript
{
  sub_agent_id: 'validation-agent-uuid',
  trigger_type: 'phase',
  trigger_phrase: 'LEAD_PRE_APPROVAL',
  priority: 95,
  is_active: true
}
```

**Orchestration Flow**:
```bash
# User creates LEAD→PLAN handoff
node scripts/unified-handoff-system.js execute LEAD-to-PLAN <SD-ID>

# System automatically:
# 1. Queries leo_sub_agent_triggers for LEAD_PRE_APPROVAL phase
# 2. Finds VALIDATION, DATABASE, SECURITY, DESIGN agents
# 3. Executes all agents in parallel
# 4. Stores results in sub_agent_execution_results table
# 5. Blocks handoff if any CRITICAL agent fails
```

**Auto-Trigger Benefits**:
- No manual invocation needed
- Parallel execution (saves time)
- Consistent validation every time
- Audit trail in database

---

### 3. Script-Level Blocking (Handoff System)

**GATE 1 Enforcement** (unified-handoff-system.js):
```javascript
// Check backlog items before LEAD→PLAN handoff
const { data: backlogItems } = await supabase
  .from('sd_backlog_map')
  .select('*')
  .eq('sd_id', sd_id);

if (!backlogItems || backlogItems.length === 0) {
  console.error('❌ GATE 1 BLOCKED: SD has 0 backlog items');
  console.error('Cannot proceed to PLAN phase without backlog validation');
  console.error('Action required: Add backlog items to sd_backlog_map table');
  process.exit(1); // Block handoff creation
}
```

**GATE 2 Enforcement** (orchestrate-phase-subagents.js):
```javascript
// Check validation agent results before PLAN→EXEC handoff
const { data: validationResults } = await supabase
  .from('sub_agent_execution_results')
  .select('*')
  .eq('sd_id', sd_id)
  .eq('sub_agent_code', 'VALIDATION')
  .order('created_at', { ascending: false })
  .limit(1);

if (validationResults && validationResults.verdict === 'BLOCKED') {
  console.error('❌ GATE 2 BLOCKED: Validation agent found critical issues');
  console.error('Cannot proceed to EXEC phase without resolving:');
  console.error(validationResults.key_findings);
  process.exit(1); // Block handoff creation
}
```

**GATE 4 Enforcement** (plan-supervisor-verification.js):
```javascript
// Check for scope creep before PLAN→LEAD handoff
const prdFeatures = await getPRDFeatures(prd_id); // From PRD
const deliveredFeatures = await getDeliveredFeatures(sd_id); // From code

const scopeCreep = deliveredFeatures.filter(f => !prdFeatures.includes(f));

if (scopeCreep.length > 0) {
  console.error('❌ GATE 4 BLOCKED: Scope creep detected');
  console.error('Features delivered but not in PRD:');
  scopeCreep.forEach(f => console.error(`  - ${f}`));
  console.error('Action required: Remove extra features OR create new SD');
  process.exit(1); // Block handoff creation
}
```

---

## Detection Rules

### BLOCKED PATTERNS (Validation Agent Required)

**If you see ANY of these patterns, STOP and invoke validation agent**:

1. **Approving SD without checking backlog items**
2. **Creating PRD without infrastructure validation**
3. **Starting implementation without duplicate check**
4. **Accepting UI/UX claims without code review**
5. **Building custom solution when existing infrastructure may exist**
6. **Creating new patterns without searching for existing ones**
7. **Claiming completion without SCOPE LOCK validation**

---

### Auto-Trigger Keywords

**These keywords MUST trigger validation agent consideration**:
- "new feature" (check for duplicates)
- "build [system/component]" (check for existing)
- "create [table/schema]" (check infrastructure)
- "authentication" / "auth" (Supabase Auth exists?)
- "UI issue" / "accessibility" (verify with code review)
- "scope complete" (SCOPE LOCK validation)

---

## Success Stories (When Gates Used Properly)

### Success 1: Duplicate Detection (SD-UAT-002)

**Situation**: UI/UX SD claimed 5 accessibility issues in login form

**Wrong Approach**: Accept claims, approve SD, create PRD for all 5 issues

**Validation Gate Approach (GATE 1)**:
1. Invoked validation agent for code review
2. Read source code: `../ehg/src/components/auth/LoginForm.tsx`
3. Verified each claim against implementation
4. Result: 2/5 claims verified, 3/5 false claims
5. Updated SD scope to reflect verified issues only
6. LEAD approved reduced scope

**Result**: Saved 3-4 hours of unnecessary work

---

### Success 2: Infrastructure Reuse (SD-UAT-020)

**Situation**: SD requested custom authentication system

**Validation Gate Approach (GATE 2)**:
1. Invoked validation agent for infrastructure check
2. Searched codebase for existing auth patterns
3. Found Supabase Auth configured and in use
4. Recommendation: Leverage existing Supabase Auth
5. PRD updated to use Supabase Auth instead of building custom

**Result**: Saved 8-10 hours of development time

---

### Success 3: Backlog Enforcement (Database Constraint)

**Situation**: LEAD attempts to approve SD without backlog items

**Validation Gate Approach (GATE 1 - Database Constraint)**:
1. LEAD updates SD status to 'active'
2. Database constraint `require_backlog_for_active` checks sd_backlog_map
3. Constraint finds 0 backlog items
4. Database BLOCKS update with error
5. LEAD forced to add backlog items before approval

**Result**: Eliminated scope ambiguity at source

---

## Failure Stories (When Gates Missed)

### Failure 1: No Backlog Validation (SD-EXPORT-001)

**Situation**: SD approved with 0 backlog items

**What Happened**:
- LEAD approved SD without checking backlog items
- PLAN created PRD with ambiguous scope
- EXEC unclear what to implement
- Late-stage scope clarification required

**Time Lost**: 2-3 hours of rework

**Should Have Done**: Invoke validation agent at GATE 1, enforce backlog requirement

---

### Failure 2: Skipped Duplicate Check (SD-UAT-020 - before gates)

**Situation**: Started building custom authentication system

**What Happened**:
- No duplicate check performed
- 4 hours into custom auth implementation
- Discovered existing Supabase Auth mid-EXEC
- Had to rebuild using Supabase Auth

**Time Lost**: 4-6 hours wasted on duplicate work

**Should Have Done**: Invoke validation agent at GATE 1 or GATE 2 for infrastructure check

---

## Quick Reference

| Scenario | WRONG Approach | RIGHT Approach (Gate) |
|----------|---------------|----------------------|
| Approving SD | No backlog check | GATE 1: Validate ≥1 backlog items |
| UI/UX claims | Trust claims | GATE 1: Code review verification |
| Creating PRD | Assume infrastructure | GATE 2: Infrastructure check |
| Starting EXEC | No duplicate check | GATE 3: Final duplicate check |
| Claiming done | Ignore scope creep | GATE 4: SCOPE LOCK validation |

---

## Related Documentation

- `CLAUDE.md` Sections 2358-2361 - Validation Agent Mandatory Gates
- `docs/reference/validation-agent-proactive-gates.md` - Gate-by-gate guide
- `scripts/systems-analyst-codebase-audit.js` - Validation agent implementation
- `.claude/agents/validation-agent.md` - Validation agent configuration

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-12 | Initial version from 74 retrospectives analysis |

---

**REMEMBER**: Validation gates are **enforcement points**, not suggestions. Gates BLOCK progress when critical issues detected. Skipping gates = wasted time. Using gates = saved time (4-12 hours per SD).
