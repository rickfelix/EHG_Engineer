<!-- file_content_hash: 51819b6275a9bf4e -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_PLAN_MANUAL.md — PLAN Manual (reference companion)

**Generated**: 2026-08-23 12:18:25 AM
**Protocol**: LEO 4.4.1
**Purpose**: Long-form PLAN reference — gate scoring tables, PRD and presentation templates, parent/child decomposition, refactor-brief guide, Explore-before-validation, runtime-audit protocol
**Load when**: At the MOMENT OF DOING one of these procedures — not at every PLAN phase entry

> This companion carries REFERENCE AND PROCEDURE. Every RULE and PROHIBITION that governs PLAN stays in CLAUDE_PLAN.md and is in force whether or not this file is read. The negative constraints, the anti-patterns, the smoke-test and stubbed-code requirements all stayed behind deliberately — this file exists to make that one readable, not to relieve it of anything that binds.

---

## Cascade Invalidation — PLAN Phase Guidance

### Before Creating Architecture Plans
Check if there are pending cascade invalidation flags:
```bash
node scripts/modules/governance/cascade-invalidation-engine.js stale architecture_plan
```

If flags exist, resolve them BEFORE creating new plans — stale plans should not be the basis for new work.

### After Vision Updates
When a vision document is updated during PLAN phase (e.g., via brainstorm refinement), the cascade trigger automatically flags downstream plans. Review flagged plans and update if the vision changes affect architecture decisions.

## Branch Creation (Automated at LEAD-TO-PLAN)

## 🌿 Branch Creation (Automated at LEAD-TO-PLAN)

### Automatic Branch Creation

As of LEO v4.4.1, **branch creation is automated** during the LEAD-TO-PLAN handoff:

1. When you run `node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001`
2. The `SD_BRANCH_PREPARATION` gate automatically creates the branch
3. Branch is created with correct naming: `<type>/<SD-ID>-<slug>`
4. Database is updated with branch name for tracking

### Manual Branch Creation (If Needed)

If branch creation fails or you need to create one manually:

```bash
# Create branch for an SD (looks up title from database)
npm run sd:branch SD-XXX-001

# Create with auto-stash (non-interactive)
npm run sd:branch:auto SD-XXX-001

# Check if branch exists
npm run sd:branch:check SD-XXX-001

# Full command with options
# Branch was auto-created at LEAD-TO-PLAN handoff
```

### Branch Naming Convention

| SD Type | Branch Prefix | Example |
|---------|---------------|---------|
| Feature | `feat/` | `feat/SD-UAT-001-user-auth` |
| Fix | `fix/` | `fix/SD-FIX-001-login-bug` |
| Docs | `docs/` | `docs/SD-DOCS-001-api-guide` |
| Refactor | `refactor/` | `refactor/SD-REFACTOR-001-cleanup` |
| Test | `test/` | `test/SD-TEST-001-e2e-coverage` |

### Branch Hygiene Rules

From CLAUDE_EXEC.md (enforced at PLAN-TO-EXEC):
- **≤7 days stale** at PLAN-TO-EXEC handoff
- **One SD per branch** (no mixing work)
- **Merge main at phase transitions**

### When Branch is Created

```
LEAD Phase                    PLAN Phase                   EXEC Phase
    |                              |                            |
    |   LEAD-TO-PLAN handoff       |                            |
    |---[Branch Created Here]----->|                            |
    |                              |   PRD Creation             |
    |                              |   Sub-agent validation     |
    |                              |                            |
    |                              |   PLAN-TO-EXEC handoff     |
    |                              |---[Branch Validated]------>|
    |                              |                            |
```


## PRD Template Scaffolding

## 📋 PRD Template Scaffolding

When creating a PRD, use this scaffold as a starting point. Fill in each section with specific, measurable content.

### PRD Creation Checklist

Before running `node scripts/add-prd-to-database.js`:

1. **Exploration Complete?** (Discovery Gate)
   - [ ] Read ≥5 relevant files
   - [ ] Documented findings in exploration_summary
   - [ ] Identified existing patterns to follow

2. **Requirements Specific?** (Russian Judge)
   - [ ] No "TBD" or placeholder text
   - [ ] Each requirement has acceptance criteria
   - [ ] Test scenarios are concrete (not "verify it works")

3. **Architecture Defined?**
   - [ ] Integration points identified
   - [ ] Data flow documented
   - [ ] Dependencies listed

### PRD Section Guide

| Section | Guiding Questions | Example |
|---------|-------------------|---------|
| **executive_summary** | What? Why? Impact? | "This PRD defines X to solve Y, reducing Z by N%" |
| **functional_requirements** | What must it do? How measured? | FR-1: System shall display X when Y occurs |
| **technical_requirements** | What technologies? Constraints? | Must integrate with existing Supabase RLS |
| **system_architecture** | How do components interact? How will this be tested? | Data flows: API → Service → Database. Key functions exported for unit testing. |
| **test_scenarios** | How do we verify? Edge cases? | TS-1: Given empty input, should show validation error |
| **acceptance_criteria** | How do we know it's done? | All E2E tests pass, Russian Judge ≥70% |
| **risks** | What could go wrong? Mitigations? | Risk: API rate limits. Mitigation: caching layer |

