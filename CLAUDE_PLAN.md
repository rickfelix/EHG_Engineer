<!-- file_content_hash: d4821b12d516252e -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_PLAN.md - PLAN Phase Operations

**Generated**: 2026-08-29 7:16:18 AM
**Protocol**: LEO 4.4.1
**Purpose**: PLAN agent operations, PRD creation, validation gates
**Effort**: high (architecture decisions and PRD rubrics require full reasoning depth)

> For Issue Resolution Protocol + Five-Point Brief, see CLAUDE.md.
> For migration execution and phase transitions, see CLAUDE_CORE.md.
> For database schema reference, see `docs/reference/database-agent-patterns.md`.

---

## Autonomous Continuation Directives

**CRITICAL**: These directives guide autonomous agent behavior during PLAN phase execution.

### Core Directives (Always Apply)

**1. Autonomous Continuation**
Continue through the strategic directive and its children SDs autonomously until completion or blocker. Do not stop to ask for permission at each step.
> Why: Stopping to ask permission at each phase boundary breaks flow and increases context-switching overhead. When AUTO-PROCEED is ON, the user has explicitly delegated phase transition decisions — mid-execution pauses consume user attention without adding value.

**2. Quality Over Speed**
Prioritize quality over speed. Do not cut corners. Ensure tests pass, code is clean, and documentation is updated.
> Why: Speed-first delivery shifts cost — tests skipped under deadline pressure become permanent gaps, clean code deferred becomes untouchable tech debt, and missing docs generate ongoing support work. Quality gates exist to frontload these costs while context is still hot.

### Handoff Directives (Apply at Phase Start)

**1. Protocol Familiarization**
At each handoff point, familiarize yourself with and read the LEO protocol documentation for the relevant phase.

### Conditional Directives (Apply When Issues Occur)

**Trigger**: When encountering errors, blockers, or failures during execution.

**1. 5-Whys Root Cause Analysis**
When encountering issues or blockers, determine the root cause by asking five whys before attempting fixes. Use /rca to invoke the formal 5-Whys analysis process.

**2. Sustainable Resolution**
Resolve root causes so they do not happen again in the future. Update processes, documentation, or automation to prevent recurrence.

---

*Directives from `leo_autonomous_directives` table (SD-LEO-CONTINUITY-001)*


## 🎯 Multi-Perspective Planning

## Multi-Perspective Planning

### When to Use Plan Agents

Before creating a PRD, launch `Plan` agents to explore different approaches when the criteria below apply. Skip only for trivial bug fixes, typo changes, or single-approach tasks where the design is unambiguous:

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

**Step 5: Validate PRD with Sub-Agents (MANDATORY)**

⚠️ **CRITICAL**: Use Task tool with specialized sub-agents, NOT the sub-agent-executor script:
> Why: `sub-agent-executor.js` is built for automated pipelines — it lacks the session context and interactive error-handling that interactive sessions need. The Task tool routes agents with full conversation context and stores results in `sub_agent_execution_results` where gates can find them.

```
# CORRECT - Use Task tool with subagent_type
Task(subagent_type="design-agent", prompt="Execute DESIGN analysis for SD-XXX. Analyze UI components, patterns, accessibility. Store results in sub_agent_execution_results table.")

Task(subagent_type="database-agent", prompt="Execute DATABASE analysis for SD-XXX. Verify schema, RLS policies, query patterns. Store results in sub_agent_execution_results table.")
```

**Why Task tool?** The sub-agent-executor.js is a framework for automated pipelines. For interactive sessions, the Task tool properly invokes agents with full context and stores results.

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
> Why: Three perspectives costs 3× the context. For a decision where the answer is clear, the extra agents produce noise without signal. Match the number of perspectives to the actual uncertainty in the decision.

> **Evidence persistence**: sub-agents MUST persist `sub_agent_execution_results` rows via `node scripts/store-sub-agent-repo-evidence.js <SD-ID> <SUB-AGENT-CODE> --content @results.json` (QF-20260702-679) or the canonical `lib/sub-agents/resolve-repo.js` helpers — NEVER hand-type a Windows path literal inside an inline `node -e`/heredoc INSERT statement. The JS string-escape parser silently corrupts backslash sequences before the value ever reaches the database (e.g. `\U`, `\P`, `\_`, `\E` are dropped as unrecognized escapes; `\r` becomes a literal embedded carriage-return control byte).

## Friction signaling

**Send `/signal <type> "<body>"`** for recurrence (gate 2× / RCA 2× / tool 3× / phase >2× type-bucket median), about-to-bypass (`--no-verify` / 3rd-bypass-quota / mock-not-fix), protocol-spec friction, recognized harness bug, or memory-trend match. Types: stuck | need-sweep | prd-ambiguous | gate-bug | spec-conflict | harness-bug | feedback | other. Source-of-truth: CLAUDE_CORE.md "Signaling friction to the coordinator" / SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-3a.

**Questions or decisions → relay to the coordinator.** If you have any questions or decisions needed, relay those to the coordinator — do not block on a human or decide unilaterally. The coordinator resolves what it can and escalates anything beyond its authority upward.

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

## PLAN Phase Negative Constraints

## 🚫 PLAN Phase Negative Constraints

<negative_constraints phase="PLAN">
These anti-patterns are specific to the PLAN phase. Violating them leads to incomplete PRDs and blocked handoffs.

