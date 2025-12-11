# CLAUDE_LEAD.md - LEAD Phase Operations

**Generated**: 2025-12-11 5:54:13 AM
**Protocol**: LEO 4.3.3
**Purpose**: LEAD agent operations and strategic validation (25-30k chars)

---

## 🚫 MANDATORY: Phase Transition Commands (BLOCKING)

**Anti-Bypass Protocol**: These commands MUST be run for ALL phase transitions. Do NOT use database-agent to create handoffs directly.

### ⛔ NEVER DO THIS:
- Using `database-agent` to directly insert into `sd_phase_handoffs`
- Creating handoff records without running validation scripts
- Skipping preflight knowledge retrieval

### ✅ ALWAYS DO THIS:

#### LEAD → PLAN Transition
```bash
node scripts/phase-preflight.js --phase PLAN --sd-id SD-XXX-001
node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001
```

#### PLAN → EXEC Transition
```bash
node scripts/phase-preflight.js --phase EXEC --sd-id SD-XXX-001
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

### Compliance Check
```bash
npm run handoff:compliance SD-XXX-001
```

**Database trigger now BLOCKS direct inserts. You MUST use the scripts above.**

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

## 📚 Automated PRD Enrichment (MANDATORY)

**SD-LEO-LEARN-001: Proactive Learning Integration**

**CRITICAL**: Run BEFORE writing PRD to incorporate historical lessons.

## Step 0: Knowledge Preflight Check

**Run this command before creating PRD**:

```bash
node scripts/phase-preflight.js --phase PLAN --sd-id <SD_UUID>
node scripts/enrich-prd-with-research.js <SD_UUID>  # If available
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
node scripts/phase-preflight.js --phase PLAN --sd-id <SD_UUID>

# Enrich PRD with research (if script exists)
node scripts/enrich-prd-with-research.js <SD_UUID>

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

*Generated from database: 2025-12-11*
*Protocol Version: 4.3.3*
*Load when: User mentions LEAD, approval, strategic validation, or over-engineering*
