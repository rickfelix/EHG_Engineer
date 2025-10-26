# Validation Agent Proactive Gates Quick Reference

**Status**: ACTIVE
**Last Updated**: 2025-10-12
**Purpose**: Quick reference for mandatory validation gates and enforcement

---

## Core Principle

**VALIDATION AGENT IS A FIRST RESPONDER, NOT OPTIONAL CHECKMARK**

```
SD creation → GATE 1 (LEAD) → GATE 2 (PLAN) → GATE 3 (EXEC) → GATE 4 (PLAN Verify) → Completion
```

Every gate is MANDATORY. Gates BLOCK progress when critical issues detected.

---

## 4 Mandatory Validation Gates

### GATE 1: LEAD Pre-Approval (BLOCKING)

**When**: Before approving ANY Strategic Directive
**Who**: LEAD agent
**Purpose**: Prevent duplicate work, validate scope clarity

**Mandatory Checks**:
- [ ] **Duplicate Check**: Does this feature/capability already exist?
- [ ] **Infrastructure Check**: Can we leverage existing tools/libraries?
- [ ] **Backlog Validation**: ≥1 backlog item required (database constraint)
- [ ] **Claims Verification**: For UI/UX SDs, verify issues exist via code review

**Invocation**:
```bash
# Automated (preferred)
node scripts/orchestrate-phase-subagents.js LEAD_PRE_APPROVAL <SD-ID>

# Manual
node scripts/systems-analyst-codebase-audit.js <SD-ID>
```

**Blocks When**:
- Duplicate feature found → Escalate to LEAD with evidence, consider closing SD
- 0 backlog items → Cannot mark SD as 'active' (database constraint enforced)
- False UI/UX claims found → Reduce scope or reject SD

**Success Pattern** (SD-UAT-002):
> "Code review revealed 3/5 claimed issues didn't exist → saved 3-4 hours of unnecessary work"

**Failure Pattern** (SD-EXPORT-001):
> "Approved with 0 backlog items → scope ambiguity, late-stage rework"

---

### GATE 2: PLAN PRD Creation (BLOCKING)

**When**: Before creating Product Requirements Document
**Who**: PLAN agent
**Purpose**: Validate technical feasibility, identify infrastructure gaps

**Mandatory Checks**:
- [ ] **Schema Validation**: Database tables exist or migration planned
- [ ] **Route Validation**: URLs/paths available and not conflicting
- [ ] **Component Validation**: Check for existing similar components (reuse > rebuild)
- [ ] **User Story Validation**: User stories created in PRD and mapped to E2E tests (100% coverage required)
- [ ] **Test Infrastructure Validation**: Existing test patterns identified

**Invocation**:
```bash
# Automated (preferred)
node scripts/orchestrate-phase-subagents.js PLAN_PRD <SD-ID>

# Manual
node scripts/systems-analyst-codebase-audit.js <SD-ID>
node lib/sub-agent-executor.js VALIDATION <SD-ID>
```

**Blocks When**:
- Critical schema gaps → Escalate to database agent + LEAD decision
- Route conflicts detected → Resolve before PRD creation
- User stories missing or not mapped to E2E tests → Must complete before PRD approval
- Missing test infrastructure → Create infrastructure SD first

**Success Pattern** (SD-UAT-020):
> "Leveraged existing Supabase Auth instead of building custom → saved 8-10 hours"

**Failure Pattern**:
> "Discovered existing infrastructure mid-implementation → wasted effort on custom solution"

---

### GATE 3: EXEC Pre-Implementation (WARNING)

**When**: Before writing ANY code
**Who**: EXEC agent
**Purpose**: Final duplicate check, pattern validation

**Mandatory Checks**:
- [ ] **Final Duplicate Check**: No new duplicates created during planning phase
- [ ] **Pattern Validation**: Using established patterns (connection helpers, UI components)
- [ ] **Dependency Validation**: All required libraries/tools available
- [ ] **Test Strategy Validation**: Test plan aligns with existing framework

