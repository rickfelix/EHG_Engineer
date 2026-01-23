# CLAUDE_LEAD.md - LEAD Phase Operations

**Generated**: 2026-01-23 8:29:37 AM
**Protocol**: LEO 4.3.3
**Purpose**: LEAD agent operations and strategic validation (25-30k chars)

---

## Autonomous Continuation Directives

**CRITICAL**: These directives guide autonomous agent behavior during LEAD phase execution.

### Core Directives (Always Apply)

**1. Autonomous Continuation**
Continue through the strategic directive and its children SDs autonomously until completion or blocker. Do not stop to ask for permission at each step.

**2. Quality Over Speed**
Prioritize quality over speed. Do not cut corners. Ensure tests pass, code is clean, and documentation is updated.

### Handoff Directives (Apply at Phase Start)

**1. Protocol Familiarization**
At each handoff point, familiarize yourself with and read the LEO protocol documentation for the relevant phase.

---

*Directives from `leo_autonomous_directives` table (SD-LEO-CONTINUITY-001)*


## 🚫 MANDATORY: Phase Transition Commands (BLOCKING)

**Anti-Bypass Protocol**: These commands MUST be run for ALL phase transitions. Do NOT use database-agent to create handoffs directly.

### ⛔ NEVER DO THIS:
- Using `database-agent` to directly insert into `sd_phase_handoffs`
- Creating handoff records without running validation scripts
- Skipping preflight knowledge retrieval

### ✅ ALWAYS DO THIS:

#### Pre-flight Batch Validation (RECOMMENDED)
```bash
# SD-LEO-STREAMS-001: Find ALL issues at once (reduces handoff iterations 60-70%)
node scripts/handoff.js precheck PLAN-TO-EXEC SD-XXX-001
```

#### LEAD → PLAN Transition
```bash
# Step 1: MANDATORY - Run preflight (loads context from database)
node scripts/phase-preflight.js --phase PLAN --sd-id SD-XXX-001

# Step 2: MANDATORY - Execute handoff (validates and blocks if not ready)
node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001
```

#### PLAN → EXEC Transition
```bash
# Step 1: MANDATORY - Run preflight
node scripts/phase-preflight.js --phase EXEC --sd-id SD-XXX-001

# Step 2: MANDATORY - Execute handoff (enforces BMAD, branch, and gate validation)
node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001
```

#### EXEC → PLAN Transition (Verification)
```bash
node scripts/handoff.js execute EXEC-TO-PLAN SD-XXX-001
```

#### PLAN → LEAD Transition (Final Approval)
```bash
node scripts/handoff.js execute PLAN-TO-LEAD SD-XXX-001
```

### Emergency Bypass (SD-LEARN-010)
For emergencies ONLY. Bypasses require audit logging and are rate-limited.

```bash
# Emergency bypass with mandatory justification (min 20 chars)
node scripts/handoff.js execute EXEC-TO-PLAN SD-XXX-001 \
  --bypass-validation \
  --bypass-reason "Production outage requires immediate fix - JIRA-12345"
```

**Rate Limits:**
- 3 bypasses per SD maximum
- 10 bypasses per day globally
- All bypasses logged to `audit_log` table with severity=warning

### What These Scripts Enforce
| Script | Validations |
|--------|-------------|
| `phase-preflight.js` | Loads context, patterns, and lessons from database |
| `handoff.js precheck` | **Batch validation** - runs ALL gates, git checks, reports ALL issues at once |
| `handoff.js LEAD-TO-PLAN` | SD completeness (100% required), strategic objectives |
| `handoff.js PLAN-TO-EXEC` | PRD exists (`ERR_NO_PRD`), chain completeness (`ERR_CHAIN_INCOMPLETE`) |
| `handoff.js EXEC-TO-PLAN` | TESTING enforcement (`ERR_TESTING_REQUIRED`), chain completeness |
| `handoff.js PLAN-TO-LEAD` | Traceability, workflow ROI, retrospective quality |

### Error Codes (SD-LEARN-010)
| Code | Meaning | Remediation |
|------|---------|-------------|
| `ERR_TESTING_REQUIRED` | TESTING sub-agent must run before EXEC-TO-PLAN (feature/qa SDs) | Run TESTING sub-agent first |
| `ERR_CHAIN_INCOMPLETE` | Missing prerequisite handoff in chain | Complete missing handoff first |
| `ERR_NO_PRD` | No PRD found for PLAN-TO-EXEC | Create PRD before proceeding |

### Compliance Marker
Valid handoffs are recorded with `created_by: 'UNIFIED-HANDOFF-SYSTEM'`. Handoffs with other `created_by` values indicate process bypass.

### Check Compliance
```bash
npm run handoff:compliance        # Check all recent handoffs
npm run handoff:compliance SD-ID  # Check specific SD
```

**FAILURE TO RUN THESE COMMANDS = LEO PROTOCOL VIOLATION**

## Baseline Issues Management

## Baseline Issues System

Pre-existing codebase issues are tracked in `sd_baseline_issues` table to prevent blocking unrelated SDs.

### LEAD Gate: BASELINE_DEBT_CHECK
- **BLOCKS** if: Stale critical issues (>30 days) exist without owner
- **WARNS** if: Total open issues > 10 or stale non-critical > 5

### Lifecycle
| Status | Meaning |
|--------|---------|
| open | Issue identified, no owner assigned |
| acknowledged | Issue reviewed, owner assigned |
| in_progress | Remediation SD actively working |
| resolved | Fixed and verified |
| wont_fix | Accepted risk (requires LEAD approval + justification) |

### Commands
```bash
npm run baseline:list          # Show all open issues
npm run baseline:assign <key> <SD-ID>  # Assign ownership
npm run baseline:resolve <key> # Mark resolved
npm run baseline:summary       # Category summary
```

### Categories
security, testing, performance, database, documentation, accessibility, code_quality, dependency, infrastructure

### Issue Key Format
`BL-{CATEGORY}-{NNN}` where:
- BL-SEC-001: Security baseline issue #1
- BL-TST-001: Testing baseline issue #1
- BL-PRF-001: Performance baseline issue #1
- BL-DB-001: Database baseline issue #1
- BL-DOC-001: Documentation baseline issue #1
- BL-A11Y-001: Accessibility baseline issue #1
- BL-CQ-001: Code quality baseline issue #1
- BL-DEP-001: Dependency baseline issue #1
- BL-INF-001: Infrastructure baseline issue #1

