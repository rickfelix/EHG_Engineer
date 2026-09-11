<!-- file_content_hash: 6c53e04d9ef09b5f -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_EXEC.md - EXEC Phase Operations

**Generated**: 2026-09-11 10:49:02 AM
**Protocol**: LEO 4.4.1
**Purpose**: EXEC agent implementation requirements and testing
**Effort**: xhigh (implementation + testing require maximum reasoning for agentic coding per Opus 4.8 guidance)

> For Issue Resolution Protocol + Five-Point Brief, see CLAUDE.md.
> For migration execution and phase transitions, see CLAUDE_CORE.md.
> For long-form reference (skills catalogue, E2E fixtures, Playwright MCP, gate descriptions, runtime-audit protocol, deliverable tracking, /batch, the Database Schema Constraints and LEO Process Scripts references), see CLAUDE_EXEC_MANUAL.md; retrospective evidence and rationale behind the rules live in CLAUDE_EXEC_PROVENANCE.md. Every rule here binds whether or not either companion is read.
> **Companion-first encode convention** (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-5): new content for this phase is encoded as the RULE plus a one-line pointer here, with its procedure written into CLAUDE_EXEC_MANUAL.md and its evidence/rationale into CLAUDE_EXEC_PROVENANCE.md by default — the gated file carries what binds, the companions carry the how and the why.

---

## Autonomous Continuation Directives

**CRITICAL**: These directives guide autonomous agent behavior during EXEC phase execution.

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


## Friction signaling

**Send `/signal <type> "<body>"`** for recurrence (gate 2× / RCA 2× / tool 3× / phase >2× type-bucket median), about-to-bypass (`--no-verify` / 3rd-bypass-quota / mock-not-fix), protocol-spec friction, recognized harness bug, or memory-trend match. Types: stuck | need-sweep | prd-ambiguous | gate-bug | spec-conflict | harness-bug | feedback | other. Source-of-truth: CLAUDE_CORE.md "Signaling friction to the coordinator" / SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-3a.

**Questions or decisions → relay to the coordinator.** If you have any questions or decisions needed, relay those to the coordinator — do not block on a human or decide unilaterally. The coordinator resolves what it can and escalates anything beyond its authority upward.

## 🚨 EXEC Agent Implementation Requirements

### MANDATORY Pre-Implementation Verification

_(procedure: MANUAL § Implementation requirements — ambiguity examples, checklist template, Gate 0 enforcement detail)_
Before writing ANY code, EXEC MUST:

0. **AMBIGUITY RESOLUTION** 🔍 CRITICAL FIRST STEP
   > Why: Ambiguous requirements produce code that solves the wrong problem. Discovering misalignment at EXEC-TO-PLAN costs far more to unwind than a 5-minute clarification upfront.
   - Review PRD for unclear requirements, missing details, or conflicting specifications
   - Do NOT proceed with implementation if ANY ambiguity exists
   - Use 3-tier escalation to resolve:
     1. **Re-read PRD**: Check acceptance_criteria, functional_requirements, test_scenarios
     2. **Query database context**: Check user stories, implementation_context, SD strategic_objectives
     3. **Ask user**: Use AskUserQuestion tool with specific, focused questions
   - Document resolution: "Ambiguity in [area] resolved via [method]: [resolution]"
   - **If still unclear after escalation**: BLOCK implementation and await user clarification

(Common ambiguities to watch for and a worked resolution example: MANUAL.)

0.5. **PRD INTEGRATION SECTION CHECK** 📋 CRITICAL
   > Why: This section defines who consumes the feature, what breaks if it fails, and what observability to wire in. Skipping it produces features that work in isolation but break downstream consumers or ship without rollback paths.
   - Read PRD `integration_operationalization` section BEFORE coding
   - Extract and document:
     - **Consumers**: Who/what uses this feature? What breaks if it fails?
     - **Dependencies**: Upstream systems to call, downstream systems that call us
     - **Failure modes**: How to handle when each dependency fails (error handling)
     - **Data contracts**: Schema changes, API shapes to implement
     - **Runtime config**: Env vars to add, feature flags to configure
     - **Observability**: Metrics to track, rollout/rollback plan
   - If section is missing: Flag to PLAN for remediation before EXEC proceeds
   - Document: "Integration context reviewed: [X consumers, Y dependencies, Z metrics]"

1. **APPLICATION CHECK** ⚠️ CRITICAL
   > Why: `EHG_Engineer` is the backend API repo. Committing UI to it means CI runs in the wrong repo, changes never reach the frontend build pipeline, and the feature is invisible to users despite appearing "done."
   - **ALL UI changes** (user AND admin) go to `C:/Users/rickf/Projects/_EHG/ehg/`
   - **User features**: `C:/Users/rickf/Projects/_EHG/ehg/src/components/` and `/src/pages/`
   - **Admin features**: `C:/Users/rickf/Projects/_EHG/ehg/src/components/admin/` and `/src/pages/admin/`
   - **Stage components**: `C:/Users/rickf/Projects/_EHG/ehg/src/components/stages/admin/`
   - **Backend API only**: `C:/Users/rickf/Projects/_EHG/EHG_Engineer/` (routes, scripts, no UI)
   - Verify: `cd C:/Users/rickf/Projects/_EHG/ehg && pwd`
   - Check GitHub: `git remote -v` should show `rickfelix/ehg.git` for frontend

2. **URL Verification** ✅
   - Navigate to the EXACT URL specified in the PRD
   - Confirm the page loads and is accessible
   - Take a screenshot for evidence
   - Document: "Verified: [URL] is accessible"

