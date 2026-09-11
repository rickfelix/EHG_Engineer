<!-- file_content_hash: 23548014907e87ce -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_CORE_MANUAL.md — Core Manual (reference companion)

**Generated**: 2026-09-11 10:49:02 AM
**Protocol**: LEO 4.4.1
**Purpose**: Long-form CORE reference — strategic governance hierarchy, Chairman/CEO roles, PR size tier rationale, Russian Judge quality rubric, built-in agent architecture, pattern search CLI
**Load when**: At the MOMENT OF DOING one of these procedures — not at every session start

> This companion carries REFERENCE ONLY. Every RULE that governs a session (Small PRs, Global Negative Constraints, Gate Failure Protocol, migration/model-routing/supabase-connection prohibitions, etc.) stays in CLAUDE_CORE.md and is in force whether or not this file is read.

---

## Cascade Invalidation System

**Purpose**: When a vision document evolves (version bump), all downstream architecture plans and objectives are automatically flagged for review.

### How It Works
1. **Trigger**: `trg_cascade_invalidation_on_vision_update` fires on `eva_vision_documents` when `version` column changes
2. **Effect**: Sets `needs_review_since = now()` on all linked `eva_architecture_plans` and `objectives`
3. **Audit**: Creates entries in `cascade_invalidation_log` (append-only) and `cascade_invalidation_flags` (work queue)

### Flag Lifecycle
| Status | Meaning |
|--------|---------|
| pending | Document needs review after upstream change |
| acknowledged | Reviewer has seen the flag |
| resolved | Document updated to reflect upstream changes |
| dismissed | Flag reviewed and no action needed |

### Commands
```bash
# View cascade health summary
node scripts/modules/governance/cascade-invalidation-engine.js summary

# List stale documents needing review
node scripts/modules/governance/cascade-invalidation-engine.js stale

# Resolve a flag after review
node scripts/modules/governance/cascade-invalidation-engine.js resolve <flagId> "Updated to reflect vision v3"
```

### Key Columns
- `eva_architecture_plans.needs_review_since` — auto-set by trigger, NULL when resolved
- `eva_architecture_plans.vision_version_aligned_to` — tracks which vision version the plan was last aligned with

## 🤖 Built-in Agent Integration

## Built-in Agent Integration

### Three-Layer Agent Architecture

LEO Protocol uses three complementary agent layers:

| Layer | Source | Agents | Purpose |
|-------|--------|--------|---------|
| **Built-in** | Claude Code | `Explore`, `Plan` | Fast discovery & multi-perspective planning |
| **Sub-Agents** | `.claude/agents/` | DATABASE, TESTING, VALIDATION, etc. | Formal validation & gate enforcement |
| **Skills** | `~/.claude/skills/` | 54 skills | Creative guidance & patterns |

### Integration Principle

> **Explore** for discovery → **Sub-agents** for validation → **Skills** for implementation patterns

Built-in agents run FIRST (fast, parallel exploration), then sub-agents run for formal validation (database-driven, deterministic).

### When to Use Each Layer

| Task | Use | Example |
|------|-----|---------|
| "Does this already exist?" | Explore agent | `Task(subagent_type="Explore", prompt="Search for existing auth implementations")` |
| "What patterns do we use?" | Explore agent | `Task(subagent_type="Explore", prompt="Find component patterns in src/")` |
| "Is this schema valid?" | Sub-agent | `node lib/sub-agent-executor.js DATABASE <SD-ID>` |
| "How should I build this?" | Skills | `skill: "schema-design"` or `skill: "e2e-patterns"` |
| "What are the trade-offs?" | Plan agent | Launch 2-3 Plan agents with different perspectives |

### Parallel Execution

Built-in agents support parallel execution. Launch multiple Explore agents in a single message:

```
Task(subagent_type="Explore", prompt="Search for existing implementations")
Task(subagent_type="Explore", prompt="Find related patterns")
Task(subagent_type="Explore", prompt="Identify affected areas")
```

This is faster than sequential exploration and provides comprehensive coverage.

## Claude Code Plan Mode Integration

**Status**: ACTIVE | **Version**: 1.0.0

### Overview
Claude Code's Plan Mode integrates with LEO Protocol to provide:
- **Automatic Permission Bundling** - Reduces prompts by 70-80%
- **Intelligent Plan Generation** - SD-type aware action plans
- **Phase Transition Automation** - Activates at phase boundaries

### SD Type Profiles
| SD Type | Workflow | Sub-Agents | PR Size Target |
|---------|----------|------------|----------------|
| `feature` | full | RISK, VALIDATION, STORIES | 100 (max 400) |
| `enhancement` | standard | VALIDATION | 75 (max 200) |
| `bug` | fast | RCA | 50 (max 100) |
| `infrastructure` | careful | RISK, GITHUB, REGRESSION | 50 (max 150) |
| `refactor` | careful | REGRESSION, VALIDATION | 100 (max 300) |
| `security` | careful | SECURITY, RISK | 50 (max 150) |
| `documentation` | light | DOCMON | no limit |