### Functions
- `check_baseline_gate(p_sd_id)`: Returns PASS/BLOCKED verdict for LEAD gate
- `generate_baseline_issue_key(p_category)`: Generates unique issue key

## 🔍 Explore Before Validation (LEAD Phase)

## Explore Before Validation

### Pattern: Discovery → Validation

Before running formal validation gates, use the built-in `Explore` agent for fast codebase discovery:

**Step 1: Launch Explore Agent(s)**
```
Task(subagent_type="Explore", prompt="Search for existing implementations of [feature]")
Task(subagent_type="Explore", prompt="Find similar patterns in the codebase")
Task(subagent_type="Explore", prompt="Identify affected areas and dependencies")
```

**Step 2: Review Explore Findings**
- Existing implementations found? → May not need new SD
- Similar patterns? → Inform PRD design, reuse existing code
- Affected areas identified? → Scope boundaries are clear

**Step 3: Run Formal Validation**
```bash
node lib/sub-agent-executor.js VALIDATION <SD-ID>
```

### Why This Order?

| Agent | Speed | Scope | Authority |
|-------|-------|-------|-----------|
| Explore | Fast (parallel) | Broad discovery | Informational |
| validation-agent | Slower | Gate enforcement | Authoritative (database-backed) |

Explore finds candidates quickly; validation-agent confirms with database-backed checks.

### When to Skip Explore

- **Trivial changes**: Typo fixes, config updates
- **Known scope**: User specifies exact files
- **Follow-up work**: Already explored in previous session
- **Emergency fixes**: Time-critical bug fixes

### Example: New Feature Discovery

```
User: "I want to add user preferences"

Claude: "Let me explore the codebase first."

Task(subagent_type="Explore", prompt="very thorough - Search for existing user preferences, settings, or configuration implementations in both EHG and EHG_Engineer codebases")

[Explore returns: Found UserSettings component in /ehg/src/components, preferences table in database, no EHG_Engineer equivalent]

Claude: "Found existing user preferences in the EHG app. Let me now run formal validation to check for duplicates."

node lib/sub-agent-executor.js VALIDATION <SD-ID>
```

## SD to Quick Fix Reverse Rubric (LEO v4.3.3)

## SD to Quick Fix Reverse Rubric

**Purpose**: Evaluate if an incoming SD should be downgraded to Quick Fix workflow.

**Why**: Quick Fix to SD escalation exists, but reverse does not. 7+ QA-category SDs went through full LEAD-PLAN-EXEC workflow unnecessarily.

### Downgrade Criteria (ALL must be true)

| Criterion | Check |
|-----------|-------|
| Category | quality_assurance, documentation, or bug_fix |
| Scope | Estimated LOC 50 or less OR no code changes (verification only) |
| Complexity | No architectural decisions needed |
| PRD | No PRD required (validation/verification task) |
| Duration | Single session completion expected |
| Risk | Low risk (no auth, schema, security, migration) |

### Anti-Criteria (ANY blocks downgrade)

- Contains: migration, schema change, auth, security, RLS
- Severity is critical
- Multiple files changed (more than 3)
- Requires sub-agent validation (DATABASE, SECURITY)

### SD Type Classification (NEW - LEO v4.3.3)

**IMPORTANT**: If SD is NOT a code change, set `sd_type` appropriately:

| sd_type | Description | Validation Requirements |
|---------|-------------|------------------------|
| `feature` | UI/UX, customer-facing features | Full (TESTING, GITHUB, DOCMON, etc.) |
| `infrastructure` | CI/CD, tooling, protocols | Reduced (DOCMON, STORIES, GITHUB) |
| `database` | Schema migrations | Full + DATABASE sub-agent |
| `security` | Auth, RLS, permissions | Full + SECURITY sub-agent |
| `documentation` | Docs only, no code changes | Minimal (DOCMON, STORIES only) |

**Auto-Detection**: The system auto-detects sd_type at PRD creation based on:
- SD title/scope keywords
- Category field
- Functional requirements analysis

**Manual Override**: If auto-detection fails, manually set sd_type:
```sql
UPDATE strategic_directives_v2 SET sd_type = 'documentation' WHERE id = 'SD-XXX';
```

### Documentation-Only SD Handling

When reviewing an SD that involves **NO CODE CHANGES** (e.g., file migration, cleanup, audit):

1. **Set sd_type = 'documentation'** before PLAN phase
2. **Skip TESTING/GITHUB** sub-agents automatically
3. **Require only**: DOCMON pass + Retrospective

**Detection Keywords** (trigger documentation-only classification):
- "cleanup", "migrate markdown", "archive", "audit", "report"
- "documentation only", "no code changes", "verification only"

**Example SD-TECH-DEBT-DOCS-001**: Migration of 34 legacy markdown files was blocked by TESTING sub-agent because sd_type was not set to 'documentation'.

### LEAD Agent Action

When reviewing a new SD that matches ALL downgrade criteria, suggest:

This SD qualifies for Quick Fix workflow.
- Category: quality_assurance
- Estimated scope: 50 LOC or less / verification only

Consider using /quick-fix to reduce overhead.
- Quick Fix skips: LEAD approval, PRD, sub-agents, full validation gates
- Quick Fix keeps: Dual tests, server restart, UAT, PR creation

**For Documentation-Only SDs** (not Quick Fix eligible due to scope):
1. Proceed with full SD workflow
2. Set `sd_type = 'documentation'` in database
3. TESTING/GITHUB validation will be automatically skipped

### Reference

- Quick Fix escalation: .claude/commands/quick-fix.md lines 139-148
- SD Type validation: lib/utils/sd-type-validation.js
- Evidence: SD-TECH-DEBT-DOCS-001 (documentation SD blocked by code-centric validation)
- Pattern: 7 QA-category SDs went through full workflow

## SD Orchestration & Baseline Management

## SD Orchestration & Baseline Management (LEAD Responsibility)

### LEAD Owns SD Prioritization
The LEAD role is responsible for:
1. **SD sequencing** - Maintaining execution order via `sequence_rank`
2. **Track assignment** - Assigning SDs to tracks (A: Infrastructure, B: Features, C: Quality)
3. **Baseline management** - Creating and approving rebaselines
4. **Burn rate monitoring** - Tracking velocity and forecasting completion

