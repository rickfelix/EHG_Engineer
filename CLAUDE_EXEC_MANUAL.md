<!-- file_content_hash: a23ce1d311c40721 -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_EXEC_MANUAL.md — EXEC Manual (reference companion)

**Generated**: 2026-09-11 10:49:02 AM
**Protocol**: LEO 4.4.1
**Purpose**: Long-form EXEC reference — skills catalogue, human-like E2E fixtures, Playwright MCP, deliverable tracking mechanics, the EXEC-TO-PLAN gate descriptions, runtime-audit protocol, branch creation, /batch, code-quality and KR procedures, the Database Schema Constraints and LEO Process Scripts references
**Load when**: At the MOMENT OF DOING one of these procedures or looking up one of these references — not at every EXEC phase entry

> This companion carries REFERENCE AND PROCEDURE. Every RULE and PROHIBITION that governs EXEC stays in CLAUDE_EXEC.md and is in force whether or not this file is read. The negative constraints, the dual-test requirement, the acceptance-criteria verification, the branch-hygiene and multi-instance rules, the migration and atomic-INSERT patterns all stayed behind deliberately — this file exists to make that one readable, not to relieve it of anything that binds.

---

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


## 📚 Skill Integration (EXEC Phase)

## Skill Integration During EXEC

### When to Invoke Skills

During EXEC, invoke Skills for creative guidance on HOW to implement:

| Task | Invoke Skill | What It Provides |
|------|-------------|------------------|
| Creating database table | `skill: "schema-design"` | Column types, constraints, naming conventions |
| Writing RLS policy | `skill: "rls-patterns"` | Policy templates, common patterns |
| Building React component | `skill: "component-architecture"` | 300-600 LOC sizing, Shadcn patterns |
| Writing E2E test | `skill: "e2e-patterns"` | Playwright structure, user story mapping |
| Handling authentication | `skill: "auth-patterns"` | Supabase Auth patterns, session management |
| Error handling | `skill: "error-handling"` | Unified error patterns, user feedback |
| API endpoints | `skill: "rest-api-design"` | RESTful patterns, status codes |

### Skill Invocation

```
skill: "schema-design"
```

Skills provide patterns, templates, and examples. Apply them to your specific implementation.

### Skills vs Sub-Agents in EXEC

Both are valid in EXEC — use them for different purposes:

| Layer | When | Purpose | Example |
|-------|------|---------|---------|
| **Skills** | While writing code | Creative guidance — "how do I structure this?" | `skill: "component-architecture"` |
| **Sub-agents (first responders)** | On errors or domain-specific tasks | Immediate domain expertise | DB write error → `database-agent`; test failure → `rca-agent` then `testing-agent` |
| **Sub-agents (validation gates)** | Before EXEC-TO-PLAN handoff | Formal, database-backed validation | `testing-agent` for coverage, `uat-agent` for acceptance |

**Clarification**: Sub-agents ARE first responders in EXEC — invoke them immediately when you encounter a problem matching their domain (see "Phase-Specific Sub-Agent Guidance: EXEC" in this file). What belongs in PLAN_VERIFY is the *full formal validation sweep* (Gate 2 DESIGN + DATABASE fidelity, Gate 2.5 UI parity, Russian Judge quality scoring). Do not pre-run PLAN_VERIFY gates mid-implementation — but DO invoke domain sub-agents the instant you need them.

### Common Skill Chains by Task

| Implementation Task | Skill Chain (invoke in order) |
|--------------------|-------------------------------|
| New database feature | `schema-design` → `rls-patterns` → `migration-safety` |
| New UI component | `component-architecture` → `design-system` → `ui-testing` |
| New API endpoint | `rest-api-design` → `api-error-handling` → `input-validation` |
| Authentication flow | `auth-patterns` → `access-control` → `secret-management` |
| E2E test suite | `e2e-patterns` → `test-selectors` → `test-fixtures` |
| Performance work | `query-optimization` → `react-performance` → `bundle-optimization` |

### Skill Selection Guide

**Database work**:
- `schema-design` - Table structure, relationships
- `rls-patterns` - Row Level Security
- `migration-safety` - Safe migration practices
- `supabase-patterns` - Triggers, functions

**Frontend work**:
- `component-architecture` - Component sizing, structure
- `design-system` - Tailwind, styling conventions
- `ehg-frontend-design` - EHG design system specifics
- `accessibility-guide` - WCAG 2.1 AA patterns

**Testing work**:
- `e2e-patterns` - Playwright structure
- `test-selectors` - Resilient locators
- `test-fixtures` - Auth fixtures, test data
- `test-debugging` - Troubleshooting Arsenal

**Security work**:
- `auth-patterns` - Authentication flows
- `input-validation` - XSS, SQL injection prevention
- `access-control` - RBAC, route protection

### Remember

Skills are for **creative guidance** (how to build).
Sub-agents act as **first responders** on domain-specific errors AND as **formal validators** before EXEC-TO-PLAN.
Use both during EXEC — the distinction is about *purpose*, not *phase*.

## Validation Rules (SD-LEARN-008)

## PLAN-TO-EXEC Validation Gates

### GATE_PRD_EXISTS
**Purpose**: Block EXEC phase if no PRD exists for the SD

**Trigger**: PLAN-TO-EXEC handoff
**Behavior**:
- Checks product_requirements_v2 table for matching sd_id
- PRD status must be 'approved', 'ready_for_exec', or 'in_progress'
- Blocks handoff with clear remediation steps if missing

**Remediation**:
```bash
node scripts/add-prd-to-database.js <SD-ID>
# Then approve the PRD and retry handoff
```

### Schema Keyword Detection for DATABASE Sub-Agent
**Purpose**: Auto-invoke DATABASE sub-agent for SDs with schema-related content

**Trigger**: PLAN_PRD phase sub-agent orchestration
**Keywords Detected**:
- schema, migration, table, column, constraint, index
- foreign key, rls, row level security, trigger, function
- alter table, create table, drop table, database

**Behavior**:
- Scans SD title, description, scope, and rationale
- If schema keywords detected, DATABASE sub-agent is added to execution list
- Works even if SD type is not 'database'

**Example**:
```
SD Type: feature
Title: "Add user preferences table"
→ Schema keyword 'table' detected
→ DATABASE sub-agent auto-invoked
```


## 📦 Database-First Progress Tracking (MANDATORY)

### ✅ AUTOMATED TRACKING (SD-DELIVERABLES-V2-001)

**As of v2.0**, deliverable tracking is now **FULLY AUTOMATED** via database triggers and sync mechanisms. Manual updates are **no longer required** in most cases.

### How Automated Tracking Works

#### 1. Bi-Directional Sync Triggers
- **User Story → Deliverable**: When user story `validation_status` changes to `validated`, linked deliverables auto-complete
- **Deliverable → User Story**: When all linked deliverables complete, user stories update via trigger
- **Loop Prevention**: `pg_trigger_depth()` prevents infinite trigger loops