### NC-PLAN-001: No Implementation in PLAN Phase
**Anti-Pattern**: Writing actual code (components, services, migrations) during PLAN
**Why Wrong**: PLAN is for specification, not execution. Code written here won't be tracked.
**Correct Approach**: Document requirements, architecture, and test scenarios. Save coding for EXEC.

### NC-PLAN-002: No PRD Without Exploration
**Anti-Pattern**: Creating PRD immediately after SD approval without reading codebase
**Why Wrong**: PRDs miss existing infrastructure, create duplicate work, conflict with patterns
**Correct Approach**: Read ≥5 relevant files, document findings in exploration_summary

### NC-PLAN-003: No Boilerplate Acceptance Criteria
**Anti-Pattern**: Using generic criteria like "all tests pass", "code review done", "meets requirements"
**Why Wrong**: Russian Judge detects boilerplate (≤50% score), blocks PLAN→EXEC handoff
**Correct Approach**: Write specific, measurable criteria tied to functional requirements

### NC-PLAN-004: No Skipping Sub-Agents
**Anti-Pattern**: Creating PRD without running DESIGN, DATABASE sub-agents
**Why Wrong**: Gate 1 blocks handoff if sub-agent execution not recorded
**Correct Approach**: Use Task tool with specialized sub-agents:
```
Task(subagent_type="design-agent", prompt="Execute DESIGN analysis for SD-XXX...")
Task(subagent_type="database-agent", prompt="Execute DATABASE analysis for SD-XXX...")
```
⚠️ Do NOT use `node lib/sub-agent-executor.js` in interactive sessions - use Task tool instead.

### NC-PLAN-005: No Placeholder Requirements
**Anti-Pattern**: Using "TBD", "to be defined", "will be determined" in requirements
**Why Wrong**: PRD validator blocks placeholders, signals incomplete planning
**Correct Approach**: If truly unknown, use AskUserQuestion to clarify before PRD creation
</negative_constraints>

## Phase-Specific Sub-Agent Guidance: PLAN

During the PLAN phase, prioritize these sub-agents for PRD creation and architecture specification:

- **stories-agent**: For generating user stories from PRD functional requirements
- **design-agent**: For UI/UX component specifications, wireframes, and accessibility analysis
- **database-agent**: For data model design, migration planning, and schema validation
- **security-agent**: For security requirement analysis and threat modeling
- **risk-agent**: For implementation risk assessment and feasibility analysis
- **validation-agent**: For verifying proposed architecture against existing codebase patterns

### When to Invoke
- **Before PRD creation**: Run database-agent for schema exploration, design-agent for UI analysis
- **During PRD writing**: Run stories-agent to generate user stories from functional requirements
- **Before PLAN-TO-EXEC handoff**: Run security-agent and risk-agent for completeness validation
- **NC-PLAN-004 compliance**: Gate 1 blocks handoff if sub-agent execution is not recorded


### Concurrent Invocation Mandate (SD-MAN-ORCH-LEO-HARNESS-EFFICIENCY-001-C)
Required sub-agents for a handoff MUST be invoked CONCURRENTLY — one message containing multiple Task tool calls — unless a documented data dependency exists between agents (state the dependency in the invocation message when sequencing is genuinely required).
> Why: The required agents are independent evidence WRITERS — each inserts its own sub_agent_execution_results row (no shared upsert, no ordering requirement in any gate). Serial invocation is pure wall-clock waste: live 5-day measurement found only 3% of multi-agent evidence groups were collected in parallel, while 33% spread over 2+ minutes, across ~200 handoffs/day fleet-wide.
Script-path equivalent: `npm run subagents:collect -- --sd <SD-KEY> --phase <HANDOFF>` launches all required agents for the handoff in parallel and waits for all evidence rows (one command replaces N serial invocations).
*Added: SD-LEO-INFRA-SUB-AGENT-ROUTING-001-B*

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


## PLAN-TO-EXEC Checklist (MANDATORY)

## 🚪 PLAN-TO-EXEC Checklist (MANDATORY)

Before running `node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX`, verify ALL items:

### 1. PRD Complete ✅
- [ ] PRD created via `node scripts/add-prd-to-database.js` or generated script
- [ ] No placeholder text ("TBD", "to be defined")
- [ ] Functional requirements have acceptance criteria
- [ ] Technical architecture documented

### 2. Integration & Operationalization Complete ✅
- [ ] PRD has `integration_operationalization` section with 5 subsections:
  - [ ] **Consumers & User Journeys**: Who/what uses this feature
  - [ ] **Upstream/Downstream Dependencies**: External systems, failure modes
  - [ ] **Data Contracts & Schema**: Tables, columns, API contracts
  - [ ] **Runtime Configuration**: Env vars, feature flags, deployment sequence
  - [ ] **Observability, Rollout & Rollback**: Metrics, rollout plan, rollback procedure
- [ ] For infrastructure SDs: Consumers identified OR justification provided (≥30 chars)
- [ ] Dependencies have `name`, `direction`, `failure_mode` fields

**Why this matters**: Integration planning prevents orphaned infrastructure, unclear dependencies, and missing observability during rollout.

**Validation**: `GATE_INTEGRATION_SECTION_VALIDATION` runs at PLAN-TO-EXEC handoff (blocking for feature/bugfix, warning for infrastructure).

### 3. User Stories Generated ✅
- [ ] User stories generated from PRD (auto-trigger or manual)
- [ ] **≥80% of stories have implementation_context** (BMAD requirement)
- [ ] Each story has: technical_approach, files_to_create/modify, dependencies, estimated_effort