### PRD Script Usage

```bash
# Create PRD with all required fields
node scripts/add-prd-to-database.js \
  --sd-id SD-XXX-001 \
  --title "Feature Name" \
  --status planning

# Or specify SD directly:
node scripts/add-prd-to-database.js --sd-id=SD-XXX-001
```

### Self-Critique Before Handoff

Before submitting PLAN→EXEC handoff, ask yourself:
- **Confidence (1-10)**: How confident am I this PRD is complete?
- **Gaps**: What areas might need clarification during EXEC?
- **Assumptions**: What am I assuming that should be validated?

If confidence < 7, revisit the PRD before handoff.
> Why: A confidence score below 7 means the PRD contains unresolved assumptions. Assumptions carried into EXEC produce ad-hoc decisions that bypass PLAN validation — these are the most common source of EXEC-TO-PLAN rejections and rework loops.

## ✅ Scope Verification with Explore (PLAN_VERIFY)

## Scope Verification with Explore

### Pattern: Explore → Compare → Validate

After EXEC completes, use Explore agent to verify implementation matches plan BEFORE running formal validation:

**Step 1: Launch Explore Agent**
```
Task(subagent_type="Explore", prompt="What files were modified for SD-XXX? List all changed files and compare to the PRD scope. Flag any changes outside the expected scope.")
```

**Step 2: Compare to Plan/PRD**
- Files modified match PRD scope?
- Any unexpected changes outside scope?
- Any PRD requirements not addressed?
- Any TODO comments left unresolved?

**Step 3: Flag Deviations**
- **Scope creep detected** → Document and discuss with human before proceeding
- **Missing requirements** → Complete before validation
- **Unintended changes** → Revert or justify

**Step 4: Run Formal Validation**
```bash
node scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e
node scripts/github-actions-verifier.js <SD-ID>
```

### Why Explore Before Validation?

| Without Explore First | With Explore First |
|-----------------------|-------------------|
| E2E tests run on wrong/extra code | Scope verified before testing |
| Validation fails late with unclear cause | Deviations caught early |
| Wasted CI/CD cycles | Faster feedback loop |
| Scope creep goes unnoticed | Changes documented explicitly |

### Explore Questions for PLAN_VERIFY

Use these prompts to verify scope compliance:

1. **File inventory**: "List all files modified since EXEC started for this SD"
2. **Scope check**: "Which of these changes are outside the PRD scope?"
3. **Completeness check**: "Are there any PRD requirements not yet addressed?"
4. **Code quality**: "Are there any TODO comments or incomplete implementations?"
5. **Test coverage**: "Do the test files cover all PRD requirements?"

### Example Verification Flow

```
Claude: "EXEC is complete. Let me verify scope compliance before formal validation."

Task(subagent_type="Explore", prompt="List all files modified for SD-AUTH-001 and compare to PRD scope")

[Explore returns:
- Modified: src/auth/login.tsx (in scope)
- Modified: src/auth/session.ts (in scope)
- Modified: src/utils/helpers.ts (NOT in PRD)
- Created: tests/auth.spec.ts (in scope)]

Claude: "Found one file modified outside PRD scope: src/utils/helpers.ts.
This change [describe]. Options:
1. Keep change (document as necessary dependency)
2. Revert change (not needed for this SD)
3. Create follow-up SD for this change

Which do you prefer?"
```

## Refactor Brief Documentation

For refactoring SDs with `intensity_level` of cosmetic or structural, use a Refactor Brief instead of a full PRD.

### When to Use Refactor Brief vs Full PRD

| Intensity | Documentation Type | Generator Script |
|-----------|-------------------|------------------|
| cosmetic | Refactor Brief | `node scripts/create-refactor-brief.js SD-XXX` |
| structural | Refactor Brief | `node scripts/create-refactor-brief.js SD-XXX` |
| architectural | Full PRD | `node scripts/add-prd-to-database.js SD-XXX` |

### Creating a Refactor Brief

```bash
# Basic usage
node scripts/create-refactor-brief.js SD-REFACTOR-001

# Interactive mode (prompts for details)
node scripts/create-refactor-brief.js SD-REFACTOR-001 --interactive

# With pre-specified options
node scripts/create-refactor-brief.js SD-REFACTOR-001 --files "src/a.ts,src/b.ts" --smell "duplication"
```

### Refactor Brief Structure

A Refactor Brief contains these lightweight sections:

1. **Document Information**
   - SD ID, Title, Intensity, Created Date, Status