**Invocation**:
```bash
# Quick duplicate check before coding
node lib/sub-agent-executor.js VALIDATION <SD-ID>

# Search for similar implementations
grep -r "feature_name" /mnt/c/_EHG/ehg/src
find /mnt/c/_EHG/ehg/src/components -name "*ComponentName*"
```

**Warns When**:
- Minor pattern deviations detected → Document why custom approach needed
- Dependency installation needed → Install before coding

**Blocks When**:
- Duplicate work detected → STOP, escalate to LEAD

**Success Pattern**:
> "Using existing patterns improves maintainability, reduces onboarding time"

---

### GATE 4: PLAN Verification (AUDIT)

**When**: Before PLAN→LEAD handoff (final approval)
**Who**: PLAN agent (supervisor mode)
**Purpose**: Ensure delivered features match approved scope

**Mandatory Checks**:
- [ ] **Sub-Agent Coverage**: All appropriate sub-agents invoked based on SD characteristics
- [ ] **User Story Completion**: All user stories delivered and E2E tests passing (100% coverage validation)
- [ ] **Implementation Validation**: Code matches approved PRD scope exactly
- [ ] **No Scope Creep**: Delivered features = approved features (SCOPE LOCK enforcement)
- [ ] **Documentation Validation**: All changes documented (generated_docs, ADRs)
- [ ] **Integration Validation**: New code integrates with existing systems
- [ ] **UI Integration Verification**: All UI entry points connected and tested (NEW)
  - Buttons have event handlers (onClick)
  - Links have proper navigation (href, router)
  - User journey tested from entry point → feature → success
  - E2E tests validate actual UI entry point (not bypassed)

**Sub-Agent Coverage Requirements**:

**MANDATORY for ALL SDs** (Must execute for every SD):
- VALIDATION (Principal Systems Analyst) - Duplicate check, infrastructure validation
- TESTING (QA Engineering Director) - E2E test execution and validation
- GITHUB (DevOps Platform Architect) - CI/CD pipeline verification
- RETRO (Continuous Improvement Coach) - Retrospective generation

**CONDITIONAL based on SD keywords** (Must execute if keywords present):
- DATABASE - Keywords: database, migration, schema, table, RLS, SQL, Postgres
- SECURITY - Keywords: auth, security, permissions, RLS, authentication, authorization
- DESIGN - Keywords: UI, UX, design, component, interface, accessibility, a11y
- PERFORMANCE - Keywords: performance, optimization, speed, latency, load, scalability
- DOCMON - Keywords: documentation, docs, README, guide
- UAT - Keywords: UAT, user acceptance, acceptance testing, user journey

**Invocation**:
```bash
# Automated (preferred)
node scripts/orchestrate-phase-subagents.js PLAN_VERIFY <SD-ID>

# PLAN supervisor verification
/leo-verify [what to check]
node scripts/plan-supervisor-verification.js --prd PRD-ID
```

**Blocks When**:
- Sub-agent coverage incomplete → Missing required sub-agents (MANDATORY or keyword-triggered CONDITIONAL)
- User stories incomplete → All user stories must be delivered and E2E tests passing
- Scope creep detected → Remove extra features OR create new SD for additions
- Documentation missing → Complete before handoff
- Integration failures → Fix before claiming completion
- **UI integration incomplete** → Connect all UI entry points before claiming feature "done"

**Sub-Agent Validation Example**:
```bash
# Query sub_agent_execution_results table
SELECT sub_agent_code, verdict, created_at
FROM sub_agent_execution_results
WHERE sd_id = 'SD-XXX'
ORDER BY created_at;

# Expected: VALIDATION, TESTING, GITHUB, RETRO (minimum)
# Plus: DATABASE, SECURITY, DESIGN, PERFORMANCE, DOCMON, UAT (if keywords match)

# If any MANDATORY sub-agent missing → BLOCKED
# If CONDITIONAL sub-agent needed but missing → BLOCKED
```

**Success Pattern**:
> "SCOPE LOCK validated: Delivered exactly what was approved, no surprises"