```bash
# Generate user stories from PRD
node scripts/modules/auto-trigger-stories.mjs <SD-ID> <PRD-ID>
# Or use the Task tool with stories-agent
Task(subagent_type="stories-agent", prompt="Generate user stories for SD-XXX...")
```

### 3. Sub-Agents Executed ✅ (GATE 1 Requirement)
- [ ] **DESIGN sub-agent** executed and results stored
- [ ] **DATABASE sub-agent** executed and results stored

```
# CORRECT - Use Task tool (NOT sub-agent-executor.js)
Task(subagent_type="design-agent", prompt="Execute DESIGN analysis for SD-XXX...")
Task(subagent_type="database-agent", prompt="Execute DATABASE analysis for SD-XXX...")
```

### 4. Validation Gates Pass ✅
- **BMAD Validation**: User story context ≥80%
- **GATE 1**: DESIGN + DATABASE sub-agents executed

### Common Failures and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| "User story context engineering requires ≥80%" | Stories missing implementation_context | Add implementation_context to all stories |
| "DESIGN sub-agent not executed" | Didn't run design-agent | Use Task tool with design-agent |
| "DATABASE sub-agent not executed" | Didn't run database-agent | Use Task tool with database-agent |

## Enhanced QA Engineering Director v2.0 - Testing-First Edition

**Enhanced QA Engineering Director v2.0**: Mission-critical testing automation with comprehensive E2E validation.

**Core Capabilities:**
1. Professional test case generation from user stories
2. Pre-test build validation (saves 2-3 hours)
3. Database migration verification (prevents 1-2 hours debugging)
4. **Mandatory E2E testing via Playwright** (REQUIRED for approval)
5. Test infrastructure discovery and reuse

**5-Phase Workflow**: Pre-flight checks → Test generation → E2E execution → Evidence collection → Verdict & learnings

**Activation**: Auto-triggers on `EXEC-TO-PLAN`, coverage keywords, testing evidence requests

**Full Guide**: See `docs/reference/qa-director-guide.md`

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


## 🧪 Test Infrastructure Readiness Gate (Before PLAN→EXEC)

**Source**: Retrospective analysis of SD-STAGE4-AI-FIRST-UX-001, SD-VENTURE-UNIFICATION-001

**Failure Pattern**: "Testing infrastructure validated AFTER implementation" caused:
- 28/32 E2E test failures (mock API config not planned)
- 11/18 unit test timeouts (vitest async issues)
- 2-4 hours of debugging per SD

### MANDATORY Verification Before PLAN→EXEC Handoff

```markdown
## Test Infrastructure Readiness Checklist

### Authentication
- [ ] Test user exists in database (query auth.users)
- [ ] Test credentials match .env.test.local
- [ ] Manual login works: `npm run test:auth:verify` or manual browser test
- [ ] Service role key is valid (for admin operations)

### Unit Tests
- [ ] `npm run test:unit` runs without infrastructure errors
- [ ] Baseline count documented: ___ passing / ___ failing
- [ ] No timeout issues (if vitest, check async handling)

### E2E Tests
- [ ] Playwright installed: `npx playwright --version`
- [ ] Browser dependencies: `npx playwright install`
- [ ] `npm run test:e2e -- --list` shows available tests
- [ ] Mock API configuration reviewed (if applicable)

### Environment
- [ ] .env.test exists with test database credentials
- [ ] Test database is accessible
- [ ] No port conflicts with dev server
```

### Exit Criteria

**BLOCKING**: Do NOT approve PLAN→EXEC handoff if:
- Test user authentication fails
- Unit test suite has infrastructure errors (not test failures)
- E2E environment is not configured

**Pattern Reference**: PAT-RECURSION-005, PAT-AUTH-PW-001

### Why This Gate Exists

From retrospectives:
> "Testing infrastructure validated AFTER implementation = failure pattern"
> "E2E test suite created but never executed due to auth blocker"
> "Mock API configuration not planned upfront"

**Time saved**: 2-4 hours per SD by catching infrastructure issues before implementation.

## Smoke Test Evidence Requirement (Pipeline/Integration SDs)

## Smoke Test Evidence Requirement

**Applies to**: Pipeline, integration, and infrastructure SDs that modify runtime behavior of existing systems.

**Gate**: SMOKE_TEST_EVIDENCE (BLOCKING at PLAN-TO-LEAD)

Before writing an architecture plan for any pipeline or integration fix, the architect MUST:

1. **Run the system** being fixed and capture actual runtime output
2. **Identify the first point of failure** in the output (not just read code)
3. **Include a "## Baseline Observation" section** in the architecture plan with:
   - The command or script used to run the system
   - The actual console output showing the failure
   - The first error/unexpected behavior in the chain
   - What the expected output should have been

**Why**: Code reading reveals what code DOES. Runtime observation reveals what code DOESN'T DO. Missing tables, empty arrays, silently-swallowed errors, and non-existent function calls are invisible to static analysis but immediately obvious at runtime.

**Example**: SD-LEO-INFRA-EVA-STAGE-PIPELINE-002 spent 6 children fixing artifact types, gates, and columns — all downstream of a  function that queries a table that does not exist. One runtime observation before architecture would have caught the root cause in 0.2 seconds.

**Detection**: The gate scans architecture plan content for evidence patterns (section headers, log output blocks, runtime observation language). Plans without evidence are rejected.

### Cross-Stage Data Flow Verification (Pipeline SDs)

When an SD creates code that **produces data consumed by a downstream stage**, the smoke test evidence must include verification that the downstream consumer receives valid data.