#### 2. Sub-Agent Result Triggers  
Sub-agent PASS verdicts auto-complete matching deliverables:
| Sub-Agent | Auto-Completes |
|-----------|----------------|
| TESTING   | test deliverables |
| DATABASE  | database, migration deliverables |
| DESIGN    | ui_feature deliverables |
| SECURITY  | api, integration deliverables |
| QA        | test deliverables |

#### 3. Git Sync (Optional)
Run `node scripts/sync-deliverables-from-git.js <SD-ID>` to match git commits to deliverables.

#### 4. 100% Confidence Auto-Complete
Deliverables with `confidence_score >= 100` are auto-completed by database trigger.

### When Manual Updates Are Still Needed

Manual updates only required when:
- Deliverable isn't linked to a user story
- No sub-agent verification exists
- Work completed outside normal triggers

```javascript
// Only if automated tracking missed a deliverable:
await supabase
  .from('sd_scope_deliverables')
  .update({
    completion_status: 'completed',
    completion_evidence: 'Manual: description of work',
    verified_by: 'EXEC',
    verified_at: new Date().toISOString()
  })
  .eq('sd_id', 'SD-XXX-YYY')
  .eq('deliverable_name', 'Name');
```

### Verification Functions

```sql
-- Check deliverable status before handoff
SELECT * FROM get_deliverable_verification_report('SD-XXX-YYY');

-- Enhanced progress with real-time tracking  
SELECT * FROM get_progress_breakdown_v2('SD-XXX-YYY');

-- Parent SD with child rollup
SELECT * FROM get_parent_sd_progress_with_children('SD-PARENT-001');
```

### Handoff Verification Gate

EXEC→PLAN handoffs now have **intelligent verification**:
- **100%**: PASS - all deliverables complete
- **80-99%**: PASS_WITH_WARNING - shows incomplete items
- **<80%**: BLOCKED - recorded in metadata, requires completion

### Why This Matters
- **Zero Manual Overhead**: Triggers handle tracking automatically
- **Real-Time Progress**: `get_progress_breakdown_v2()` shows incremental EXEC progress
- **Evidence-Based Completion**: All completions require evidence/commit hash
- **Verification Gate**: Prevents premature handoffs

## Component Sizing Guidelines

**Evidence from Retrospectives**: Proven pattern in SD-UAT-020 and SD-008.

### Optimal Component Size: 300-600 Lines

**Success Pattern** (SD-UAT-020):
> "Split settings into three focused components. Each ~500 lines. Easy to test and maintain."

### Sizing Rules

| Lines of Code | Action | Rationale |
|---------------|--------|-----------|
| **<200** | Consider combining | Too granular |
| **300-600** | ✅ **OPTIMAL** | Sweet spot |
| **>800** | **MUST split** | Too complex |

## TODO Comment Standard

## TODO Comment Standard (When Deferring Work)

**Evidence from Retrospectives**: Proven pattern in SD-UAT-003 saved 4-6 hours.

### Standard TODO Format

```typescript
// TODO (SD-ID): Action required
// Requires: Dependencies, prerequisites
// Estimated effort: X-Y hours
// Current state: Mock/temporary/placeholder
```

**Success Pattern** (SD-UAT-003):
> "Comprehensive TODO comments provided clear future work path. Saved 4-6 hours."

## Human-Like E2E Testing Fixtures

### Human-Like E2E Testing Enhancements (LEO v4.4)

Enhanced Playwright fixtures for human-like testing that catches "feels wrong" issues, accessibility regressions, and failure-mode gaps.

### Available Fixtures (`tests/e2e/fixtures/`)

| Fixture | Purpose | Import Pattern |
|---------|---------|----------------|
| `accessibility.ts` | axe-core WCAG 2.1 AA testing | `import { test, a11y } from './fixtures/accessibility'` |
| `keyboard-oracle.ts` | Tab order, focus traps, skip links | `import { test, keyboard } from './fixtures/keyboard-oracle'` |
| `chaos-saboteur.ts` | Network failure simulation, resilience | `import { test, chaos } from './fixtures/chaos-saboteur'` |
| `visual-oracle.ts` | CLS measurement, layout shift detection | `import { test, visual } from './fixtures/visual-oracle'` |
| `llm-ux-oracle.ts` | GPT-5.2 multi-lens UX evaluation | `import { test, uxOracle } from './fixtures/llm-ux-oracle'` |
| `stringency-resolver.ts` | Auto-determines test stringency | `import { determineStringency } from './fixtures/stringency-resolver'` |

### Stringency Levels (Auto-Determined)

| Level | Behavior | Triggers |
|-------|----------|----------|
| `strict` | Block any violation | Critical paths: /checkout, /auth, /payment |
| `standard` | Block critical/serious, warn moderate | Default for most pages |
| `relaxed` | Warn only, collect data | New features, /admin routes |

### LLM UX Evaluation Lenses (~$20/month budget)

| Lens | Evaluates |
|------|-----------|
| `first-time-user` | Is purpose clear? Are CTAs obvious? Is there guidance? |
| `accessibility` | Visual a11y beyond automated WCAG checks |
| `mobile-user` | Touch targets (44px min), thumb zones, scroll depth |
| `error-recovery` | Helpful errors, clear recovery paths |
| `cognitive-load` | Too many choices? Overwhelming forms? |

### Chaos Testing Capabilities

```typescript
// Network failure injection (30% failure rate)
await chaos.attachNetworkChaos(0.3, {
  failureTypes: ['error'],
  targetPatterns: ['**/api/**']
});

// Temporary offline simulation
await chaos.simulateOffline(2000); // 2 seconds

// Latency injection
await chaos.injectLatency('**/api/**', 500); // 500ms

// Double-submit idempotency test
const result = await chaos.testDoubleSubmit('button[type="submit"]');
assertNoDuplicateSubmit(result);

// Recovery verification
const recovery = await chaos.checkRecovery('body', 10000);
expect(recovery.recovered).toBe(true);
```

### Sample Test Files

| File | Tests |
|------|-------|
| `tests/e2e/accessibility/wcag-check.spec.ts` | WCAG 2.1 AA compliance, keyboard navigation |
| `tests/e2e/resilience/chaos-testing.spec.ts` | Network failure recovery, idempotency |
| `tests/e2e/ux-evaluation/llm-ux.spec.ts` | LLM-powered UX evaluation |

### CI Workflow

**File:** `.github/workflows/e2e-human-like.yml`

Runs all human-like tests on PR:
- Accessibility (axe-core) - ~1 min
- Keyboard navigation - ~30 sec
- Chaos/resilience - ~2 min
- LLM UX evaluation (if OPENAI_API_KEY set) - ~2 min

