# Vision: /simplify and /batch Integration into LEO Protocol

## Executive Summary

The LEO protocol excels at building new things (LEAD→PLAN→EXEC) and scoring alignment (/heal), but lacks a formal operational maintenance layer. Two commands — /simplify (existing but underutilized) and /batch (nonexistent despite 10+ ad-hoc scripts) — represent the foundation of a "MAINTAIN" mode that transforms LEO from a build-only workflow into a fleet management system.

/simplify enforcement closes the gap between code quality intent and actual enforcement. /batch unification replaces scattered one-off scripts with an auditable, dry-run-safe operational command that enables fleet-level maintenance sweeps.

Together, these commands give LEO the self-maintenance capability it needs to prevent technical debt accumulation at scale.

## Problem Statement

**Who is affected**: LEO protocol operators (Claude Code agents and human engineers) running SDs through the LEAD→PLAN→EXEC pipeline.

**What problem**: Two gaps exist:
1. Code quality degrades because /simplify is optional (Step 0.6 in /ship) and routinely skipped under AUTO-PROCEED. Session-scoped only — legacy debt is never addressed.
2. Bulk operations (handoff acceptance, SD completion, vision rescoring) are performed via 10+ ad-hoc scripts with no unified interface, no common dry-run semantics, and no operational logging. This creates inconsistent error handling, no auditability, and operator friction.

**Current impact**: Technical debt accumulates silently. 165 scripts have the same broken ESM entry point pattern (documented in MEMORY.md). Batch operations require knowing which specific script to run, with what arguments, against which Supabase env vars.

## Personas

### Protocol Operator (Primary)
- **Goals**: Ship clean code through the LEO pipeline efficiently; manage fleet of SDs at scale
- **Mindset**: Values automation, trusts dry-run previews, wants single-command solutions
- **Key activities**: Running SDs through phases, clearing handoff queues, rescoring vision after rule changes, maintaining codebase hygiene

### Chairman (Secondary)
- **Goals**: Visibility into operational health; confidence that the fleet is well-maintained
- **Mindset**: Strategic oversight, wants dashboards not terminal commands
- **Key activities**: Reviewing SD progress across tracks, approving batch operations on the fleet

### Protocol Developer (Tertiary)
- **Goals**: Extend LEO with new batch operations without reinventing the wheel
- **Mindset**: DRY principles, wants a framework to plug new operations into
- **Key activities**: Writing new batch scripts that conform to a standard interface

## Information Architecture

### /simplify Integration Points
- `/ship` Step 0.6 → promoted from optional to enforced (with escape hatch for time-sensitive shipping)
- PreToolUse hook enforcement via `scripts/hooks/pre-tool-enforce.cjs`
- Gate metric: simplification compliance score in gate validator schema
- Database: `leo_simplification_rules` table (existing)

### /batch Command Structure
```
/batch <operation> [--dry-run] [--filter <criteria>] [--concurrency <n>]
```

Operations:
- `accept-handoffs` — wraps batch-accept-all-valid-handoffs.mjs
- `complete-children <parent-sd>` — wraps batch-complete-child-sds.js
- `rescore [--type manual|round1|round2]` — wraps batch-rescore-*.js
- `update-refs` — wraps batch-update-handoff-table-refs.cjs
- `test-sds` — wraps batch-test-completed-sds.cjs
- `simplify-all [--type cleanup|style|logic]` — codebase-wide /simplify sweep

### Data Sources
- `sd_phase_handoffs` — handoff state for batch acceptance
- `strategic_directives_v2` — SD state for batch completion/testing
- `eva_vision_scores` — vision scores for batch rescoring
- `leo_simplification_rules` — simplification rule definitions
- `batch_operation_log` (new) — audit trail for all /batch executions

## Key Decision Points

1. **Protocol layer vs. tooling layer**: Should /batch be a protocol phase (alongside LEAD/PLAN/EXEC) or a separate operational tooling layer? The Challenger perspective argues tooling layer to avoid adding failure modes to the sensitive protocol core.

2. **Mandatory vs. enforced-with-escape**: /simplify enforcement needs an escape hatch for time-sensitive shipping. The question is whether the escape is a flag (`--skip-simplify`) or a gate override with logging.

3. **Serial vs. parallel execution**: Batch operations currently run one-at-a-time (implicit serialization guard). Introducing parallelism requires solving race conditions on shared Supabase state (e.g., two scripts writing to `sd_phase_handoffs` concurrently).

4. **Silent failure amplification**: Supabase returns empty data on schema errors without throwing. Batch operations amplify this — one silent failure becomes N silent failures. Mitigation: mandatory write-verification (read-back after write).

## Integration Patterns

### Existing System Connections
- **/ship**: /simplify moves from optional Step 0.6 to enforced pre-commit gate
- **/heal**: /batch can drive /heal across the entire scored backlog in one session
- **/learn**: /batch completion triggers /learn for operational pattern capture
- **PreToolUse hooks**: Enforce /simplify compliance before /ship proceeds
- **A/B/C Track system**: /batch enables track-level transformations

### New Integration Points
- **`batch_operation_log` table**: Audit trail for all /batch executions (operation, timestamp, item count, success/fail, dry-run flag, operator)
- **Chairman Dashboard**: Surface /batch operation history and /simplify compliance rates
- **sd:next output**: Show /simplify compliance status per SD in queue display

## Evolution Plan

### Phase 1: /simplify Enforcement (SD-A)
- Remove "optional" qualifier from /ship Step 0.6
- Add PreToolUse hook enforcement
- Add `--skip-simplify` escape with mandatory logging
- LOC estimate: ~30-50 lines changed

### Phase 2: /batch Command Foundation (SD-B)
- Build dispatcher with dry-run enforcement (~150-200 LOC)
- Route top 3-4 highest-frequency scripts (accept-handoffs, rescore, complete-children)
- Create `batch_operation_log` table
- Common argument parser and progress reporting
- LOC estimate: ~300-400 lines new

### Phase 3: /batch Expansion (SD-C, future)
- Add remaining batch scripts to dispatcher
- Add `simplify-all` operation for codebase-wide sweeps
- Add concurrency control for safe parallel execution
- Chairman Dashboard integration

## Out of Scope

- Rewriting the underlying batch scripts — /batch is a routing/dispatcher layer, not a rewrite
- Automated scheduling of /batch operations (cron-style) — future enhancement
- /simplify rule authoring UI — rules are managed directly in the database
- Cross-repository /batch operations — scoped to EHG_Engineer only
- Real-time /batch progress streaming to Chairman UI

## UI/UX Wireframes

N/A — /simplify and /batch are CLI commands, not UI components. Chairman Dashboard integration (Phase 3) would surface operation logs as a table view, but that is out of scope for initial phases.

## Success Criteria

1. **/simplify compliance rate reaches 80%+** of shipped SDs within 2 weeks of enforcement (measured via gate validator logs)
2. **/batch dry-run mode** successfully previews all routed operations without DB mutations
3. **Zero zombie SD states** caused by /batch operations (silent write failures caught by read-back verification)
4. **Ad-hoc batch script usage drops 50%+** as operators adopt unified /batch interface
5. **batch_operation_log** captures 100% of /batch executions with full audit trail
6. **New batch operations** can be added by implementing a standard interface (< 1 hour to plug in a new operation)