**Failure Pattern**:
> "Scope creep: 3 extra features added without approval → late-stage removal required"

---

## How to Invoke Validation Agent

### With SD Context (Most Common)

```bash
# For specific validation task
node scripts/systems-analyst-codebase-audit.js <SD-ID>

# For targeted sub-agent execution
node lib/sub-agent-executor.js VALIDATION <SD-ID>

# For phase-based orchestration (recommended)
node scripts/orchestrate-phase-subagents.js <PHASE> <SD-ID>

# Phases:
# - LEAD_PRE_APPROVAL
# - PLAN_PRD
# - EXEC_IMPL
# - PLAN_VERIFY
```

### Advisory Mode (No SD Context)

**For general questions** (no implementation):
```
User: "What's the best way to check for existing implementations?"
Validation Agent: [Provides expert guidance on search patterns]
```

**Note**: For ANY actual validation work, use script invocation with SD context

---

## Pre-Gate-Work Checklist

### Before GATE 1 (LEAD Pre-Approval)

```markdown
- [ ] Query sd_backlog_map table for backlog items
- [ ] Search codebase for similar features (EHG + EHG_Engineer)
- [ ] If UI/UX SD: Read source code to verify claims
- [ ] Check existing database tables for schema overlap
- [ ] Identify reusable infrastructure (auth, components, utilities)
```

**Evidence**: SD-UAT-002 saved 3-4 hours by rejecting false claims early

---

### Before GATE 2 (PLAN PRD Creation)

```markdown
- [ ] Invoke validation agent for schema/route validation
- [ ] Coordinate with database agent for schema checks
- [ ] Verify test infrastructure exists (Vitest, Playwright patterns)
- [ ] Identify reusable components/patterns
- [ ] Document validation results in PLAN→EXEC handoff
```

**Evidence**: SD-UAT-020 saved 8-10 hours by leveraging existing Supabase Auth

---

### Before GATE 3 (EXEC Pre-Implementation)

```markdown
- [ ] Final duplicate check (no new duplicates during planning)
- [ ] Verify using established patterns:
  - Connection helpers: scripts/lib/supabase-connection.js
  - UI components: src/components/ui/*
  - Utility functions: src/lib/*
- [ ] Confirm all dependencies available (npm ls)
- [ ] Review test strategy aligns with framework
```

---

### Before GATE 4 (PLAN Verification)

```markdown
- [ ] Validate delivered features match PRD scope (SCOPE LOCK)
- [ ] Check for scope creep (extra features not in PRD)
- [ ] Verify documentation completeness:
  - generated_docs/*
  - ADRs (if architectural decisions made)
  - README updates (if needed)
- [ ] Confirm integration with existing systems
- [ ] **UI Integration Verification** (NEW):
  - [ ] All buttons have event handlers (onClick)
  - [ ] All links have proper navigation (href, router)
  - [ ] User journey tested manually from entry point
  - [ ] E2E tests validate actual UI entry point (not bypassed)
```

---

## Integration with LEO Protocol Phases

### LEAD Pre-Approval

**When**:
- SD submitted for approval
- MANDATORY: Validation gate enforced

**Action**:
```bash
node scripts/orchestrate-phase-subagents.js LEAD_PRE_APPROVAL <SD-ID>
```

**Include in**: Parallel sub-agent execution with Security, Design, Database

**Blocks**: SD approval if GATE 1 checks fail

**Documents**: Duplicate findings, backlog validation, claims verification in LEAD→PLAN handoff

---

### PLAN PRD Creation

**When** (MANDATORY):
- Before creating PRD
- ANY infrastructure/schema dependencies
- Route/component planning needed

**Action**:
```bash
# FIRST thing in PLAN phase
node scripts/orchestrate-phase-subagents.js PLAN_PRD <SD-ID>
```

**Blocks**: PRD creation if GATE 2 checks fail (critical schema gaps, route conflicts)

**Documents**: Schema validation, component reuse, test infrastructure in PLAN→EXEC handoff

---

### EXEC Implementation

**When**:
- Before implementing ANY code
- When duplicate concerns arise
- Before creating new patterns/utilities