### Integration with Evidence Pack

All human-like test results are automatically included in the LEO evidence pack:
- `test_results.attachments.accessibility` - axe-core violations
- `test_results.attachments.chaos` - resilience test results
- `test_results.attachments.llm_ux` - LLM evaluation scores

## ✅ EXEC UI Parity Verification Checklist

**Added in LEO v4.3.3** - MANDATORY before marking implementation complete

### Pre-Completion Checklist

Before marking any backend implementation as complete, verify:

#### 1. Data Contract Mapping
```
For each field in output contract:
  ├── [ ] Field has corresponding UI component
  ├── [ ] Component displays actual value (not derived)
  └── [ ] Component handles loading/error states
```

#### 2. Stage Output Visibility
```
For stage implementations:
  ├── [ ] StageOutputViewer component exists
  ├── [ ] Key findings displayed in list format
  ├── [ ] Recommendations are actionable
  ├── [ ] Score breakdown is visible
  └── [ ] Confidence indicators shown
```

#### 3. User Accessibility
```
For all features:
  ├── [ ] User can navigate to view outputs
  ├── [ ] No hidden data (no "check logs" or "query DB")
  ├── [ ] Loading states indicate progress
  └── [ ] Error states are informative
```

### Integration with Dual Test Requirement

The existing dual test requirement (Unit + E2E) is extended:

| Test Type | Original | With UI Parity |
|-----------|----------|----------------|
| Unit | Backend logic | Backend logic |
| E2E | Feature works | Feature works AND is visible |

**E2E tests MUST now verify:**
1. Feature functionality (existing)
2. Output visibility in UI (NEW)
3. Data displayed matches backend (NEW)

### Handoff Modification

Update implementation handoff to include:
```
UI Parity Status:
- Backend Fields: X
- Fields with UI: Y
- Coverage: Y/X (Z%)
- Missing: [list]
- Gate 2.5 Status: PASS/FAIL
```

## Auto-Merge Workflow for SD Completion

### Auto-Merge Workflow (RECOMMENDED)

After creating a PR, enable auto-merge to allow Claude to continue to the next SD without waiting:

```bash
# Create PR and enable auto-merge in one step
gh pr create --title "feat(SD-XXX): title" --body "..." --base main
gh pr merge --auto --squash --delete-branch  # gh-merge-guard-exempt: --auto is unsupported by gh-merge-safe.mjs (Category D, SD-LEO-INFRA-GH-MERGE-SAFE-WIRING-001)
```

**Benefits**:
- Claude continues to next SD immediately
- Merge happens automatically when CI passes
- No manual intervention required
- Branch auto-deleted after merge

**Requirements for Auto-Merge**:
- Repository must have auto-merge enabled in GitHub settings
- All required status checks must pass
- No merge conflicts with main

**Usage Pattern**:
```bash
# After EXEC phase tests pass:
git add . && git commit -m "feat(SD-XXX): description"
git push origin feat/SD-XXX-branch
gh pr create --title "feat(SD-XXX): title" --body "## Summary..."  --base main
gh pr merge --auto --squash --delete-branch  # gh-merge-guard-exempt: --auto is unsupported by gh-merge-safe.mjs (Category D, SD-LEO-INFRA-GH-MERGE-SAFE-WIRING-001)
# Claude immediately continues to next SD
```

## /batch Command Reference

The /batch command provides unified batch operations across the SD fleet.

### Usage
```
node scripts/batch-dispatcher.mjs <operation> [--apply] [flags]
node scripts/batch-dispatcher.mjs --list
```

### Available Operations

| Operation | Description | Key Flags |
|-----------|-------------|-----------|
| accept-handoffs | Accept valid pending handoffs | --type (lead-to-plan, plan-to-exec, etc.) |
| rescore | Rescore vision scores by type | --type (manual, round1, round2) |
| complete-children | Complete children of orchestrator SD | --parent <SD-KEY> |
| update-refs | Find and update SD key references | --from <OLD-KEY> --to <NEW-KEY> |
| test-sds | Verify smoke tests across SDs | --status (completed, in_progress) |
| simplify-all | Codebase-wide simplification sweep | --path <root> |

### Common Flags
- **--apply**: Execute writes (default is dry-run preview)
- **--concurrency N**: Process N items in parallel (default: 1, serial)
- **--list**: Show all available operations

### Examples
```bash
# Preview pending handoffs
node scripts/batch-dispatcher.mjs accept-handoffs

# Accept handoffs with concurrency
node scripts/batch-dispatcher.mjs accept-handoffs --apply --concurrency 3

# Preview SD reference updates
node scripts/batch-dispatcher.mjs update-refs --from SD-OLD-001 --to SD-NEW-001

# Check smoke tests across completed SDs
node scripts/batch-dispatcher.mjs test-sds --status completed

# Preview codebase simplifications
node scripts/batch-dispatcher.mjs simplify-all
```

### Safety
- All operations default to **dry-run** (preview only)
- Use **--apply** to execute actual writes
- Write verification (read-back) validates all mutations
- All executions logged to batch_operation_log table

## E2E Testing: Dev Mode vs Preview Mode

**E2E Testing Mode**: Default to dev mode (port 5173) for reliable tests.

**Issue**: Preview mode (4173) may have rendering problems
**Solution**: Use dev mode for tests, preview only for production validation
```typescript
baseURL: 'http://localhost:5173'  // Dev mode
```

**Full Guide**: See `docs/reference/e2e-testing-mode-configuration.md`

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


## Test Coverage Quality Gate (EXEC-TO-PLAN)

**Source**: SD-LEO-ORCH-QUALITY-GATE-ENHANCEMENTS-001-B (Fixes GAP-002, GAP-004)

**Purpose**: Validates that changed code files have adequate test coverage before returning to PLAN phase for review. Reads `coverage/coverage-summary.json` and evaluates coverage for CHANGED files only (not entire codebase).

### Complexity Thresholds

| SD Type | Threshold | Mode |
|---------|-----------|------|
| feature, bugfix, security | 60% line coverage | **BLOCKING** |
| infrastructure, refactor | 40% line coverage | ADVISORY (warning only) |
| All others | 40% line coverage | ADVISORY |

### What It Checks

1. **Detects changed code files** via `git diff` (supports .js, .ts, .tsx, .jsx, .mjs, .cjs, .py, .rb, .go, .rs, .java, .cs, .php, .sql)
2. **Reads coverage data** from `coverage/coverage-summary.json`
3. **Matches changed files** to coverage entries (handles Windows/Unix path normalization)
4. **Flags zero-coverage files** (changed files with 0% coverage)
5. **Flags below-threshold files** (changed files below the type-specific threshold)

### Auto-Skip Conditions