### Commands (LEAD Authority)

#### Daily Operations
```bash
npm run sd:next      # View execution queue
npm run sd:status    # Progress vs baseline
```

#### Baseline Management (Requires LEAD Approval)
```bash
npm run sd:baseline view        # View current baseline
npm run sd:baseline create      # Create initial baseline
npm run sd:baseline rebaseline  # Create new baseline (requires approval)
```

#### Velocity & Forecasting
```bash
npm run sd:burnrate             # Current velocity metrics
npm run sd:burnrate forecast    # Completion forecasts
npm run sd:burnrate snapshot    # Take periodic snapshot
```

### Track Definitions

| Track | Name | Focus |
|-------|------|-------|
| A | Infrastructure/Safety | EVA systems, circuit breakers, core infra |
| B | Feature/Stages | Stage implementations (7-40), user features |
| C | Quality | Verification ladder, quality gates, testing |
| STANDALONE | Standalone | No dependencies, can run anytime |

### Rebaseline Triggers
LEAD should consider rebaseline when:
1. Burn rate deviates >20% from plan for 3+ SDs
2. New critical SD added that changes dependencies
3. Major blocker discovered
4. Explicit request from Chairman

### Dependency Health Score
Each SD has a health score (0.0 - 1.0):
- **1.0** = All dependencies completed, READY to start
- **0.5** = Half of dependencies completed
- **0.0** = No dependencies completed, BLOCKED

### Conflict Detection
Before approving parallel work on multiple SDs:
1. Check `sd_conflict_matrix` for file/component overlap
2. SDs touching same files should NOT run in parallel
3. Use `npm run sd:next` to see track assignments


## Strategic Directive Creation Process

### Overview

Strategic Directives (SDs) are the primary unit of work in the LEO Protocol. This section documents the complete SD creation and validation workflow.

### Step 1: Create SD Record in Database

**MANDATORY**: Use process scripts - never create SDs manually in the database.

```bash
# Create a new Strategic Directive
node scripts/add-sd-to-database.js --sd-id SD-XXX-001 --title "Your SD Title"
```

### Required Fields (ALL SDs)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | **YES** | Auto-generated or provided |
| `sd_key` | text | **CRITICAL** | Business key, MUST match id format (e.g., SD-FIX-NAV-001) |
| `title` | text | **YES** | Short descriptive title |
| `description` | text | **YES** | Detailed description of requirements |
| `rationale` | text | **YES** | Why this SD matters (business justification) |
| `status` | text | **YES** | draft, in_progress, active, completed, etc. |
| `sd_type` | text | **YES** | Determines validation profile (see SD Types) |
| `category` | text | **YES** | Classification (feature, infrastructure, etc.) |
| `priority` | text | **YES** | critical, high, medium, low |
| `scope` | text | **YES** | What's included/excluded |
| `success_criteria` | array | **YES** | Measurable success metrics |
| `target_application` | text | **YES** | EHG (frontend) or EHG_Engineer (backend) |

### SD Type-Specific Requirements

| SD Type | Additional Required Fields | Notes |
|---------|---------------------------|-------|
| `bugfix` | `smoke_test_steps` | 30-second demo steps required |
| `feature` | `smoke_test_steps` | Full validation + LLM UX evaluation |
| `refactor` | `intensity_level` | cosmetic, structural, or architectural |
| `infrastructure` | None | Lighter validation, skip TESTING/GITHUB |
| `orchestrator` | `parent_sd_id` for children | Coordinates children, no handoffs |
| `database` | None | DATABASE sub-agent required |
| `security` | None | SECURITY sub-agent required |
| `documentation` | None | Minimal validation |
| `performance` | None | PERFORMANCE sub-agent recommended |

### Step 2: LEAD Strategic Validation (9-Question Gate)

LEAD MUST answer these questions before approval:

1. **Need Validation**: Is this solving a real user problem?
2. **Solution Assessment**: Does it align with business objectives?
3. **Existing Tools**: Can we leverage existing infrastructure?
4. **Value Analysis**: Does expected value justify effort?
5. **Feasibility Review**: Any technical/resource constraints?
6. **Risk Assessment**: What are key risks and mitigations?
7. **UI Inspectability**: Can users see and interpret the outputs?
8. **Scope Reduction**: What was REMOVED? (Target >10% reduction)
9. **Human-Verifiable Outcome**: What's the 30-second demo? (`smoke_test_steps`)

### Step 3: Execute Handoff Chain

```bash
# LEAD → PLAN (Strategic approval)
node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001

# PLAN → EXEC (PRD complete, ready for implementation)
node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001

# EXEC → PLAN (Implementation complete, ready for verification)
node scripts/handoff.js execute EXEC-TO-PLAN SD-XXX-001

# PLAN → LEAD (Verification complete, ready for final approval)
node scripts/handoff.js execute PLAN-TO-LEAD SD-XXX-001
```

### Validation Gates per Handoff

| Handoff | Key Gates | Threshold |
|---------|-----------|-----------|
| LEAD-TO-PLAN | SD_TRANSITION_READINESS, TARGET_APPLICATION, BASELINE_DEBT_CHECK | 85% |
| PLAN-TO-EXEC | PREREQUISITE_CHECK, BMAD_VALIDATION, BRANCH_ENFORCEMENT | 85% |
| EXEC-TO-PLAN | IMPLEMENTATION_FIDELITY, TESTING_REQUIRED, GIT_COMMIT | 85% |
| PLAN-TO-LEAD | SUB_AGENT_ORCHESTRATION, RETROSPECTIVE_QUALITY | 85% |

### Reference Documents

- **Field Reference**: `docs/database/strategic_directives_v2_field_reference.md`
- **Handoff System**: `docs/reference/handoff-system-guide.md`
- **Schema Mapping**: `docs/reference/strategic-directives-v2-schema.md`
- **Process Scripts**: `scripts/add-sd-to-database.js`, `scripts/handoff.js`


## Common SD Creation Errors and Solutions

### Database Constraint Errors

#### Error: `null value in column "sd_key" violates not-null constraint`

**Cause**: Missing `sd_key` field when creating SD
**Solution**:
```javascript
const sd = {
  id: 'SD-XXX-001',
  sd_key: 'SD-XXX-001',  // MUST be present and match id format
  // ... other fields
};
```
**Reference**: `docs/database/strategic_directives_v2_field_reference.md` line 20