2. **Current State**
   - Code location (primary files, related files)
   - Current implementation description
   - Code smell type being addressed

3. **Desired State**
   - Proposed structure after refactoring
   - Key changes checklist
   - Expected benefits

4. **Files Affected**
   - Table: File | Change Type | Risk Level | Notes
   - Total files and estimated LOC

5. **Risk Zones**
   - Circular dependency risk
   - Breaking import risk
   - Public API change risk
   - Test risks

6. **Verification Criteria**
   - Pre-refactor baseline (tests pass, build succeeds, lint clean)
   - Post-refactor validation (same criteria + imports resolve)
   - REGRESSION-VALIDATOR checklist

7. **Rollback Plan**
   - Git revert command
   - Manual rollback steps if needed

8. **Sign-off**
   - LEAD approval, baseline captured, validation complete, REGRESSION verdict

### REGRESSION-VALIDATOR Integration

For structural and architectural refactoring, invoke the REGRESSION sub-agent:

**Baseline Capture** (before refactoring):
```bash
# REGRESSION captures:
# - Test suite results
# - Public API signatures (exports)
# - Import dependency graph
# - Test coverage metrics
```

**Post-Refactor Validation** (after refactoring):
```bash
# REGRESSION compares:
# - Tests pass without modification
# - API signatures unchanged
# - All imports resolve
# - Coverage not decreased
```

**Verdict Types**:
- **PASS**: All checks passed, refactoring is safe
- **CONDITIONAL_PASS**: Minor issues found, document and proceed with caution
- **FAIL**: Breaking changes detected, fix before proceeding

### Refactoring Handoff Validation

When transitioning phases for refactoring SDs:

| Transition | Required for Refactoring |
|------------|--------------------------|
| LEAD-TO-PLAN | Intensity level set, code smell identified |
| PLAN-TO-EXEC | Refactor Brief stored, files identified |
| EXEC-TO-PLAN | REGRESSION baseline captured |
| PLAN-TO-LEAD | REGRESSION verdict obtained, all tests pass |

### Example: Structural Refactoring Workflow

1. **LEAD Approval**: Sets intensity_level=structural, identifies code smell
2. **PLAN Phase**:
   - Run `node scripts/create-refactor-brief.js SD-XXX --interactive`
   - Brief stored in `product_requirements_v2` with `document_type='refactor_brief'`
3. **EXEC Phase**:
   - REGRESSION captures baseline before changes
   - Implement refactoring following brief
   - Run tests continuously
4. **VERIFY Phase**:
   - REGRESSION compares before/after
   - All tests must pass WITHOUT modification
   - Verdict: PASS required for completion
5. **LEAD Final**: Review REGRESSION verdict, approve closure

## Child SD Field Requirements for LEAD Evaluation

### Required Fields for Child SDs

> **CRITICAL**: Child SDs MUST include ALL fields required for LEAD evaluation.
> LEAD's `autoScore()` function analyzes: title, description, scope, strategic_intent, strategic_objectives.
> Children with minimal fields will receive "hollow" LEAD evaluations and may pass incorrectly.

| Field | Required | LEAD Evaluation Impact |
|-------|----------|------------------------|
| `id` | **YES** | Identification |
| `title` | **YES** | Scored by autoScore() |
| `description` | **YES** | Scored by autoScore() - CRITICAL |
| `scope` | **YES** | Scored by autoScore() - CRITICAL |
| `rationale` | **YES** | Strategic validation |
| `category` | **YES** | SD classification |
| `priority` | **YES** | Execution order |
| `parent_sd_id` | **YES** | Parent reference |
| `relationship_type` | **YES** | Must be 'child' |
| `status` | **YES** | Must be 'draft' |
| `sd_key` | **YES** | Unique key |
| `sequence_rank` | **YES** | Execution sequence |
| `strategic_objectives` | **YES** | Scored by autoScore() |
| `success_criteria` | **YES** | Completion validation |
| `key_changes` | Recommended | Change documentation |
| `risks` | Recommended | Risk assessment |
| `dependencies` | Recommended | Dependency tracking |

### Validation Before LEAD Handoff

Before handing child SDs to LEAD, validate they have sufficient content:

```javascript
function validateChildSDForLead(childSD) {
  const errors = [];

  // Required text fields for autoScore()
  if (!childSD.description || childSD.description.length < 100) {
    errors.push('description must be >= 100 chars for proper LEAD evaluation');
  }
  if (!childSD.scope || childSD.scope.length < 50) {
    errors.push('scope must be >= 50 chars for proper LEAD evaluation');
  }
  if (!childSD.rationale || childSD.rationale.length < 30) {
    errors.push('rationale required for strategic validation');
  }

  // Required arrays
  if (!childSD.strategic_objectives?.length) {
    errors.push('strategic_objectives required for LEAD scoring');
  }
  if (!childSD.success_criteria?.length) {
    errors.push('success_criteria required for completion validation');
  }

  // Relationship fields
  if (!childSD.parent_sd_id) {
    errors.push('parent_sd_id required for child SD');
  }
  if (childSD.relationship_type !== 'child') {
    errors.push('relationship_type must be "child"');
  }

  return { valid: errors.length === 0, errors };
}
```