- No code files changed in the branch
- Coverage summary file does not exist (warns to generate with `npx vitest run --coverage`)
- No changed files match coverage entries (path normalization mismatch warning)

### Remediation

When this gate fails:
1. Run `npx vitest run --coverage` to generate fresh coverage
2. Add tests for flagged zero-coverage files
3. Improve tests for files below the threshold
4. Re-run the EXEC-TO-PLAN handoff

### Implementation

- **File**: `scripts/modules/handoff/executors/exec-to-plan/gates/test-coverage-quality.js`
- **Export**: `createTestCoverageQualityGate(supabase)`
- **Gate Key**: `GATE_TEST_COVERAGE_QUALITY`

## Integration Test Requirement Gate (EXEC-TO-PLAN)

**Source**: SD-LEO-ORCH-QUALITY-GATE-ENHANCEMENTS-001-E (Fixes GAP-003)

**Purpose**: Ensures complex SDs include integration tests before returning to PLAN phase. Only applies to SDs that meet complexity criteria.

### Complexity Criteria (ANY triggers the gate)

| Criterion | Threshold |
|-----------|-----------|
| Story Points | >= 5 |
| Has Children | SD is a parent with child SDs |
| Modified Modules | >= 3 top-level directories changed |

If no complexity criteria are met, the gate auto-passes.

### Enforcement Modes

| SD Type | Story Points | Mode |
|---------|-------------|------|
| feature, refactor | >= 5 | **BLOCKING** |
| Any other type | Any | ADVISORY (warning only) |
| Any type | < 5 (no other criteria) | Auto-pass |

### What It Checks

1. **Classifies SD complexity** from story_points, child SD presence, and git diff module count
2. **Scans `tests/integration/`** directory for test files (.js, .ts, .mjs, .cjs)
3. **Counts `test(` calls** across all integration test files
4. **Requires > 10 test() calls** to be considered non-trivial

### Security

- Symlinks that escape the repository root are skipped
- Directory traversal is bounded to the repo root

### Remediation

When this gate fails:
1. Create `tests/integration/` directory if it does not exist
2. Add integration test files with meaningful test cases
3. Ensure > 10 `test()` calls across all integration files
4. Re-run the EXEC-TO-PLAN handoff

### Implementation

- **File**: `scripts/modules/handoff/executors/exec-to-plan/gates/integration-test-requirement.js`
- **Export**: `createIntegrationTestRequirementGate(supabase)`
- **Gate Key**: `GATE_INTEGRATION_TEST_REQUIREMENT`

### Cross-SD Pipeline Integration Tests

**Trigger**: SD modifies code in a multi-stage pipeline where stages have producer-consumer relationships.

**Detection**: Any SD touching files in `lib/eva/stage-templates/`, `lib/eva/stage-execution-worker.js`, or `lib/eva/lifecycle-sd-bridge.js`.

**Requirement**: Integration tests must verify the **data contract** between the modified stage and its consumers:

| Producer Stage | Target Table | Consumer Stage | What to Test |
|---------------|--------------|----------------|--------------|
| S17 doc-gen | eva_vision_documents, eva_architecture_plans | S19 bridge | Vision/arch docs exist and have expected fields |
| S19 bridge | strategic_directives_v2 | Build pipeline | Orchestrator + children created with correct parent_sd_id |
| Stage templates | venture_artifacts | Next stage | Artifact type, content schema, is_current flag |

**Why this is separate from unit tests**: Unit tests verify a function works in isolation. Cross-SD integration tests verify that the output schema of Stage N matches the input expectations of Stage N+M. The S17 doc-gen passed its unit-level validation (file existed, function exported correctly) but failed at runtime because it queried a non-existent column — a bug only visible when running against the real database schema.

## Playwright MCP Integration

## 🎭 Playwright MCP Integration

**Status**: ✅ READY (Installed 2025-10-12)

### Overview
Playwright MCP (Model Context Protocol) provides browser automation capabilities for testing, scraping, and UI verification.

### Installed Components
- **Chrome**: Google Chrome browser for MCP operations
- **Chromium**: Chromium 141.0.7390.37 (build 1194) for standard Playwright tests
- **Chromium Headless Shell**: Headless browser for CI/CD pipelines
- **System Dependencies**: All required Linux libraries installed

### Available MCP Tools

#### Navigation
- `mcp__playwright__browser_navigate` - Navigate to URL
- `mcp__playwright__browser_navigate_back` - Go back to previous page

#### Interaction
- `mcp__playwright__browser_click` - Click elements
- `mcp__playwright__browser_fill` - Fill form fields
- `mcp__playwright__browser_select` - Select dropdown options
- `mcp__playwright__browser_hover` - Hover over elements
- `mcp__playwright__browser_type` - Type text into elements

#### Verification
- `mcp__playwright__browser_snapshot` - Capture accessibility snapshot
- `mcp__playwright__browser_take_screenshot` - Take screenshots
- `mcp__playwright__browser_evaluate` - Execute JavaScript

#### Management
- `mcp__playwright__browser_close` - Close browser
- `mcp__playwright__browser_tabs` - Manage tabs

### Testing Integration

**When to Use Playwright MCP**:
1. ✅ Visual regression testing
2. ✅ UI component verification
3. ✅ Screenshot capture for evidence
4. ✅ Accessibility tree validation
5. ✅ Cross-browser testing

**When to Use Standard Playwright**:
1. ✅ E2E test suites (`npm run test:e2e`)
2. ✅ CI/CD pipeline tests
3. ✅ Automated test runs
4. ✅ User story validation

### Usage Example

```javascript
// Using Playwright MCP for visual verification
await mcp__playwright__browser_navigate({ url: 'http://localhost:3000/dashboard' });
await mcp__playwright__browser_snapshot(); // Get accessibility tree
await mcp__playwright__browser_take_screenshot({ name: 'dashboard-state' });
await mcp__playwright__browser_click({ element: 'Submit button', ref: 'e5' });
```

### QA Director Integration

The QA Engineering Director sub-agent now has access to:
- Playwright MCP for visual testing
- Standard Playwright for E2E automation
- Both Chrome (MCP) and Chromium (tests) browsers

**Complete Guide**: See `docs/reference/playwright-mcp-guide.md` *(retired — no longer in the tree)*

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


## Edge Case Testing Checklist

When implementing tests, ensure coverage for:

### Input Validation Edge Cases
- [ ] Empty strings, null values, undefined
- [ ] Maximum length inputs (overflow testing)
- [ ] Special characters (SQL injection, XSS vectors)
- [ ] Unicode and emoji inputs
- [ ] Whitespace-only inputs

### Boundary Conditions
- [ ] Zero, negative, and maximum numeric values
- [ ] Array min/max lengths (empty, single item, very large)
- [ ] Date boundaries (leap years, timezone edge cases)