**Applies to**: SDs where Stage N writes artifacts/records that Stage N+M reads.

**Examples**:
- S17 doc-gen writes to `eva_vision_documents` → S19 bridge reads vision_key for SD creation
- S19 bridge writes to `strategic_directives_v2` → Build pipeline reads SDs for execution
- Stage templates write to `venture_artifacts` → Downstream stages query artifacts by type

**Required Evidence**:
1. Run the producer stage and verify rows exist in the target table
2. Run the consumer stage and verify it reads those rows successfully
3. Include both queries in the "## Baseline Observation" section

**Why**: SD-LEO-INFRA-CENTRALIZED-POST-STAGE-001 and SD-LEO-INFRA-VENTURE-BUILD-READINESS-001-C each passed their individual gates, but the data contract between S17 (produces vision/arch docs) and S19 (consumes them for sprint validation) was never tested end-to-end. A column name mismatch in S17 caused zero docs to be written, and S19 proceeded with an unvalidated sprint plan.

## First-Failure-First Ordering (Pipeline Orchestrator SDs)

## First-Failure-First (FFF) Child Ordering

**Applies to**: Orchestrator SDs with children that fix pipeline or integration issues.

**Gate**: FAILURE_CHAIN_ORDERING (BLOCKING at PLAN-TO-LEAD)

When a pipeline has cascading failures, the architecture plan MUST:

1. **Include a "## Failure Chain" section** showing the cascade:
   \
2. **Order children from upstream (root cause) to downstream (symptoms)**:
   - Child A must fix Layer 1 (the root cause)
   - Child B fixes Layer 2
   - Subsequent children fix progressively downstream layers
   - The final child (validation/test) depends on all others

3. **Each child must reference its position in the failure chain**

**Why**: If Child A fixes Layer 4 (symptoms) while Layer 1 (root cause) remains broken, all downstream fixes are untestable. The root cause must be fixed first so subsequent children can verify their fixes against real output.

**Detection**: The gate checks architecture plan content for failure chain diagrams and upstream-first child ordering language.

## 🔬 BMAD Method Enhancements

## BMAD Enhancements

### 6 Key Improvements
1. **Unified Handoff System** - All handoffs via `handoff.js`
2. **Database-First PRDs** - PRDs stored in database, not markdown
3. **Validation Gates** - 4-gate validation before EXEC
4. **Progress Tracking** - Automatic progress % calculation
5. **Context Management** - Proactive monitoring, compression strategies
6. **Sub-Agent Compression** - 3-tier output reduction

### Using Handoff System
```bash
node scripts/handoff.js create "{message}"
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

## Testing Tier Strategy (Updated)

**Philosophy**: Comprehensive testing = Unit tests (logic) + E2E tests (user experience)

### Architecture Context
- **EHG_Engineer (Port 3000)**: Backend API tests only
- **EHG (Port 8080)**: Frontend tests (E2E, A11y, Visual)

### Tier 1: Smoke Tests (MANDATORY) ✅
- **Requirement**: BOTH unit tests AND E2E tests must pass
- **EHG_Engineer Commands**:
  - Unit: `npm run test:unit` (Vitest - backend logic)
  - E2E: `npm run test:e2e` (Playwright - API tests)
- **EHG Commands** (frontend):
  - Unit: `npm run test:unit` (Vitest)
  - E2E: `npm run test:e2e` (Playwright - UI tests)
- **Approval**: **BOTH test types REQUIRED for PLAN→LEAD approval**

### Tier 2: Comprehensive Testing (RECOMMENDED) 📋
- **EHG_Engineer**: Unit coverage, integration tests
- **EHG (Frontend)**:
  - E2E: Full Playwright suite
  - A11y: Accessibility tests (in EHG repository)
  - Integration: Component integration tests
- **Approval**: Nice to have, **NOT blocking** but highly recommended

### Tier 3: Manual Testing (SITUATIONAL) 🔍
- **UI changes**: Visual regression (EHG repository)
- **Complex flows**: Multi-step wizards, payment flows
- **Edge cases**: Rare scenarios not covered by automation

### ⚠️ Architecture Note
**SD-ARCH-EHG-007**: A11y and visual tests moved to EHG unified frontend.
EHG_Engineer focuses on backend API testing only.

## Documentation Link Validation Gate (PLAN-TO-LEAD)

**Source**: SD-LEO-ORCH-QUALITY-GATE-ENHANCEMENTS-001-D

**Purpose**: Validates that all relative links in changed markdown files point to existing files. Prevents broken documentation links from reaching LEAD review.

### Enforcement Modes

| SD Type | Mode |
|---------|------|
| documentation | **BLOCKING** |
| All others | ADVISORY (warning only) |

### What It Checks

1. **Identifies changed markdown files** via `git diff` against main branch
2. **Strips code blocks** (fenced and inline) to avoid false positives from example links
3. **Extracts relative file links** using markdown link syntax `[text](path)`
4. **Skips non-file references**: HTTP/HTTPS URLs, mailto:, anchor-only (#), data: URIs, tel:
5. **Resolves link targets** relative to the file directory AND from repo root
6. **Reports broken links** with file location and target path

### Scoring

- All links valid: 100/100
- Each broken link: -15 points (minimum 0)

### Auto-Skip Conditions

- No markdown files changed in the branch

### Remediation

When this gate fails (documentation SDs):
1. Fix or remove broken relative links
2. Ensure referenced files exist at the specified paths
3. Use correct relative path from the linking file directory
4. Re-run the PLAN-TO-LEAD handoff

### Implementation

- **File**: `scripts/modules/handoff/executors/plan-to-lead/gates/documentation-link-validation.js`
- **Export**: `createDocumentationLinkValidationGate(supabase)`
- **Gate Key**: `GATE_DOCUMENTATION_LINK_VALIDATION`

## Vision V2 PRD Requirements (SD-VISION-V2-*)

### MANDATORY: Vision Spec Integration in PRDs

**For ALL PRDs for SDs matching `SD-VISION-V2-*`:**

Before creating a PRD, you MUST:

1. **Query SD metadata for vision spec references**
2. **Read ALL files listed in `must_read_before_prd`**
3. **Include vision spec citations in PRD sections**

### PRD Section Requirements for Vision V2

| PRD Section | Vision Spec Requirement |
|-------------|------------------------|
| `technical_context` | MUST cite specific spec sections that define the implementation |
| `implementation_approach` | MUST reference spec patterns/examples |
| `acceptance_criteria` | MUST include "Matches spec Section X" criteria |
| `metadata` | MUST include `vision_spec_references` from parent SD |

### PRD Template for Vision V2

Add this to PRD's `technical_context`:

```markdown
### Vision Specification References