### Use Validation Script

Run the validation script before submitting children to LEAD:

```bash
node scripts/validate-child-sd-completeness.js <parent_sd_id>
node scripts/validate-child-sd-completeness.js --all-children
```


## Pre-Implementation Plan Presentation Template

## Plan Presentation Template

### Required Sections
1. **Summary**: 2-3 sentences on what/why
2. **Technical Approach**: How it will be implemented
3. **Database Changes**: Schema modifications (if any)
4. **Testing Strategy**: Unit + E2E approach
5. **Risk Assessment**: Potential issues + mitigations

### Format
```markdown
# PRD: {SD-ID} - {Title}

## Summary
[What and why in 2-3 sentences]

## Technical Approach
- Implementation method
- Key decisions

## Database Changes
- Tables affected
- Migration required? (Y/N)

## Testing Strategy
- Unit: [scope]
- E2E: [key flows]

## Risks
| Risk | Mitigation |
|------|------------|
| ... | ... |
```

## Branch Should Already Exist (LEO v4.4.1)

### Branch Should Already Exist (LEO v4.4.1)

As of LEO v4.4.1, the branch is **automatically created during LEAD-TO-PLAN handoff**:
- The `SD_BRANCH_PREPARATION` gate creates the branch proactively
- By the time EXEC starts, the branch should already exist
- This gate now **validates** the branch rather than creating it

If branch doesn't exist (legacy SDs or manual workflow):
```bash
npm run sd:branch SD-XXX-001    # Creates and switches to branch
```


## Triangulated Runtime Audit Protocol

### Purpose
A structured workflow for manually testing the EHG application with AI-assisted diagnosis and remediation planning. Uses Claude Code as the testing guide and triangulates findings across 3 AI models (Claude, ChatGPT, Antigravity) for high-confidence root cause analysis and fix proposals.

### When to Use
- Periodic product health checks
- After major deployments
- When users report multiple issues
- Before major releases
- When you want to "click around" and find what's broken

### Quick Start
Invoke with: `/runtime-audit`

---

### Protocol Phases

#### Phase 1: SETUP
1. Start app: `bash scripts/leo-stack.sh restart`
2. Define context anchor (vision, immutables, pending SDs)
3. Claude enters "testing guide mode"

#### Phase 2: MANUAL TESTING (Claude Guides)
- Claude provides next click step
- You report what you see
- Claude logs issues in structured format
- Claude identifies "nearby failures" to check

**Issue Format:**
```
[Flow]-[##]: One-line description
Route: /path
Severity: Critical | Major | Minor
Notes: expected vs actual
```

**Flow Priority:**
1. `/chairman/*` (Chairman Console)
2. `/ventures/*` (Venture Management)
3. `/eva-assistant`, `/ai-agents` (EVA/Agents)
4. `/analytics/*`, `/reports/*` (Analytics)
5. `/governance`, `/security/*` (Governance)

#### Phase 3: ROOT CAUSE DIAGNOSIS (All 3 Models)
- Claude creates diagnostic prompt from logged issues
- Send SAME prompt to ChatGPT and Antigravity
- Each model investigates independently
- Compare findings to identify consensus vs divergence

#### Phase 4: REMEDIATION PLANNING (All 3 Models)
- Send confirmed root causes to all 3 models
- Each proposes fixes independently
- Triangulate to find best approach
- Decision rules:
  - All agree → High confidence, execute
  - 2 agree → Evaluate trade-offs, Chairman decides
  - Safety concern → Immediate investigation

#### Phase 5: SD CREATION (Claude Executes)
- Follow LEO Protocol orchestrator/child pattern (see `docs/recommendations/child-sd-pattern-for-phased-work.md`)
- Use proper hierarchy fields: `relationship_type`, `parent_sd_id`, `sequence_rank`
- Embed triangulation evidence in metadata
- Reference: `scripts/templates/sd-creation-template.js`

#### Phase 6: EXECUTION
- Execute child SDs in priority order
- Regression test each fix
- Mark complete when done

#### Phase 7: AUDIT RETROSPECTIVE

Immediately after SD creation, generate audit retrospective to capture lessons.

**Trigger:**
```bash
npm run audit:retro -- --file docs/audits/YYYY-MM-DD-audit.md
```

**System Aggregates:**
- All findings with dispositions from `audit_finding_sd_mapping`
- Triangulation consensus data from `audit_triangulation_log`
- Chairman verbatim observations (2x weighting)
- Sub-agent contributions