### Concurrent Operations
- [ ] Race conditions (simultaneous updates)
- [ ] Database transaction rollbacks
- [ ] Cache invalidation timing

### Error Scenarios
- [ ] Network failures (timeout, disconnect)
- [ ] Database connection errors
- [ ] Invalid authentication tokens
- [ ] Permission denied scenarios

### State Transitions
- [ ] Idempotency (repeated operations)
- [ ] State rollback on error
- [ ] Partial success scenarios

## KR Progress Tracking in EXEC

After shipping implementation code, update relevant KR metrics to reflect progress.

### Post-Ship KR Update Workflow
1. **Identify linked KRs**: Check PRD metadata for `kr_linkages` or SD description for KR references
2. **Measure impact**: Determine the new `current_value` based on what was implemented
3. **Update via CLI**: `node scripts/eva/okr-command.mjs link --kr <KR-CODE> --value <new-value>`
4. **Log in retrospective**: Include KR progress in the retrospective's key_learnings

### When to Update
- **After EXEC-TO-PLAN**: When implementation is verified and ready for review
- **After LEAD-FINAL-APPROVAL**: Confirmed completion, final KR update
- **Monthly snapshots**: OKR monthly handler automatically captures progress via `okr-monthly-handler.js`

### Example
If SD implements a feature that reduces legacy references from 243 to 200:
- KR-GOV-1.1 baseline: 243, target: 0
- After ship: update current_value to 200
- Monthly snapshot captures this automatically

## Code Quality Pre-Commit Check

### Before Every Commit
Run linting on changed files before committing:
```bash
# Lint only staged files
npx eslint --no-error-on-unmatched-pattern $(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|ts|tsx|cjs|mjs)$')
```

### Before Every Push (If Pre-Push Hook Exists)
Do a dry-run lint check to avoid the hook reverting your changes:
```bash
npx eslint --no-error-on-unmatched-pattern $(git diff --name-only origin/main...HEAD | grep -E '\.(js|ts|tsx|cjs|mjs)$')
```

### Common Failures
| Symptom | Cause | Fix |
|---------|-------|-----|
| Parse error after edit | Incomplete edit left orphaned syntax | Re-read file, fix dangling brackets/braces |
| Unused import warning | Removed usage but left import | Remove the import |
| Pre-push hook rejects | Lint errors in committed files | Fix errors, commit fix, push again |

> Why: ESLint parse errors from incomplete edits are the #2 source of code quality friction. Catching them before commit prevents cascade failures at gate validation and pre-push hooks.

## PRD metadata.db_content_assertions field guide

# metadata.db_content_assertions Field Guide

When authoring a PRD for an SD that touches a central-registry table, populate
`strategic_directives_v2.metadata.db_content_assertions` so the DB_CONTENT_PARITY
gate at /leo complete can verify code-vs-DB content drift.

## Shape

```jsonc
{
  "db_content_assertions": [
    {
      "table": "venture_stages",                // must be in REGISTRY_TABLES
      "row_filter": { "stage_number": 20 },     // selects exactly one row
      "expected_columns": {
        "stage_name": "Code Quality Gate",      // literal comparison
        "description": { "regex": "^Code Quality" }  // anchored regex
      }
    }
  ]
}
```

## Allowlist (REGISTRY_TABLES)

The list of tables eligible for assertions lives in
`lib/db-content-registry-allowlist.js` — currently `['venture_stages',
'chairman_dashboard_config']`. Adding a table requires explicit chairman-approved
PR and compounds gate runtime / false-positive surface area.

## Worked examples

### Literal match (preferred)
```jsonc
{ "table": "venture_stages", "row_filter": { "stage_number": 18 },
  "expected_columns": { "stage_name": "Marketing Copy Studio" } }
```

### Anchored regex (only when literal won't fit)
```jsonc
{ "table": "venture_stages", "row_filter": { "stage_number": 21 },
  "expected_columns": { "description": { "regex": "^Configures marketing distribution" } } }
```

## Anti-ReDoS guard

- Regex patterns are capped at 500 characters.
- When `LEO_PARITY_REGEX_REQUIRE_ANCHORS=true`, unanchored patterns are rejected.
- Prefer literal matches; reach for regex only when the value is dynamic.

## What happens at /leo complete

The gate (`scripts/modules/handoff/gates/db-content-parity-gate.js`) runs after
scope-completion and before /learn. On mismatch it fails closed with a remediation
message naming `table`, `row_filter`, `expected`, and `actual`. Each run writes one
row to `sd_verification_results` (verification_type='DB_CONTENT_PARITY', column
`result` not `status`). Skip path (no assertions) returns pass:true with no DB reads.

## Worktree Freshness Pre-Check (Before Declaring Code Missing)

**Before concluding that referenced code, a function, or a sibling SD's deliverable is missing or phantom-incomplete**, verify your worktree is current against `origin/main` first:

```bash
git fetch origin main
git log origin/main --oneline -10 -- <suspected-missing-path>
```

If the merges show recent activity on the path in question, the "missing" code may simply be behind an unmerged/unpulled commit from another session — a routine staleness gap, not a real defect or an incomplete sibling SD.

> Why: In a heavily-parallel multi-session fleet, merges land every few minutes. A 9-minute-stale worktree once made another session's in-flight PR (#5783, landing the exact function an SD's rationale depended on) look like a phantom-completed sibling SD, costing real investigation time chasing a non-issue. This pre-check is cheap (one `git fetch` + `git log`) relative to the cost of a false "code is missing" conclusion driving wrong downstream decisions (SD-LEO-FIX-PAYMENT-RAIL-RETRO-001).

## EXEC Manual — carved procedure (companion)

Procedure lifted out of rule sections that stay in CLAUDE_EXEC.md (checklist templates, command sequences, enforcement-layer lists). The rules themselves bind whether or not this file is read; each carve below is headed by the section it left and that section carries a pointer here.

---

### Implementation requirements — ambiguity examples, checklist template, Gate 0 enforcement detail (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-3/FR-4 carve)

**Common Ambiguities to Watch For**:
- Vague feature descriptions ("improve UX", "make it better")
- Missing edge case handling ("what if user inputs invalid data?")
- Unclear success criteria ("should be fast", "should look good")
- Conflicting requirements between PRD sections
- Undefined behavior for error states

**Example Ambiguity Resolution**:
```
❌ BAD: Guess at implementation based on similar feature
✅ GOOD:
  - Tier 1: Re-read PRD section 3.2 → Still unclear on validation rules
  - Tier 2: Query user_stories table → Found implementation_context with validation spec
  - Resolution: "Email validation will use regex pattern from US-002 context"
```