3. **Component Identification** 🎯
   - Identify the exact file path of the target component
   - Confirm component exists at specified location
   - Document: "Target component: [full/path/to/component.tsx]"

4. **Application Context** 📁
   - Verify correct application directory
   - Confirm port number matches PRD (8080 for frontend, 3000 for backend API)
   - Document: "Application: [/path/to/app] on port [XXXX]"

5. **Visual Confirmation** 📸
   - Screenshot current state BEFORE changes
   - Identify exact location for new features
   - Document: "Current state captured, changes will go at [location]"

### Implementation Checklist Template

The checklist template lives in MANUAL; complete every line of it before writing code.

### Testability-Aware Implementation
> Why: Code that mixes logic and side effects forces the testing-agent to mock everything, producing brittle tests. Testable architecture — pure functions, injectable dependencies, clear seams — lets the testing-agent write unit tests that actually catch regressions.

Before writing code, review the PRD's `test_scenarios` and `testing_strategy` and design your implementation to be testable:

1. **Separate pure logic from side effects** — Extract business rules into pure functions that can be unit tested without mocking infrastructure
2. **Export key functions independently** — Pipeline stages, validators, and transforms should be importable/callable outside their runtime context
3. **Use injectable dependencies** — Database clients, API callers, and config should be parameters, not hardcoded imports, for functions that will need testing
4. **Design clear seams** — When building multi-step workflows, each step should be independently testable with well-defined inputs/outputs
5. **Uniformity audit (verify before EXEC-TO-PLAN)** — if you applied a client-injectable/testability pattern to some of the N functions this SD adds or modifies, enumerate all N and confirm the pattern is applied to EVERY one — especially the SD's own headline/CRITICAL-priority fix. Ask "which functions did NOT get the pattern?" and justify each exception explicitly. Partial application is how a core fix ships untested: in one SD, 3 of 4 new functions followed the pattern and the unpatterned 4th was the headline dedup gate.

Ask yourself: "If the testing-agent had to write tests for this, would the architecture make that easy or painful?"

Skip for: documentation SDs, config-only changes, trivial fixes (<15 LOC)

### Common Mistakes to AVOID
- ❌ Assuming component location based on naming similarity
- ❌ Implementing without navigating to the URL first
- ❌ Ignoring port numbers in URLs
- ❌ Pattern matching without verification
- ❌ Starting to code before completing checklist
- ❌ Not restarting dev servers after changes
- ❌ **CRITICAL**: Creating files for PRDs, handoffs, or documentation
- ❌ **CRITICAL**: Proceeding with implementation when requirements are ambiguous
- ❌ **CRITICAL**: Putting admin UI code in EHG_Engineer (all UI goes to EHG)

### Gate 0 Enforcement 🚨

**CRITICAL**: Before ANY implementation work, verify SD has passed LEAD approval:

```bash
# Check SD phase status
node scripts/phase-preflight.js SD-XXX-001

# Or check via sd:status
npm run sd:status SD-XXX-001
```

**Valid Phases for Implementation**:
- PLANNING, PLAN_PRD, PLAN, PLAN_VERIFICATION (PRD creation)
- EXEC (implementation authorized)

**Blocked Phases**:
- draft - SD not approved
- LEAD_APPROVAL - Awaiting LEAD approval

Enforcement layers, the naming-illusion rationale and the full documentation pointer: MANUAL.

**If SD is in draft**: STOP. Do not implement. Run LEAD-TO-PLAN handoff first.


## ❌ Anti-Patterns from Retrospectives (EXEC Phase)

**Source**: Analysis of 175 high-quality retrospectives (score ≥60) (provenance: PROVENANCE § Retrospective anti-patterns — evidence quotes)

These patterns have caused significant time waste. **AVOID them.**

### 1. Manual Test Creation (2-3 hours waste per SD)
**Pattern**: Writing tests manually instead of delegating to testing-agent

**Fix**: Always use Task tool with `subagent_type: "testing-agent"`
```
Task(subagent_type="testing-agent", prompt="Create E2E tests for [feature] based on PRD acceptance criteria")
```

---

### 2. Skipping Knowledge Retrieval (4-6 hours rework)
**Pattern**: Starting implementation without querying retrospectives/patterns

**Fix**: Run before EXEC starts:
```bash
node scripts/automated-knowledge-retrieval.js <SD-ID>
```
If `research_confidence_score = 0.00`, you skipped this step.

---

### 3. Workarounds Before Root Cause (2-3x time multiplier)
**Pattern**: Working around issues instead of fixing root causes

**Fix**: Before implementing a workaround, ask:
- [ ] Have I identified the root cause?
- [ ] Is this a fix or a workaround?
- [ ] What is the time multiplier? (typical: 2-3x)

---

### 4. Accepting Environmental Blockers Without Debug
**Pattern**: Accepting "it's environmental" without investigation

**Fix**: 5-step minimum debug before accepting as environmental:
1. Check logs for specific error
2. Verify credentials/tokens
3. Test in isolation (curl, manual browser)
4. Check network/ports
5. Compare with known working state

---

### 5. Manual Sub-Agent Simulation (15% quality delta)
**Pattern**: Manually creating sub-agent results instead of executing tools

**Fix**: Sub-agent results MUST have:
- `tool_executed: true`
- Actual execution timestamp
- Real output (not simulated)

---


### 6. Reinventing Existing Deletion Primitives (repeats a fixed hazard class)
**Pattern**: Writing new worktree-adjacent file-deletion logic without first checking for an existing primitive