**Action**:
```bash
node lib/sub-agent-executor.js VALIDATION <SD-ID>
```

**Warns**: Minor pattern deviations (requires documentation)

**Blocks**: Duplicate work detection

**Provides**: Pattern guidance, dependency confirmation, test strategy alignment

---

### PLAN Verification

**When**:
- Before PLAN→LEAD handoff
- Validating implementation completeness
- Checking for scope creep

**Action**:
```bash
node scripts/orchestrate-phase-subagents.js PLAN_VERIFY <SD-ID>
```

**Confirms**: SCOPE LOCK enforcement, documentation completeness, integration success

**Blocks**: Handoff if GATE 4 checks fail

---

## Success Patterns (Proven Examples)

### Pattern 1: Early Duplicate Detection

**Example**: SD-UAT-002
- Validation agent code review rejected 3/5 false UI/UX claims
- Proper scope reduction before implementation
- **Time Saved**: 3-4 hours of unnecessary work

### Pattern 2: Infrastructure Reuse

**Example**: SD-UAT-020
- Validation agent identified existing Supabase Auth
- Used existing instead of building custom solution
- **Time Saved**: 8-10 hours of development

### Pattern 3: Backlog Enforcement

**Example**: Database constraint implementation
- Database constraint prevents SD activation without backlog items
- Forces scope clarity before LEAD approval
- **Time Saved**: 2-3 hours of scope clarification discussions

---

## Failure Patterns (When Gates Missed)

### Failure 1: No Backlog Validation

**Example**: SD-EXPORT-001
- SD approved with 0 backlog items
- Scope ambiguity throughout implementation
- **Time Lost**: 2-3 hours of rework, unclear requirements

**Lesson**: GATE 1 backlog validation is MANDATORY

---

### Failure 2: Late Infrastructure Discovery

**Example**: SD-UAT-020 (before validation gate)
- Discovered existing Supabase Auth mid-implementation
- Wasted effort on custom solution
- **Time Lost**: 4-6 hours rebuilding

**Lesson**: GATE 2 infrastructure check prevents late surprises

---

### Failure 3: Missing User Story Validation

**Example**: SD-EVA-MEETING-001
- User stories existed but no E2E test mapping
- Manual testing burden, unclear acceptance criteria
- **Time Lost**: 2-3 hours creating tests post-hoc

**Lesson**: GATE 2 test infrastructure validation prevents this

---

### Failure 4: UI Integration Verification Gap

**Example**: CreateVentureDialog (2025-10-26)
- Dialog component fully built (309 LOC) with all features
- UI buttons existed but had no onClick handlers
- Feature inaccessible to users despite being 100% complete
- Similar: Missing Browse Button (2025-10-26) - Entry point lost during refactoring
- **Time Lost**: Unknown (user-reported, could have been days/weeks undetected)

**Pattern**: Backend/component implementation complete, UI integration missing
- Component built and tested in isolation ✅
- UI buttons exist but have no onClick handlers ❌
- User journey never tested from entry point ❌

**Lesson**: GATE 4 UI integration verification MANDATORY - "Done" = component + integration + accessible via UI + journey tested

**Reference**: `docs/lessons-learned/2025-10-26-disconnected-venture-creation-dialog.md`

---

## Quick Decision Matrix

| Situation | Invoke Validation Agent? | Gate | Why |
|-----------|-------------------------|------|-----|
| Approving new SD | ✅ YES | GATE 1 | Duplicate check, backlog validation |
| Creating PRD | ✅ YES | GATE 2 | Schema/route validation, infrastructure check |
| Starting implementation | ✅ YES | GATE 3 | Final duplicate check, pattern validation |
| Claiming completion | ✅ YES | GATE 4 | SCOPE LOCK enforcement, documentation check |
| General validation question | ⚠️ MAYBE | Advisory | Theory okay without SD context |
| Using established pattern | ❌ NO | N/A | Pattern already validated |

---

## Enforcement Mechanisms

### Database Constraints (Automatic)