### Implementation Checklist Template
```markdown
## EXEC Pre-Implementation Checklist
- [ ] **Ambiguity Check**: All requirements clear and unambiguous
- [ ] **Ambiguity Resolution**: [NONE FOUND | Resolved via Tier X: description]
- [ ] **Application verified**: [EHG unified frontend confirmed]
- [ ] **Feature type**: [User /src/ | Admin /src/components/admin/ | Backend API EHG_Engineer]
- [ ] **URL verified**: [exact URL from PRD]
- [ ] **Page accessible**: [YES/NO]
- [ ] **Component identified**: [path/to/component]
- [ ] **Port confirmed**: [8080 frontend | 3000 backend API]
- [ ] **Screenshot taken**: [timestamp]
- [ ] **Target location confirmed**: [where changes go]
```

**Why This Matters**: Gate 0 prevents the anti-pattern where code is shipped while SDs remain in draft status. This is the "naming illusion" - using LEO terminology while bypassing LEO workflow.

**Enforcement Layers**:
1. Pre-commit hook (blocks commits for draft SDs)
2. CLAUDE_EXEC.md (mandatory Phase 1 check)
3. LOC threshold (>500 LOC requires SD)
4. phase-preflight.js script
5. GitHub Action (PR validation)
6. Orchestrator progress calculation

See: `docs/03_protocols_and_standards/gate0-workflow-entry-enforcement.md` for complete documentation.

---

### Branch hygiene gate — originating incident, health-check script, why-this-matters (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-3/FR-4 carve)

### Branch Health Check Script

```bash
# Quick branch health check
echo "=== Branch Health Check ==="
DIVERGE_COMMIT=$(git merge-base main HEAD)
DAYS_OLD=$(( ( $(date +%s) - $(git log -1 --format=%ct $DIVERGE_COMMIT) ) / 86400 ))
COMMIT_COUNT=$(git rev-list --count main..HEAD 2>/dev/null || echo 0)
FILE_COUNT=$(git diff --name-only main...HEAD 2>/dev/null | wc -l || echo 0)

echo "Days since divergence: $DAYS_OLD"
echo "Commits on branch: $COMMIT_COUNT"
echo "Files changed: $FILE_COUNT"

if [ $DAYS_OLD -gt 7 ]; then
  echo "⚠️ WARNING: Branch is stale (>7 days). Sync with main before EXEC."
fi
if [ $FILE_COUNT -gt 100 ]; then
  echo "⚠️ WARNING: Many files changed (>100). Consider splitting work."
fi
```

---

### Multi-instance coordination — worktree commands, quick reference, incident evidence (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-3/FR-4 carve)

#### Before Starting EXEC Phase:
```bash
# 1. Create isolated worktree (NOT shared C:/Users/rickf/Projects/_EHG/ehg) -- absolute paths,
#    never `cd`, so a single unscoped directory change never has to be classifier-approved.
git -C C:/Users/rickf/Projects/_EHG/ehg worktree add C:/Users/rickf/Projects/_EHG/ehg/.worktrees/${SD_ID} -b feat/${SD_ID}-branch

# 2. Work ONLY in the worktree directory -- reference it by absolute path, never cd into it
WORKTREE=C:/Users/rickf/Projects/_EHG/ehg/.worktrees/${SD_ID}

# 3. All git operations use -C; scripts run by absolute path from the repo root
git -C "$WORKTREE" add . && git -C "$WORKTREE" commit -m "feat(${SD_ID}): description"
git -C "$WORKTREE" push origin feat/${SD_ID}-branch
```

#### After PR Merged:
```bash
# Cleanup worktree (no cd needed -- git worktree remove takes the path directly)
git -C C:/Users/rickf/Projects/_EHG/ehg worktree remove C:/Users/rickf/Projects/_EHG/ehg/.worktrees/${SD_ID}
```

### Quick Reference

```bash
# Node CLI (recommended)
node scripts/session-worktree.js --sd-key SD-STAGE-09-001 --branch feat/SD-STAGE-09-001

# List active worktrees
node scripts/session-worktree.js --list

# Check if directory is worktree
git rev-parse --is-inside-work-tree
```

### Why Worktrees?

- **Complete isolation**: Each instance has its own filesystem
- **Shared history**: All worktrees share the same .git
- **No conflicts**: Branch operations don't affect other instances
- **Built-in**: No custom tooling required

---

### Completion commit/push/merge — command sequences (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-3/FR-4 carve)

The script will:
1. Verify tests pass and UAT completed
2. Commit and push changes
3. **Prompt to merge PR to main** (or local merge if no PR)
4. Delete the feature branch

After LEAD approval, execute the following:

```bash
# 1. Ensure all changes committed
git add .
git commit -m "feat(SD-YYYY-XXX): [description]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 2. Push to remote
git push origin feature/SD-YYYY-XXX

# 3. Create PR if not exists
gh pr create --title "feat(SD-YYYY-XXX): [title]" --body "..."

# 4. Merge PR (preferred method)
node scripts/gh-merge-safe.mjs <PR#> --merge --delete-branch

# OR local merge fallback
git checkout main
git pull origin main
git merge --no-ff feature/SD-YYYY-XXX
git push origin main
git branch -d feature/SD-YYYY-XXX
git push origin --delete feature/SD-YYYY-XXX
```



## Database Schema Constraints Reference

**CRITICAL**: These constraints are enforced by the database. Agents MUST use valid values to avoid insert failures.

### leo_agents

| Column | Valid Values | Hint |
|--------|--------------|------|
| `agent_code` | LEAD, PLAN, EXEC | Use one of: LEAD, PLAN, EXEC |

### leo_handoff_executions

| Column | Valid Values | Hint |
|--------|--------------|------|
| `validation_score` | N/A | Validation score must be an integer between 0 and 100. Use Math.round() and clamp to 0-100. |
| `status` | created, validated, accepted, rejected, superseded | Use one of: created, validated, accepted, rejected, superseded |

### leo_process_scripts

| Column | Valid Values | Hint |
|--------|--------------|------|
| `argument_format` | positional, flags, mixed, none | Use one of: positional, flags, mixed, none |
| `category` | handoff, prd, generation, validation, utility, migration | Use one of: handoff, prd, generation, validation, utility, migration |

### leo_protocol_sections

| Column | Valid Values | Hint |
|--------|--------------|------|
| `context_tier` | ROUTER, CORE, PHASE_LEAD, PHASE_PLAN, PHASE_EXEC, REFERENCE | Use one of: ROUTER, CORE, PHASE_LEAD, PHASE_PLAN, PHASE_EXEC, REFERENCE |
| `priority` | CORE, STANDARD, SITUATIONAL | Use one of: CORE, STANDARD, SITUATIONAL |

### leo_protocols

| Column | Valid Values | Hint |
|--------|--------------|------|
| `status` | active, superseded, draft, deprecated | Use one of: active, superseded, draft, deprecated |

### leo_schema_constraints

