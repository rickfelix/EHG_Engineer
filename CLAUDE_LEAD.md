# CLAUDE_LEAD.md - LEAD Phase Operations

**Generated**: 2025-12-01 6:34:54 PM
**Protocol**: LEO 4.3.3
**Purpose**: LEAD agent operations and strategic validation (25-30k chars)

---

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

---

*Generated from database: 2025-12-01*
*Protocol Version: 4.3.3*
*Load when: User mentions LEAD, approval, strategic validation, or over-engineering*