**RETRO Generates:**
- Process learnings (about the audit itself)
- Divergence insights (where models disagreed)
- Pattern candidates for `issue_patterns` table
- Protocol improvements

**Quality Criteria:**
- 100% triage coverage (all items have disposition)
- >= 3 Chairman verbatim citations
- >= 1 model divergence insight
- All lessons cite evidence (NAV-xx, SD-xx)
- Time constraint: <= 15-20 minutes

**Output:**
- Retrospective record in `retrospectives` (retro_type='AUDIT')
- Contributions in `retrospective_contributions`
- Runtime audit marked 'retro_complete'

---

### Roles

| Model | Role | When Used |
|-------|------|-----------|
| **Claude Code** | Testing Guide + Synthesizer | Throughout |
| **ChatGPT** | Triangulation Partner | Phases 3-4 |
| **Antigravity** | Triangulation Partner | Phases 3-4 |

---

### Templates

#### Context Anchor Template
```markdown
## Context Anchor

### Vision & Immutables
1. EHG is an Autonomous Venture Orchestrator
2. Role/permissions enforced at every action
3. No irreversible action without confirmation + audit trail
4. AI outputs labeled (recommendation vs action vs system-executed)
5. Venture state transitions must be valid and traceable
6. Governance and runtime are separate domains

### Pending SDs
[List any SDs in progress]

### Guardrails
- Don't propose changes that increase technical debt
- Prefer minimal diffs over refactors
```

#### Diagnostic Prompt Template
See: `/runtime-audit` skill for full template

#### Remediation Prompt Template
See: `/runtime-audit` skill for full template

---

### Synthesis Grid Template

| Issue | Claude | ChatGPT | Antigravity | Consensus |
|-------|--------|---------|-------------|-----------|
| A-01 | [finding] | [finding] | [finding] | HIGH/MED/LOW |

---

### Decision Rules

