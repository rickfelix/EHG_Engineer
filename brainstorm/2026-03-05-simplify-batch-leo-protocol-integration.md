# Brainstorm: Integrating /simplify and /batch Commands into the LEO Protocol

## Metadata
- **Date**: 2026-03-05
- **Domain**: Protocol
- **Phase**: Discovery
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: None (internal protocol improvement)

---

## Problem Statement

The LEO protocol has a mature build cycle (LEAD→PLAN→EXEC), scoring (/heal), and learning (/learn), but lacks a formal **operational maintenance layer**. Two specific gaps:

1. **/simplify** exists as a code cleanup command but is positioned as "optional Step 0.6" in /ship. Agents routinely skip it under AUTO-PROCEED. It's session-scoped only and never addresses legacy code debt.

2. **/batch** doesn't exist as a command despite 10+ ad-hoc batch scripts sharing common patterns (query DB → iterate → process → report). These scripts handle handoff acceptance, child SD completion, vision rescoring, and more — but with no unified interface, no common dry-run semantics, and no DB logging of operations.

## Discovery Summary

### Current /simplify State
- Full command definition at `.claude/commands/simplify.md`
- Database-driven rules in `leo_simplification_rules` table
- Session-scoped (files changed since origin/main)
- Three confidence tiers: auto-apply (≥95%), suggest (≥80%), manual review (≥60%)
- Integrated with /ship as optional Step 0.6
- Plugin bridge supports Claude Opus reasoning when available

### Current Batch Script Landscape
| Script | Purpose |
|--------|---------|
| `batch-accept-all-valid-handoffs.mjs` | Accept all pending handoffs across types |
| `batch-accept-pending-handoffs.mjs` | Accept LEAD→PLAN handoffs specifically |
| `batch-complete-child-sds.js` | Force-complete children of an orchestrator |
| `batch-rescore-manual-overrides.js` | Rescore manual vision overrides via Ollama |
| `batch-rescore-round1-children.js` | Rescore Round 1 children |
| `batch-rescore-round2-children.js` | Rescore Round 2 children |
| `batch-update-handoff-table-refs.cjs` | Update handoff table references |
| `batch-test-completed-sds.cjs` | Test completed SDs |
| `batch-test-completed-sds-real.cjs` | Real batch testing with monitoring |
| `generate-stage-dossiers-batch.js` | Batch generate stage dossiers |

Common pattern: All use Supabase queries, iterate results, process each, report success/fail counts. Some support `--dry-run`.

### Affected Workflows
- **EXEC→Ship transition** (where /simplify lives today)
- **Orchestrator management** (batch handoff acceptance)
- **EVA scoring** (batch rescore)
- **General codebase maintenance** (no protocol layer exists)

## Analysis