### Permission Bundling by Phase
| Phase | Pre-approved Actions |
|-------|---------------------|
| LEAD | SD queue commands, handoff scripts, git status |
| PLAN | PRD generation, sub-agent orchestration, git branches |
| EXEC | Tests, builds, git commit/push, handoff scripts |
| VERIFY | Verification scripts, handoff scripts |
| FINAL | Merge operations, archive commands |

### Automatic Activation
- **Session start**: If SD detected on current branch
- **Phase boundaries**: Before each handoff execution

### Configuration
```json
// .claude/leo-plan-mode-config.json
{ "leo_plan_mode": { "enabled": true, "permission_pre_approval": true } }
```

### Module Location
`scripts/modules/plan-mode/` - LEOPlanModeOrchestrator.js, phase-permissions.js

## QF Lifecycle Reconciliation

**Problem**: quick_fixes rows stay `status=open` after a PR is merged via direct `gh pr merge` (any path that skips complete-quick-fix.js). sd:next then recommends phantom work. Root cause documented in feedback memory `feedback_qf_db_stale_after_merge.md`.

**Solution**: Two complementary reconciliation layers — pre-merge filter + post-merge sweep. Both are idempotent and safe to run on any schedule.

### Layer 1 — Pre-Merge Filter (sd:next data loader)
`scripts/modules/sd-next/data-loaders.js` exposes two functions:
- `loadOpenQuickFixes()` — returns rows where `pr_url IS NULL` AND `commit_sha IS NULL`. Filters out QFs with in-flight PRs so sd:next does not restart work a parallel session is already merging (QF-380 merge-race fix).
- `loadReadyToMergeQuickFixes()` — queries the inverse pool (`pr_url IS NOT NULL`), cross-checks each PR state via `gh api` with a 60-second in-memory cache, returns only OPEN + all-checks-green rows tagged `ready_to_merge=true`. Lets the sd:next dispatcher emit a `qf_merge` action for adoption-ready work instead of `qf_start`.

> Why the cache: sd:next runs many times per session. Without the 60s dedup, each invocation hits the GitHub API for every open QF — rate limits bite within minutes.

### Layer 2 — Post-Merge Sweep (orphan-qf-reaper)
`scripts/orphan-qf-reaper.mjs` sweeps rows where `status IN (open, in_progress)` AND `pr_url` points to a MERGED PR, and flips them to `status=completed`. Protections:
- **Idempotency**: `.eq(status, current)` guard on the update — a concurrent complete-quick-fix.js flip wins without erroring.
- **5-minute safety window**: skips rows whose `pr_url` was set within the last 5 minutes, giving complete-quick-fix.js time to finish its own flip.
- **Structured JSON logging**: one line per row evaluated, durable artifact for debugging races.

### Scheduled Execution
`.github/workflows/orphan-qf-reaper.yml` runs Layer 2 every 15 minutes on cron plus `workflow_dispatch`, with a `dry-run` input, a concurrency group to prevent overlap, and a per-run `reaper.log` artifact.

### When to Reach For This
- **`sd:next` recommends a QF you know was merged**: check `loadOpenQuickFixes` is filtering on `pr_url IS NULL`; inspect that QF's `pr_url` / `commit_sha` columns. If they're set, the reaper will close it on its next cron; for immediate cleanup, run `node scripts/orphan-qf-reaper.mjs`.
- **Two sessions on the same QF**: verify `loadReadyToMergeQuickFixes` is wired into the dispatcher and emitting `qf_merge` for rows with open PRs.
- **QF with open PR but sd:next ignores it**: the PR's checks are not all green — expected. Layer 1 only surfaces merge-ready work.

### Anti-Pattern
Do **not** replace these layers with a blanket "close all QFs with any pr_url set". The 5-minute window and merged-state check prevent closing a QF whose PR is still under review.

> Background: This section is FR5 of SD-LEO-INFRA-LIFECYCLE-RECONCILIATION-ORPHAN-001. Layer 1 first shipped as QF-20260423-380; Layer 2 + scheduled sweep ship with this SD.

## Queue Ranking and QF Track Inference

**Purpose**: Document the unified queue ranking model used by `npm run sd:next`,
established by SD-LEO-INFRA-UNIFY-QUICK-FIX-001.

### Single Source of Truth: `scripts/modules/sd-next/rank-items.js`

Both the baseline-active path (`SDNextSelector.js::displayTracks`) and the
no-baseline fallback path (`display/fallback-queue.js::showFallbackQueue`)
delegate ranking to the same pure `rankItems(items, context)` function. The
urgency bands, vision gap weighting, OKR impact blending, and policy boost
apply uniformly regardless of whether a baseline is active.

Do NOT reintroduce inline sort logic or `composite_rank` arithmetic in the
orchestrator files — that divergence was the bug this SD fixed.

### QF Track Inference

Quick Fixes rank alongside SDs in the same track sections. The QF → track
assignment is inferred from existing `quick_fixes` columns; there is no
`quick_fixes.track` schema column and none should be added.

| `quick_fixes.type` | Default Track | Override |
|---------------------|---------------|----------|
| `bug`               | C (Quality)   | Track A if `branch_name` contains an infra keyword |
| `polish`            | C (Quality)   | Track A if `branch_name` contains an infra keyword |
| `documentation`     | STANDALONE    | (none) |
| anything else       | STANDALONE    | (none) |