| Scenario | Action |
|----------|--------|
| All 3 models agree on root cause + fix | Execute with high confidence |
| 2 models agree, 1 differs | Evaluate trade-offs, Chairman decides |
| All 3 differ significantly | More investigation needed |
| Single model flags safety/permission issue | Immediate investigation (don't wait) |
| Divergent fixes are complementary (A+B) | Take union of both approaches |
| Divergent fixes are contradictory (A vs B) | Chairman decides based on vision |

---

### Checklist

**Before Starting:**
- [ ] App running on localhost:8080
- [ ] Logged in with correct role
- [ ] Context anchor defined
- [ ] ChatGPT session ready
- [ ] Antigravity session ready

**During Testing:**
- [ ] Issues logged with ID, route, severity
- [ ] Nearby failures identified
- [ ] Console errors captured

**After Testing:**
- [ ] Diagnostic prompt sent to all models
- [ ] Root causes triangulated
- [ ] Remediation triangulated
- [ ] SDs created with evidence

**After SD Creation (Phase 7):**
- [ ] Audit findings ingested (`npm run audit:ingest`)
- [ ] All items triaged (100% coverage)
- [ ] Audit retrospective generated (`npm run audit:retro`)
- [ ] Quality score >= 70
- [ ] Action items assigned

---

### Artifacts

| Artifact | Location | Purpose |
|----------|----------|---------|
| Issue Log | Inline or TEST_LOG.md | Track findings |
| Diagnostic Prompt | Generated by Claude | Send to partners |
| Synthesis Grid | Inline | Compare findings |
| SD Script | scripts/create-sd-runtime-audit-*.mjs | Create SDs |
| Strategic Directives | Database | Track fixes |
| Audit Mappings | audit_finding_sd_mapping | Track all findings |
| Audit Retrospective | retrospectives (type=AUDIT) | Capture learnings |
| Triangulation Log | audit_triangulation_log | Model consensus |

---

### Related Skills
- `baseline-testing` - Establishing test baselines
- `e2e-ui-verification` - Verifying UI before testing
- `codebase-search` - Finding code references
- `schema-design` - Database schema issues


## Child SD Pattern: When to Decompose

### PLAN Agent Responsibility

During parent PRD creation, PLAN agent must evaluate:
- **User story count**: ≥8 stories → consider decomposition
- **Phase boundaries**: 3+ distinct phases → consider decomposition
- **Duration estimate**: Multi-week work → consider decomposition
- **Complexity**: High complexity → consider decomposition

### Decision Matrix

| Criteria | Single SD | Parent + Children |
|----------|-----------|-------------------|
| User Stories | < 8 | ≥ 8 |
| Distinct Phases | 1-2 | 3+ |
| Duration | Days | Weeks |
| Complexity | Low-Medium | High |

### Decomposition Workflow

**Step 1: PLAN Proposes Decomposition**

During parent PRD creation:
1. Identify natural boundaries (phases, features, components)
2. Create child SD records with `parent_sd_id` and `relationship_type = 'child'`
3. Define dependency chain in parent's `dependency_chain` field
4. Document children in parent PRD
5. Mark children as `status = 'draft'` (they need LEAD approval)

**Step 2: Create Child SDs**

```javascript
// Example: Parent PLAN creates 3 children
await supabase.from('strategic_directives_v2').insert([
  {
    id: 'SD-PARENT-001-A',
    title: 'Phase A: Foundation',
    parent_sd_id: 'SD-PARENT-001',
    relationship_type: 'child',
    status: 'draft', // Needs LEAD approval
    current_phase: null,
    priority: 'critical'
  },
  {
    id: 'SD-PARENT-001-B',
    title: 'Phase B: Features',
    parent_sd_id: 'SD-PARENT-001',
    relationship_type: 'child',
    status: 'draft',
    current_phase: null,
    priority: 'high'
  },
  {
    id: 'SD-PARENT-001-C',
    title: 'Phase C: Polish',
    parent_sd_id: 'SD-PARENT-001',
    relationship_type: 'child',
    status: 'draft',
    current_phase: null,
    priority: 'medium'
  }
]);

// Update parent with dependency chain
await supabase.from('strategic_directives_v2')
  .update({
    relationship_type: 'parent',
    dependency_chain: {
      children: [
        {sd_id: 'SD-PARENT-001-A', order: 1, depends_on: null},
        {sd_id: 'SD-PARENT-001-B', order: 2, depends_on: 'SD-PARENT-001-A'},
        {sd_id: 'SD-PARENT-001-C', order: 3, depends_on: 'SD-PARENT-001-B'}
      ]
    }
  })
  .eq('id', 'SD-PARENT-001');
```

**Step 3: Children Go Through LEAD**

After parent PLAN completes:
- Each child SD goes to LEAD individually
- LEAD validates strategic value of THAT child
- LEAD locks scope for THAT child
- LEAD assesses risks for THAT child
- After LEAD approval, child enters PLAN

**Step 4: Sequential Execution**

- Child A: LEAD → PLAN → EXEC → Complete
- Then Child B: LEAD → PLAN → EXEC → Complete
- Then Child C: LEAD → PLAN → EXEC → Complete
- Then Parent: Auto-completes

### Parent PRD Template

```markdown
## Child SD Overview

This SD requires decomposition due to [complexity/phases/duration].

| Child ID | Scope | Priority | Depends On |
|----------|-------|----------|------------|
| SD-XXX-A | Foundation | critical | None |
| SD-XXX-B | Features | high | SD-XXX-A |
| SD-XXX-C | Polish | medium | SD-XXX-B |

## Sequential Execution

Children execute sequentially:
1. Child A completes full LEAD→PLAN→EXEC
2. Child B starts LEAD after Child A completes
3. Child C starts LEAD after Child B completes
4. Parent completes after Child C completes

## Why Children Need Individual LEAD Approval

Each child represents distinct strategic value:
- **Child A (Foundation)**: Validates core architecture decisions
- **Child B (Features)**: Validates feature priority and scope
- **Child C (Polish)**: Validates UX investment vs other priorities

## Completion Criteria

Parent completes when:
- [ ] All children have status = 'completed'
- [ ] Parent progress = 100% (auto-calculated)
```


### Metadata Inheritance Requirement

When creating child SDs, the parent's metadata MUST be inherited to provide full vision context.

**Required Inheritance:**
- vision_spec_references (all specs and philosophy docs)
- governance (strangler pattern, workflow policies)
- prd_requirements (spec reference requirements)
- implementation_guidance (creation mode, critical instructions)

**Implementation:**
```javascript
// After creating child SD records, inherit parent metadata
const { data: parent } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('id', parentId)
  .single();

// Update each child with inherited metadata
for (const childId of childIds) {
  await supabase
    .from('strategic_directives_v2')
    .update({
      metadata: {
        ...childMetadata,
        inherited_from_parent: {
          vision_spec_references: parent.metadata.vision_spec_references,
          governance: parent.metadata.governance,
          prd_requirements: parent.metadata.prd_requirements,
          implementation_guidance: parent.metadata.implementation_guidance
        }
      }
    })
    .eq('id', childId);
}
```

> **NOTE**: A database trigger (trg_inherit_parent_metadata) also enforces this automatically as a safety net.

> **Team Capabilities**: When planning complex SDs, consider whether team spawning (any agent leading specialists) could parallelize cross-domain work. See **Teams Protocol** in CLAUDE.md.

## Quality Assessment Integration in Handoffs

**Context**: AI-powered Russian Judge quality assessment is integrated into PLAN → EXEC handoffs to validate PRD and User Story quality before implementation begins.

### When Quality Assessment Runs

**PLAN → EXEC Handoff** (`npm run handoff` from PLAN phase):
1. **PRD Quality Validation**: Evaluates PRD against 4 weighted criteria (see AI-Powered Russian Judge section)
2. **User Story Quality Validation**: Evaluates User Stories against INVEST principles + acceptance criteria clarity
3. **Threshold**: Both must score ≥70% to proceed to EXEC phase

**Why At Handoff Time?**:
- Catches quality issues BEFORE implementation starts (prevents rework)
- Forces PLAN agent to address ambiguity and placeholder text
- Ensures EXEC agent receives implementation-ready requirements

### Hierarchical Context in Handoff Validation

**PRD Validation**:
```javascript
// Automatic parent context fetching
const assessment = await prdRubric.validatePRDQuality(prd, sd);
```

**What Happens**:
1. Handoff script fetches PRD from database
2. If `prd.sd_id` exists, fetches parent SD from `strategic_directives_v2`
3. Passes both PRD + SD context to AI evaluator
4. AI evaluates PRD requirements against SD strategic objectives
5. Returns holistic assessment ("PRD architecture is solid but doesn't address SD's cost reduction objective")

**User Story Validation**:
```javascript
// Fetch PRD context for alignment check
const assessment = await userStoryRubric.validateUserStoryQuality(userStory, prd);
```

**What Happens**:
1. Handoff script fetches User Story from database
2. Fetches parent PRD via `user_story.prd_id`
3. Passes both User Story + PRD context to AI evaluator
4. AI validates User Story acceptance criteria align with PRD requirements

### Handoff Failure Handling

**If Quality Assessment Fails (score < 70)**:

**Handoff Script Returns**:
```javascript
{
  status: 'FAIL',
  phase: 'PLAN',
  issues: [
    'requirements_depth_specificity: Needs significant improvement (4/10) - Most requirements contain placeholder text like "To be defined" which prevents implementation',
    'architecture_explanation_quality: Room for improvement (6/10) - Architecture mentions React components but missing data flow and API integration details'
  ],
  warnings: [
    'test_scenario_sophistication: Room for improvement (6/10) - Test scenarios cover happy path but missing edge cases for error conditions'
  ],
  weighted_score: 62,
  threshold: 70
}
```

**PLAN Agent Must**:
1. **Address all `issues`** (score < 5/10) - These are blockers
2. **Consider `warnings`** (score 5-7/10) - Recommended improvements
3. **Regenerate PRD/User Stories** in database
4. **Re-run handoff validation** (`npm run handoff`)

**Quality Gate Enforcement**: Handoff script will NOT create EXEC handoff entry until PRD/User Story quality passes threshold.

### Integration with PRD Schema

**PRD Database Schema** (`product_requirements_v2` table):
- `id`: PRD identifier
- `sd_id`: Foreign key to parent Strategic Directive
- `functional_requirements`: JSONB array of requirements
- `ui_ux_requirements`: JSONB array of UI requirements
- `technical_architecture`: JSONB object (overview, components, data_flow, integration_points)
- `test_scenarios`: JSONB array of test scenarios
- `acceptance_criteria`: JSONB array of criteria
- `risks`: JSONB array of risks + mitigation
- `status`: PRD lifecycle status

**AI Assessment Validates**:
- **Depth**: Are requirements specific or generic?
- **Architecture**: Are components, data flow, and integration points explained?
- **Tests**: Do scenarios cover happy path + edge cases + error conditions?
- **Risks**: Are technical risks identified with mitigation + rollback plans?

**Quality Before Quantity**: Better to have 5 deeply detailed requirements (score 8/10) than 20 placeholder requirements (score 3/10).

### Common Quality Issues and AI Feedback

**Issue**: Placeholder Text in Requirements
```
AI Feedback: "requirements_depth_specificity: Needs significant improvement (3/10) -
Functional requirement #4 states 'Authentication flow to be defined during implementation'.
This prevents EXEC agent from implementing. Specify: authentication method (OAuth, JWT),
user roles, session timeout, error handling."
```

**Issue**: Missing Architecture Details
```
AI Feedback: "architecture_explanation_quality: Room for improvement (5/10) -
Architecture mentions 'React components and Node.js backend' but missing:
- How do components communicate? (Props, Context, Redux?)
- What is the API structure? (REST endpoints, GraphQL schema?)
- Where is state managed? (Client-side, server-side, hybrid?)"
```

**Issue**: Trivial Test Scenarios
```
AI Feedback: "test_scenario_sophistication: Room for improvement (6/10) -
Test scenarios only cover happy path ('user logs in successfully'). Missing:
- Edge cases: user enters wrong password, network timeout, expired session
- Error conditions: database unavailable, rate limiting, concurrent login attempts
- Performance tests: login under load, response time validation"
```

### Best Practices for PLAN Phase

**To Pass PRD Quality Gate (≥70%)**:
1. **Replace ALL placeholders** ("To be defined", "TBD") with specific details
2. **Add baseline + target metrics** for measurable requirements ("reduce from X to Y")
3. **Document data flow and integration points** in technical architecture
4. **Include edge cases and error conditions** in test scenarios
5. **Provide specific mitigation strategies** (not "test thoroughly") for risks

**To Pass User Story Quality Gate (≥70%)**:
1. **Write specific, testable acceptance criteria** ("Given X, When Y, Then Z")
2. **Follow INVEST principles** (Independent, Negotiable, Valuable, Estimable, Small, Testable)
3. **Provide user context** (who is the user? what problem are they solving?)
4. **Link to parent PRD requirements** for traceability

### Quality Assessment vs Traditional Validation

**Traditional Validation** (still used):
- Field presence: "Does `functional_requirements` exist?"
- Data types: "Is `test_scenarios` a JSONB array?"
- Foreign keys: "Does `sd_id` reference a valid Strategic Directive?"

**AI Quality Assessment** (new):
- Content depth: "Are requirements specific or generic?"
- Semantic meaning: "Does PRD align with SD strategic objectives?"
- Anti-patterns: "Does content contain placeholder text or boilerplate?"

**Both Required**: Traditional validation catches structural issues. AI assessment catches quality issues. A PRD can pass traditional validation (all fields present) but fail AI assessment (all fields contain "To be defined").

### Performance and Cost in Handoffs

**Typical PLAN → EXEC Handoff**:
- PRD validation: ~3-8 seconds, $0.003-0.008
- User Story validation (×5 stories): ~5-10 seconds, $0.005-0.010
- **Total**: ~10-20 seconds, $0.01-0.02 per handoff

**User Prioritization**: Quality over speed. Better to wait 20 seconds for thorough validation than proceed with ambiguous requirements and waste hours in EXEC rework.

**Caching Strategy**: Assessments stored in `ai_quality_assessments` table. If PRD unchanged since last assessment, can reuse previous score (optimization for future implementation).

### Example: Successful PLAN → EXEC Handoff

1. **PLAN agent creates PRD** with specific requirements, detailed architecture, comprehensive tests
2. **User runs**: `npm run handoff`
3. **PRD Quality Assessment**:
   - requirements_depth_specificity: 8/10 (all requirements specific and actionable)
   - architecture_explanation_quality: 9/10 (components, data flow, integration points explained)
   - test_scenario_sophistication: 7/10 (happy path + edge cases covered)
   - risk_analysis_completeness: 8/10 (risks with mitigation + rollback plans)
   - **Weighted Score**: 82/100 ✅ PASS
4. **User Story Quality Assessment**: All stories score ≥70% ✅ PASS
5. **Handoff Entry Created**: `from_phase=PLAN`, `to_phase=EXEC`, `status=pending`
6. **EXEC Agent Proceeds**: Implementation with clear, unambiguous requirements

**Result**: No rework, no ambiguity, faster implementation.

### Files Reference

**Handoff Validation Script**:
- `/scripts/validate-plan-handoff.js` (PRD + User Story quality checks)

**Rubric Implementations**:
- `/scripts/modules/rubrics/prd-quality-rubric.js`
- `/scripts/modules/rubrics/user-story-quality-rubric.js`

**Database Tables**:
- `product_requirements_v2`: Product Requirements Documents
- `user_stories`: User Stories linked to PRDs
- `ai_quality_assessments`: Assessment history and scores
- `handoffs`: Handoff status tracking (includes quality gate results)

## KR Linkage in PRD Creation

When creating a PRD during PLAN phase, connect functional requirements to relevant Key Results where applicable.

### How to Link
1. **Check active KRs**: Query `key_results` for `status` in ('pending', 'on_track', 'at_risk')
2. **Match by scope**: Which KR's `baseline_value` → `target_value` does this SD's work advance?
3. **Add to PRD metadata**: Include `kr_linkages` array in PRD metadata: `[{ kr_code: "KR-GOV-1.1", impact: "Reduces from 243 to ~200 references" }]`

### KR Fields Reference
| Column | Description |
|--------|-------------|
| `code` | KR identifier (e.g., KR-GOV-1.1) |
| `baseline_value` | Starting metric |
| `current_value` | Current progress |
| `target_value` | Goal metric |
| `direction` | 'increase' or 'decrease' |
| `vision_dimension_code` | Linked EVA dimension (A01-A10, V01-V08) |

### When to Skip
- Bug fixes and urgent patches: KR linkage is optional
- Infrastructure SDs: Link if the work measurably advances a KR
- Feature SDs: Always attempt KR linkage

---

*Generated from database: 2026-08-23*
*Protocol Version: 4.4.1*
*Source of truth: leo_protocol_sections (section_type=workflow, handoff_quality_gates, parent_child_plan, plan_refactor_brief_guide, parent_child_validation, plan_verify_explore, prd_template_scaffold, governance_kr_linkage_plan, plan_presentation_template, cascade_invalidation_plan). Do not hand-edit — edit the DB section and regenerate.*
