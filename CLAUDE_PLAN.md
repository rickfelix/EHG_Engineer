# CLAUDE_PLAN.md - PLAN Phase Operations

**Generated**: 2025-12-02 7:29:22 PM
**Protocol**: LEO 4.3.3
**Purpose**: PLAN agent operations, PRD creation, validation gates (30-35k chars)

---

## 🎯 Multi-Perspective Planning

## Multi-Perspective Planning

### When to Use Plan Agents

Before creating a PRD, consider launching multiple `Plan` agents to explore different approaches:

**Use Plan agents when**:
- Multiple valid architectures exist
- Trade-offs between simplicity/performance/extensibility
- Uncertain about best approach
- Complex feature with many moving parts

**Skip Plan agents when**:
- Approach is obvious
- Small, well-scoped changes
- Following established patterns exactly
- Trivial bug fixes

### Pattern: Perspectives → Selection → PRD

**Step 1: Launch Plan Agents (Parallel)**
```
Task(subagent_type="Plan", prompt="Design from SIMPLICITY perspective: What is the minimal viable approach that solves the problem with the least complexity?")

Task(subagent_type="Plan", prompt="Design from EXISTING PATTERNS perspective: How can we reuse existing infrastructure, components, and patterns already in the codebase?")

Task(subagent_type="Plan", prompt="Design from EXTENSIBILITY perspective: What design would best support future enhancements while avoiding over-engineering?")
```

**Step 2: Present Options to Human**
- Summarize each perspective (key trade-offs)
- Highlight pros/cons
- Recommend one approach with rationale

**Step 3: Human Selects Approach**

**Step 4: Create PRD Based on Selection**
```bash
node scripts/add-prd-to-database.js --sd-id=<SD-ID>
```

**Step 5: Validate PRD**
```bash
node lib/sub-agent-executor.js DATABASE <SD-ID>
node lib/sub-agent-executor.js DESIGN <SD-ID>
```

### Perspective Examples by Task Type

| Task Type | Perspective 1 | Perspective 2 | Perspective 3 |
|-----------|--------------|--------------|--------------|
| New feature | Simplicity | Performance | Maintainability |
| Bug fix | Root cause fix | Quick workaround | Prevention strategy |
| Refactoring | Minimal change | Clean architecture | Gradual migration |
| UI work | User experience | Developer experience | Accessibility |
| API design | RESTful purity | Client convenience | Backwards compatibility |
| Database | Normalized schema | Query performance | Migration safety |

### Quality Over Quantity

Launch 1-3 Plan agents based on complexity:
- **1 agent**: Approach is mostly clear, want sanity check
- **2 agents**: Genuine trade-off between two approaches
- **3 agents**: Complex decision with multiple valid paths

Do NOT launch 3 agents for every task—that wastes time on simple decisions.

## Deferred Work Management

### What Gets Deferred
- Technical debt discovered during implementation
- Edge cases not critical for MVP
- Performance optimizations for later
- Nice-to-have features

### Creating Deferred Items
```sql
INSERT INTO deferred_work (sd_id, title, reason, priority)
VALUES ('SD-XXX', 'Title', 'Reason for deferral', 'low');
```

### Tracking
- Deferred items linked to parent SD
- Reviewed during retrospective
- May become new SDs if significant