| Column | Valid Values | Hint |
|--------|--------------|------|
| `constraint_type` | check, enum, foreign_key, not_null, unique | Use one of: check, enum, foreign_key, not_null, unique |

### leo_sub_agents

| Column | Valid Values | Hint |
|--------|--------------|------|
| `tool_policy_profile` | full, coding, readonly, minimal | Use one of: full, coding, readonly, minimal |
| `thinking_effort` | low, medium, high | Use one of: low, medium, high |
| `activation_type` | automatic, manual | Use one of: automatic, manual |
| `model_tier` | haiku, sonnet, opus | Use one of: haiku, sonnet, opus |
| `team_role` | leader, teammate | Use one of: leader, teammate |

### leo_validation_rules

| Column | Valid Values | Hint |
|--------|--------------|------|
| `gate` | L, 0, 1, Q, 2A, 2B, 2C, 2D, 3, 4 | Use one of: L, 0, 1, Q, 2A, 2B, 2C, 2D, 3, 4 |

### product_requirements_v2

| Column | Valid Values | Hint |
|--------|--------------|------|
| `status` | draft, planning, in_progress, testing, verification, approved, completed, archived, rejected, on_hold, cancelled | Use one of: draft, planning, in_progress, testing, verification, approved, completed, archived, rejected, on_hold, cancelled |
| `reasoning_depth` | quick, standard, deep, ultra | Use one of: quick, standard, deep, ultra |
| `document_type` | prd, refactor_brief, architecture_decision_record | Use one of: prd, refactor_brief, architecture_decision_record |

### retrospectives

| Column | Valid Values | Hint |
|--------|--------------|------|
| `learning_category` | APPLICATION_ISSUE, PROCESS_IMPROVEMENT, TESTING_STRATEGY, DATABASE_SCHEMA, DEPLOYMENT_ISSUE, PERFORMANCE_OPTIMIZATION, USER_EXPERIENCE, SECURITY_VULNERABILITY, DOCUMENTATION | Use one of: APPLICATION_ISSUE, PROCESS_IMPROVEMENT, TESTING_STRATEGY, DATABASE_SCHEMA, DEPLOYMENT_ISSUE, PERFORMANCE_OPTIMIZATION, USER_EXPERIENCE, SECURITY_VULNERABILITY, DOCUMENTATION |
| `action_items` | array | Use one of: array |
| `test_verdict` | PASS, FAIL, PARTIAL, ERROR | Use one of: PASS, FAIL, PARTIAL, ERROR |
| `protocol_improvements` | array | Use one of: array |
| `retrospective_type` | LEAD_TO_PLAN, PLAN_TO_EXEC, EXEC_TO_PLAN, SD_COMPLETION | Use one of: LEAD_TO_PLAN, PLAN_TO_EXEC, EXEC_TO_PLAN, SD_COMPLETION |
| `test_evidence_freshness` | FRESH, AGING, STALE | Use one of: FRESH, AGING, STALE |
| `retro_type` | SPRINT, SD_COMPLETION, INCIDENT, MILESTONE, WEEKLY, MONTHLY, ARCHITECTURE_DECISION, RELEASE, AUDIT, HANDOFF | Use one of: SPRINT, SD_COMPLETION, INCIDENT, MILESTONE, WEEKLY, MONTHLY, ARCHITECTURE_DECISION, RELEASE, AUDIT, HANDOFF |
| `status` | DRAFT, PUBLISHED, ARCHIVED | Use one of: DRAFT, PUBLISHED, ARCHIVED |
| `key_learnings` | array | Use one of: array |
| `generated_by` | MANUAL, SUB_AGENT, TRIGGER, SCHEDULED | Use one of: MANUAL, SUB_AGENT, TRIGGER, SCHEDULED |
| `what_went_well` | array | Use one of: array |
| `what_needs_improvement` | array | Use one of: array |

### sd_backlog_map

| Column | Valid Values | Hint |
|--------|--------------|------|
| `item_type` | epic, story, task | Use one of: epic, story, task |
| `verification_status` | not_run, failing, passing | Use one of: not_run, failing, passing |

### sd_phase_handoffs

| Column | Valid Values | Hint |
|--------|--------------|------|
| `from_phase` | LEAD, PLAN, EXEC, PLAN_PRD, PLAN_VERIFICATION, EXEC_COMPLETE, LEAD_APPROVAL, LEAD_COMPLETE, LEAD_FINAL, LEAD_FINAL_APPROVAL, COMPLETED, CANCELLED | Use one of: LEAD, PLAN, EXEC, PLAN_PRD, PLAN_VERIFICATION, EXEC_COMPLETE, LEAD_APPROVAL, LEAD_COMPLETE, LEAD_FINAL, LEAD_FINAL_APPROVAL, COMPLETED, CANCELLED |
| `validation_score` | N/A | Use one of: blocked |
| `to_phase` | LEAD, PLAN, EXEC, PLAN_PRD, PLAN_VERIFICATION, EXEC_COMPLETE, LEAD_APPROVAL, LEAD_COMPLETE, LEAD_FINAL, LEAD_FINAL_APPROVAL, COMPLETED, CANCELLED | Use one of: LEAD, PLAN, EXEC, PLAN_PRD, PLAN_VERIFICATION, EXEC_COMPLETE, LEAD_APPROVAL, LEAD_COMPLETE, LEAD_FINAL, LEAD_FINAL_APPROVAL, COMPLETED, CANCELLED |
| `status` | pending_acceptance, accepted, rejected, blocked | Use one of: pending_acceptance, accepted, rejected, blocked |
| `handoff_type` | LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD, LEAD-FINAL-APPROVAL, BYPASS-COMPLETION | Use one of: LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD, LEAD-FINAL-APPROVAL, BYPASS-COMPLETION |

### sd_scope_deliverables

| Column | Valid Values | Hint |
|--------|--------------|------|
| `completion_status` | pending, in_progress, completed, blocked, cancelled | Use one of: pending, in_progress, completed, blocked, cancelled |

### strategic_directives_v2

