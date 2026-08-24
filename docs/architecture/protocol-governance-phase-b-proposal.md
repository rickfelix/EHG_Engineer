# Protocol Governance Phase B Proposal

**SD:** SD-LEO-INFRA-PROTOCOL-GOVERNANCE-PACKAGE-001 (FR-3)
**Status:** STAGED — awaiting chairman decision. This SD does not execute Phase B below;
it packages the evidence and routes the question.

## Context: what Phase A (this SD) already shipped

FR-1 stages (does not apply) a chairman-gated migration adding `leo_protocol_sections_history`:
a **LOG-ONLY** audit trail on `leo_protocol_sections` (the entire live LEO protocol ruleset,
286 rows, previously with no `created_at`/`updated_at` and no wired audit trail at all — an
existing trigger, `trg_doctrine_constraint_sections`, is confirmed blind for this table). FR-2
fixes two concrete writer-side bugs so future writes carry honest provenance. Phase A **never
blocks a write** — it only observes and records.

Phase B is the next, separate step the original charter envisioned: turning that observation
into **enforcement** — a FREEZE window, a rate cap, and a self-approval ban on the real write
path. This SD does not build Phase B. Three independent LEAD/EXEC-phase reviews (validation-agent,
risk-agent, and a live-testing pass) found that building it now, as originally scoped, would ship
2–3 new instances of the exact defect class this whole SD exists to close: a guard that looks
like it works but cannot actually fire, or fires on a fabricated number.

## The three open questions, with evidence

### 1. The rate cap: two live, contradictory numbers

| Source | Value | As of |
|---|---|---|
| `protocol_constitution` DB table, CONST-007 ("Rate Limiting") | 3 AUTO-tier changes / 24h | seeded 2026-01-22, unchanged since |
| `system_settings.AUTO_RATE_LIMIT` (live, queried 2026-08-24) | `{"max_applied": 50, "window_seconds": 3600}` = 50/hour = 1,200/24h | live today |

These are **400x apart**, both real, both currently authoritative for different pipelines
(CONST-007 governs the `protocol_improvement_queue`/AI-Quality-Judge pipeline; `AUTO_RATE_LIMIT`
governs `is_auto_frozen()`'s sibling freeze/rate machinery from SD-LEO-SELF-IMPROVE-002A). Neither
was ever wired to gate `leo_protocol_sections` writes directly. Hardcoding either number into a
new Phase-B guard would mean either (a) a cap so tight it blocks the live `/learn` applier's
normal cadence (1–2 sections per SD completion, which could plausibly hit 3/24h on a busy day),
or (b) a cap so loose (1,200/24h) it can never fire against any writer that exists today —
functionally decorative.

**The question for the chairman:** which number should govern `leo_protocol_sections` writes
specifically — 3/24h, 50/hour, a new third number, or a different mechanism (e.g., tiered by
`channel`, since `service_role`/automated writes and direct `postgres` writes carry different
risk)?

### 2. The self-approval ban: not implementable as a field comparison

A Postgres trigger sees only the row being written (`NEW`/`OLD`) — it has no external identity
system to check "did the same actor who proposed this change also approve it." The existing
precedent for this exact concept, `trg_doctrine_constraint_sections`, tried to solve it with a
session-level GUC (`app.current_actor_role`) — and that GUC can never be set by a `supabase-js`/
PostgREST caller, so the guard has been silently non-functional for every real write to this
table. Building a second version of the same mechanism would repeat it.

**The proposed alternative, staged here for chairman review, not built:** reframe "self-approval
ban" as **"external approval-artifact reference."** When a write's derived `channel` is
`service_role` (automated) or its `provenance.actor_type` is missing, require
`metadata.provenance.approval_ref` to resolve to a live row in `chairman_ratifications` (the
append-only ledger from SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001) before the write is
allowed to proceed. This is an honest, checkable property — but it proves only that an
independently-audited artifact was **cited**, not that the proposer and approver are actually
different people. That residual gap should be stated explicitly in whatever Phase-B design the
chairman approves, not glossed over.

### 3. The arming precondition: currently unreachable, and why

The literal, original success criterion — "a section edit without a provenance key (or breaching
the 24h cap) REJECTS on the real path" — cannot honestly arm today, for two independent reasons:

- **0/286 pre-existing rows carry a provenance key.** Blocking on missing provenance immediately
  would brick `scripts/protocol/adam-contract-land.mjs` — a real, recurring chairman ceremony
  script, not a one-off — on the very next run after Phase B armed.
- **Two additional live write sites bypass FR-2's fix entirely.** `improvement-appliers.js`'s
  `applyChecklistItemChange` (an unconditional insert) and `applySubAgentConfigChange` (a
  fallback-branch insert) both write to `leo_protocol_sections` without going through
  `sanitizeProtocolSectionPayload()` at all — confirmed by direct code read during PLAN. FR-1's
  audit trigger still observes and logs these writes (Phase A's coverage is unaffected — the
  trigger fires regardless of which application code performed the write), but they will always
  record `provenance_status='missing'` until a **separate, out-of-this-SD's-scope fix** routes
  them through the same sanitizer FR-2 already fixed.

**The proposed arming precondition, staged here, not yet met:** Phase B's blocking enforcement
should arm only once the Phase-A ledger (`leo_protocol_sections_history`) shows **100% provenance
coverage across all observed write channels for a 14-day rolling window** — a measured,
falsifiable precondition, not a calendar date. As things stand today, that precondition **cannot
be satisfied** until the two additional write sites above are also fixed. This proposal
recommends treating that as a **named follow-up item**, not a silent gap: either a small QF/SD
closes those two sites' provenance handling, or the coverage measurement is explicitly redefined
to exclude them with a documented rationale the chairman signs off on.

There is also a hard sequencing dependency: sibling SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001 (same
table, dispatched the same day) plans a bulk row-dedup/reclassification pass. That pass should
complete before Phase B's coverage window starts counting, so its own bulk churn — most of which
is metadata/dedup work the FR-1 `WHEN` clause is already scoped to ignore — doesn't distort the
measurement or trip an armed cap prematurely.

## Options

### Option A — Build the follow-up fixes, then arm Phase B on schedule

Fix the two additional write sites (`applyChecklistItemChange`, `applySubAgentConfigChange`) to
route through the sanitizer, let SSOT-DEDUP-001's bulk pass complete, then measure 14 days of
100% coverage off the live ledger and arm Phase B with a ratified rate-cap number and the
approval-artifact-reference self-approval check.

- **Pro:** Delivers the full governance package the original charter envisioned, honestly and
  incrementally, with each step measured rather than assumed.
- **Con:** Multi-week timeline (14-day measurement window alone), plus at least one more small
  SD/QF for the write-site fixes. Requires the chairman to actually ratify a rate-cap number,
  which is itself a real decision, not a formality.

### Option B — Defer Phase B indefinitely; Phase A's observability is the deliverable

Treat the log-only audit trail (Phase A) as sufficient for now — every write is now attributed
and reviewable, even if none are blocked. Revisit blocking enforcement only if the audit trail
itself surfaces a real incident (e.g., a governing section actually gets clobbered by an
unattributed write) that a human review of `leo_protocol_sections_history` would otherwise have
caught sooner with blocking in place.

- **Pro:** No further engineering investment until there's evidence it's needed; avoids
  over-building governance machinery for a risk that, per the 286-row/6-months-of-history census
  this SD's LEAD phase ran, has not yet materialized as an actual incident.
- **Con:** The doctrine-of-constraint intent behind CONST-001/002/007/009 remains unenforced for
  this specific table indefinitely; a future incident would still have no automated backstop,
  only after-the-fact attribution.

## Recommendation

Option A, but sequenced explicitly and not rushed: fix the two additional write sites as a
small, focused follow-up (low risk, same shape as this SD's own FR-2), let the sibling dedup SD
land, then let the 14-day measurement run for real before asking the chairman to ratify a
specific rate-cap number and approve the approval-artifact-reference design for self-approval.
This keeps Phase A's honest observability as the immediate deliverable while giving Phase B a
real, measured foundation instead of a guessed one. This recommendation is not binding — the
chairman may select either option, a hybrid, or request the two write-site fixes as a
precondition before deciding anything else.

## Routing

This document is delivered as FR-3's evidence package. Per this SD's PRD (FR-3 AC-2), it is
routed to the chairman via `feedback` row `40255115-4a66-4ab0-87d8-42bcdac0b155`
(category=`chairman_decision_capture`, status=`new`, `metadata.doc_path` pointing back at this
file) — not left as a docs/-only artifact awaiting discovery.