### Rules
- Document WHY deferred, not just WHAT
- Set realistic priority (critical items shouldn't be deferred)
- Max 5 deferred items per SD

## Stubbed/Mocked Code Detection


**CRITICAL: Stubbed/Mocked Code Detection** (MANDATORY):

Before PLAN→LEAD handoff, MUST verify NO stubbed/mocked code in production files:

**Check For** (BLOCKING if found):
```bash
# 1. TEST_MODE flags in production code
grep -r "TEST_MODE.*true\|NODE_ENV.*test" lib/ src/ --exclude-dir=test

# 2. Mock/stub patterns
grep -r "MOCK:\|STUB:\|TODO:\|PLACEHOLDER:\|DUMMY:" lib/ src/ --exclude-dir=test

# 3. Commented-out implementations
grep -r "// REAL IMPLEMENTATION\|// TODO: Implement" lib/ src/ --exclude-dir=test

# 4. Mock return values without logic
grep -r "return.*mock.*result\|return.*dummy" lib/ src/ --exclude-dir=test
```

**Acceptable Patterns** ✅:
- `TEST_MODE` in test files (`tests/`, `*.test.js`, `*.spec.js`)
- TODO comments with SD references for future work: `// TODO (SD-XXX): Implement caching`
- Feature flags with proper configuration: `if (config.enableFeature)`

**BLOCKING Patterns** ❌:
- `const TEST_MODE = process.env.TEST_MODE === 'true'` in production code
- `return { verdict: 'PASS' }` without actual logic
- `console.log('MOCK: Using dummy data')`
- Empty function bodies: `function execute() { /* TODO */ }`
- Commented-out real implementations

**Verification Script**:
```bash
# Create verification script
node scripts/detect-stubbed-code.js <SD-ID>
```

**Manual Code Review**:
- Read all modified files from git diff
- Verify implementations are complete
- Check for placeholder comments
- Validate TEST_MODE usage is test-only

**Exit Requirement**: Zero stubbed code in production files, OR documented in "Known Issues" with follow-up SD created.


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

## Enhanced QA Engineering Director v2.0 - Testing-First Edition

**Enhanced QA Engineering Director v2.0**: Mission-critical testing automation with comprehensive E2E validation.

**Core Capabilities:**
1. Professional test case generation from user stories
2. Pre-test build validation (saves 2-3 hours)
3. Database migration verification (prevents 1-2 hours debugging)
4. **Mandatory E2E testing via Playwright** (REQUIRED for approval)
5. Test infrastructure discovery and reuse

**5-Phase Workflow**: Pre-flight checks → Test generation → E2E execution → Evidence collection → Verdict & learnings

**Activation**: Auto-triggers on `EXEC_IMPLEMENTATION_COMPLETE`, coverage keywords, testing evidence requests

**Full Guide**: See `docs/reference/qa-director-guide.md`

## Database Schema Documentation

### Database Schema Documentation

Auto-generated schema docs provide quick reference without database queries:

**Paths**:
- EHG_Engineer: `docs/reference/schema/engineer/database-schema-overview.md`
- EHG App: `docs/reference/schema/ehg/database-schema-overview.md`

**Update**: `npm run schema:docs:engineer` or `npm run schema:docs:ehg`

**PRD Integration**: PRDs stored in `product_requirements_v2` table (NOT markdown).
Use `add-prd-to-database.js` to create PRDs with schema review prompts.


## PLAN Pre-EXEC Checklist

## PLAN Agent Pre-EXEC Checklist (MANDATORY)

**Evidence from Retrospectives**: Database verification issues appeared in SD-UAT-003, SD-UAT-020, and SD-008. Early verification saves 2-3 hours per blocker.

Before creating PLAN→EXEC handoff, PLAN agent MUST verify:

### Database Dependencies ✅
- [ ] **Identify all data dependencies** in PRD
- [ ] **Run schema verification script** for data-dependent SDs
- [ ] **Verify tables/columns exist** OR create migration
- [ ] **Document verification results** in PLAN→EXEC handoff
- [ ] If tables missing: **Escalate to LEAD** with options

**Success Pattern** (SD-UAT-003):
> "Database Architect verification provided evidence for LEAD decision. Documented instead of implementing → saved 4-6 hours"

### Architecture Planning ✅
- [ ] **Component sizing estimated** (target 300-600 lines per component)
- [ ] **Existing infrastructure identified** (don't rebuild what exists)
- [ ] **Third-party libraries considered** before custom code

**Success Pattern** (SD-UAT-020):
> "Leveraged existing Supabase Auth instead of building custom → saved 8-10 hours"

### Testing Strategy ✅
- [ ] **Smoke tests defined** (3-5 tests minimum)
- [ ] **Test scenarios documented** in PRD

### Quality Validation ✅
- [ ] **Verified claims with code review** (if UI/UX SD)
- [ ] **Assessed technical feasibility**
- [ ] **Identified potential blockers**

**Success Pattern** (SD-UAT-002):
> "LEAD code review rejected 3/5 false claims → saved hours of unnecessary work"


## Testing Tier Strategy

## Testing Requirements - Clear Thresholds

**Evidence from Retrospectives**: Testing confusion appeared in SD-UAT-002, SD-UAT-020, SD-008.

### Three-Tier Testing Strategy

#### Tier 1: Smoke Tests (MANDATORY) ✅
- **Requirement**: 3-5 tests, <60 seconds execution
- **Approval**: **SUFFICIENT for PLAN→LEAD approval**

#### Tier 2: Comprehensive E2E (RECOMMENDED) 📋
- **Requirement**: 30-50 tests covering user flows
- **Approval**: Nice to have, **NOT blocking for LEAD approval**
- **Timing**: Can be refined post-deployment

#### Tier 3: Manual Testing (SITUATIONAL) 🔍
- **UI changes**: Single smoke test recommended (+5 min)
- **Logic changes <5 lines**: Optional
- **Logic changes >10 lines**: Required

### Anti-Pattern to Avoid ❌

**DO NOT** create 100+ manual test checklists unless specifically required.

**From SD-UAT-020**:
> "Created 100+ test checklist but didn't execute manually. Time spent on unused documentation."

## 🔬 BMAD Method Enhancements

## BMAD Enhancements

### 6 Key Improvements
1. **Unified Handoff System** - All handoffs via `unified-handoff-system.js`
2. **Database-First PRDs** - PRDs stored in database, not markdown
3. **Validation Gates** - 4-gate validation before EXEC
4. **Progress Tracking** - Automatic progress % calculation
5. **Context Management** - Proactive monitoring, compression strategies
6. **Sub-Agent Compression** - 3-tier output reduction

### Using Handoff System
```bash
node scripts/unified-handoff-system.js create "{message}"
```

### PRD Creation
```bash
node scripts/add-prd-to-database.js {SD-ID}
```

### Never Bypass
- ⚠️ Always use process scripts
- ⚠️ Never create PRDs as markdown files
- ⚠️ Never skip validation gates

## Research Lookup Before PRD Creation

## Research Lookup Before PRD Creation (MANDATORY)

**CRITICAL**: Before creating any PRD, check if research has been completed for the SD.

### Research Directory Structure

```
docs/research/outputs/
├── index.json                    # Master index of all research
├── SD-RESEARCH-106/
│   ├── index.json                # SD-specific index with prd_generation_notes
│   ├── leo-protocol-v5x-summary.md
│   └── ...
├── SD-RESEARCH-107/
│   └── ...
└── SD-RESEARCH-108/
    └── ...
```

### Lookup Process (Step 0 of PRD Creation)

1. **Check master index**:
   ```bash
   cat docs/research/outputs/index.json | jq '.strategic_directives[] | select(.sd_id == "SD-YOUR-ID")'
   ```

2. **If research exists**, read SD-specific index:
   ```bash
   cat docs/research/outputs/{SD-ID}/index.json
   ```

3. **Extract prd_generation_notes** (MUST be incorporated into PRD):
   ```bash
   cat docs/research/outputs/{SD-ID}/index.json | jq '.prd_generation_notes'
   ```

4. **Read summary files** for detailed findings:
   ```bash
   cat docs/research/outputs/{SD-ID}/*.md
   ```

### index.json Structure

```json
{
  "sd_id": "SD-RESEARCH-106",
  "sd_title": "LEO Protocol Evolution to v5.x",
  "research_status": "complete",
  "documents": [
    {
      "title": "Document Title",
      "filename": "Original.pdf",
      "pages": 18,
      "relevance": "primary|supporting|reference",
      "summary_file": "summary-file.md",
      "key_sections": ["Section 1", "Section 2"],
      "key_decisions": ["Decision 1", "Decision 2"]
    }
  ],
  "prd_generation_notes": [
    "Note 1 - MUST be in PRD",
    "Note 2 - MUST be in PRD"
  ],
  "cross_references": {
    "SD-OTHER-001": "How this SD relates"
  }
}
```

### Integration with PRD Creation

> **WARNING**: If research exists but is not referenced in PRD, the PRD is incomplete.

When research is found:
1. Add `prd_generation_notes` to PRD's `technical_approach` field
2. Reference key decisions in `implementation_plan`
3. Include cross_references in `dependencies` field
4. Link to summary files in PRD metadata

### Example PRD Creation Flow

```bash
# Step 0: Research lookup
cat docs/research/outputs/index.json | jq '.strategic_directives[] | select(.sd_id == "SD-RESEARCH-106")'
# → research_status: "complete"

cat docs/research/outputs/SD-RESEARCH-106/index.json | jq '.prd_generation_notes'
# → ["Reference Temporal.io TypeScript SDK documentation", ...]

# Step 1: Schema review (existing process)
# Step 2: PRD creation with research incorporated
node scripts/add-prd-to-database.js SD-RESEARCH-106
# → PRD includes research findings in technical_approach
```


## CI/CD Pipeline Verification

## CI/CD Pipeline Verification (MANDATORY)

**Evidence from Retrospectives**: Gap identified in SD-UAT-002 and SD-LEO-002.

### Verification Process

**After EXEC implementation complete, BEFORE PLAN→LEAD handoff**:

1. Wait 2-3 minutes for GitHub Actions to complete
2. Trigger DevOps sub-agent to verify pipeline status
3. Document CI/CD status in PLAN→LEAD handoff
4. PLAN→LEAD handoff is **BLOCKED** if pipelines failing

## DESIGN→DATABASE Validation Gates

**4 mandatory gates ensuring sub-agent execution and implementation fidelity.**

| Gate | When | Purpose | Pass Score |
|------|------|---------|------------|
| 1. PLAN→EXEC | After PRD, before EXEC | Verify planning complete | ≥80/100 |
| 2. EXEC→PLAN | After EXEC, before verification | Verify implementation fidelity | ≥80/100 |
| 2.5 Human | After Gate 2 | Manual verification | Checkbox |
| 3. Final | LEAD closure | Traceability audit | ≥80/100 |

### Gate 1: PLAN→EXEC (Pre-Implementation)

**9 Checks** (11 pts each):
1. DESIGN sub-agent executed (`sub_agent_execution_results`)
2. DATABASE sub-agent executed
3. DATABASE informed by DESIGN (`metadata.database_analysis.design_informed`)
4. STORIES sub-agent executed
5. Schema docs consulted (`docs/reference/schema/`)
6. PRD metadata complete (design + database analysis)
7. Sub-agent execution order (DESIGN < DATABASE < STORIES)
8. PRD created via `add-prd-to-database.js`
9. User stories have implementation_context (≥80%)

**Conditional**: Only for SDs with `design` AND `database` categories.

### Gate 2: EXEC→PLAN (Post-Implementation)

**4 Sections** (25 pts each):
- **A. Design Fidelity**: UI components committed, workflows match
- **B. Database Fidelity**: Schema changes match analysis
- **C. Traceability**: Commits reference SD-XXX
- **D. Quality**: Tests exist, no TODO/FIXME in critical paths

### Gate 2.5: Human Inspectability

Manual verification after Gate 2:
- [ ] Design alignment verified visually
- [ ] Database changes reviewed
- [ ] No magic numbers/hardcoded values
- [ ] Error handling present

### Gate 3: LEAD Final Approval

Retroactive audit at SD closure:
- Recommendation adoption rate
- Deviation documentation
- Pattern effectiveness tracking

**Reference**: `scripts/modules/design-database-gates-validation.js`


## 🚪 Gate 2.5: Human Inspectability Validation

**Position**: Between Gate 2 (EXEC → PLAN Handback) and Gate 3 (PLAN → LEAD)

### Purpose
Verify that all backend functionality has corresponding UI representation before marking implementation complete.

### Gate Checklist

#### Data Contract Coverage
- [ ] All `stageX_data` fields mapped to UI components
- [ ] Score values displayed (not just derived states)
- [ ] Confidence indicators visible
- [ ] Timestamps/metadata accessible

#### Component Verification
- [ ] Stage output viewer exists for this stage
- [ ] Key findings panel displays all findings
- [ ] Recommendations are actionable
- [ ] Red flags are highlighted

#### User Journey Validation
- [ ] User can navigate to view outputs
- [ ] Data is presented in human-readable format
- [ ] No "hidden" data requiring DB queries
- [ ] Export/sharing capability exists (if required)

### Scoring

| Score | Criteria |
|-------|----------|
| 100% | All backend fields have UI representation |
| 80% | Core fields visible, minor fields may require expansion |
| 60% | Major fields visible, some data requires logs/DB |
| <60% | BLOCKING - Significant UI gaps |

### Enforcement

**Minimum Score**: 80% to pass Gate 2.5
**Blocking Condition**: Score <80% blocks progression to Gate 3

### Handoff Template Addition

When creating EXEC → PLAN handoff, include:
```json
{
  "ui_coverage": {
    "total_backend_fields": "<count>",
    "fields_with_ui": "<count>",
    "coverage_percentage": "<percent>",
    "missing_components": ["<list>"],
    "gate_2_5_status": "PASS|FAIL"
  }
}
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

## Database Schema Overview

### Core Tables
- `leo_protocols` - Protocol versions and content
- `leo_protocol_sections` - Modular protocol sections
- `leo_agents` - Agent definitions and percentages
- `leo_handoff_templates` - Standardized handoffs
- `leo_sub_agents` - Sub-agent definitions
- `leo_sub_agent_triggers` - Activation rules
- `leo_validation_rules` - Protocol validation

### Key Queries

**Get Current Protocol**:
```sql
SELECT * FROM leo_protocols WHERE status = 'active';
```

**Check Sub-Agent Triggers**:
```sql
SELECT sa.*, t.*
FROM leo_sub_agents sa
JOIN leo_sub_agent_triggers t ON sa.id = t.sub_agent_id
WHERE t.trigger_phrase ILIKE '%keyword%';
```

**Get Handoff Template**:
```sql
SELECT * FROM leo_handoff_templates
WHERE from_agent = 'EXEC' AND to_agent = 'PLAN';
```

## API Endpoints (Database-Backed)

- `GET /api/leo/current` - Current active protocol
- `GET /api/leo/agents` - All agents with percentages
- `GET /api/leo/sub-agents` - Active sub-agents with triggers
- `GET /api/leo/handoffs/:from/:to` - Handoff template
- `POST /api/leo/validate` - Validate against rules

## Key Scripts (Database-Aware)

- `get-latest-leo-protocol-from-db.js` - Get version from database
- `generate-claude-md-from-db.js` - Generate this file
- `migrate-leo-protocols-to-database.js` - Migration tool
- `activate-sub-agents-from-db.js` - Check database triggers

## Compliance Tools

All tools now query database instead of files:

### 1. Version Check
```bash
node scripts/get-latest-leo-protocol-from-db.js
```

### 2. Update CLAUDE.md
```bash
node scripts/generate-claude-md-from-db.js
```

### 3. Validate Handoff
```bash
node scripts/leo-checklist-db.js [agent-name]
```

## 🔍 PLAN Supervisor Verification

### Overview
PLAN agent now includes supervisor capabilities for final "done done" verification:
- Queries ALL sub-agents for their verification results
- Ensures all requirements are truly met
- Resolves conflicts between sub-agent reports
- Provides confidence scoring and clear pass/fail verdict

### Activation
Trigger PLAN supervisor verification via:
- **Command**: `/leo-verify [what to check]`
- **Script**: `node scripts/plan-supervisor-verification.js --prd PRD-ID`
- **Automatic**: When testing phase completes

### Verification Process
1. **Read-Only Access**: Queries existing sub-agent results (no re-execution)
2. **Summary-First**: Prevents context explosion with tiered reporting
3. **Conflict Resolution**: Priority-based rules (Security > Database > Testing)
4. **Circuit Breakers**: Graceful handling of sub-agent failures
5. **Maximum 3 Iterations**: Prevents infinite verification loops

### Verdicts
- **PASS**: All requirements met, high confidence (≥85%)
- **FAIL**: Critical issues or unmet requirements
- **CONDITIONAL_PASS**: Minor issues, needs LEAD review
- **ESCALATE**: Cannot reach consensus, needs LEAD intervention

## Dashboard Integration

Dashboard automatically connects to database:
- Real-time protocol updates via Supabase subscriptions
- Version detection from `leo_protocols` table
- Sub-agent status from `leo_sub_agents` table
- PLAN supervisor verification status
- No file scanning needed

## Important Notes

1. **Database is Source of Truth** - Files are deprecated
2. **Real-time Updates** - Changes reflect immediately
3. **No Version Conflicts** - Single active version enforced
4. **Audit Trail** - All changes tracked in database
5. **WebSocket Updates** - Dashboard stays synchronized
6. **PLAN Supervisor** - Final verification before LEAD approval

## Testing Tier Strategy (Updated)


## Testing Requirements - Dual Test Execution (UPDATED)

**Philosophy**: Comprehensive testing = Unit tests (logic) + E2E tests (user experience)

### Tier 1: Smoke Tests (MANDATORY) ✅
- **Requirement**: BOTH unit tests AND E2E tests must pass
- **Commands**:
  - Unit: `npm run test:unit` (Vitest - business logic)
  - E2E: `npm run test:e2e` (Playwright - user flows)
- **Approval**: **BOTH test types REQUIRED for PLAN→LEAD approval**
- **Execution Time**: Combined <5 minutes for smoke-level tests
- **Coverage**:
  - Unit: Service layer, business logic, utilities
  - E2E: Critical user paths, authentication, navigation

### Tier 2: Comprehensive Testing (RECOMMENDED) 📋
- **Requirement**: Full test suite with deep coverage
- **Commands**:
  - Unit: `npm run test:unit:coverage` (50%+ coverage target)
  - E2E: All Playwright tests (30-50 scenarios)
  - Integration: `npm run test:integration`
  - A11y: `npm run test:a11y`
- **Approval**: Nice to have, **NOT blocking** but highly recommended
- **Timing**: Can be refined post-deployment

### Tier 3: Manual Testing (SITUATIONAL) 🔍
- **UI changes**: Visual regression testing
- **Complex flows**: Multi-step wizards, payment flows
- **Edge cases**: Rare scenarios not covered by automation

### ⚠️ What Changed (From Protocol Enhancement)
**Before**: "Tier 1 = 3-5 tests, <60s" (ambiguous - which tests?)
**After**: "Tier 1 = Unit tests + E2E tests (explicit frameworks, explicit commands)"

**Lesson Learned**: SD-AGENT-ADMIN-002 testing oversight (ran E2E only, missed unit test failures)


## Database Schema Documentation Access

## Schema Documentation Access

### Quick Reference
- **Full schema**: `database/schema/` directory
- **Views**: `v_sd_*` prefix for SD views
- **RLS**: `database/schema/010_rls_policies.sql`

### Key Tables
| Table | Purpose |
|-------|---------|
| strategic_directives | SDs and their metadata |
| prds | PRD content and status |
| retrospectives | Completion retrospectives |
| deferred_work | Deferred items |

### Querying Schema
```sql
-- List tables
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- Table columns
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'strategic_directives';
```

## Visual Documentation Best Practices

When creating PRDs and technical specifications, consider adding:

### Architecture Diagrams (Mermaid)
```mermaid
graph TD
    A[User Request] --> B[Validation Layer]
    B --> C{Valid?}
    C -->|Yes| D[Business Logic]
    C -->|No| E[Error Response]
    D --> F[Database]
    F --> G[Success Response]
```

### State Flow Diagrams
```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Review
    Review --> Approved
    Review --> Rejected
    Rejected --> Draft
    Approved --> [*]
```

### Sequence Diagrams (Complex Interactions)
```mermaid
sequenceDiagram
    User->>+Frontend: Submit Form
    Frontend->>+API: POST /api/submit
    API->>+Database: INSERT data
    Database-->>-API: Success
    API->>+Queue: Enqueue job
    Queue-->>-API: Acknowledged
    API-->>-Frontend: 202 Accepted
    Frontend-->>-User: Show success
```

**When to Use**:
- Complex workflows with multiple decision points → Flowchart
- Multi-component interactions → Sequence diagram
- State transitions → State diagram
- System architecture → Component diagram

## Handoff Templates


#### PLAN → EXEC (plan_presentation)
Elements: [object Object], [object Object], [object Object], [object Object], [object Object]
Required: goal_summary present and ≤300 chars, file_scope has at least one of: create, modify, delete, execution_plan has ≥1 step, testing_strategy has both unit_tests and e2e_tests defined


#### EXEC → PLAN (EXEC-to-PLAN-VERIFICATION)
Elements: Not defined
Required: executive_summary, deliverables_manifest, key_decisions, known_issues, resource_utilization, action_items, completeness_report, rca_integration


#### LEAD → PLAN (strategic_to_technical)
Elements: Executive Summary, Completeness Report, Deliverables Manifest, Key Decisions & Rationale, Known Issues & Risks, Resource Utilization, Action Items for Receiver
Required: [object Object], [object Object], [object Object]


#### PLAN → LEAD (verification_to_approval)
Elements: Executive Summary, Completeness Report, Deliverables Manifest, Key Decisions & Rationale, Known Issues & Risks, Resource Utilization, Action Items for Receiver
Required: [object Object], [object Object], [object Object]


#### EXEC → PLAN (implementation_to_verification)
Elements: Executive Summary, Completeness Report, Deliverables Manifest, Key Decisions & Rationale, Known Issues & Risks, Resource Utilization, Action Items for Receiver
Required: [object Object], [object Object], [object Object], [object Object], [object Object], [object Object]


## Validation Rules


- **hasADR** (undefined)
  - Severity: undefined
  - Definition: undefined


- **hasInterfaces** (undefined)
  - Severity: undefined
  - Definition: undefined


- **hasTechDesign** (undefined)
  - Severity: undefined
  - Definition: undefined


- **designArtifacts** (undefined)
  - Severity: undefined
  - Definition: undefined


- **dbSchemaReady** (undefined)
  - Severity: undefined
  - Definition: undefined


- **securityScanClean** (undefined)
  - Severity: undefined
  - Definition: undefined


- **riskSpikesClosed** (undefined)
  - Severity: undefined
  - Definition: undefined


- **nfrBudgetsPresent** (undefined)
  - Severity: undefined
  - Definition: undefined


- **coverageTargetSet** (undefined)
  - Severity: undefined
  - Definition: undefined


- **testPlanMatrices** (undefined)
  - Severity: undefined
  - Definition: undefined


- **supervisorChecklistPass** (undefined)
  - Severity: undefined
  - Definition: undefined


---

*Generated from database: 2025-12-02*
*Protocol Version: 4.3.3*
*Load when: User mentions PLAN, PRD, validation, or testing strategy*