Infra keyword set (in `rank-items.js::TRACK_A_BRANCH_KEYWORDS`): `infra`,
`hook`, `gate`, `protocol`, `workflow`, `sd-next`, `handoff`. The
heuristic is conservative by design — false-positive Track A assignment
pollutes the Infrastructure track with mis-categorised work.

### QF Severity → sequence_rank + urgency band

| Severity   | sequence_rank | Default band (fresh) | Band (age > 7 days) |
|------------|---------------|----------------------|---------------------|
| `critical` | 100           | P0                   | P0                  |
| `high`     | 200           | P1                   | P0                  |
| `medium`   | 500           | P2                   | P0                  |
| `low`      | 1000          | P3                   | P3                  |

Tuning: edit `SEVERITY_TO_RANK` and `qfUrgencyBand` in `rank-items.js` —
single-line changes; do not propagate these constants elsewhere.

### Anti-patterns

- ❌ Adding a `quick_fixes.track` column. We infer at read time on purpose.
- ❌ Duplicating ranking logic in a new caller. Import `rankItems` instead.
- ❌ Reintroducing a separate `OPEN QUICK FIXES` section at the bottom of
  `sd:next` output. QFs render inline inside their track via
  `display/tracks.js::displaySDItem` (branch on `item.kind === 'qf'`).
- ❌ Conflating `item.kind` (routing discriminator) with `qf.type`
  (DB column holding bug/polish/documentation). They are separate signals.

### AUTO_PROCEED_ACTION envelope (unchanged)

The refactor preserves the existing envelope shape exactly:

```
AUTO_PROCEED_ACTION:{"action":"start"|"qf_start"|"continue"|...,
                     "sd_id": "<key>"|null, "qf_id": "<id>"|null,
                     "reason": "<text>"}
```

Downstream consumers (`coordination-inbox.cjs`, integration tests) continue
to parse without modification.

## DB Ops Protocol (Common Pitfalls)

**ID Field Confusion**: Three distinct ID columns exist in `strategic_directives_v2`:
- `id` — UUID primary key (use for FK references like `parent_sd_id`, `sd_id` in other tables)
- `sd_key` — Human-readable key (e.g., `SD-FIX-NAV-001`). Use `.eq('sd_key', ...)` for lookups.
- `uuid_id` — Separate auto-generated UUID. Rarely needed.

**JSONB Double-Stringification**: Supabase JS client serializes automatically. Passing `JSON.stringify()` on arrays/objects before `.insert()` wraps the value in extra quotes, producing `'"[...]"'` instead of `'[...]'`. Fix: pass native JS arrays/objects directly.

**Numeric Scale Checks**: Fields like `progress` (0-100) and `priority` (text enum: critical/high/medium/low) have CHECK constraints. Supabase returns a generic error on violation — always validate before insert.

**Silent Empty Returns**: Supabase returns `{ data: [], error: null }` when column names are wrong. Always `.select('*').limit(1)` on unfamiliar tables first to discover actual column names.

**NOT NULL Pre-Validation**: Before inserting rows, check which columns are NOT NULL without defaults. Query `information_schema.columns` if unsure:
```sql
SELECT column_name, is_nullable, column_default FROM information_schema.columns
WHERE table_name = '<table>' AND is_nullable = 'NO' AND column_default IS NULL;
```
> Why: Supabase returns generic constraint errors on NOT NULL violations. Pre-checking avoids trial-and-error inserts.

**Migration Safety — IF EXISTS**: All DDL in migration scripts must use defensive guards:
- `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- `DROP TABLE IF EXISTS`, `DROP INDEX IF EXISTS`
> Why: Migrations may run against databases in different states (dev vs prod, partial prior runs). Without IF EXISTS, re-running a migration fails on the first already-applied statement.

## PR Size Guidelines

**Philosophy**: Balance AI capability with human review capacity. Modern AI can handle larger changes, but humans still need to review them.

**Three Tiers**:

1. **≤100 lines (Sweet Spot)** - No justification needed
   - Simple bug fixes
   - Single feature additions
   - Configuration changes
   - Documentation updates

2. **101-200 lines (Acceptable)** - Brief justification in PR description
   - Multi-component features
   - Refactoring with tests
   - Database migrations with updates
   - Example: "Adds authentication UI (3 components) + tests"

3. **201-400 lines (Requires Strong Justification)** - Detailed rationale required
   - Complex features that cannot be reasonably split
   - Large refactorings with extensive test coverage
   - Third-party integrations with configuration
   - Must explain why splitting would create more risk/complexity
   - Example: "OAuth integration requires provider config, UI flows, session management, and error handling as atomic unit"

**Over 400 lines**: Generally prohibited. Split into multiple PRs unless exceptional circumstances (emergency hotfix, external dependency forcing bundled changes).

**Key Principle**: If you can split it without creating incomplete/broken intermediate states, you should split it.

## 🔍 Issue Pattern Search (Knowledge Base)

## Issue Pattern Search (Knowledge Base)

Search the pattern database for known issues before implementing fixes.

### When to Search
- **PLAN Phase**: Before schema/auth/security work
- **EXEC Phase**: Before implementing, when hitting errors
- **Retrospective**: Auto-extracted

### CLI Commands
```bash
npm run pattern:alert:dry          # Active patterns near thresholds
npm run pattern:resolve PAT-XXX "Fixed by implementing XYZ"
```

### Programmatic API
```javascript
import { IssueKnowledgeBase } from './lib/learning/issue-knowledge-base.js';
const kb = new IssueKnowledgeBase();