#### Error: `duplicate key value violates unique constraint`

**Cause**: SD with that id or sd_key already exists
**Solution**: Use UPDATE instead of INSERT, or choose a different ID
```javascript
// Check if exists first
const { data: existing } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', 'SD-XXX-001')
  .single();

if (existing) {
  // Update existing
  await supabase.from('strategic_directives_v2').update(sd).eq('id', 'SD-XXX-001');
} else {
  // Insert new
  await supabase.from('strategic_directives_v2').insert(sd);
}
```

#### Error: `invalid input syntax for type json`

**Cause**: Invalid JSON in `metadata`, `success_criteria`, or other JSONB fields
**Solution**: Ensure JSONB fields are valid JSON objects/arrays, not strings

### Handoff Validation Errors

#### Error: `ERR_NO_PRD` during PLAN-TO-EXEC

**Cause**: No PRD found for SD
**Solution**: Create PRD before executing handoff
```bash
node scripts/add-prd-to-database.js --sd-id SD-XXX-001 --title "PRD Title"
```
**Reference**: CLAUDE_EXEC.md line 84

#### Error: `ERR_CHAIN_INCOMPLETE` during handoff

**Cause**: Missing prerequisite handoff in chain
**Solution**: Complete the missing prerequisite handoff first

| Handoff | Requires First |
|---------|---------------|
| PLAN-TO-EXEC | LEAD-TO-PLAN |
| EXEC-TO-PLAN | PLAN-TO-EXEC |
| PLAN-TO-LEAD | EXEC-TO-PLAN |
| LEAD-FINAL | PLAN-TO-LEAD |

#### Error: `ERR_TESTING_REQUIRED` during EXEC-TO-PLAN

**Cause**: TESTING sub-agent must run before EXEC-TO-PLAN for feature/bugfix SDs
**Solution**: Run TESTING sub-agent first
```
Task(subagent_type="testing-agent", prompt="Execute TESTING validation for SD-XXX-001")
```

### SD Type Errors

#### Error: SD blocked by TESTING validation but no code changes

**Cause**: `sd_type` not set correctly for documentation-only SD
**Solution**: Set `sd_type = 'documentation'` to skip code validation
```sql
UPDATE strategic_directives_v2 SET sd_type = 'documentation' WHERE sd_key = 'SD-XXX-001';
```
**Evidence**: SD-TECH-DEBT-DOCS-001 was blocked until sd_type was set correctly

#### Error: Refactor SD missing intensity level

**Cause**: Refactor SDs require `intensity_level` field
**Solution**: Set intensity level before LEAD approval
```sql
UPDATE strategic_directives_v2
SET intensity_level = 'structural'  -- cosmetic, structural, or architectural
WHERE sd_key = 'SD-REFACTOR-001';
```

### Branch and Git Errors

#### Error: `Branch is stale (>7 days)`

**Cause**: Feature branch has diverged from main for too long
**Solution**: Sync with main before handoff
```bash
git fetch origin main
git merge origin/main --no-edit
```

#### Error: Multiple SDs detected on branch

**Cause**: Branch contains commits from multiple SDs
**Solution**: Create separate branches for each SD

### Quick Diagnostic Commands

```bash
# Check SD exists and get status
node -e "require('dotenv').config(); const {createClient}=require('@supabase/supabase-js'); createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY).from('strategic_directives_v2').select('id,sd_key,status,sd_type').eq('sd_key','SD-XXX-001').single().then(r=>console.log(r.data||r.error));"

# Check handoff chain
node scripts/handoff.js list SD-XXX-001

# Validate before handoff (find all issues)
node scripts/handoff.js precheck PLAN-TO-EXEC SD-XXX-001
```


### SDKeyGenerator Errors (SD-LEO-SDKEY-001)

#### Error: `Invalid SD type` or `new value for domain sd_type violates check constraint`

**Cause**: Using user-friendly type names that don't match database constraint
**Solution**: SDKeyGenerator automatically maps user types to valid database types:
```javascript
// User-friendly types → Database types
fix, bugfix → bugfix
feature, feat → feature
enhancement → feature
refactor, refactoring → refactor
infrastructure, infra → infrastructure
documentation, docs → documentation
testing, test → testing
security → security
```

**Reference**: `scripts/modules/sd-key-generator.js` line 45-60

#### Error: `SD key collision detected` or duplicate key in different format

**Cause**: Proposed SD key matches existing SD in either `sd_key` OR `id` column
**Solution**: SDKeyGenerator checks BOTH columns automatically:
```javascript
// Checks both columns
const { data: existing } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key')
  .or(`sd_key.eq.${proposedKey},id.eq.${proposedKey}`);
```
If collision detected, sequential number auto-increments (001 → 002 → 003).

**Reference**: `scripts/modules/sd-key-generator.js` keyExists() function

#### Error: Semantic extraction produces unclear abbreviations

**Cause**: Title contains many small words or acronyms
**Solution**: SDKeyGenerator extracts 2-3 meaningful words, skipping common words:
```javascript
// "Fix navigation route not working" → "NAV-ROUTE"
// "Add user authentication feature" → "USER-AUTH"
// Skips: the, a, an, and, or, but, to, from, with, of, for, in, on, at
```

**Manual override available**:
```javascript
await generateSDKey({
  source: 'UAT',
  type: 'bugfix',
  title: 'Fix navigation route not working',
  semanticOverride: 'NAV-FIX'  // Force specific semantic
});
```

**Reference**: `scripts/modules/sd-key-generator.js` extractSemanticWords() function

#### Error: Child SD key format incorrect (e.g., `SD-UAT-FIX-NAV-001-A` vs `SD-UAT-FIX-NAV-001A`)

**Cause**: Manual child key creation without using SDKeyGenerator hierarchy functions
**Solution**: Use SDKeyGenerator hierarchy functions for consistent encoding:
```javascript
// Root SD
const rootKey = await generateSDKey({...}); // SD-UAT-FIX-NAV-001

// Child (no hyphen before suffix)
const childKey = generateChildKey(rootKey, 'A'); // SD-UAT-FIX-NAV-001A

// Grandchild (hyphen before numeric suffix)
const grandchildKey = generateGrandchildKey(childKey, '1'); // SD-UAT-FIX-NAV-001A-1

// Great-grandchild (dot separator)
const greatGrandchildKey = generateGreatGrandchildKey(grandchildKey, '1'); // SD-UAT-FIX-NAV-001A-1.1
```

