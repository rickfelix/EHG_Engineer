# CLAUDE_LEAD.md - LEAD Phase Operations

**Generated**: 2025-11-28 9:22:26 AM
**Protocol**: LEO 4.3.2
**Purpose**: LEAD agent operations and strategic validation (25-30k chars)

---

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

### LEAD Agent Action

When reviewing a new SD that matches ALL downgrade criteria, suggest:

This SD qualifies for Quick Fix workflow.
- Category: quality_assurance
- Estimated scope: 50 LOC or less / verification only

Consider using /quick-fix to reduce overhead.
- Quick Fix skips: LEAD approval, PRD, sub-agents, full validation gates
- Quick Fix keeps: Dual tests, server restart, UAT, PR creation

### Reference

- Quick Fix escalation: .claude/commands/quick-fix.md lines 139-148
- Evidence: SD-E2E-VENTURE-CHUNKS-001 (QA SD with 5+ rejection cycles)
- Pattern: 7 QA-category SDs went through full workflow

## 🎯 LEAD Agent Operations

**LEAD Agent Operations**: Strategic planning, business objectives, final approval.

**Finding Active SDs**: `node scripts/query-active-sds.js` or query `strategic_directives_v2` table directly

**Decision Matrix**:
- Draft → Review & approve
- Pending Approval → Final review  
- Active → Create LEAD→PLAN handoff
- In Progress → Monitor execution

**Key Responsibilities**: Strategic direction, priority setting (CRITICAL: 90+, HIGH: 70-89, MEDIUM: 50-69, LOW: 30-49), handoff creation, progress monitoring

**Complete Guide**: See `docs/reference/lead-operations.md`

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

## 🔍 Pre-Implementation Knowledge Retrieval (MANDATORY)

**SD-LEO-LEARN-001: Proactive Learning Integration**

**CRITICAL**: Run BEFORE starting implementation to retrieve relevant historical lessons.

## Step 0: Knowledge Preflight Check

**Run this command before writing any code**:

```bash
node scripts/phase-preflight.js --phase EXEC --sd-id <SD_UUID>
```

## What This Does

Queries historical knowledge base for:
- **Issue patterns** relevant to your SD category
- **Retrospectives** from similar past work
- **Proven solutions** with success rates >85%
- **Common pitfalls** to avoid (success rate <50%)
- **Prevention checklists** for proactive measures

## How to Use Results

1. **High Success Patterns (✅ ≥85%)**:
   - Apply proven solutions preemptively
   - Add to implementation plan before encountering issues
   - Example: "PAT-004 shows server restart needed after changes → add to workflow"

2. **Moderate Patterns (⚠️ 50-85%)**:
   - Be aware, prepare contingencies
   - Document why you chose alternative approach
   - Example: "PAT-002 test path errors → verify imports carefully"

3. **Low Success Patterns (❌ <50%)**:
   - Known failure modes, avoid these approaches
   - Flag in handoff if you must use similar approach
   - Example: "PAT-007 sub-agent not triggering → use manual invocation"

## Handoff Documentation (MANDATORY)

Add "Patterns Consulted" section to your handoff:

```markdown
## Patterns Consulted

- PAT-001: Schema mismatch TypeScript/Supabase (Success: 100%, Applied: Yes)
- PAT-004: Server restart needed for changes (Success: 100%, Applied: Yes)
- PAT-002: Test path errors after refactor (Success: 100%, Not encountered)
```

## Why This Matters

- **Prevents repeated mistakes**: 60%+ of issues have been seen before
- **Saves time**: Apply proven solutions immediately (avg 15-20 min saved)
- **Builds institutional memory**: Every SD benefits from prior learnings
- **Reduces rework**: Proactive prevention vs reactive debugging

## Quick Reference

```bash
# Before starting implementation (MANDATORY)
node scripts/phase-preflight.js --phase EXEC --sd-id <SD_UUID>

# View detailed pattern info
node scripts/search-prior-issues.js "<issue description>"

# View knowledge summaries (updated weekly)
ls docs/summaries/lessons/*.md
```

**Time Investment**: 30 seconds to run, 2-3 minutes to review
**Time Saved**: 15-60 minutes of debugging/rework

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

## 📖 Historical Context Review (RECOMMENDED)