const patterns = await kb.search('', { category: 'database' });
const solution = await kb.getSolution('PAT-003');
```

### Category → Sub-Agent Mapping
| Category | Sub-Agents |
|----------|------------|
| database | DATABASE, SECURITY |
| testing | TESTING, UAT |
| security | SECURITY, DATABASE |
| deployment | GITHUB, DEPENDENCY |
| protocol | RETRO, DOCMON, VALIDATION |

### Auto-SD Creation Thresholds
- Critical severity: 5+ occurrences
- High severity: 7+ occurrences
- Increasing trend: 4+ occurrences

## Database Sub-Agent Auto-Invocation

## Database Sub-Agent Semantic Triggering

When SQL execution intent is detected, the database sub-agent should be auto-invoked instead of outputting manual execution instructions.

### Intent Detection Triggers

The following phrases trigger automatic database sub-agent invocation:

| Category | Example Phrases | Priority |
|----------|-----------------|----------|
| **Direct Command** | "run this sql", "execute the query" | 9 |
| **Delegation** | "use database sub-agent", "have the database agent" | 8 |
| **Imperative** | "please run", "can you execute" | 8 |
| **Operational** | "update the table", "create the table" | 7 |
| **Result-Oriented** | "make this change in the database" | 6 |
| **Contextual** | "run it", "execute it" (requires SQL context) | 5 |

### Denylist Phrases (Block Execution Intent)

These phrases force NO_EXECUTION intent:
- "do not execute"
- "for reference only"
- "example query"
- "sample sql"
- "here is an example"

### Integration

When Claude generates SQL with execution instructions:
1. Check for SQL execution intent using `shouldAutoInvokeAndExecute()`
2. If intent detected with confidence >= 80%, use Task tool with database-agent
3. Never output "run this manually" when auto-invocation is permitted

```javascript
// Import
import { shouldAutoInvokeAndExecute } from 'lib/utils/db-agent-auto-invoker.js';