### Arguments For
1. **LEO has no maintenance mode.** Build, score, learn — but no "operate on the fleet at scale." /batch fills this gap.
2. **/simplify enforcement is nearly free.** The command exists, works, and just needs the "optional" escape hatch removed. Immediate code quality improvement.
3. **The 165 broken ESM scripts** (documented in MEMORY.md) are a textbook /batch use case — controlled sweep with auditability vs. 165 individual PRs.
4. **/batch amplifies /heal.** Instead of per-SD vision scoring, a single session could sweep the entire scored backlog.
5. **Track-level operations.** The A/B/C track system produces SDs with shared patterns. /batch enables track-level transformations (e.g., PR #1818 injected capability context into all Stage 0 scanners — a /batch use case).

### Arguments Against
1. **Protocol surface area risk.** Adding operational tooling to the protocol layer adds failure modes to the most sensitive system component.
2. **Thin wrapper illusion.** A unified /batch interface over heterogeneous scripts creates false safety — operators assume uniform error handling when each script has unique failure modes.
3. **No gate metric for /simplify.** Making it mandatory without a measurable quality metric in gate validators means it's "theater" — adding latency with no signal.
4. **Implicit serialization guard.** Ad-hoc manual scripts are safe because they run one at a time. Automation removes that guard.
5. **Session-scope is a feature, not a bug.** Touching legacy code during a live EXEC phase causes gate drift and unexpected diffs.

## Protocol: Friction/Value/Risk Analysis

| Dimension | /simplify | /batch | Combined |
|-----------|-----------|--------|----------|
| Friction Reduction | 6/10 | 8/10 | **7/10** |
| Value Addition | 5/10 | 9/10 | **7/10** |
| Risk Profile | 2/10 | 6/10 | **4/10** |

**Decision Rule**: Implement if (Friction + Value) > Risk * 2
- /simplify: 11 > 4 → **Implement**
- /batch: 17 > 12 → **Implement** (with caution)
- Combined: 14 > 8 → **Implement**

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. Protocol-vs-tooling conflation — /simplify and /batch are operational conveniences, not protocol primitives. Grafting them into the protocol layer adds surface area to the most sensitive part of the system.
  2. "No unified interface" diagnosis misidentifies the problem — it's a tooling gap, not a protocol gap. A thin wrapper over heterogeneous operations creates false safety.
  3. Session-scope of /simplify may be intentional design, not a limitation — agents may correctly assess the risk.
- **Assumptions at Risk**:
  1. "Agents skip /simplify because it's optional" — the real reason may be that no gate checks for simplification quality. Without a metric, mandatory /simplify is theater.
  2. "A /batch command would reduce ad-hoc sprawl" — the sprawl may be a symptom of bulk operations not being modeled as first-class SDs.
  3. "Backward compatibility can be managed" — several scripts have implicit dependencies on execution order and Supabase row state.
- **Worst Case**: /batch bulk-advances handoffs, silent Supabase schema errors cause writes to fail silently, 3 SDs enter zombie state (in-memory says "advanced" but DB disagrees), no recovery path exists, RCA agents investigate the wrong layer.

### Visionary
- **Opportunities**:
  1. /batch transforms LEO from a build-only protocol into a **fleet management system** — ad-hoc scripts converge into reusable, auditable commands with operational memory.
  2. /simplify as mandatory pre-commit check closes the loop between code quality intent and enforcement — quality gate with teeth, like /heal for vision scores.
  3. Combined /batch + /heal gives LEO a **self-maintenance mode** — periodic protocol hygiene as a single command rather than manual multi-session effort.
- **Synergies**:
  - /batch amplifies /heal (sweep entire scored backlog in one session)
  - /simplify reinforces PR size discipline (≤100 LOC advisory becomes structural)
  - /batch connects to A/B/C track system (track-level transformations)
  - /simplify + /batch solves the 165 broken ESM scripts (controlled sweep with auditability)
- **Upside Scenario**: LEO becomes self-improving. /batch can be pointed at the protocol scripts themselves, applying /simplify to the orchestration layer, identifying patterns in failed gate runs, surfacing them to /learn. The protocol's own codebase becomes subject to the same quality discipline it enforces on application code.

### Pragmatist
- **Feasibility**: 4/10 overall (split: /simplify enforcement = 2/10 difficulty, /batch unification = 6/10 difficulty)
- **Resource Requirements**:
  - /simplify: 1 engineer, 2-4 hours. Update /ship protocol, add PreToolUse hook enforcement.
  - /batch: 1 engineer, 3-5 days. Dispatcher script (~150-200 LOC), common argument parser, dry-run enforcement, documentation.
- **Constraints**:
  1. Audit all 10+ batch scripts for argument signatures, exit codes, and output formats before building dispatcher.
  2. Mandatory dry-run mode — these scripts operate on the database. Misrouted commands can corrupt SD state.
  3. Protocol adoption requires documentation in CLAUDE_EXEC_DIGEST.md — agents won't discover undocumented commands.
- **Recommended Path**: /simplify enforcement first (days 1-2), then /batch dispatcher for top 3-4 scripts (days 3-7), then expand incrementally (week 2-3). Do not big-bang rewrite. Total: ~2 weeks for solid v1.

### Synthesis
- **Consensus Points**: Two-phase approach (simplify first, batch second). Dry-run is non-negotiable. Script audit is a prerequisite.
- **Tension Points**: Protocol layer vs. tooling layer placement. Silent failure amplification vs. fleet maintenance power. Whether agents skip /simplify correctly or not.
- **Composite Risk**: Medium

## Open Questions
1. Should /simplify have a gate metric (e.g., "simplification compliance score") to give enforcement teeth?
2. Should /batch be a protocol phase or a separate tooling layer outside LEAD→PLAN→EXEC?
3. Should bulk operations be modeled as SDs themselves (Challenger's alternative) rather than a new command?
4. What is the right concurrency model for /batch? Serial-only (safe) or controlled parallelism (fast)?

## Suggested Next Steps
1. **SD-A (Quick Win)**: Enforce /simplify in /ship — remove "optional" qualifier, add hook enforcement. ~2-4 hours.
2. **SD-B (Build)**: Create /batch command — audit existing scripts, build dispatcher with dry-run enforcement, route top 3-4 highest-frequency scripts first, expand incrementally. ~2 weeks.
3. Consider: Add simplification quality metric to gate validators (addresses Challenger's "theater" concern).
4. Consider: Model /batch operations as a "MAINTAIN" mode in LEO lifecycle documentation.