**Fix**: Before writing ANY worktree-adjacent file-deletion code, grep for the existing chokepoint first:
```bash
grep -rn "rmSync\|junction\|safeRecursiveRm" lib/worktree-manager.js
```
Route the delete through `safeRecursiveRm` (lib/worktree-manager.js) rather than a fresh `fs.rmSync`/raw recursive delete -- it is the one place this repo's junction-safe deletion policy is maintained, and a second unreviewed implementation is a second unreviewed policy.

### Quick Reference

| Anti-Pattern | Time Cost | Fix |
|--------------|-----------|-----|
| Manual test creation | 2-3 hours | Use testing-agent |
| Skip knowledge retrieval | 4-6 hours | Run automated-knowledge-retrieval.js |
| Workarounds first | 2-3x multiplier | Fix root cause |
| Accept environmental | Hours of idle | 5-step debug minimum |
| Simulate sub-agents | 15% quality loss | Execute actual tools |
| Reinvent deletion primitive | Repeat of a fixed hazard class | grep for safeRecursiveRm first |

**Pattern References**: PAT-RECURSION-001 through PAT-RECURSION-005

## Vision/Architecture Doc Pre-Check

## Vision/Architecture Doc Pre-Check (Step 0.25)

**Before implementing ANY SD**, verify vision and architecture coverage:
> Why: Implementation without vision/architecture governance creates features that work in isolation but contradict strategic intent. Discovering misalignment after EXEC is complete forces expensive rework. The pre-check takes 2 minutes; the rework takes 2+ sessions.

1. **Query EVA**: `SELECT key, title FROM eva_vision_documents WHERE status = 'active' AND key ILIKE '%' || <domain> || '%'`
2. **Query Architecture**: `SELECT key, title FROM eva_architecture_plans WHERE vision_key = <vision_key> AND needs_review_since IS NULL`

### Decision Matrix
| Vision Doc | Arch Plan | Action |
|-----------|-----------|--------|
| Exists, current | Exists, current | Proceed — implementation is governed |
| Exists, current | Missing or stale | Flag to PLAN — create/update arch plan first |
| Missing | — | Check if SD is tactical (bugfix/QF) — OK to proceed. If strategic (feature/infrastructure), flag for brainstorm |

### Skip Conditions
- `sd_type` is `bugfix` or `documentation` — skip this check
- SD has `--from-uat` or `--from-feedback` provenance — skip (corrective work)
- Parent orchestrator already passed this check — skip for children

> Note: `bugfix` is the canonical sd_type value; the SDKeyGenerator maps user-facing `fix` → `bugfix` automatically (see CLAUDE_LEAD.md "SDKeyGenerator Errors").

## EXEC Phase Negative Constraints

## 🚫 EXEC Phase Negative Constraints

<negative_constraints phase="EXEC">
These anti-patterns are specific to the EXEC phase. Violating them leads to failed tests and rejected handoffs.

### NC-EXEC-001: No Scope Creep
**Anti-Pattern**: Implementing features not in PRD, "improving" unrelated code, adding "nice to have" features
**Why Wrong**: Scope creep derails timelines, introduces untested changes, confuses review
**Correct Approach**: Implement ONLY what's in the PRD. Create new SD for additional work.

### NC-EXEC-002: No Wrong Application Directory
**Anti-Pattern**: Working in EHG_Engineer when target is ehg app (or vice versa)
**Why Wrong**: Changes applied to wrong codebase, tests fail in CI, deployment issues
**Correct Approach**: Verify pwd matches PRD target_application before ANY changes

### NC-EXEC-003: No Tests Without Execution
**Anti-Pattern**: Claiming "tests exist" without actually running them
**Why Wrong**: 30-minute gaps between "complete" and discovering failures (SD-EXPORT-001)
**Correct Approach**: Run BOTH npm run test:unit AND npm run test:e2e, document results

### NC-EXEC-004: No Manual Sub-Agent Simulation
**Anti-Pattern**: Manually creating sub-agent results instead of executing actual tools
**Why Wrong**: 15% quality delta between manual (75%) and tool-executed (60%) confidence
**Correct Approach**: Sub-agent results must have tool_executed: true with real output

### NC-EXEC-005: No UI Without Visibility
**Anti-Pattern**: Backend implementation without corresponding UI to display results
**Why Wrong**: LEO v4.3.3 UI Parity Gate blocks features users can't see
**Correct Approach**: Every backend field must have corresponding UI component