| Column | Valid Values | Hint |
|--------|--------------|------|
| `intensity_level` | cosmetic, structural, architectural | Use one of: cosmetic, structural, architectural |
| `metadata` | do_not_advance_without_trigger, trigger_condition | Use one of: do_not_advance_without_trigger, trigger_condition |
| `key_changes` | array | Use one of: array |
| `sd_type` | feature, bugfix, database, infrastructure, security, refactor, documentation, orchestrator, performance, enhancement, docs, discovery_spike, implementation, ux_debt, uat | Use one of: feature, bugfix, database, infrastructure, security, refactor, documentation, orchestrator, performance, enhancement, docs, discovery_spike, implementation, ux_debt, uat |
| `relationship_type` | standalone, parent, child | Use one of: standalone, parent, child |
| `human_verification_status` | not_required, pending, in_progress, passed, failed | Use one of: not_required, pending, in_progress, passed, failed |
| `priority` | critical, high, medium, low | Use one of: critical, high, medium, low |
| `status` | draft, active, in_progress, planning, review, pending_approval, completed, deferred, cancelled | Use one of: draft, active, in_progress, planning, review, pending_approval, completed, deferred, cancelled |
| `complexity_level` | simple, moderate, complex, critical | Use one of: simple, moderate, complex, critical |
| `key_principles` | array | Use one of: array |
| `vision_score_action` | accept, minor_sd, gap_closure_sd, escalate | Use one of: accept, minor_sd, gap_closure_sd, escalate |
| `rolled_triage` | High, Medium, Low, Future | Use one of: High, Medium, Low, Future |
| `success_criteria` | array | Use one of: array |
| `success_metrics` | array | Use one of: array |
| `lineage_verdict` | BACKFILLED_HIGH, BACKFILLED_LOW_CONFIDENCE, GRANDFATHERED_NO_VALIDATION | Use one of: BACKFILLED_HIGH, BACKFILLED_LOW_CONFIDENCE, GRANDFATHERED_NO_VALIDATION |
| `current_phase` | LEAD, LEAD_APPROVAL, LEAD_COMPLETE, LEAD_FINAL, LEAD_FINAL_APPROVAL, PLAN_PRD, PLAN_VERIFICATION, EXEC, EXEC_COMPLETE, COMPLETED, CANCELLED | Use one of: LEAD, LEAD_APPROVAL, LEAD_COMPLETE, LEAD_FINAL, LEAD_FINAL_APPROVAL, PLAN_PRD, PLAN_VERIFICATION, EXEC, EXEC_COMPLETE, COMPLETED, CANCELLED |

### sub_agent_execution_results

| Column | Valid Values | Hint |
|--------|--------------|------|
| `warnings` | array | Use one of: array |
| `justification` | CONDITIONAL_PASS | Use one of: CONDITIONAL_PASS |
| `status` | pending, running, completed, failed, skipped | Use one of: pending, running, completed, failed, skipped |
| `critical_issues` | array | Use one of: array |
| `verdict` | PASS, FAIL, BLOCKED, CONDITIONAL_PASS, WARNING, MANUAL_REQUIRED, PENDING, ERROR | Use one of: PASS, FAIL, BLOCKED, CONDITIONAL_PASS, WARNING, MANUAL_REQUIRED, PENDING, ERROR |
| `conditions` | CONDITIONAL_PASS | Use one of: CONDITIONAL_PASS |
| `validation_mode` | prospective, retrospective | Use one of: prospective, retrospective |
| `recommendations` | array | Use one of: array |

### user_stories

| Column | Valid Values | Hint |
|--------|--------------|------|
| `e2e_test_status` | not_created, created, passing, failing, skipped | Use one of: not_created, created, passing, failing, skipped |
| `story_key` | ^[A-Z0-9-]+:US-[0-9]{3,}$ | Use one of: ^[A-Z0-9-]+:US-[0-9]{3,}$ |
| `priority` | critical, high, medium, low, minimal | Use one of: critical, high, medium, low, minimal |
| `implementation_context` | ::text) AND (implementation_context <>  | Use one of: ::text) AND (implementation_context <>  |
| `validation_status` | pending, in_progress, validated, failed, skipped | Use one of: pending, in_progress, validated, failed, skipped |
| `status` | draft, ready, in_progress, testing, completed, blocked | Use one of: draft, ready, in_progress, testing, completed, blocked |



## LEO Process Scripts Reference

**Usage**: All scripts use positional arguments unless noted otherwise.

### Generation Scripts

#### generate-claude-md-from-db.js
Generates modular CLAUDE files (CLAUDE.md, CLAUDE_CORE.md, CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md) from database tables.

**Usage**: `node scripts/generate-claude-md-from-db.js`

**Examples**:
- `node scripts/generate-claude-md-from-db.js`

**Common Errors**:
- Pattern: `No active protocol found` -> Fix: Ensure one protocol has status=active in leo_protocols table

### Handoff Scripts

#### handoff.js
Unified LEO Protocol handoff execution system. Handles all handoff types with database-driven templates and validation.

**Usage**: `node scripts/handoff.js <command> [TYPE] [SD-ID] [PRD-ID]`

**Examples**:
- `node scripts/handoff.js execute LEAD-TO-PLAN SD-IDEATION-STAGE1-001`
- `node scripts/handoff.js execute PLAN-TO-EXEC SD-IDEATION-STAGE1-001 PRD-IDEATION-001`
- `node scripts/handoff.js list SD-IDEATION-STAGE1-001`
- `node scripts/handoff.js stats`

**Common Errors**:
- Pattern: `--type.*not recognized` -> Fix: Use positional: execute TYPE SD-ID, not --type TYPE
- Pattern: `Strategic Directive.*not found` -> Fix: Create SD first using LEO Protocol dashboard or create-strategic-directive.js

### Migration Scripts

#### run-sql-migration.js
Executes SQL migration files against the database. Handles statement splitting and error reporting.

**Usage**: `node scripts/run-sql-migration.js <migration-file-path>`

**Examples**:
- `node scripts/run-sql-migration.js database/migrations/20251127_leo_v432.sql`

**Common Errors**:
- Pattern: `relation .* does not exist` -> Fix: Check table names and run migrations in order

### Prd Scripts

#### add-prd-to-database.js
Adds a Product Requirements Document to the database with proper schema validation.

**Usage**: `node scripts/add-prd-to-database.js --sd-id <SD-ID> --title <title> [options]`

**Examples**:
- `node scripts/add-prd-to-database.js --sd-id SD-IDEATION-STAGE1-001 --title "Stage 1 Implementation"`

### Validation Scripts

#### check-leo-version.js
Verifies version consistency between CLAUDE*.md files and database. Use --fix to auto-regenerate.

**Usage**: `node scripts/check-leo-version.js [--fix]`

**Examples**:
- `node scripts/check-leo-version.js`
- `node scripts/check-leo-version.js --fix`

**Common Errors**:
- Pattern: `No active protocol found` -> Fix: Ensure leo_protocols has exactly one active record

---

*Generated from database: 2026-09-11*
*Protocol Version: 4.4.1*
*Source of truth: leo_protocol_sections (section_type=workflow, exec_skill_integration, exec_requirement, exec_component_sizing_guidelines, exec_todo_comment_standard, auto_merge_workflow, exec_ui_parity_verification, exec_edge_case_testing_checklist, testing_tools, e2e_testing_mode_configuration, human_like_testing, test_coverage_quality_gate, integration_test_requirement_gate, governance_kr_progress_exec, code_quality_pre_commit, worktree_freshness_precheck, exec_manual_reference, exec_manual). Do not hand-edit — edit the DB section and regenerate.*