**Hierarchy encoding rules**:
- Root: `SD-SOURCE-TYPE-SEMANTIC-NUM`
- Child: Append letter (no hyphen): `-NUMA`
- Grandchild: Add hyphen + number: `-NUMA-1`
- Great-grandchild: Add dot + number: `-NUMA-1.1`

**Reference**: `docs/reference/sd-key-generator-guide.md` Hierarchy Support section

#### Error: Sequential numbering gaps (e.g., 001, 002, 005)

**Cause**: Deleted SDs or manual key creation creating gaps
**Solution**: SDKeyGenerator automatically finds next available number:
```javascript
// If SD-UAT-FIX-NAV-001 and SD-UAT-FIX-NAV-003 exist
// Next key will be SD-UAT-FIX-NAV-002 (fills gap)
// Then SD-UAT-FIX-NAV-004 (next sequential)
```

**Reference**: `scripts/modules/sd-key-generator.js` getNextSequentialNumber() function

### Using /leo create Command

#### Recommended: Unified SD creation interface (SD-LEO-SDKEY-001)

Instead of manually calling SDKeyGenerator or legacy scripts, use `/leo create`:

```bash
# Interactive mode - Prompts for all fields
/leo create

# From UAT finding
/leo create --from-uat <test-id>

# From /learn pattern
/leo create --from-learn <pattern-id>

# From /inbox feedback
/leo create --from-feedback <feedback-id>

# Create child SD
/leo create --child SD-UAT-FIX-NAV-001 A
```

**Features**:
- Automatic source detection (UAT, LEARN, FEEDBACK, etc.)
- Type mapping to valid database constraints
- Collision detection across both `sd_key` and `id` columns
- Sequential numbering with gap detection
- Hierarchy support (4 levels)

**Reference**: `docs/reference/npm-scripts-guide.md` line 121-148, `docs/reference/sd-key-generator-guide.md`

#### Migration from legacy scripts

If you have code using old SD creation patterns, migrate to SDKeyGenerator:

```javascript
// OLD (manual key generation)
const sdKey = `SD-${source}-${type.toUpperCase()}-${semantic}-001`;

// NEW (SDKeyGenerator)
import { generateSDKey } from './modules/sd-key-generator.js';
const sdKey = await generateSDKey({ source, type, title });
```

**Migrated scripts**:
1. `scripts/uat-to-strategic-directive-ai.js`
2. `scripts/sd-from-feedback.js`
3. `scripts/pattern-alert-sd-creator.js`
4. `scripts/create-sd.js`
5. `scripts/modules/learning/executor.js`


## 📋 Directive Submission Review Process

**Directive Submission Review**: Review submissions before creating SDs.

**Quick Review**:
```bash
node scripts/lead-review-submissions.js
```

**Review Checklist**:
- Chairman input (original intent)
- Intent clarity & strategic alignment
- Priority assessment & scope validation
- Duplicate check & gate progression

**Decision Matrix**:
- Completed + No SD → Create SD
- Completed + SD exists → Verify & handoff
- Pending → Monitor
- Failed → Archive/remediate

**Complete Process**: See `docs/reference/directive-submission-review.md`

## 🔍 Strategic Validation Question 7: UI Inspectability

## Strategic Validation Question 7: UI Inspectability

**Added in LEO v4.3.3** - Part of LEAD Pre-Approval Gate

### The Question
> "Can users see and interpret the outputs this feature produces?"

### Evaluation Criteria

| Rating | Criteria |
|--------|----------|
| ✅ YES | All backend outputs have corresponding UI components, users can view/act on data |
| ⚠️ PARTIAL | Some outputs visible, others require DB queries or logs to access |
| ❌ NO | Backend works but outputs are not visible in UI |

### LEAD Agent Actions

**If YES**: Proceed with approval
**If PARTIAL**:
- Require UI component list in PRD
- Add "UI Coverage" acceptance criteria
- May approve with explicit UI backfill task

**If NO**:
- Block approval until UI representation plan is documented
- Either expand SD scope to include UI OR
- Create linked child SD for UI implementation

### Integration with 6-Question Gate

This question is MANDATORY for all SDs that produce user-facing data. It should be evaluated alongside:
1. Is this minimal scope?
2. Does it fit the current phase?
3. Are there simpler alternatives?
4. What is the maintenance cost?
5. Does it follow existing patterns?
6. Is it required for the stated goal?
**7. Can users see and interpret the outputs?** ← NEW

## 🎯 Strategic Validation Question 9: Human-Verifiable Outcome

## Strategic Validation Question 9: Human-Verifiable Outcome

**Added in LEO v4.4.0** - Part of LEAD Pre-Approval Gate

### The Question
> "Describe the 30-second demo that proves this SD delivered value."

If you cannot answer this question concretely, the SD is too vague to approve.

### Evaluation Criteria

| Rating | Criteria |
|--------|----------|
| ✅ YES | SD has concrete `smoke_test_steps` with user-observable outcomes |
| ⚠️ PARTIAL | Some verification steps exist but are too technical or vague |
| ❌ NO | No smoke test steps defined, or all criteria are technical-only |

### Required Format: smoke_test_steps

Feature SDs MUST include `smoke_test_steps` JSONB array:

```json
[
  {"step_number": 1, "instruction": "Navigate to /dashboard", "expected_outcome": "Dashboard loads with venture list visible"},
  {"step_number": 2, "instruction": "Click Create Venture button", "expected_outcome": "New venture form appears"},
  {"step_number": 3, "instruction": "Fill form and click Save", "expected_outcome": "Success toast + venture appears in list"}
]
```

### LEAD Agent Actions

**If YES**: Proceed with approval
**If PARTIAL**:
- Require concrete user-observable outcomes
- Reject technical-only criteria ("API returns 200", "data in database")

**If NO**:
- **BLOCK approval** until `smoke_test_steps` is populated
- Prompt: "What will a user SEE that proves this works?"

### SD Type Exemptions

| SD Type | Requires Q9? | Reason |
|---------|--------------|--------|
| feature | ✅ YES | User-facing, must be verifiable |
| bugfix | ✅ YES | Fix must be observable |
| security | ⚠️ API test | Verify auth/authz works |
| database | ⚠️ API test | Verify data flows correctly |
| infrastructure | ❌ NO | Internal tooling |
| documentation | ❌ NO | No runtime behavior |
| refactor | ❌ NO | Behavior unchanged by definition |