```sql
-- Prevent SD activation without backlog items
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT require_backlog_for_active
CHECK (status != 'active' OR EXISTS (
  SELECT 1 FROM sd_backlog_map WHERE sd_id = strategic_directives_v2.id
));
```

**Impact**: Database-level enforcement, cannot be bypassed

---

### Auto-Trigger System (Orchestration)

**Configuration** (`leo_sub_agent_triggers` table):
- VALIDATION agent triggers on LEAD_PRE_APPROVAL phase
- Triggers on keywords: validation, duplicate, existing, codebase audit
- Parallel execution with DATABASE, SECURITY, DESIGN agents
- Results stored in `sub_agent_execution_results` table

**Impact**: No manual invocation needed, automatic validation

---

### Script-Level Blocking (Handoff System)

```javascript
// Example from unified-handoff-system.js
const { data: backlogItems } = await supabase
  .from('sd_backlog_map')
  .select('*')
  .eq('sd_id', sd_id);

if (!backlogItems || backlogItems.length === 0) {
  console.error('❌ GATE 1 BLOCKED: SD has 0 backlog items');
  console.error('Cannot proceed to PLAN phase without backlog validation');
  process.exit(1); // Block handoff creation
}
```

**Impact**: Handoff creation fails if validation gates not passed

---

## Performance Metrics

**From 12 SDs with Validation Agent Usage**:

| Metric | With Validation Gates | Without Validation Gates |
|--------|----------------------|--------------------------|
| Duplicate Work | 0 instances | 2-3 instances |
| Scope Ambiguity | 0 (≥1 backlog required) | 1 instance (SD-EXPORT-001) |
| Time to Detect Issues | 0-30 min (GATE 1) | 2-4 hours (mid-EXEC) |
| Rework Required | 0-1 hour | 4-6 hours |
| Infrastructure Reuse | 90%+ | 50-60% |

**Expected Outcomes** (After Gates Implementation):
- **Zero SDs approved without backlog items** (database constraint)
- **100% duplicate check rate** (GATE 1 mandatory)
- **50% reduction in late-stage rework** (early validation)
- **4-6 hours saved per SD** (infrastructure reuse)

---

## Related Documentation

**Protocol Sections**:
- CLAUDE.md Sections 2358-2361: Validation Agent Mandatory Gates
- CLAUDE.md Section: Validation Enforcement Patterns
- CLAUDE.md Section: Validation Agent Proactive Invocation Checklist

**Detailed Guides**:
- `docs/reference/validation-enforcement-patterns.md` - Enforcement mechanisms catalog
- `scripts/systems-analyst-codebase-audit.js` - Validation agent implementation
- `.claude/agents/validation-agent.md` - Validation agent configuration

---

## Cheat Sheet

### One-Line Decision

```
Need to validate SD/PRD/implementation? → node scripts/systems-analyst-codebase-audit.js <SD-ID>
```

### Four Gates, Four Questions

1. **GATE 1 (LEAD)**: Does this already exist? Do we have backlog items?
2. **GATE 2 (PLAN)**: Do we have the infrastructure? Are routes/schemas available?
3. **GATE 3 (EXEC)**: Are we using established patterns? Any duplicates created?
4. **GATE 4 (PLAN Verify)**: Did we deliver exactly what was approved? Any scope creep?

### Three Rules

1. **Validation agent BEFORE approving SD** (GATE 1)
2. **Validation agent BEFORE creating PRD** (GATE 2)
3. **No bypassing gates—they BLOCK for a reason**

### Remember

> "Validation agent is an Intelligent Trigger for duplicate detection and infrastructure validation. Your value is in recognizing when validation is needed and routing to the proven audit system."
>
> — `.claude/agents/validation-agent.md`

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-12 | Initial quick reference from 74 retrospectives analysis |

---

**BOTTOM LINE**: Validation gates prevent duplicate work (8-10 hours saved), scope ambiguity (2-3 hours saved), and late-stage rework (4-6 hours saved). When in doubt, invoke validation agent—it's faster than discovering issues mid-implementation.