**SD-LEO-LEARN-001: Proactive Learning Integration**

**RECOMMENDED**: Run BEFORE approving SD to review historical context.

## Step 0: Historical Context Check

**Run this command before SD approval**:

```bash
node scripts/phase-preflight.js --phase LEAD --sd-id <SD_UUID>
```

## What This Does

Queries historical knowledge base for:
- **Over-engineering patterns** in this SD category
- **Similar past SDs** and their outcomes
- **Complexity indicators** (actual vs estimated time)
- **Scope creep history** (SDs split due to bloat)

## Red Flags to Watch For

### Over-Engineering Indicators
- Pattern shows "over-engineering" occurred 2+ times in this category
- Historical resolution time >5x original estimate
- Past SDs in category were split due to scope bloat
- Complexity score disproportionate to business value

### Strategic Concerns
- Similar SDs had high failure/rework rates
- Category has pattern of expanding beyond initial scope
- Technical approach more complex than necessary
- Dependencies create cascading risks

## How to Use Results

### If Red Flags Found
1. Apply simplicity-first lens more rigorously
2. Challenge technical complexity in strategic validation
3. Request PLAN to simplify approach before approval
4. Consider phased delivery (MVP first, enhancements later)

### Document in Approval
Add to approval notes:

```markdown
## Historical Context Reviewed

Consulted 3 prior retrospectives in [category]:
- SD-SIMILAR-001: Over-engineered auth (8 weeks → 3 weeks after simplification)
- SD-SIMILAR-002: Scope expanded 3x during implementation
- PAT-009: Premature abstraction in [category] (40% success rate)

**Decision**: Approved with simplicity constraints:
- MVP scope only (defer advanced features to Phase 2)
- Weekly complexity reviews during PLAN
- Hard cap: 400 LOC per component
```

### If No Red Flags
- Proceed with standard approval process
- Note historical consultation in approval
- Builds confidence in strategic decision

## Why This Matters

- **Prevents strategic mistakes**: Learn from past over-engineering
- **Informed decisions**: Data-driven approval vs intuition
- **Protects team time**: Avoid repeating known pitfalls
- **Builds pattern recognition**: Strategic lens improves over time

## Quick Reference

```bash
# Before SD approval (RECOMMENDED)
node scripts/phase-preflight.js --phase LEAD --sd-id <SD_UUID>

# Review over-engineering patterns
node scripts/search-prior-issues.js --category over_engineering --list

# Check category history
node scripts/search-prior-issues.js "<SD category>" --retrospectives
```

**Time Investment**: 1-2 minutes
**Value**: Strategic foresight, prevents month-long mistakes

## 🛡️ LEAD Pre-Approval Strategic Validation Gate

### MANDATORY Before Approving ANY Strategic Directive

LEAD MUST answer these questions BEFORE approval:

1. **Need Validation**: Is this solving a real user problem or perceived problem?
2. **Solution Assessment**: Does the proposed solution align with business objectives?
3. **Existing Tools**: Can we leverage existing tools/infrastructure instead of building new?
4. **Value Analysis**: Does the expected value justify the development effort?
5. **Feasibility Review**: Are there any technical or resource constraints that make this infeasible?
6. **Risk Assessment**: What are the key risks and how are they mitigated?

**Approval Criteria**:
- Real user/business problem identified
- Solution is technically feasible
- Resources are available or can be allocated
- Risks are acceptable and documented
- Expected value justifies effort

**SCOPE LOCK**: Once LEAD approves an SD, the scope is LOCKED. LEAD commits to delivering the approved scope. LEAD may NOT:
- ❌ Re-evaluate "do we really need this?" during final approval
- ❌ Reduce scope after EXEC phase begins without critical justification
- ❌ Defer work unilaterally during verification
- ❌ Mark SD complete if PRD requirements not met

**Exception**: LEAD may adjust scope mid-execution ONLY if:
1. Critical technical blocker discovered (true impossibility, not difficulty)
2. External business priorities changed dramatically (documented)
3. Explicit human approval obtained
4. New SD created for all deferred work (no silent scope reduction)


---

*Generated from database: 2025-11-28*
*Protocol Version: 4.3.2*
*Load when: User mentions LEAD, approval, strategic validation, or over-engineering*