### Integration with Validation Gates

This question is ENFORCED by:
1. **LeadToPlanExecutor** - `SMOKE_TEST_SPECIFICATION` gate blocks without steps
2. **ExecToPlanExecutor** - `HUMAN_VERIFICATION_GATE` validates execution
3. **AIQualityEvaluator** - Caps scores at 70% if no human-verifiable outcomes
4. **UserStoryQualityRubric** - Caps at 6/10 for technical-only acceptance criteria

## 📚 Automated PRD Enrichment (MANDATORY)

**SD-LEO-LEARN-001: Proactive Learning Integration**

**CRITICAL**: Run BEFORE writing PRD to incorporate historical lessons.

## Step 0: Knowledge Preflight Check

**Run this command before creating PRD**:

```bash
node scripts/phase-preflight.js --phase PLAN --sd-id <SD_ID>
node scripts/enrich-prd-with-research.js <SD_ID>  # If available
```

## What This Does

Automatically:
1. Queries retrospectives for similar SDs
2. Extracts proven technical approaches
3. Identifies common pitfalls → adds to "Risks & Mitigations"
4. Suggests prevention measures → adds to acceptance criteria
5. Updates user_stories.implementation_context

## How to Use Results

### In PRD "Technical Approach" Section
- Include proven solutions from high-success patterns
- Reference historical approaches that worked well
- Example: "Based on PAT-001 (100% success), we'll verify schema types before..."

### In PRD "Risks & Mitigations" Section
- Document known pitfalls from retrospectives
- Add prevention measures from historical failures
- Example: "Risk: Test path errors after refactor (PAT-002). Mitigation: Verify all imports."

### In PRD "Acceptance Criteria"
- Include prevention checklist items
- Add validation steps from proven patterns
- Example: "[ ] Schema types verified against database (prevents PAT-001)"

## Verification

Verify enrichment appears in PRD's "Reference Materials" section:

```markdown
## Reference Materials

### Historical Patterns Consulted
- PAT-001: Schema mismatch TypeScript/Supabase (Success: 100%)
- SD-SIMILAR-001 Retrospective: Database validation prevented 3 rework cycles

### Prevention Measures Applied
- Schema verification before implementation
- Test path validation in acceptance criteria
```

## Why This Matters

- **Better PRDs**: Incorporate lessons before design, not after errors
- **Prevents design flaws**: Known pitfalls addressed in planning
- **Faster implementation**: EXEC has clear prevention guidance
- **Higher quality**: Proven approaches baked into requirements

## Quick Reference

```bash
# Before creating PRD (MANDATORY)
node scripts/phase-preflight.js --phase PLAN --sd-id <SD_ID>

# Enrich PRD with research (if script exists)
node scripts/enrich-prd-with-research.js <SD_ID>

# View category-specific lessons
cat docs/summaries/lessons/<category>-lessons.md
```

**Time Investment**: 1-2 minutes
**Time Saved**: 30-90 minutes of EXEC rework

## 6-Step SD Evaluation Checklist

**6-Step SD Evaluation Checklist (MANDATORY for LEAD & PLAN)**:

1. Query `strategic_directives_v2` for SD metadata
2. Query `product_requirements_v2` for existing PRD
3. **Query `sd_backlog_map` for linked backlog items** ← CRITICAL
4. Search codebase for existing infrastructure
5. Identify gaps between backlog requirements and existing code
6. **Execute QA smoke tests** ← NEW (verify tests run before approval)

**Backlog Review Requirements**: Review backlog_title, item_description, extras.Description_1 for each item

**Complete Checklist**: See `docs/reference/sd-evaluation-checklist.md`

## Quality Validation Examples

**Evidence from Retrospectives**: Thorough validation saves 4-6 hours per SD by catching issues early.

### LEAD Pre-Approval Validation Examples

#### Example 1: Verify Claims Against Reality

**Case** (SD-UAT-002): Code review revealed 3/5 claimed issues didn't exist → saved 3-4 hours of unnecessary work

**Lesson**: Always verify claims with actual code inspection, don't trust assumptions

#### Example 2: Leverage Existing Infrastructure

**Case** (SD-UAT-020): Used existing Supabase Auth instead of custom solution → saved 8-10 hours

**Lesson**: Check what already exists before approving new development

#### Example 3: Document Blockers Instead of Building Around Them

**Case** (SD-UAT-003): Database blocker identified early → documented constraint instead of workaround → saved 4-6 hours

**Lesson**: Identify true blockers during approval phase, not during implementation

#### Example 4: Question Necessity vs. Nicety

**Lesson**: Distinguish between "must have" (core requirements) and "nice to have" (future enhancements) during validation

### Quality Gate Benefits

Thorough LEAD pre-approval validation:
- Catches false assumptions early
- Identifies existing solutions
- Documents blockers before implementation starts
- Ensures resource allocation matches real requirements

**Total Time Saved from Examples**: 15-20 hours across validated SDs


## LEAD Code Review for UI/UX SDs

## LEAD Code Review Requirement (For UI/UX SDs)

**Evidence from Retrospectives**: Critical pattern from SD-UAT-002 saved hours.

### When Code Review is MANDATORY

**For SDs claiming** UI/UX issues or improvements.

### Why Code Review First?

**Success Story** (SD-UAT-002):
> "LEAD challenged 5 claimed issues, validated only 2. Saved 3-4 hours of unnecessary work."