This PRD implements requirements from:
- **Primary Spec**: [spec-name.md](path/to/spec) - Sections X, Y, Z
- **Design Philosophy**: [VISION_V2_GLASS_COCKPIT.md](VISION_V2_GLASS_COCKPIT.md)

Key spec requirements addressed:
1. [Requirement from spec Section X]
2. [Requirement from spec Section Y]
```

### Implementation Guidance (from SD metadata)

All Vision V2 SDs have `creation_mode: CREATE_FROM_NEW` - implement fresh per specs, learn from existing code but do not modify it.

## PRD Creation Anti-Pattern (PROHIBITED)

**NEVER create one-off PRD creation scripts like:**
- `create-prd-sd-*.js`
- `insert-prd-*.js`
- `enhance-prd-*.js`

**ALWAYS use the standard CLI:**
```bash
node scripts/add-prd-to-database.js
```

### Why This Matters
- One-off scripts bypass PRD quality validation
- They create massive maintenance burden (100+ orphaned scripts)
- They fragment PRD creation patterns

### Archived Scripts Location
~100 legacy one-off scripts have been moved to:
- `scripts/archived-prd-scripts/`

These are kept for reference but should NEVER be used as templates.

### Correct Workflow
1. Run `node scripts/add-prd-to-database.js`
2. Follow the modular PRD creation system in `scripts/prd/`
3. PRD is properly validated against quality rubrics

## PRD Creation — Inline Mode is the Default for Claude Code

**CRITICAL**: When running `node scripts/add-prd-to-database.js <SD-ID> "<title>"` from a Claude Code session, the script defaults to **inline mode** (`LLM_PRD_INLINE=true`). This is the correct mode. **Do NOT set `LLM_PRD_INLINE=false`** from within Claude Code.

### What inline mode does

The script prints the PRD generation system prompt + user prompt to stdout between delimiters:
```
===PRD_GENERATION_PROMPT_START===
SYSTEM_PROMPT:
...
USER_PROMPT:
...
===PRD_GENERATION_PROMPT_END===
```

Followed by:
```
>>> PRD_VERIFICATION_FAILED=true
>>> PRD_SD_ID=<uuid>
Claude Code: You MUST insert the PRD record into product_requirements_v2 before proceeding.
```

**This is NOT an error.** It is a handoff from the script to Claude Code. The script is telling you: "I printed the prompt, now YOU (Opus 4.6) generate the PRD JSON and INSERT it."

### Why external API mode is wrong for Claude Code

Setting `LLM_PRD_INLINE=false` routes through `lib/llm/client-factory.js`, which calls Anthropic/Google/OpenAI over HTTP. From within a Claude Code session this:
1. Pays twice for the same model (Claude Code IS Opus 4.6)
2. Often times out due to sandboxing/network restrictions
3. Hits `LLM_PROVIDER=google` in `.env` by default → Gemini timeout
4. Reference: SD-LEO-FIX-REPLACE-EXTERNAL-API-001 was specifically created to eliminate this external call for Claude Code

### Correct workflow

1. Run `node scripts/add-prd-to-database.js SD-XXX-001 "PRD Title"` (default flags, no `LLM_PRD_INLINE` override).
2. Read the **full prompt** between the delimiters — do NOT truncate with `| tail` since you need the system prompt's JSON schema.
3. Generate the PRD JSON yourself matching the schema, using the parent SD's plan_content / arch doc / vision doc as source material.
4. INSERT the generated JSON into `product_requirements_v2` directly. Required fields: `executive_summary`, `functional_requirements`, `system_architecture`, `acceptance_criteria`, `test_scenarios`, `implementation_approach`, `risks`. The `id` field is manual text format `PRD-<sd_key>`; `sd_id` references `strategic_directives_v2.id` (UUID, not sd_key). Status must be `approved` before PLAN-TO-EXEC.
5. Also INSERT user stories into `user_stories` with `implementation_context` JSONB (NOT NULL).
6. Run `node scripts/handoff.js precheck PLAN-TO-EXEC <SD-ID>` to verify.

### Anti-pattern to avoid

```bash
# WRONG — routes to external API, times out, creates audit noise
LLM_PROVIDER=anthropic LLM_PRD_INLINE=false node scripts/add-prd-to-database.js ...
```

```bash
# WRONG — truncates the prompt so you can't see the schema
node scripts/add-prd-to-database.js SD-XXX "Title" 2>&1 | tail -30
```

```bash
# RIGHT — default inline mode, full output captured
node scripts/add-prd-to-database.js SD-XXX "Title" 2>&1 | tee /tmp/prd-prompt.txt
```

### Misreading inline-mode output as a failure (historical incident)

On 2026-04-06 during SD-LEO-REFAC-STAGE-ADVANCEMENT-ENGINE-001 child decomposition, the PRD creation step was blocked for ~30 minutes because the `WARNING: No PRD record found` message was interpreted as a script failure rather than as the inline-mode handoff signal. The fix attempt (`LLM_PRD_INLINE=false`) then hit external API timeouts, compounding the confusion. Root cause: the warning's phrasing ("You MUST insert the PRD record") is delivered in a warning/error tone, but it is in fact the normal inline-mode completion message.


## Substring-Redundancy Audit for Keyword-List Expansions

MANDATORY during PRD authoring for any FR that expands a keyword/phrase list backed by `Array.prototype.some(kw => str.includes(kw))` or equivalent substring matchers: (1) list new keywords, (2) check each against existing entries for case-insensitive substring overlap, (3) drop entries fully subsumed by broader existing entries, (4) document the audit in the FR's acceptance_criteria.

### Why

validation-agent caught this on the "gates" entry during SD-LEO-INFRA-BUILDDEFAULTSMOKETESTSTEPS-KEYWORD-DETECTOR-001 PLAN: `gate` already substring-matches `gates`, `gateway`, `upgrade`. Adding `gates` was structural noise. Generic to any keyword-list expansion (codeKeywords, riskKeywords, schemaKeywords).

### Anti-Pattern Example

Adding `protocol gates` alongside existing `protocol`. Either drop the longer entry, or replace `protocol` with the more specific term and explicitly accept the broadening.

### How to Apply

For every keyword-list FR expansion, include in acceptance_criteria: "Substring-redundancy audit applied: each new entry checked against all existing + sibling new entries for substring containment; redundant entries dropped with rationale."

## Handoff Templates


#### PLAN -> EXEC (plan_presentation)
- **Elements**: goal_summary, file_scope, execution_plan, dependency_impacts, testing_strategy
- **Required**: goal_summary present and ≤300 chars, file_scope has at least one of: create, modify, delete, execution_plan has ≥1 step, testing_strategy has both unit_tests and e2e_tests defined


#### EXEC -> PLAN (EXEC-to-PLAN-VERIFICATION)
- **Elements**: Not defined
- **Required**: executive_summary, deliverables_manifest, key_decisions, known_issues, resource_utilization, action_items, completeness_report, rca_integration


#### LEAD -> PLAN (strategic_to_technical)
- **Elements**: Executive Summary, Completeness Report, Deliverables Manifest, Key Decisions & Rationale, Known Issues & Risks, Resource Utilization, Action Items for Receiver
- **Required**: {
  "element": "SD created",
  "required": true
}, {
  "element": "Objectives defined",
  "required": true
}, {
  "element": "Priority set",
  "required": true
}


#### PLAN -> LEAD (verification_to_approval)
- **Elements**: Executive Summary, Completeness Report, Deliverables Manifest, Key Decisions & Rationale, Known Issues & Risks, Resource Utilization, Action Items for Receiver
- **Required**: {
  "element": "EXEC work complete",
  "required": true
}, {
  "element": "Sub-agent verifications complete",
  "required": true
}, {
  "element": "EXEC checklist >= 80%",
  "required": true
}


#### EXEC -> PLAN (implementation_to_verification)
- **Elements**: Executive Summary, Completeness Report, Deliverables Manifest, Key Decisions & Rationale, Known Issues & Risks, Resource Utilization, Action Items for Receiver
- **Required**: {
  "element": "Implementation complete",
  "required": true
}, {
  "element": "Tests passing",
  "required": true
}, {
  "element": "Documentation updated",
  "required": true
}, {
  "format": "Command + pass/fail count + coverage %",
  "element": "Unit Test Results",
  "evidence": "SD-EXPORT-001",
  "required": true
}, {
  "format": "Command + pass/fail count + screenshot URL + Playwright report",
  "element": "E2E Test Results",
  "evidence": "SD-EXPORT-001, SD-EVA-MEETING-002",
  "required": true
}, {
  "format": "Total stories / Validated stories / Coverage % (must be 100%)",
  "element": "User Story Coverage",
  "evidence": "SD-EVA-MEETING-001",
  "required": true
}


## Validation Rules


- **hasDiffMinimality** (Gate Q)
  - Weight: 0.25
  - Required: No
  - Criteria: 4 criteria defined (command, thresholds, description...)


- **hasRollbackSafety** (Gate Q)
  - Weight: 0.2
  - Required: No
  - Criteria: 4 criteria defined (command, description, migration_paths...)


- **hasMigrationCorrectness** (Gate Q)
  - Weight: 0.2
  - Required: No
  - Criteria: 5 criteria defined (command, description, naming_pattern...)


- **sdExistenceCheck** (Gate L)
  - Weight: 0.15
  - Required: Yes
  - Criteria: checks: ["id_exists","status_active","not_archived"]; description: "Strategic Directive exists and is active"


- **sdObjectivesDefined** (Gate L)
  - Weight: 0.25
  - Required: Yes
  - Criteria: min_items: 2; description: "Strategic objectives defined with measurable outcomes"; required_fields: ["strategic_objectives","success_metrics"]


- **sdPrioritySet** (Gate L)
  - Weight: 0.2
  - Required: Yes
  - Criteria: description: "Priority is set to critical, high, medium, or low"; valid_values: ["critical","high","medium","low"]


- **sdSuccessCriteria** (Gate L)
  - Weight: 0.25
  - Required: Yes
  - Criteria: min_items: 3; description: "Success criteria defined with measurable items"


- **sdRisksIdentified** (Gate L)
  - Weight: 0.15
  - Required: No
  - Criteria: allow_empty: true; description: "Risks array is defined (can be empty for low-risk SDs)"


- **hasTestEvidence** (Gate Q)
  - Weight: 0.25
  - Required: Yes
  - Criteria: 4 criteria defined (command, description, successCriteria...)


- **userStoryQualityValidation** (Gate 1)
  - Weight: 0.173
  - Required: Yes
  - Criteria: 4 criteria defined (uses_ai, min_score, description...)


- **prdQualityValidation** (Gate 1)
  - Weight: 0.172
  - Required: Yes
  - Criteria: uses_ai: true; min_score: 50; description: "PRD quality validation - lowered for refactor SDs"


- **uiComponentsImplemented** (Gate 2A)
  - Weight: 0.4
  - Required: Yes
  - Criteria: checks: ["component_files_exist","naming_conventions"]; description: "UI components created matching design specifications"


- **userWorkflowsImplemented** (Gate 2A)
  - Weight: 0.35
  - Required: Yes
  - Criteria: checks: ["workflows_in_deliverables"]; description: "User workflows implemented as designed"


- **userActionsSupported** (Gate 2A)
  - Weight: 0.25
  - Required: No
  - Criteria: checks: ["create","update","delete","insert"]; description: "CRUD operations found in code changes"


- **migrationsCreatedAndExecuted** (Gate 2B)
  - Weight: 0.6
  - Required: Yes
  - Criteria: checks: ["migration_files_exist","migrations_executed"]; critical: true; description: "CRITICAL: Database migrations exist AND executed in database"


- **rlsPoliciesImplemented** (Gate 2B)
  - Weight: 0.2
  - Required: No
  - Criteria: checks: ["CREATE_POLICY","ALTER_POLICY"]; description: "RLS policies created for new tables"


- **migrationComplexityAligned** (Gate 2B)
  - Weight: 0.2
  - Required: No
  - Criteria: checks: ["line_count","complexity_appropriate"]; description: "Migration complexity matches design requirements"


- **databaseQueriesIntegrated** (Gate 2C)
  - Weight: 0.4
  - Required: Yes
  - Criteria: checks: [".select(",".insert(",".update(",".from("]; description: "Database queries found in code (.select, .insert, .update)"


- **formUiIntegration** (Gate 2C)
  - Weight: 0.4
  - Required: Yes
  - Criteria: checks: ["useState","useForm","onSubmit","Input","Button"]; description: "Form/UI integration found (useState, useForm, onSubmit)"


- **dataValidationImplemented** (Gate 2C)
  - Weight: 0.2
  - Required: No
  - Criteria: checks: ["zod","validate","schema",".required()"]; description: "Data validation found (zod, schema, required)"


- **e2eTestCoverage** (Gate 2D)
  - Weight: 0.4
  - Required: Yes
  - Criteria: 4 criteria defined (checks, critical, test_dirs...)


- **testingSubAgentVerified** (Gate 2D)
  - Weight: 0.3
  - Required: Yes
  - Criteria: description: "TESTING sub-agent executed with PASS verdict"; sub_agent_code: "TESTING"; expected_verdict: "PASS"


- **screenshotEvidenceExists** (Gate 2D)
  - Weight: 0.15
  - Required: No
  - Criteria: checks: ["screenshot_url_valid"]; description: "E2E test screenshots exist"


- **playwrightReportExists** (Gate 2D)
  - Weight: 0.15
  - Required: No
  - Criteria: checks: ["playwright_report_url_valid"]; description: "Playwright report URL exists and valid"


- **recommendationAdherence** (Gate 3)
  - Weight: 0.3
  - Required: Yes
  - Criteria: checks: ["design_adherence_percent","database_adherence_percent"]; description: "CRITICAL: EXEC delivered what PLAN designed"; min_adherence: 80


- **implementationQuality** (Gate 3)
  - Weight: 0.3
  - Required: Yes
  - Criteria: checks: ["gate2_score","test_coverage_documented"]; description: "CRITICAL: Gate 2 passed with acceptable score"; min_gate2_score: 70


- **traceabilityMapping** (Gate 3)
  - Weight: 0.25
  - Required: Yes
  - Criteria: checks: ["commits_reference_sd","design_code_mapping","database_schema_mapping"]; description: "PRD->Implementation, Design->Code, DB->Schema tracing"


- **subAgentEffectiveness** (Gate 3)
  - Weight: 0.1
  - Required: No
  - Criteria: checks: ["sub_agents_executed","substantial_recommendations"]; description: "Sub-agents executed with substantial recommendations"


- **lessonsCaptured** (Gate 3)
  - Weight: 0.05
  - Required: No
  - Criteria: checks: ["retrospective_prepared","workflow_effectiveness_noted"]; description: "Retrospective preparation and workflow notes"


- **executiveSummaryComplete** (Gate Q)
  - Weight: 0
  - Required: No
  - Criteria: min_length: 100; description: "Executive summary is complete and specific"


- **designSubAgentExecution** (Gate 1)
  - Weight: 0.138
  - Required: Yes
  - Criteria: checks: ["execution_exists","verdict_not_fail"]; description: "DESIGN sub-agent executed and analysis stored"; sub_agent_code: "DESIGN"


- **databaseSubAgentExecution** (Gate 1)
  - Weight: 0.138
  - Required: Yes
  - Criteria: checks: ["execution_exists","design_informed"]; description: "DATABASE sub-agent executed and informed by DESIGN"; sub_agent_code: "DATABASE"


- **bmadContextEngineering** (Gate 1)
  - Weight: 0.115
  - Required: Yes
  - Criteria: checks: ["implementation_context","checkpoint_plan"]; description: "User story context engineering >= 80% coverage"; min_coverage: 80


- **testingStrategyValidation** (Gate 1)
  - Weight: 0.115
  - Required: Yes
  - Criteria: description: "Testing strategy defines unit_tests and e2e_tests"; required_sections: ["unit_tests","e2e_tests"]


- **goalSummaryValidation** (Gate 1)
  - Weight: 0.092
  - Required: Yes
  - Criteria: max_length: 300; description: "Goal summary present and <= 300 chars"


- **keyDecisionsDocumented** (Gate Q)
  - Weight: 0
  - Required: No
  - Criteria: description: "Key decisions documented with rationale"; check_decision_language: true


- **knownIssuesTracked** (Gate Q)
  - Weight: 0
  - Required: No
  - Criteria: allow_none: true; description: "Known issues tracked or explicitly none"


- **actionItemsPresent** (Gate Q)
  - Weight: 0
  - Required: No
  - Criteria: min_items: 3; description: "Action items for next phase >= 3"


- **completenessReportValid** (Gate Q)
  - Weight: 0
  - Required: No
  - Criteria: description: "Completeness report has phase, score, status"; required_fields: ["phase","score","status"]


- **valueDelivered** (Gate 4)
  - Weight: 0.35
  - Required: Yes
  - Criteria: questions: ["Does this solve a real business problem?","Is this the simplest solution?","Are we building whats needed vs nice-to-have?"]; description: "Strategic value delivered: solves real business problem"


- **patternEffectiveness** (Gate 4)
  - Weight: 0.3
  - Required: Yes
  - Criteria: questions: ["Did EXEC over-engineer this?","Whats the ROI/complexity ratio?"]; description: "Pattern effectiveness: no over-engineering, good ROI"


- **executiveValidation** (Gate 4)
  - Weight: 0.25
  - Required: Yes
  - Criteria: checks: ["pr_merged","user_stories_complete","retrospective_exists"]; description: "Executive validation: PR merged, user stories complete"


- **processAdherence** (Gate 4)
  - Weight: 0.1
  - Required: No
  - Criteria: checks: ["all_gates_passed","protocol_followed"]; description: "Process adherence: all gates passed, protocol followed"


- **sdTransitionReadiness** (Gate L)
  - Weight: 0
  - Required: Yes
  - Criteria: checks: ["status_valid","not_blocked"]; description: "SD transition readiness check"


- **targetApplicationValidation** (Gate L)
  - Weight: 0
  - Required: Yes
  - Criteria: description: "Target application is valid and accessible"; valid_targets: ["EHG","EHG_Engineer"]


- **subAgentOrchestration** (Gate 3)
  - Weight: 0
  - Required: Yes
  - Criteria: description: "Sub-agent orchestration complete"; required_agents: ["DESIGN","DATABASE","TESTING"]


- **retrospectiveQualityGate** (Gate 3)
  - Weight: 0
  - Required: No
  - Criteria: description: "Retrospective quality gate - lessons captured"; min_quality_score: 70


- **planToLeadHandoffExists** (Gate 4)
  - Weight: 0
  - Required: Yes
  - Criteria: status: "accepted"; description: "PLAN-TO-LEAD handoff exists and accepted"


- **userStoriesComplete** (Gate 4)
  - Weight: 0
  - Required: Yes
  - Criteria: coverage: 100; description: "All user stories validated and complete"


- **retrospectiveExists** (Gate 4)
  - Weight: 0
  - Required: Yes
  - Criteria: required: true; description: "Retrospective exists for this SD"


- **prMergeVerification** (Gate 4)
  - Weight: 0
  - Required: Yes
  - Criteria: checks: ["pr_exists","pr_merged"]; description: "PR merged to main branch"


- **hasAcceptableComplexity** (Gate Q)
  - Weight: 0.1
  - Required: No
  - Criteria: 5 criteria defined (metrics, advisory, thresholds...)


- **sdTypeValidation** (Gate 0)
  - Weight: 1
  - Required: No
  - Criteria: category: "sd_quality"; description: "SD-LEO-001: Validate SD type matches content-based detection"; handoff_type: "LEAD-TO-PLAN"


- **documentationStandardsCompliance** (Gate 1)
  - Weight: 0.057
  - Required: No
  - Criteria: checks: ["sd_type_is_documentation","prd_has_standards_section","standards_checklist_present"]; description: "For documentation SDs, validates PRD includes documentation standards checklist"; applies_only_to: "documentation"


- **valueAuthenticitySpecGate** (Gate L)
  - Weight: 0
  - Required: Yes
  - Criteria: 6 criteria defined (sd, mode, checks...)


---

*Generated from database: 2026-08-29*
*Protocol Version: 4.4.1*
*Load when: User mentions PLAN, PRD, validation, or testing strategy*