// Check before outputting SQL
const result = await shouldAutoInvokeAndExecute(sqlMessage);
if (result.shouldInvoke) {
  // Use Task tool instead of manual instructions
  Task({ subagent_type: 'database-agent', prompt: result.taskParams.prompt });
}
```

### Configuration

Runtime configuration in `db_agent_config` table:
- `MIN_CONFIDENCE_TO_INVOKE`: 0.80 (default)
- `DB_AGENT_ENABLED`: true (default)
- `DENYLIST_PHRASES`: Array of blocking phrases

### Audit Trail

All invocation decisions logged to `db_agent_invocations` table with:
- correlation_id for tracing
- intent and confidence scores
- matched trigger IDs
- decision outcome


## Protocol Consistency Linter

Static checks for the LEO Protocol CLAUDE.md family. Detects threshold drift, enum drift, version drift, duplicate authoritative lists, and other consistency violations.

### Commands
| Command | Purpose |
|---------|---------|
| `npm run protocol:lint` | On-demand audit. Writes violations to `leo_lint_violations`. Exit non-zero on blocking violations. |
| `npm run protocol:lint:test` | Run rule fixtures (positive/negative). CI uses this to verify rules. |
| `npm run protocol:lint:promote <rule-id>` | Promote a warn-severity rule to block-severity. Requires 2+ clean regen runs. |

### Auto-run
The linter runs inside `generate-claude-md-from-db.js` after DB fetch and before file writes. Block-severity violations abort the regen — CLAUDE*.md files are not overwritten when drift is detected.

### Bypass (rate-limited)
```bash
node scripts/generate-claude-md-from-db.js --skip-lint --skip-reason "<text>"
```
Limit: 3 bypasses per repository per week. All bypasses logged to `leo_lint_run_history`.

### Where things live
| Item | Location |
|------|----------|
| Declarative rules (JSON pattern) | `scripts/protocol-lint/rules/declarative/*.json` |
| Code rules (semantic) | `scripts/protocol-lint/rules/code/*.mjs` |
| Fixtures (positive + negative per rule) | `scripts/protocol-lint/fixtures/*.json` |
| Engine | `scripts/protocol-lint/engine.mjs` |
| Audit tables | `leo_lint_violations`, `leo_lint_run_history`, `leo_lint_rules` |

### Adding a rule
New rules ship at `severity='warn'`. After 2+ consecutive regen runs with zero violations on a rule, run `npm run protocol:lint:promote <rule-id>` to elevate to `severity='block'`. Every rule must include a positive fixture (triggers detection) and a negative fixture (does not trigger).

*Added: SD-PROTOCOL-LINTER-001*

## 📊 Database Column Quick Reference

### Priority Column (strategic_directives_v2)
**Type**: STRING (not integer!)
**Valid Values**: 'critical', 'high', 'medium', 'low'

**Correct Usage**:
```javascript
// Filter by priority
.in('priority', ['critical', 'high'])

// Display priority
console.log(sd.priority.toUpperCase()) // 'CRITICAL'
```

**Wrong Usage** (will silently fail):
```javascript
// DON'T DO THIS - compares string to integer
.in('priority', [1, 2])  // Returns empty!
sd.priority === 1 ? 'CRITICAL' : 'LOW'  // Always 'LOW'!
```

**Pattern Reference**: PAT-DATA-TYPE-001


## AI-Powered Russian Judge Quality Assessment

**Status**: ACTIVE | **Model**: gpt-5-mini | **Threshold**: 70% weighted score | **Storage**: ai_quality_assessments

### Overview
Multi-criterion weighted scoring evaluates deliverable quality. Each rubric scores content 0-10 per criterion, applies weights, and generates graduated feedback.

### Rubric Criteria Summary

| Content Type | Phase | Key Criteria (Weight) |
|--------------|-------|----------------------|
| **SD** | LEAD | Description (35%), Objectives (30%), Metrics (25%), Risks (10%) |
| **PRD** | PLAN | Requirements (40%), Architecture (30%), Tests (20%), Risks (10%) |
| **User Story** | PLAN | Acceptance Criteria (40%), INVEST (35%), Feasibility (15%), Context (10%) |
| **Retrospective** | EXEC | Issue Analysis (40%), Solutions (30%), Lessons (20%), Metadata (10%) |

### Scoring Scale
- **0-3**: Inadequate (placeholder text, boilerplate, missing)
- **4-6**: Needs improvement (generic, lacks specificity)
- **7-8**: Good quality (specific, actionable)
- **9-10**: Excellent (rare - comprehensive with measurement methods)

### Anti-Patterns (Score 0-3)
- Placeholder text: "To be defined", "TBD"
- Generic benefits: "improve UX", "better system"
- Missing architecture details or metrics

### Integration
- **LEAD→PLAN**: SDQualityRubric validates SD before PRD creation
- **PLAN→EXEC**: PRDQualityRubric + UserStoryQualityRubric validate before implementation
- **On Failure**: Returns issues/warnings for revision

### Files Reference
- Rubrics: `/scripts/modules/rubrics/*.js`
- Base: `/scripts/modules/ai-quality-evaluator.js`
- Full documentation: `docs/reference/ai-quality-rubrics.md`

## Retrospective-Gate Invariants

## Retrospective-Gate Invariants (FR4 of SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001)

Both LEO handoff gates that check for a completion retrospective — `RETROSPECTIVE_QUALITY_GATE` at PLAN-TO-LEAD (`scripts/modules/handoff/executors/plan-to-lead/gates/retrospective-quality.js`) and `createRetrospectiveExistsGate` at LEAD-FINAL-APPROVAL (`scripts/modules/handoff/executors/lead-final-approval/gates.js`) — enforce **three invariants** via the shared helper `scripts/modules/handoff/retro-filters.js`:

### The Three Invariants

| # | Invariant | Query filter | Why |
|---|-----------|--------------|-----|
| 1 | **Existence** | `sd_id = <uuid>` plus `.maybeSingle()` with null-guard | A missing retrospective must be a hard-fail. Never fall through to `validateSDCompletionReadiness(sd, null)` — that function scores on SD quality alone, silently passing the gate. |
| 2 | **Type** | `.eq('retro_type', 'SD_COMPLETION')` | Handoff-time retros (LEAD_TO_PLAN, PLAN_TO_EXEC) are stored in the same table with a `retrospective_type` column for the phase label — but they still set `retro_type='SD_COMPLETION'` (see `lead-to-plan/retrospective.js:283`). The type filter excludes SPRINT / INCIDENT / AUDIT retros but is NOT sufficient on its own. |
| 3 | **Freshness** | `.gt('created_at', leadToPlanAcceptedAt)` | The one axis that reliably separates handoff-time retros from true SD-completion retros is creation time — SD-completion retros are authored *after* the SD actually ships. `leadToPlanAcceptedAt` comes from the most-recent `sd_phase_handoffs` row where `from_phase='LEAD'`, `to_phase='PLAN'`, `status='accepted'`. Falls back to `SD.created_at` when no such handoff exists (Phase-0 / unusual SDs). |

### Why Binary Pass/Fail, Not Percentage

Artifact-existence gates must query the artifact table directly, never heuristic-score. The original bug (`PAT-RETRO-EXISTS-GATE-FALSE-PASS`) manifested precisely because `validateSDCompletionReadiness` returned a percentage score based on SD quality when the retro was missing — and that score was high enough to pass the threshold. Hard-fail with remediation is the only way to make the absence loud.

### Touching These Gates

If you modify either gate, preserve the three-invariant invariant:

- Use `getFilteredRetrospective(sdUuid, sdCreatedAt, supabase)` from `scripts/modules/handoff/retro-filters.js`. Do **not** re-roll the query.
- Preserve the zero-rows hard-fail branch **before** `checkAutoPassConditions`. The auto-pass fast-paths for orchestrator / database / bugfix / corrective / enhancement / infrastructure assume a valid retro is present — they must never run on null.
- Add a test case for each new behavior: see `scripts/modules/handoff/retro-filters.test.js`, `retrospective-quality.test.js` (4 new failure-mode cases), and `lead-final-approval/gates/retrospective-exists.test.js` (mirror tests, previously zero coverage).

### Reference

- Evidence row (VALIDATION sub-agent, predecessor SD): `sub_agent_execution_results.id = e6cf78c4-427b-4c94-9fb9-b9b030604871`
- Evidence row (VALIDATION sub-agent, this SD): `sub_agent_execution_results.id = eb55ea9b-712c-4dcb-ad37-123c15d26d0f`
- Hot pattern: `PAT-RETRO-EXISTS-GATE-FALSE-PASS` (critical severity, process category)


## Solomon Consultation Protocol

**Solomon Consultation Protocol** — the deep-reasoning oracle on the cognitive ladder.

> Discoverability: when local reasoning AND the rca-agent are exhausted on a genuinely hard
> *cognitive* problem, escalate to **Solomon** (the propose-only deep-reasoning oracle) — do not
> spin. Solomon advises; you remain the actor. **Dormant by default** behind `SOLOMON_CONSULT_V1`
> (flag-off = byte-identical; the flip is chairman-only).

**Cognitive escalation ladder:** local reasoning → rca-agent → **Solomon** → Chairman.
Solomon sits between Canonical Pause Point #3 (RCA after 2 retries) and human escalation.

**How to consult** (flag-gated, dormant until `SOLOMON_CONSULT_V1=on`):
```bash
node scripts/worker-signal.cjs solomon-consult "<packet>" --severity high \
  --rca-count <N> --tool-attempts <N> [--type spec-conflict] [--await]
```
Counter-gated by the triage SSOT (`lib/coordinator/solomon-triage.cjs` `isSolomonEligible`): eligible
only when rca-agent ran ≥2× OR a gate failed ≥3× (Pause-Point-#3 exhausted), or a first-encounter
spec-conflict/arch-ambiguity WITH a logged self-resolution attempt. Flag OFF → prints
"Solomon dormant — handle locally" and inserts nothing. The reply returns under the existing
`adam_advisory` kind (+`oracle:true`). Solomon is propose-only: it NEVER claims, edits, gates, or sources.

**Observe pending consults:** `node scripts/fleet-dashboard.cjs solomon` (PENDING SOLOMON CONSULTS).
**Model:** Opus 4.8 (`claude-opus-4-8`) at high effort; no Fable dependency (Fable-swappable later).
**Activation:** chairman-gated, graduated (Mode A reactive consults, then Mode B sweeps) —
see `docs/architecture/solomon-activation-runbook.md`.

## Strategic Governance Hierarchy

The EHG platform operates under a 7-layer strategic governance stack. Each layer has a database table, CLI command, and clear purpose.

| Layer | Purpose | Database Table | CLI Command |
|-------|---------|---------------|-------------|
| **Mission** | Permanent organizational purpose | `missions` | `node scripts/eva/mission-command.mjs view` |
| **Constitution** | Immutable operating rules (CONST-001–009) | `protocol_constitution` | `node scripts/eva/constitution-command.mjs view` |
| **Vision** | 2-5 year strategic direction with scoring dimensions | `eva_vision_documents` | (managed via EVA scoring) |
| **Strategy** | Annual themes derived from vision | `strategic_themes` | `node scripts/eva/strategy-command.mjs view` |
| **OKRs** | Quarterly/monthly objectives with measurable KRs | `objectives` + `key_results` | `node scripts/eva/okr-command.mjs review` |
| **KRs** | Quantitative targets (baseline → target) linked to vision dimensions | `key_results` | `node scripts/eva/okr-command.mjs link` |
| **SDs** | Implementation units following LEAD→PLAN→EXEC | `strategic_directives_v2` | `npm run sd:next` |

**Hierarchy flow**: Mission → Constitution → Vision → Strategy → OKRs → KRs → SDs

Each SD should trace upward through this hierarchy. When evaluating or creating SDs, consider which OKR/KR the work advances.

## Chairman and CEO Governance Roles

### Chairman (Human Owner)
- **Owns**: Mission statement and Constitution rules
- **Approves**: Mission revisions (`mission-command.mjs propose`), constitutional amendments (`constitution-command.mjs amend`)
- **Authority**: Final say on strategic direction; immutable rules cannot be changed without Chairman approval

### CEO Agent (EVA)
- **Owns**: Strategy derivation, OKR generation, brainstorm-to-vision pipeline
- **Generates**: Monthly OKRs via `okr-command.mjs generate` (40% top-down from vision gaps, 60% bottom-up from retrospectives)
- **Derives**: Annual themes from vision dimensions via `strategy-command.mjs derive`
- **Wires**: Brainstorm session outcomes to vision documents via `brainstorm-to-vision.mjs`
- **Reports**: OKR progress snapshots, objective scoring, KR status tracking

### Separation of Concerns
| Action | Owner | Requires Approval? |
|--------|-------|--------------------|
| Change mission | Chairman | Yes (propose → approve) |
| Amend constitution | Chairman | Yes (draft → active) |
| Derive strategy themes | CEO (EVA) | No (automated from vision) |
| Generate monthly OKRs | CEO (EVA) | No (automated, logged in `okr_generation_log`) |
| Link KRs to vision dimensions | CEO (EVA) | No (via `okr-command.mjs link`) |
| Create/approve SDs | LEO Protocol | Yes (LEAD phase gates) |

## Tiered Auto-Apply Policy (SD-LEO-INFRA-MIGRATION-TIER-CLASSIFIER-001)

Handoff-time migration auto-apply is gated by a **fail-closed, allow-list tier classifier** (`scripts/lib/migration-tier-classifier.mjs`). The classifier is PURE (no DB/IO) and **default-deny**: a migration is auto-apply-eligible **only** when EVERY statement provably matches an additive allow rule.

- **TIER-1 (auto-apply eligible)** — provably additive only: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX` (incl. CONCURRENTLY / IF NOT EXISTS), nullable `ADD COLUMN` with a constant-only default, `ENABLE ROW LEVEL SECURITY` / `CREATE POLICY`, and bare `CREATE FUNCTION`/`VIEW` (NOT `OR REPLACE`, no `SECURITY DEFINER`, body free of destructive SQL). These flow to the DATABASE sub-agent for execution (the mechanics above are unchanged).
- **TIER-2 (chairman-gated)** — EVERYTHING ELSE: any `DROP`/`TRUNCATE`/`DELETE`/`UPDATE`/`RENAME`/`GRANT`/`REVOKE`, `ALTER COLUMN ... TYPE`, multi-action ALTER with a non-additive action, volatile or `NOT NULL` defaults, `CREATE OR REPLACE`, `SECURITY DEFINER`, `DO` blocks, named-`$tag$` function bodies hiding destructive SQL, and unparseable/under-split/ambiguous input. These are **never auto-applied** — they require the full 3-factor `@approved-by` chairman gate:
  ```
  node scripts/apply-migration.js <path> --prod-deploy
  ```
  (`--prod-deploy` + a single-use 1h token + an `-- @approved-by: <email>` header matching `git config user.email` — enforced by `scripts/lib/migration-guards.js`, which the tier classifier NEVER weakens.)

**Default-deny safety contract**: a false TIER-1 verdict on a destructive migration would auto-apply it past the chairman gate, so the classifier is allow-list only, NEVER throws, and NEVER returns TIER-1 on any error/ambiguity path. Both auto-apply vectors are gated — SD-declared migrations AND uncommitted manual-update SQL.

**Rollout**: the gate reads the `LEO_MIGRATION_TIER_GATE_BYPASS` flag in `leo_feature_flags` — ONE representation every execution path sees, worktrees included. Polarity is INVERTED deliberately: the flag stores a BYPASS, so the evaluator’s `enabled=false` default (returned for `evaluation_error`, `flag_not_found`, `kill_switch_active`, `lifecycle_draft`) means *no bypass*, i.e. the gate is **ON**. It therefore FAILS CLOSED — an unreachable DB means the gate holds, never that destructive DDL auto-applies. `LEO_MIGRATION_TIER_GATE` is **deprecated and ignored** (it logs a removal notice): it is present in `.env` on every surface and is loaded regardless of cwd, so honouring it would short-circuit before every DB read and leave the flag permanently inert. The break-glass is `LEO_MIGRATION_TIER_GATE_FORCE_ON=1`, which can only force the gate ON — no env value turns it off. To disable the gate, disable the flag in the DB. NOTE (measured, and the opposite of what an earlier draft of this line claimed): the `risk_tier: high` approval requirement is enforced ONLY on `transitionLifecycleState` — `updateFlag({isEnabled:true})` and a raw service-role UPDATE both succeed with **zero** approvals, and no RLS policy, trigger or CHECK blocks them. This flag is protected by default-OFF, inverted polarity, service-role key custody and the `fn_audit_feature_flag_changes` audit trail — NOT by an enforced approval gate. Every tier decision is still audited fail-soft to `audit_log` as `MIGRATION_TIER_CLASSIFICATION`, and the audit row now reports the verdict actually used rather than re-deriving it from the environment. (SD-LEO-INFRA-TIER-GATE-FLAG-001)

**Note on the Adam-delegated `--prod-deploy` flow (SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C, 2026-07-18)**: `lib/migration/adam-delegated-apply.js` (GAP A, SD-LEO-INFRA-ADAM-DBCHANGE-APPLY-DELEGATION-001) applies a STRICTER, SEPARATE scope check that excludes `create_policy`/`enable_rls` tokens — but this check only fires inside the Adam-persona kill-switch-gated delegated-apply path (`-- @delegated-by: adam` marker present AND `LEO_ADAM_DBAPPLY_DELEGATION=on`, default OFF). It does NOT narrow the general TIER-1 allow-list above for an ordinary EXEC-phase migration executed via the DATABASE sub-agent's `run-sql-migration.js` path — `CREATE POLICY`/`ENABLE ROW LEVEL SECURITY` on a brand-new table remain TIER-1 there. The two vectors were confused once already (RCA-verified) because both reuse tier-classifier language; treat them as distinct gates for distinct flows, not one rule with an exception.

## Sub-Agent Keyword Routing Table

| Agent | Trigger Keywords | Best For |
|-------|-----------------|----------|
| database-agent | migration, schema, sql, postgres, rls | Database operations, migrations, RLS policies |
| design-agent | component design, tailwind, responsive, a11y | UI/UX design, accessibility, frontend components |
| security-agent | auth bypass, csrf, xss, vulnerability | Security audits, vulnerability fixes |
| testing-agent | test coverage, e2e test, unit test, vitest | Test creation, test infrastructure |
| performance-agent | bottleneck, load time, memory leak | Performance optimization, profiling |
| rca-agent | root cause, 5 whys, failure analysis | Root cause analysis, debugging |
| docmon-agent | documentation update, api docs, readme | Documentation maintenance |
| regression-agent | backward compatible, breaking change, refactor | Refactoring safety, API compatibility |
| retro-agent | retrospective, lessons learned, post-mortem | Sprint retrospectives, learning capture |
| risk-agent | risk assessment, security risk, tradeoff | Risk analysis, architecture decisions |
| validation-agent | duplicate check, existing implementation | Codebase validation, overlap detection |
| stories-agent | user stories, acceptance criteria, epic | User story generation |
| github-agent | pull request, ci pipeline, code review | Git operations, CI/CD |
| api-agent | api endpoint, rest api, graphql | API design and implementation |
| dependency-agent | npm audit, outdated packages, vulnerability | Dependency management |
| uat-agent | user acceptance test, user journey, manual test | User acceptance testing |

### Invocation Pattern
```
Task(subagent_type="<agent-name>", prompt="Execute <AGENT> analysis for SD-XXX...")
```

## Genesis Codebase Locations (detail)

## Genesis Codebase Locations

**CRITICAL**: Genesis spans TWO codebases:

| Codebase | Path | Contents |
|----------|------|----------|
| **EHG_Engineer** | `/lib/genesis/` | Infrastructure (quality gates, TTL, patterns) |
| **EHG App** | `/lib/genesis/` | Orchestrators (ScaffoldEngine, repo-creator) |
| **EHG App** | `/scripts/genesis/` | Pipeline (genesis-pipeline.js, soul-extractor.js) |

### Quick Reference
| Task | Location |
|------|----------|
| Create simulation | `node /ehg/scripts/genesis/genesis-pipeline.js create "seed"` |
| Ratify simulation | `POST /api/genesis/ratify` |
| Query patterns | `EHG_Engineer/lib/genesis/pattern-library.js` |
| Run quality gates | `EHG_Engineer/lib/genesis/quality-gates.js` |
| Soul extraction (Stage 16) | `ehg/scripts/genesis/soul-extractor.js` |
| Production gen (Stage 17) | `ehg/scripts/genesis/production-generator.js` |

### Full Documentation
- Implementation guide: `docs/architecture/GENESIS_IMPLEMENTATION_GUIDE.md`
- Quick reference: `docs/reference/genesis-codebase-guide.md`

## Schema Key & Constraint Traps (quick_fixes / adam_task_ledger / chairman_ratifications)

**quick_fixes**: `id` IS the key and holds the literal string `QF-YYYYMMDD-NNN` (e.g. `QF-20260907-188`) -- there is no `qf_key` column. Filter dedup/lookup queries on `id`; use `title`/`description` via `ilike` for fuzzy SEARCH only, never as a join/match key. A query selecting a nonexistent `qf_key` column errors at PostgREST, the client sees `data: null`, and a bare `if (data && data.length)` guard prints nothing -- reading as "no existing QF" while the query never ran. (`lib/learning/feedback-clusterer.js`'s title-similarity clustering is a deliberate exception -- it groups by title for clustering, not for keying, and must not be "fixed".)

**quick_fixes.disposition** IN (`premise_resolved`, `premise_unverified_stale`, `duplicate_of`, `re_verified`, `promoted`).

**adam_task_ledger.status** IN (`open`, `in_progress`, `blocked`, `done`, `cancelled`) -- there is no `closed` value.

**chairman_ratifications.id** is a UUID column -- Postgres has no `ilike`/`~~*` operator for `uuid`, so an `ilike` filter on it errors ("operator does not exist: uuid ~~* unknown"). Match on `id` via `eq` (full UUID) or read rows and filter client-side by string prefix for a short-form citation.

---

*Generated from database: 2026-09-11*
*Protocol Version: 4.4.1*
*Source of truth: leo_protocol_sections (section_type=governance_strategic_hierarchy, builtin_agent_integration, pattern_search_guide, ai_quality_russian_judge, pr_size_guidelines, governance_chairman_ceo_roles, database_column_reference, migration_tier_policy_detail, sub_agent_routing_table_detail, infrastructure, protocol_lint_tooling, genesis_codebase_detail, cascade_invalidation_system, db_ops_protocol, qf_lifecycle_reconciliation, queue_ranking_unified, sub_agent_config, gate_retrospective_invariants, quick_fixes_schema_traps, solomon_consultation_protocol). Do not hand-edit — edit the DB section and regenerate.*