### NC-EXEC-006: No Bare Import/Require of a scripts/one-off/** File
**Anti-Pattern**: Running `node -e "import('./scripts/one-off/some-script.mjs')"` (or `require(...)`, or an ESM/CJS interop check) against a scripts/one-off/** file to inspect it, check its exports, or verify module-format compatibility
**Why Wrong**: Incident 2026-08-21 — a sub-agent's bare `import()` of scripts/one-off/backfill-solomon-ledger-decision-by.mjs, intended only as an ESM/CJS interop check, executed the file's top-level, unguarded DB mutation for real: a live 1,241-row prod `decision_by` overwrite. Many scripts/one-off/** files hold SUPABASE_SERVICE_ROLE_KEY and mutate the DB unconditionally at import time with no `if (import.meta.url === ...)` main-guard — importing IS executing.
**Correct Approach**: Never import or require a scripts/one-off/** file to inspect it. To check exports/format, read the file's source directly (Read tool / `cat`) or run it `node scripts/one-off/foo.mjs` (direct execution, not a bare import, is the file's normal invocation and is unaffected). ENF-18 (`scripts/hooks/pre-tool-enforce.cjs`, SD-LEO-FIX-TEST-FIXTURE-LANE-001) blocks a bare import/require of any file the committed manifest (`scripts/lint/one-off-mutate-key-manifest.json`) marks dangerous (mutates + holds the service-role key + unguarded); a genuine, reviewed need to import one anyway requires `LEO_ALLOW_ONE_OFF_IMPORT="<ticket>: <reason>"`, never a workaround.

</negative_constraints>

## Phase-Specific Sub-Agent Guidance: EXEC

During the EXEC phase, use sub-agents proactively for implementation quality and safety:

- **database-agent**: For executing migrations, schema changes, and RLS policy deployment
- **testing-agent**: For test creation, coverage analysis, and test infrastructure
- **security-agent**: For security review of implementations before merge
- **github-agent**: For PR creation, CI/CD operations, and code review coordination
- **regression-agent**: For refactoring safety validation and backward compatibility checks
- **performance-agent**: For performance optimization, profiling, and bottleneck detection
- **rca-agent**: For debugging implementation issues and failure analysis
- **uat-agent**: For user acceptance test execution before handoff

### When to Invoke
- **On ANY database WRITE error**: Immediately invoke database-agent (do not attempt workarounds).
> Why: Write errors on Supabase have specific failure modes — RLS violations, constraint failures, pooler routing issues — that require database-agent patterns. Attempting workarounds here typically corrupts partial state, making the actual fix harder than the original error. For read errors, check MCP tool configuration first.
- **Before PR creation**: Run testing-agent for coverage, security-agent for review
- **During refactoring**: Run regression-agent to validate backward compatibility
- **On test failures**: Run rca-agent for root cause analysis, then testing-agent
- **Before EXEC-TO-PLAN handoff**: Run uat-agent for acceptance validation

### Important
Sub-agents are FIRST RESPONDERS in EXEC phase. When you encounter a problem that matches an agent's domain, invoke the agent IMMEDIATELY rather than attempting manual solutions.
> Why: Manual attempts before invoking the right agent waste context and produce lower-quality output. Retrospective data (PAT-RECURSION-005) shows manual sub-agent simulation consistently leads to rework — the agent has domain-specific tooling the orchestrator cannot replicate inline.


### Concurrent Invocation Mandate (SD-MAN-ORCH-LEO-HARNESS-EFFICIENCY-001-C)
Required sub-agents for a handoff MUST be invoked CONCURRENTLY — one message containing multiple Task tool calls — unless a documented data dependency exists between agents (state the dependency in the invocation message when sequencing is genuinely required).
> Why: The required agents are independent evidence WRITERS — each inserts its own sub_agent_execution_results row (no shared upsert, no ordering requirement in any gate). Serial invocation is pure wall-clock waste: live 5-day measurement found only 3% of multi-agent evidence groups were collected in parallel, while 33% spread over 2+ minutes, across ~200 handoffs/day fleet-wide.
Script-path equivalent: `npm run subagents:collect -- --sd <SD-KEY> --phase <HANDOFF>` launches all required agents for the handoff in parallel and waits for all evidence rows (one command replaces N serial invocations).
*Added: SD-LEO-INFRA-SUB-AGENT-ROUTING-001-B*

## Migration Script Pattern (MANDATORY)

**Issue Pattern**: PAT-DB-MIGRATION-001

When writing migration scripts, you MUST use the established pattern:

### Correct Pattern
```javascript
import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';
import { readFileSync } from 'fs';

const migrationSQL = readFileSync('path/to/migration.sql', 'utf-8');
const client = await createDatabaseClient('engineer', { verify: true });
const statements = splitPostgreSQLStatements(migrationSQL);

for (const statement of statements) {
  await client.query(statement);
}

await client.end();
```

### NEVER Use This Pattern
```javascript
// WRONG - exec_sql RPC does not exist
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(url, key);
await supabase.rpc('exec_sql', { sql_query: sql }); // FAILS
```

### Before Writing Migration Scripts
1. Search for existing patterns: `Glob *migration*.js`
2. Read `scripts/run-sql-migration.js` as canonical template
3. Use `lib/supabase-connection.js` utilities

## Multi-Instance Coordination (MANDATORY)

## 🔀 Multi-Instance Coordination (MANDATORY)

**Root Cause**: Multiple Claude Code instances operating in the same git working directory causes branch conflicts, stash collisions, and interrupted operations. (provenance: PROVENANCE § Multi-instance coordination — worktree commands, quick reference, incident evidence) (procedure: MANUAL § Multi-instance coordination — worktree commands, quick reference, incident evidence)

### MANDATORY: Git Worktrees for Parallel SD Work

When multiple Claude Code instances may run concurrently on different SDs:

Worktree creation and cleanup commands: MANUAL (`node scripts/session-worktree.js --sd-key <SD> --branch <branch>` is the recommended entry point; work ONLY in the worktree by absolute path, never `cd`).

### Forbidden Operations (Multi-Instance)

| Operation | Why Forbidden | Alternative |
|-----------|---------------|-------------|
| `git stash pop` across SDs | Mixes changes between instances | Use worktrees |
| `git checkout` to different SD branch | Switches shared directory | Use worktrees |
| Working in `C:/Users/rickf/Projects/_EHG/ehg` during parallel execution | Shared state conflicts | Use worktree path |
| Branch switching mid-operation | Interrupts other instance | Complete or stash first |

### Verify After Every Edit (When In Doubt)

If there is ANY ambiguity about which working tree an Edit landed in — multi-session
fleet, worktree-per-SD convention, a prior command that may have changed `cwd` — run
`git status` (or `git diff --stat`) immediately after the Edit, not after a downstream
symptom surfaces. Checking proactively is cheap; discovering a stray shared-root edit
indirectly (e.g. via an unexpected test result loading stale worktree code) costs far
more time to trace back.



## EXEC Dual Test Requirement

### ⚠️ MANDATORY: Dual Test Execution

**CRITICAL**: "Smoke tests" means BOTH test types, not just one! (provenance: PROVENANCE § Dual test requirement — evidence, common mistakes, why-this-matters)



Before creating EXEC→PLAN handoff, EXEC MUST run:

#### 1. Unit Tests (Business Logic Validation)
```bash
npm --prefix C:/Users/rickf/Projects/_EHG/ehg run test:unit
```
- **What it validates**: Service layer, business logic, data transformations
- **Failure means**: Core functionality is broken
- **Required for**: EXEC→PLAN handoff
- **Framework**: Vitest

#### 2. E2E Tests (UI/Integration Validation)
```bash
npm --prefix C:/Users/rickf/Projects/_EHG/ehg run test:e2e
```
- **What it validates**: User flows, component rendering, integration
- **Failure means**: User-facing features don't work
- **Required for**: EXEC→PLAN handoff
- **Framework**: Playwright

#### Verification Checklist
- [ ] Unit tests executed: `npm run test:unit`
- [ ] Unit tests passed: [X/X tests]
- [ ] E2E tests executed: `npm run test:e2e`
- [ ] E2E tests passed: [X/X tests]
- [ ] Both test types documented in EXEC→PLAN handoff
- [ ] Screenshots captured for E2E test evidence
- [ ] Test results included in handoff "Deliverables Manifest"

**❌ BLOCKING**: Cannot create EXEC→PLAN handoff without BOTH test types passing.

**Why**: the SD-EXPORT-001 and SD-EVA-MEETING-002 incidents, in PROVENANCE.

## 🌿 Branch Hygiene Gate (MANDATORY)

## Branch Hygiene Gate (MANDATORY)

**Evidence**: the SD-STAGE4-UX-EDGE-CASES-001 unsalvageable-branch incident, in PROVENANCE. (procedure: MANUAL § Branch hygiene gate — originating incident, health-check script, why-this-matters)

### MANDATORY Before PLAN-TO-EXEC Handoff

EXEC MUST verify these branch hygiene requirements BEFORE starting implementation:

### 1. Branch Freshness (≤7 Days Stale)

```bash
# Check days since branch diverged from main
git log main..HEAD --oneline | wc -l  # Should be reasonable
git log --oneline main..HEAD --format="%ar" | tail -1  # Check age
```

**Threshold**: Feature branch must be ≤7 days stale at PLAN-TO-EXEC handoff
**Action**: If exceeded, rebase or merge main before proceeding
> Why: Branches older than 7 days accumulate merge conflicts at an accelerating rate. Beyond 14 days, the conflict surface area exceeds what an LLM can safely resolve in one session — the SD-STAGE4 incident demonstrated that a 13-day branch became unsalvageable.

### 2. Single-SD Branch Rule (No Mixing)

```bash
# All commits should reference the same SD-ID
git log main..HEAD --oneline | grep -E "SD-[A-Z0-9-]+"
```

**Rule**: One SD per branch - no mixing unrelated work
**Anti-Pattern**: "Kitchen sink" branches that accumulate work from multiple SDs
**Action**: If multiple SDs detected, create separate branches
> Why: Mixed-SD branches make rollbacks impossible and confuse the review-gate risk scorer. A single-SD branch means any revert is safe — reverting a mixed branch would silently undo unrelated shipped work.

### 3. Merge Main at Phase Transitions

**At PLAN-TO-EXEC**:
```bash
git fetch origin main
git merge origin/main --no-edit  # Or rebase if preferred
```

**Rule**: Sync with main at each phase transition (LEAD→PLAN, PLAN→EXEC, EXEC→PLAN)
> Why: Phase transitions are natural synchronization points — the branch is stable, tests are passing, and a PR review window just occurred. Syncing here keeps conflict resolution small and predictable rather than deferred to an explosive final merge.
**Benefit**: Catches conflicts early, prevents accumulation

### 4. Maximum Branch Lifetime (14 Days)

| Age | Action |
|-----|--------|
| 0-7 days | ✅ Proceed normally |
| 7-10 days | ⚠️ Warning - sync with main |
| 10-14 days | 🔴 Must sync before any handoff |
| >14 days | ❌ Create fresh branch, cherry-pick changes |

### 5. When a PR Goes CONFLICTING (Post-Push)

QF-20260904-004: `git push --force-with-lease` is denied by the Claude Code auto-mode classifier
before any repo-side check runs -- a worker seat cannot complete a REBASE-and-force-push cycle on
its own branch, so a CONFLICTING PR strands until a bypass-permissions seat pushes for it.

**DEFAULT (no force-push ever needed): merge-from-main on the SAME branch.**
```bash
git fetch origin main
git merge origin/main   # resolve any conflicts locally, then:
git add -A && git commit
git push   # plain push -- the branch's existing commits are untouched, so this is a fast-forward for origin, never a force-push
```
This is why item 3 above ("Merge Main at Phase Transitions") already says `git merge`, not
`rebase`, as the primary form -- a merge commit is the tradeoff (non-linear branch history), and
it is accepted here specifically because it keeps the worker unblocked without any human seat.

**ESCAPE HATCH (only if a genuine rebase/linear-history is required, or the merge itself cannot
be resolved cleanly): replay as a new branch.**
```bash
git rebase origin/main   # resolve conflicts locally
git checkout -b <branch>-r2
git push -u origin <branch>-r2   # plain push of a NEW branch -- never force
gh pr create --title "..." --body "Replaces #<original-PR>, rebased for a clean merge."
gh pr close <original-PR> --comment "Superseded by #<new-PR> (rebased, replay-as-new-branch per QF-20260904-004)"
```
The original branch/PR is closed, never force-pushed. Used precedent: PR #8189, #8190.

**Do not attempt** `git push --force-with-lease` (or `--force`) on an existing branch from a
worker seat -- it is denied by the classifier before any repo check runs, and retrying the
identical command does not change the outcome. If a human operator wants worker seats to
force-push their own `qf/`/`feat/` branches, that is a Bash permission-rule decision for the
chairman, not something a worker session can grant itself.

### Branch Health Check Script

The script lives in MANUAL.

### EXEC Agent Action

When starting implementation:
1. Run branch health check
2. If >7 days stale → merge main first
3. If multiple SDs detected → split branches
4. If >100 files changed → assess scope creep
5. Document branch health in handoff notes

## 🔀 SD/Quick-Fix Completion: Commit, Push, Merge

## 🔀 SD/Quick-Fix Completion: Commit, Push, Merge (MANDATORY)

**Every completed Strategic Directive and Quick-Fix MUST end with:** (procedure: MANUAL § Completion commit/push/merge — command sequences)

1. **Commit** - All changes committed with proper message format
2. **Push** - Branch pushed to remote
3. **Merge to Main** - Feature branch merged into main

### For Quick-Fixes

The `complete-quick-fix.js` script handles this automatically:

```bash
node scripts/complete-quick-fix.js QF-YYYYMMDD-NNN --pr-url https://...
```

### For Strategic Directives

After LEAD approval: commit → push → `gh pr create` → `node scripts/gh-merge-safe.mjs <PR#> --merge --delete-branch` (the full command sequence and the local-merge fallback: MANUAL).

### Merge Checklist

Before merging, verify:
- [ ] All tests passing (unit + E2E)
- [ ] CI/CD pipeline green
- [ ] Code review completed (if required)
- [ ] No merge conflicts
- [ ] SD status = 'archived' OR Quick-Fix status = 'completed'

### Anti-Patterns

❌ **NEVER** leave feature branches unmerged after completion
❌ **NEVER** skip the push step
❌ **NEVER** merge without verifying tests pass
❌ **NEVER** force push to main

### Verification

After merge, confirm:
```bash
git checkout main
git pull origin main
git log --oneline -5  # Should show your merge commit
```

## Working with Child SDs During EXEC

### Child SD Lifecycle

**Children have FULL workflow** (not simplified):
1. LEAD validates child (strategic value, scope, risks)
2. PLAN creates child PRD (detailed requirements)
3. PLAN→EXEC handoff (with validation gates)
4. EXEC implements (full testing required)
5. EXEC→PLAN handoff (verification)
6. Mark child as 'completed'

### Sequential Execution Rules

**Database trigger enforces**:
- Child B cannot start until Child A has `status = 'completed'`
- Attempting to activate out-of-order will fail

**EXEC agent must**:
1. Check dependency status before starting
2. Wait if dependency not complete
3. Document in handoff when dependency cleared

### Progress Tracking

```javascript
// Update child progress as you work
await supabase.from('strategic_directives_v2')
  .update({ progress: 75 })
  .eq('id', 'SD-PARENT-001-A');

// Parent progress auto-calculates
// DO NOT manually set parent progress
```

### Parent Completion

After last child completes:
1. Parent progress auto-updates to 100%
2. Parent status auto-updates to 'completed'
3. (Optional) Create orchestration retrospective

### Common Mistakes

| Mistake | Why Wrong | Fix |
|---------|-----------|-----|
| Starting Child B before Child A done | Violates dependencies | Wait for dependency |
| Setting parent progress manually | Overwrites calculation | Let function calculate |
| Skipping child LEAD | No strategic validation | Full LEAD required |
| Skipping child PRD | No requirements doc | Full PLAN required |

### Why Full Workflow Matters

Each child SD is a strategic directive, not a task:
- **LEAD validates**: Is this child strategically sound?
- **PLAN defines**: What exactly does this child deliver?
- **EXEC implements**: How do we build it?

Skipping phases = skipping essential validation.

> **Team Capabilities**: During EXEC, any agent can spawn specialist teams for cross-domain investigation (e.g., DB + API + Security). See **Teams Protocol** in CLAUDE.md for templates and dynamic agent creation.

## User Story Acceptance Criteria Verification (MANDATORY)

Before marking any user story as `status = 'completed'`, you **MUST** verify each acceptance criterion against implementation evidence. Bulk-updating story status to pass the ACCEPTANCE_CRITERIA_VALIDATION gate without per-criterion verification is a **protocol violation**.

### Required Steps

1. **Read each acceptance criterion** from the story's `acceptance_criteria` field
2. **Cite specific evidence** that proves each criterion is met:
   - Test output showing the behavior works
   - Query results confirming data exists
   - Code references showing the implementation
   - Error output confirming constraints are enforced
3. **Document the verification** in your response before updating the database
4. **Only then** update `status = 'completed'` and optionally `validation_status = 'validated'`

### Anti-Pattern

```
❌ BAD: Bulk-update all stories to 'completed' to clear the gate
   supabase.from('user_stories').update({ status: 'completed' }).eq('sd_id', uuid)

✅ GOOD: Verify each story individually, cite evidence, then update
   // US-001: "6 columns exist on table"
   // Evidence: SELECT query returned all 6 column names ✓
   // US-001: "CHECK constraints enforce valid values"
   // Evidence: UPDATE with invalid value returned constraint error ✓
   // → All criteria verified, marking US-001 as completed
   supabase.from('user_stories').update({ status: 'completed' }).eq('id', story1_id)
```

### Scoring Impact

The ACCEPTANCE_CRITERIA_VALIDATION gate scores stories as follows:
- **100**: `status = 'completed'` AND test evidence exists (story_test_mappings or e2e_test_status)
- **70**: `status = 'completed'` but no formal test mapping
- **50**: Criteria exist but story not completed/validated
- **0**: No acceptance criteria defined

Threshold: overall score >= 60 AND no story scores 0.

## Loop Continuity / Never-Exit (Fleet Worker Contract)

The WORKER analog of CLAUDE.md "Canonical Pause Points — THE ONLY REASONS TO STOP". An autonomous fleet worker in a /loop must NEVER exit prematurely: the enumerated stops below are the ONLY legitimate exits; every other condition re-arms a ScheduleWakeup and re-enters the loop.

**THE LOOP'S UNIT IS ONE COMPLETE WORK ITEM** — an SD driven through ALL its handoffs (LEAD→PLAN→EXEC→PLAN_VERIFICATION→LEAD_FINAL) to completion, OR a quick fix worked to completion — NEVER a single handoff or phase. Under AUTO-PROCEED you flow from each handoff straight into the next IN THE SAME TURN: a phase boundary is NOT an iteration boundary and is NOT a pause point. The "re-arm a ScheduleWakeup" rule governs the boundary BETWEEN iterations (item complete / blocked claim / genuine idle / waiting on an external event such as CI or a coordinator reply) — it does NOT apply BETWEEN the handoffs of an active item. Do NOT arm a ScheduleWakeup, and do NOT end your turn, while you hold a claimed item with an immediately-actionable next handoff. ScheduleWakeup is an idle/wait mechanism, never a pacing mechanism for active work.

**THE ONLY legitimate stops (the allow-path):**
1. The operator tells you to stop / wind down.
2. A canonical pause point is reached.
3. You completed the /signal wind-down handshake (announced offline + gave the grace window).

**Every other condition is a CONTINUE — re-arm a ScheduleWakeup and re-run the loop. Four enforced exit-modes:**
- **(4a) Post-ship**: you just shipped an SD → /signal a fleet-retro → /checkin → claim the next workable SD (READY > EXEC > PLANNING > DRAFT) in the SAME turn. Shipping is the START of the next iteration, not the end of the loop (the #1 wrong-stop).
- **(4b) Blocked claim**: your SD hit a chairman gate/blocker while unblocked belt work exists → STAY on that SD, park WIP (push the branch + set metadata.blocker.status), /signal the specific blocker, and COORDINATE with the coordinator to RESOLVE the block. *** ON EVERY WAKEUP, BEFORE YOU RE-POLL OR RE-REPORT: RE-RUN YOUR OWN BLOCKER CHECK. *** Blockers self-resolve silently and nobody tells you — two seats burned 5h23m and 9h41m on conditions that had already cleared, while awake and emitting 66 and 74 rows, because a stuck signal is a one-shot message into a queue nobody re-evaluates. The re-check is one command: RESYNC_REQUIRED is git fetch origin main && git log --oneline HEAD..origin/main -- scripts/sd-start.js; a peer-dirty tree is git status --porcelain. If it now passes, RESUME IMMEDIATELY. Re-report ONLY when the condition has materially changed (cleared, or changed in kind) — an UNCHANGED blocker is re-checked SILENTLY and never re-sent; do not invent a re-send timer. (via /signal, re-poll session_coordination by correlation_id on each wakeup; the bare two-way request lane has no coordinator inbox surface yet, so use /signal until that ships) — do NOT hop to a different SD. The coordinator does due diligence, then decides + approves how you proceed; for a migration you MAY apply it yourself ONLY after explicit coordinator sign-off (never self-apply a prod migration without it). Never idle silently. Escalation runs Coordinator -> Adam -> chairman. (chairman directive 2026-06-24; canonical: docs/protocol/fleet-coordinator-and-worker-behavior.md.)
- **(4c) No wind-down handshake**: never exit silently → /signal feedback "winding down — finished <SD>, anything queued? idling ~180s", arm a SHORT (~180s) grace ScheduleWakeup, re-check the inbox on that tick, THEN settle into the ~300s idle cadence.
- **(4d) Transient error**: a connectivity/API/tool blip is NOT a stop → re-arm a ScheduleWakeup and resume (retry ≤2, then invoke the RCA sub-agent). Never treat a transient error as terminal.

**ENFORCEMENT (the teeth):** the Stop hook `scripts/hooks/stop-loop-wakeup-reminder.cjs` BLOCKS a premature stop (emits `{decision:"block"}` + re-prompts you to push WIP and arm a wakeup) UNLESS you took the allow-path (operator-stop / canonical pause point / an announced /signal wind-down detected in session_coordination). Gated by `LEO_LOOP_WAKEUP_REMINDER`; fail-open + single-fire (blocks at most once per turn) so a legitimate stop is never trapped.

**CANON SYNC:** this section (`leo_protocol_sections#fleet_worker_loop_continuity`) is the source of truth; it is mirrored in `docs/protocol/fleet-worker-loop-directive.md` and the `[ROLE] WORKER` block in `scripts/hooks/session-role-orient.cjs`. Keep all three in sync.

## Vision V2 Implementation Requirements (SD-VISION-V2-*)

### MANDATORY: Vision Spec Consultation Before Implementation

**For ALL implementations of SDs matching `SD-VISION-V2-*`:**

Before writing any code, you MUST:

1. **Query SD metadata for vision spec references**
2. **Read ALL files listed in `must_read_before_exec`**
3. **Follow patterns and structures defined in specs**

### Implementation Requirements for Vision V2

| Requirement | Description |
|-------------|-------------|
| **Spec Compliance** | Code MUST match spec definitions exactly (table names, column types, API shapes) |
| **Venture-Stage Insulation** | CEO Runtime MUST be OBSERVER-COMMITTER only - no direct venture_stage_work writes |
| **Glass Cockpit Design** | UI MUST follow progressive disclosure, minimal chrome philosophy |
| **Token Budget Enforcement** | All agent operations MUST respect venture token budgets |

### CREATE_FROM_NEW Policy

All Vision V2 SDs have this implementation guidance:
- **REVIEW** all vision files before implementation
- **CREATE FROM NEW** - similar files may exist to learn from, but implement fresh
- **DO NOT MODIFY** existing files - create new implementations per vision specs

### Venture-Stage Insulation Checklist (SD-VISION-V2-005 CRITICAL)

**Before marking SD-VISION-V2-005 complete:**

- [ ] Zero direct INSERT/UPDATE/DELETE on `venture_stage_work`
- [ ] All stage transitions via `fn_advance_venture_stage()` only
- [ ] Gate types (auto/advisory/hard) respected
- [ ] E2E test verifies no direct writes to stage tables
- [ ] No new columns added to existing stage tables

## Atomic INSERT Pattern for Writer/Consumer Asymmetry Fixes

MANDATORY during EXEC for changes that add/remove DB columns or JSONB fields consumed by gates, change shared function signatures, or modify shared metadata schemas: (1) identify ALL writers AND consumers of the affected state, (2) modify writer + consumer + sibling-writers in the SAME atomic INSERT (or migration / PR), (3) add a regression test exercising both paths.

### Why

PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 has been witnessed 5 times (SD-LEO-INFRA-CLAIM-DUAL-COLUMN-001 sibling release functions, SD-LEO-INFRA-CROSS-REPO-MERGE-001 PR_MERGE_VERIFICATION scope, SD-LEO-INFRA-LEO-CREATE-CROSS-001 --target-repos, SD-LEO-INFRA-BUILDDEFAULTSMOKETESTSTEPS-KEYWORD-DETECTOR-001 plan-file path, SD-LEO-FEAT-STAGE-REJECT-KILL-001 heal-87 floor). When a writer evolves and a sibling consumer is missed, gate behavior diverges silently — usually surfacing only when a downstream SD trips the asymmetry.

### Anti-Pattern Example

Adding `metadata.target_repos[]` at SD creation but only updating one of two gate consumers. Surface: gate passes for the new SD but fails for an older one with the same metadata shape, or vice versa.

### Atomic INSERT Specific Application

When you see `UPDATE-immediately-after-INSERT` in the same script (especially for fields downstream helpers read at INSERT time), default to threading the field through the INSERT call. The plan-file path of leo-create-sd.js was a textbook case until PR #3578.

### Cross-References

- migration_script_pattern
- PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001

### How to Apply

Before EXEC apply, grep for the field/function name across all callers. List every writer + consumer in PR description. Add a regression test that mutates the writer and asserts every consumer behaves correctly.

## Sanctioned Read-Only CI-Wait Pattern

When you need to block-wait on CI (e.g. during a fix-CI-fix loop), use the built-in `gh` watch subcommands instead of a manual poll loop:

```bash
# Wait on a specific PR's checks
gh pr checks <PR#> --repo <owner/repo> --watch

# Wait on a specific workflow run
gh run watch <run-id>
```

Both are read-only from the RCA retry-guard's perspective. `gh pr checks --watch` has been allowlist-exempt since QF-20260704-784 (it is not newly enabled by this section) and is now also covered by the classifier's `gh pr checks` pattern. `gh run watch` is covered by the classifier's `gh run watch` pattern; as a single blocking invocation it does not itself generate repeat signatures the way a manual poll loop does.

**Do NOT** hand-roll a poll loop (`while ! gh pr checks ...; do sleep N; done`) — each individual invocation is a separate tool call, and while `gh pr checks` itself is exempt, the surrounding shell loop or a non-exempt variant of the same idea can still accumulate toward the 3-strike guard on unrelated command shapes.

> Why: `gh run list`, `gh pr view`, and other legitimate CI-polling reads had zero coverage in the retry-guard's read-only classifier (`READ_ONLY_LEADING_RE`) before SD-LEO-INFRA-RCA-READONLY-GH-VERBS-001 — 13 narrow one-off allow-list patches landed in 8 weeks instead of a classifier-level fix (QF-20260704-784 for `gh pr checks` alone, after 3 workers tripped it in 90 minutes). Documenting the sanctioned watch-based pattern here, rather than leaving it as a hook source-code comment, means a worker learns it by instruction instead of by accident.


---

*Generated from database: 2026-09-11*
*Protocol Version: 4.4.1*
*Load when: User mentions EXEC, implementation, coding, or testing*
