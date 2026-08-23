<!-- file_content_hash: b8947bb3616d3d86 -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_COORDINATOR_MANUAL.md — Coordinator Manual (how-to companion)

**Generated**: 2026-08-23 12:18:25 AM
**Protocol**: LEO 4.4.1
**Purpose**: How-to procedures lifted out of the role contract — dispatch mechanics, gauge/count verification steps, loop-registry operating detail
**Load when**: At the MOMENT OF DOING the procedure — not at session start

> This companion carries PROCEDURE. The RULES that govern these procedures stay in CLAUDE_COORDINATOR.md and are in force whether or not this file is read.

---

## Coordinator Manual — Blocked-claim resolution & gauge-integrity procedures

## Blocked-claim resolution — the coordinator OWNS resolving worker blocks (chairman directive 2026-06-24)

When a worker signals a BLOCKED claim (a dependency / credential / gate / migration step it cannot self-complete), the worker STAYS on that SD and coordinates with YOU — it does NOT hop to a different SD. You own resolving the block:
1. DUE DILIGENCE FIRST — read the PR / migration SQL / gate output / dependency state yourself; gather whatever you need.
2. DECIDE + APPROVE within your lane — tell the worker how to proceed and give EXPLICIT approval. For a MIGRATION: verify it is safe — e.g. purely ADDITIVE (CREATE-only; no ALTER/DROP/data-mutation of existing objects) — then APPROVE the worker to apply it themselves. The worker applies WITH your sign-off; you never blind-approve without the read, and you do NOT apply a prod migration yourself in the worker place.
3. ESCALATE ONLY what you genuinely cannot resolve, and via the chain COORDINATOR -> ADAM -> CHAIRMAN. Never skip to the chairman: a pre-authorized / operational step (e.g. an additive migration) is YOURS to approve after due diligence, not a chairman question. The chairman is the last resort, reached only through Adam.

Canonical SSOT: docs/protocol/fleet-coordinator-and-worker-behavior.md ("Blocked-claim resolution protocol"). Worker side: fleet-worker-loop-directive.md loop-rule 4b. Adam relay: adam_role_contract.
### Gauge-integrity challenge (chairman-directed, verbal 2026-07-19 — standing pre-dispatch control)

Before acting on any Adam-sourced count or queue gauge (belt sizes, unpromoted totals, backlog percentages), CHALLENGE the number: (a) exact head-count (`{ count: 'exact', head: true }`) or a capped row-fetch? A gauge reading exactly 1000 is presumed truncated (live incident 2026-07-19: probe reported 1000 — the PostgREST cap — true count 1495). (b) plan-of-record-scoped, or raw table-wide? (c) deduped vs origin/main / done-state? This is the symmetric twin of Adam KPI-3 (independently recompute coordinator gauges) — bidirectional verification, no correlated blindness. count=null renders 'unavailable', never 0 (a missing relation is a measurement failure, not a healthy zero). Mechanism: lib/db/fetch-all-paginated.mjs (fetchAllPaginated / assertNotCapTruncated / renderCount) + the enumerated ledger docs/audits/count-truncation-inventory.json. Provenance: SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-8; Solomon verdict db4b2292.

(d) did the QF term's DEFINITION change recently, not just its value? The belt gauge in duty 5 above (`belt=N ... (N SD + M QF)`) sums the SD-dispatchable count with a QF count. As of SD-LEO-INFRA-QF-SUPPLY-PREDICATE-AUTO-START-001 (2026-08-15), the QF term is `countAutoStartableQuickFixes` — the SAME strict predicate the worker's own /checkin self-claim path runs (excludes stale >3d, `factory_lane`, chairman-gated, TIER3_RISK_RE keyword matches, and fixture rows), not the looser unclaimed+status='open'-only count `lib/governance/qf-mint-gate.mjs`'s demand gauge still uses. Measured live the day this shipped: the old, looser count read 173; the new, accurate count read 0. A belt reading that drops sharply right after this SD merged is the fix taking effect — the prior reading was silently counting QFs no worker could actually claim — not a belt collapse. A QF term that stays nonzero-but-small thereafter is the real, accurate signal to act on (or to feed back to Adam as sourcing demand); do not "correct" it back toward the old inflated number.



---

*Generated from database: 2026-08-23*
*Protocol Version: 4.4.1*
*Source of truth: leo_protocol_sections (section_type=coordinator_manual). Do not hand-edit — edit the DB section and regenerate.*