### Process:
1. Receive SD with UI/UX claims
2. Read actual source code (don't trust claims)
3. Verify each claim against implementation
4. Reject false claims, document findings
5. Update SD scope and priority

## Refactoring SD Evaluation

When evaluating refactoring SDs, LEAD must apply specialized criteria that differ from feature development.

### SD Type Classification for Refactoring

| sd_type | Description | Documentation |
|---------|-------------|---------------|
| refactor | Code restructuring, tech debt | Intensity-based (see below) |

### Intensity Level Classification (REQUIRED for refactor SDs)

The `intensity_level` field is **REQUIRED** for all refactoring SDs. LEAD must set this during approval.

| Intensity | Scope | LOC Range | Documentation | E2E Testing | REGRESSION |
|-----------|-------|-----------|---------------|-------------|------------|
| cosmetic | Renames, formatting, comments | <50 | Refactor Brief | Optional | Optional |
| structural | Extract method, file reorg, import cleanup | 50-500 | Refactor Brief + E2E | Required | Required |
| architectural | Pattern changes, module boundaries | >500 | Full PRD + REGRESSION | Required | Required |

### Refactoring-Specific LEAD Validation Questions

Before approving a refactoring SD, LEAD must answer these questions:

1. **Code Smell Identification**: What specific code smell or technical debt does this address?
   - Valid answers: duplication, long_method, tight_coupling, deep_nesting, dead_code, other
   - If "other", describe clearly

2. **Scope Clarity**: Is the refactoring scope clearly bounded?
   - Can you list the specific files affected?
   - Are there clear boundaries for what IS and IS NOT being changed?

3. **Behavior Preservation**: Is any behavior change expected?
   - If YES: This is NOT a refactoring. Reject or reclassify as feature/bugfix.
   - If NO: Proceed with refactoring workflow.

4. **Intensity Classification** (REQUIRED): What is the intensity level?
   - cosmetic / structural / architectural
   - This MUST be set in the `intensity_level` column

5. **Regression Risk**: What could break if this refactoring goes wrong?
   - List potential impact areas
   - This informs REGRESSION-VALIDATOR scope

### Workflow Selection by Intensity

```
cosmetic:     LEAD-TO-PLAN → PLAN-TO-LEAD (skip E2E, REGRESSION optional)
structural:   LEAD-TO-PLAN → PLAN-TO-EXEC → EXEC-TO-PLAN → PLAN-TO-LEAD (E2E + REGRESSION required)
architectural: Full LEO workflow with REGRESSION-VALIDATOR mandatory
```

### Example: Approving a Refactoring SD

**SD**: "Consolidate duplicate utility functions into shared module"

**LEAD Evaluation**:
1. Code Smell: duplication
2. Scope: utility functions in 5 files, consolidating to 1 shared module
3. Behavior Change: No - same functions, different location
4. Intensity: structural (extract + consolidate, ~200 LOC)
5. Regression Risk: Breaking imports in consuming files

**Decision**: APPROVED with intensity_level=structural
**Required Sub-agents**: REGRESSION-VALIDATOR
**Documentation**: Refactor Brief (not full PRD)

### Anti-Patterns to Reject

- **Scope Creep**: "While refactoring, also add this feature..." → Split into separate SDs
- **Behavior Change Disguised**: "Refactor the auth flow" (if it changes behavior) → Reclassify as feature
- **No Clear Boundary**: "Improve code quality across the codebase" → Too vague, require specific scope
- **Missing Intensity**: Any refactor SD without intensity_level → Block until set

## 🛡️ LEAD Pre-Approval Strategic Validation Gate

### MANDATORY Before Approving ANY Strategic Directive

LEAD MUST answer these questions BEFORE approval:

1. **Need Validation**: Is this solving a real user problem or perceived problem?
2. **Solution Assessment**: Does the proposed solution align with business objectives?
3. **Existing Tools**: Can we leverage existing tools/infrastructure instead of building new?
4. **Value Analysis**: Does the expected value justify the development effort?
5. **Feasibility Review**: Are there any technical or resource constraints that make this infeasible?
6. **Risk Assessment**: What are the key risks and how are they mitigated?
7. **Simplicity Check**: Are there simpler alternatives? (Reference: over-engineering rubric)
8. **Deletion Audit (Q8)**: What has been REMOVED from the original request?
   - Target: >10% scope reduction
   - If <10% eliminated, flag for additional scrutiny
   - Document what was cut and why
   - Record in `scope_reduction_percentage` field

**Approval Criteria**:
- Real user/business problem identified
- Solution is technically feasible
- Resources are available or can be allocated
- Risks are acceptable and documented
- Expected value justifies effort
- Scope has been actively reduced (Q8 answered)

**SCOPE LOCK**: Once LEAD approves an SD, the scope is LOCKED. LEAD commits to delivering the approved scope.

## Parent-Child Decomposition Approval

### When PLAN Proposes Decomposition

PLAN agent will propose decomposition when:
- Parent SD has ≥8 user stories
- Work spans 3+ distinct phases
- Duration estimate exceeds 1-2 weeks

### LEAD Review of Parent SD

When approving parent SD, LEAD should:
- [ ] Understand this will create child SDs
- [ ] Review proposed child structure in parent PRD
- [ ] Validate decomposition makes sense
- [ ] Approve parent SD (which creates children)

**Note**: Approving parent SD does NOT approve children. Children need individual LEAD approval.

### LEAD Review of Each Child SD

**After parent PLAN completes**, each child goes to LEAD individually:

#### Child A LEAD Review Checklist
- [ ] Strategic value: Is this child worth building?
- [ ] Scope: Is child scope clear and locked?
- [ ] Dependencies: Is parent complete enough to start this child?
- [ ] Risks: What are the specific risks for this child?
- [ ] Resources: Do we have what we need?

Repeat for Child B, Child C, etc.

### Why Individual Child Approval Matters

Each child represents different strategic decisions:
- **Child A (Foundation)**: Architecture decisions, tech stack validation
- **Child B (Features)**: Feature priority, user value validation
- **Child C (Polish)**: UX investment, quality bar validation

These are **different strategic questions** requiring separate LEAD approval.

### Rejecting a Child

LEAD can approve parent but reject a specific child:
- Approve Child A and Child B
- Reject Child C (not worth it)
- Update parent's `dependency_chain` to remove Child C

### Parent Completion Approval

Parent completes automatically after last child, but LEAD should verify:
- [ ] All approved children have status = 'completed'
- [ ] Parent progress = 100%
- [ ] Orchestration learnings documented (optional)

### Anti-Pattern: Batch Approval

**❌ Don't do this**:
> "All 3 children look good, approve them all at once"

**✅ Do this instead**:
> "Approve Child A. After Child A completes, we'll review Child B with updated context."

Sequential LEAD approval allows learning from earlier children to inform later decisions.


## Vision V2 SD Handling (SD-VISION-V2-*)

### MANDATORY: Vision Spec Reference Check

**For ALL SDs with ID matching `SD-VISION-V2-*`:**

Before LEAD approval, you MUST:

1. **Read the SD's metadata.vision_spec_references** field
2. **Read ALL files listed in `must_read_before_prd`**
3. **Verify scope aligns with referenced spec sections**

### Vision Document Locations

| Spec | Path | Content |
|------|------|---------|
| Database Schema | `docs/vision/specs/01-database-schema.md` | Tables, RLS, functions |
| API Contracts | `docs/vision/specs/02-api-contracts.md` | Endpoints, TypeScript interfaces |
| UI Components | `docs/vision/specs/03-ui-components.md` | React components, layouts |
| EVA Orchestration | `docs/vision/specs/04-eva-orchestration.md` | EVA modes, token budgets |
| Agent Hierarchy | `docs/vision/specs/06-hierarchical-agent-architecture.md` | LTREE, CEOs, VPs |
| Glass Cockpit | `VISION_V2_GLASS_COCKPIT.md` | Design philosophy |

### LEAD Approval Gate for Vision V2 SDs

**Additional questions for Vision V2 SDs:**

1. **Spec Alignment**: Does the SD scope match the referenced spec sections?
2. **25-Stage Insulation**: If SD touches agents/CEOs, does it maintain READ-ONLY access to venture_stage_work?
3. **Vision Document Traceability**: Are specific spec sections cited in the SD description?

### Implementation Guidance

All Vision V2 SDs contain this metadata:
```json
"implementation_guidance": {
  "critical_instruction": "REVIEW ALL VISION FILES REFERENCED BEFORE ANY IMPLEMENTATION",
  "creation_mode": "CREATE_FROM_NEW",
  "note": "Similar files may exist in the codebase that you can learn from, but we are creating from new."
}
```

## SD Creation Anti-Pattern (PROHIBITED)

**NEVER create one-off SD creation scripts like:**
- `create-*-sd.js`
- `create-sd*.js`

**ALWAYS use the standard CLI:**
```bash
node scripts/leo-create-sd.js
```

### Why This Matters
- One-off scripts bypass validation and governance
- They create maintenance burden (100+ orphaned scripts)
- They fragment the codebase and confuse future developers

### Archived Scripts Location
~100 legacy one-off scripts have been moved to:
- `scripts/archived-sd-scripts/`

These are kept for reference but should NEVER be used as templates.

### Correct Workflow
1. Run `node scripts/leo-create-sd.js`
2. Follow interactive prompts
3. SD is properly validated and tracked in database

## Parent-Child SD Phase Governance

## Parent-Child SD Phase Governance (PAT-PARENT-CHILD-001)

### Overview

When a parent SD delegates work to child SDs, specific phase transition rules apply.

**Critical Rule**: Parent SDs MUST be in EXEC phase before child SDs can be activated.

### The Problem

Database trigger `enforce_sd_phase_transition_rules` enforces:
- Child SD cannot be activated while parent is in PLAN phase
- Parent must be in EXEC phase first

**Error Message**: "LEO Protocol: Child SD cannot be activated while parent is in PLAN phase. Parent must be in EXEC phase first."

### Why This Happens

Typical workflow:
1. Parent SD completes v1 implementation
2. Parent transitions to PLAN phase (waiting for v2 work from children)
3. Child SDs need to activate to do v2 work
4. **BLOCKED**: Trigger prevents child activation because parent is in PLAN

### Resolution Steps

**Option 1: Manual Phase Transition**

```sql
-- Step 1: Insert handoff record
INSERT INTO sd_handoffs (sd_id, direction, from_agent, to_agent, summary, created_by)
VALUES (
  '<PARENT_SD_UUID>',
  'PLAN_TO_EXEC',
  'PLAN',
  'EXEC',
  'Re-activating parent SD to allow child SD execution',
  'SYSTEM'
);

-- Step 2: Update parent phase
UPDATE strategic_directives_v2
SET phase = 'EXEC', status = 'in_progress'
WHERE id = '<PARENT_SD_UUID>';
```

**Option 2: Use Helper Script (Recommended)**

```bash
node scripts/reactivate-parent-sd.js <PARENT_SD_ID>
```

### Best Practices

1. **Plan for re-activation**: When parent delegates to children, document that parent will need to return to EXEC
2. **Use parent-child SD pattern intentionally**: Understand the phase governance before creating child SDs
3. **Document in PRD**: Note parent-child relationships and phase transition requirements
4. **Check before activation**: Query parent phase before attempting child activation

### Recommended Improvements

1. Update trigger error messages to include resolution steps
2. Create `scripts/reactivate-parent-sd.js` helper script
3. Add database function for safe parent re-activation
4. Update handoff.js for parent-child handling

### Related Patterns

- SD Hierarchy documentation
- Phase transition rules
- Database trigger governance

## Multi-Track Parallel Execution

### Track System Overview

The LEO Protocol organizes SDs into tracks designed for **parallel execution across multiple Claude Code instances**:

| Track | Focus Area | Can Run In Parallel With |
|-------|-----------|-------------------------|
| **A: Infrastructure** | Core systems, safety, EVA | B, C |
| **B: Features** | User-facing stages, product | A, C |
| **C: Quality** | Testing, verification, gates | A, B |
| **STANDALONE** | No dependencies | Any track |

### How To Present SD Options

When presenting READY SDs to the user, **always clarify parallel execution options**:

```
**For this session**, I recommend SD-XXX (Track A, rank #1).

**For parallel throughput**, you could also start additional Claude Code instances:
- Track B: SD-YYY (Features)  
- Track C: SD-ZZZ (Quality)

Tracks are designed to work simultaneously without file conflicts.
Would you like to proceed with just Track A, or start multiple instances?
```

### Conflict Prevention

Before recommending parallel work:
1. Check `sd_conflict_matrix` for file/component overlap
2. SDs touching the same files should NOT run in parallel
3. Use `npm run sd:next` to see track assignments

### Single vs Multi-Instance Decision

| Scenario | Recommendation |
|----------|---------------|
| User has one Claude Code session | Pick highest-ranked READY SD |
| User asks about multiple SDs | Explain parallel track option |
| User has limited time | Focus on single highest-impact SD |
| User wants maximum throughput | Suggest 2-3 parallel instances by track |

### Commands Reference

```bash
npm run sd:next      # Shows all tracks with READY SDs
npm run sd:status    # Overall progress by track
```


---

*Generated from database: 2026-01-23*
*Protocol Version: 4.3.3*
*Load when: User mentions LEAD, approval, strategic validation, or over-engineering*
