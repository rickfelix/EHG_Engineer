---
category: Reference
status: Draft
version: 1.0.0
author: Claude Code (Alpha-4, Fable seat)
last_updated: 2026-07-10
tags: [open-loop-sweep, audit, phase-2-adjudication, closure-map, chairman-directed]
---

# Open-Loop Sweep — Closure Map (Phase 2 deliverable)

**Inputs**: Phase-1 GATHER packet (`open-loop-evidence-packet.md`, PR #5821, Golf-2, 9 surfaces, cited) consumed cold; assignment brief (coordinator scratchpad, Phase-2 section) followed verbatim; Adam's Surface-9 reframe applied (the email channel is ALIVE — the open question is whether CONTENT surfaces the pending queue, and whether the 79 rows are chairman-actionable vs machine noise). Supersedes the interim register in `open-loop-adjudication-phase2.md` (PR #5837) where they differ — specifically the S9 "channel dead" phrasing, corrected below.

**Verdict legend**: REAL-OPEN (owner + close action + effort tier + stage) · CLOSED-UNDOCUMENTED (close the record, evidence cited) · OBSOLETE (superseded — by what) · NOT-FOUND (briefed item does not exist — no loop) · STANDING (dated/triggered watch, not yet due). **Tier enum extended beyond the brief's Sonnet/Fable/chairman-only where the close action is not build-work**: `Adam-disposition` (per-item judgment in Adam's queues) and `coordinator-direct` (a minutes-scale coordinator action) — declared here rather than silently used.

**Staging deviations, acknowledged**: two Sonnet-tier items are staged inside the window rather than next week's belt — S3's `8b9782a5` reachability verification (185h-stale resurfacing loop) and S9's predicate/SLA surfacing SD (it gates the Discovery run) — deliberate exceptions to the brief's staging rule, with rationale in their rows.

**Window rule applied**: Fable-tier closes before Sunday night or go to park-or-pay; Sonnet-tier feeds next week's belt. **Finding: zero REAL-OPEN loops require Fable-tier effort** — every close action below is Sonnet-tier mechanics, a coordinator direct action, or a chairman-only judgment. Nothing needs to be parked for lack of Fable capacity.

---

## Closure map

### Surface 1 — feedback/harness_backlog (2,320 rows, all status=new)

| Loop | Verdict | Owner | Close action | Tier | Stage |
|---|---|---|---|---|---|
| The backlog as a mechanism (0 closures ever; 1,784/2,320 are completion-flag witness residue burying 516 actionable reports) | **REAL-OPEN (systemic → class C1)** | Adam + coordinator co-author | Drain-policy SD: witness rows to a terminal category at write time; 3-occurrence fingerprint promotion to QF for the rest; age-out for informational rows | Sonnet | Next-week belt (SD) |
| Fable-prompt audit `b1e50a31` (chairman-commissioned research output, 1.5h old at gather) | REAL-OPEN | Adam | Per-item disposition — it is a finished research artifact awaiting routing, not a bug | Adam-disposition | This window |
| Doc-drift proposal series (6 near-identical rows since 06-28, category `adam_doc_drift` — a strict harness_backlog filter misses it) | REAL-OPEN (recurring) | Adam | ONE disposition on the series; the 6x recurrence itself is class-C1 evidence | Adam-disposition | This window |
| GH-health advisory (briefed item) | **NOT-FOUND** (no loop exists) | — | None — searched across all 6,995 feedback rows, all categories/statuses; the briefed item does not exist | — | — |
| The 7 cited 30d+ items (dedup-gap, complete-quick-fix hang, coordination-channel auto-ack, re-claim bug, RCA false-positives, 2 worktree-reaper data-loss items) | VERDICT PENDING SWEEP — several are plausibly CLOSED-UNDOCUMENTED by later work (the reaper pair predates subsequent reaper hardening; the auto-ack row matches the since-fixed read-stamped family) but closure must be CITED, not assumed | Any Sonnet seat | One bounded enumeration sweep of the 536 non-witness rows, dedup-by-done-state against shipped SDs/QFs; close with citations, promote true leftovers | Sonnet | Next-week belt (first item) |

### Surface 2 — 46 coordinator-review SLA "breaches"

| Loop | Verdict | Owner | Close action | Tier | Stage |
|---|---|---|---|---|---|
| The 46 unacked review requests (2026-06-10→07-07) | **OBSOLETE** — superseded by the evidence in the packet's own caveat: median-9-minute worker sessions cannot answer requests that outlive them, and real replies never stamp `acknowledged_at` (see class C6) | Coordinator | One batch close of the historical rows | Sonnet | Low, next week |
| Review requests keep targeting dead addressees | REAL-OPEN (small) | Coordinator | QF: target live-heartbeat sessions only, or re-route on addressee death | Sonnet | Next-week belt |

### Surface 3 — Promised-fixes-unverified (reachability class)

| Loop | Verdict | Owner | Close action | Tier | Stage |
|---|---|---|---|---|---|
| `8b9782a5` CONFIRMED DEPLOY/REACHABILITY GAP — resurfacing unacked at 185h AFTER its fix SD completed | **REAL-OPEN** | Adam | Verify the singleton-refresh fix actually REACHES its running consumer (fix-shipped-symptom-recurs ⇒ check reachability before logic); then disposition the ledger row with the evidence | Sonnet verify + Adam disposition | Prompt (this window) |
| `c7f9b144` CHECKIN-OWN-CLAIM fix merged mid-session (Golf-3 predates merge) | Instance: **OBSOLETE** (that session has since rotated; the merged fix reaches every new session). Class: REAL-OPEN → class C3 | Coordinator co-author | Class machinery QF (see C3) | Sonnet | Next-week belt |

### Surface 4 — Retro action items never promoted

| Loop | Verdict | Owner | Close action | Tier | Stage |
|---|---|---|---|---|---|
| Ship-witness cluster (`b119bba1` mergeToMain observation, `a50dd499` actor columns, `98e6619a` escapeAuth substrate) | REAL-OPEN (coherent trio) | Adam (source) | ONE SD covering the three | Sonnet | Next-week belt |
| Remaining 42 unpromoted items | VERDICT PENDING SWEEP (same sweep as S1's 536; same dedup-by-done-state rule) | Any Sonnet seat | Fold into the S1 enumeration sweep | Sonnet | Next-week belt |
| 8 byte-identical template-boilerplate items | **OBSOLETE** (template artifact, not commitments) | Any seat | Optional: fix the retro template emitting them | Sonnet | Low |
| Root cause: retro items are "promoted" into the S1 sink and die | REAL-OPEN → class C1 (no separate machinery needed once C1 lands) | Adam + coordinator (via the C1 drain-policy SD row above) | Covered by the drain-policy SD | Sonnet (within C1 SD) | Next-week belt (with C1) |

### Surface 5 — Worker-signal rows (3,133; 422 unacked)

| Loop | Verdict | Owner | Close action | Tier | Stage |
|---|---|---|---|---|---|
| The surface as a whole | **CLOSED-UNDOCUMENTED** — the packet's own triage IS the closure evidence: 0 confirmed unactioned-ask breaches; real asks get fresh targeted replies within minutes; `acknowledged_at` is not a reply signal (class C6) | Any seat | One doc line in the fleet-coordination reference stating ack-null ≠ unreplied | Sonnet | Low |
| `280dc183` ("OWNERSHIP CHECK before I act", 15:22Z, too fresh at gather) | VERDICT PENDING (2-minute spot-check) | Coordinator | Spot-check whether it was answered; near-certain yes given the 7/8 base rate | coordinator-direct | Today |
| `b7024d14`, `bed6e7d0` (packet's two "ambiguous/likely self-resolved" asks) | **CLOSED-UNDOCUMENTED (presumed)** — packet's own review judged them likely self-resolved; fold into the same coordinator spot-check for the citation | Coordinator | Same 2-minute spot-check batch as `280dc183` | coordinator-direct | Today |

### Surface 6 — Solomon ledger (149 pending)

| Loop | Verdict | Owner | Close action | Tier | Stage |
|---|---|---|---|---|---|
| 149 pending dispositions (healthy age profile: zero >14d) | REAL-OPEN **by design** — this queue is Adam's standing per-item disposition duty, never bulk-ackable | Adam | Continue per-item dispositions | Adam-disposition | Ongoing |
| Resurface pump caps at `.limit(50)` < 149 depth | REAL-OPEN | Any seat | QF: cursor/round-robin so the full queue cycles | Sonnet | Next-week belt |

### Surface 7 — WATCH items

| Loop | Verdict | Owner | Close action | Tier | Stage |
|---|---|---|---|---|---|
| Gemini 3.5 GA → J2A re-run | **STANDING** (trigger not fired; not a delinquent loop) | Adam | On trigger (GA or Flash pricing stabilizes): re-run the J2A A/B harness | Sonnet (on trigger) | On trigger |
| Window-close posture reversion (4 postures, due Sun Jul 13 night PT) | REAL-OPEN (dated) | Coordinator | Set a dated tickler/cron NOW — a hard-dated commitment living only in memory is precisely this sweep's target class | coordinator-direct | Before Sunday |
| Sample-2 (DataDistill v2) taste verdict — awaiting chairman since 07-07 | REAL-OPEN | **Chairman-only** | Include in the groomed decisions email (S9); explicitly feeds Sunday park-or-pay | chairman | This window |

### Surface 8 — Unconfirmed commitments (715 matches; 8 triaged)

| Loop | Verdict | Owner | Close action | Tier | Stage |
|---|---|---|---|---|---|
| 7 of 8 triaged commitments | **CLOSED-UNDOCUMENTED** — packet cites topically-matched follow-through for each (minutes-to-hours latency) | — | None; evidence already in packet | — | — |
| `a80daa6b` "unfence Child B the moment A lands clean" | REAL-OPEN (conditional) | Coordinator | Check Child A's state; if landed clean, unfence + direct-assign B — a 2-minute action | coordinator-direct | Today |
| ~707 untriaged matches | NOT SWEPT (coverage map) — sample closure rate (7/8) does not justify an exhaustive pass while C1/C9 sinks exist | — | None now | — | — |
| Role-slot sender rotation defeats commitment tracking | REAL-OPEN → class C5 (observation only; tooling deferred) | Coordinator (class C5 custodian) | Revisit only on a real dropped commitment; no build now | Sonnet (if ever built) | Deferred |

### Surface 9 — Chairman decision queue (REFRAMED per Adam: channel alive; content is the question)

Fresh verification run for this map (2026-07-10 ~17:20Z): `chairman_pending_decisions` = 79 rows → 75 `flag_review` + 4 `chairman_approval`. Of the 75 flag_review rows, **66 are one repeating machine-telemetry title — "Fleet dormancy: N worker(s) armed a wakeup that never fired"** — auto-filed detector output, not decisions. The remaining 9: at least one already-fixed harness bug (checkin-own-claim — fix merged 07-10), assorted harness pattern notes, and ONE genuinely chairman-relevant security item (MarketLens `/feedback` prompt-injection surface, Solomon C#2 F4 — **CLOSED-WITH-CITATION 2026-07-10T22:32Z**: the immediate consumer-side exclude-patch shipped via SD-FDBK-FIX-LIVE-PROMPT-INJECTION-001, PR #5857 (merged) — `isUntrustedOrigin()` + `sanitizeUserText()` wired into all 6 confirmed injection-risk call sites. The fuller pre-probe injection floor remains a required follow-on SD, not yet filed).

| Loop | Verdict | Owner | Close action | Tier | Stage |
|---|---|---|---|---|---|
| 4 pending `chairman_approval` rows (`f83dde76` surfaced 07-06; `241eaba4`, `d2c84ce1`, `449ec12b` with zero surfacing evidence) | **REAL-OPEN** | Coordinator groom → **Chairman decides** | Groomed decisions email on the (alive) on-demand channel: the 3 unsurfaced approvals + the S7 sample-2 verdict; one email per action item, none 23:00–05:00 ET | chairman | Today/this window — **now gates the Discovery run** (see C4 note) |
| `9868fa64` (the packet's 5th pending row, Stage-23 test-fixture gate) | **CLOSED** — resolved 2026-07-10T16:36:24Z by the console assessment's authorized Park probe (status left the pending queue; that probe's parked-as-`approved` mis-status is itself the defect fixed by QF-20260710-291, whose backfill re-statuses the row to `cancelled` on apply) | — | None — recorded here so the packet's 5-row count reconciles to this map's fresh 4-row count with citation, not silence | — | — |
| 66 dormancy-telemetry rows sitting in the chairman view | **CLOSED-WITH-CITATION 2026-07-11T02:36Z** — write-time audience routing shipped via SD-LEO-INFRA-TELEMETRY-AUDIENCE-ROUTING-001, PR #5877 (merged) + scope-drift correction PR #5881 (merged). `emitFeedback()` now routes `category='fleet_dormancy'` writes through an atomic UPSERT RPC (`record_telemetry_occurrence`) that collapses same-day repeats into ONE aggregate row (`occurrence_count` increments) instead of one row per firing — regardless of the caller's own dedup_key, since the caller's prior hourly-bucket mitigation (`scripts/stale-session-sweep.cjs`) was proven insufficient by this incident. **Scope note (LEAD-phase risk-agent, deliberate narrowing):** delivered scope is `fleet_dormancy` only, NOT the full ~20-writer ALL-PATHS framing this row originally implied — the ~15 direct `chairman_decisions` table writers are owned by sibling SD-LEO-INFRA-CHAIRMAN-DECISION-SURFACING-001 (already shipped, PR #5859). Read-side `chairman-actionable.mjs` needed no changes — its existing `TELEMETRY_DECISION_TYPES` exclusion already covered this class at the decision_type level. | Sonnet (Golf-4) | Closed | Sonnet | Closed |
| Remaining 9 flag_review rows | VERDICT PENDING SWEEP (fold into S1 sweep; checkin-own-claim row is CLOSED-UNDOCUMENTED — fix merged; MarketLens F4 row is **CLOSED-WITH-CITATION** — immediate exclude-patch shipped, SD-FDBK-FIX-LIVE-PROMPT-INJECTION-001 / PR #5857) | Sonnet seat | Same enumeration sweep | Sonnet | Next-week belt |
| `shouldAutoEscalate` predicate only fires on `raised_by='adam'` — stage-gate inserts structurally bypass it | **CLOSED-WITH-CITATION 2026-07-10T23:11Z** — `shouldAutoEscalate` widened so `blocking===true` escalates for ANY raiser (`lib/chairman/record-pending-decision.mjs`); adam+session_question path preserved. Shipped via SD-LEO-INFRA-CHAIRMAN-DECISION-SURFACING-001, PR #5859 (merged). ALL-PATHS producer enumeration (16 producer classes incl. the Stage-0 ready-venture pause fixture) covered by `tests/unit/chairman/all-paths-producers.test.js` | Adam (source) | Done | Sonnet | Closed |
| SLA enforcer/timeout modules have zero production call sites (24h fallback everyone assumes never fires) | **CLOSED-WITH-CITATION 2026-07-10T23:11Z** — new scheduled runner `scripts/cron/chairman-decision-sla-sweep.mjs` + `.github/workflows/chairman-decision-sla-cron.yml` dispatches `chairman-sla-enforcer.js::enforceDecisionSLAs` notify-only (`blockOnViolation:false`) plus a dedicated blocking-row grace-period sweep (the enforcer alone exempts blocking rows); `stage_gate` SLA key added to `DEFAULT_SLA_MATRIX` (feedback `3acb9cdd`). `chairman-decision-timeout.js` deliberately left unscheduled (superseded by the enforcer — arming both would double-escalate). Shipped via SD-LEO-INFRA-CHAIRMAN-DECISION-SURFACING-001, PR #5859 (merged) | Adam (source, same SD) | Done | Sonnet | Closed |
| Hourly exec-summary "dead 12 days" | **OBSOLETE as a defect** — superseded by the chairman's own decision to disable the hourly summary in favor of on-demand decision emails (script header + Adam's reframe). The real loop was never the channel; it is the two rows above | — | None | — | — |

**Why S9 gates the Discovery run**: as of PR #5825, every 'ready' Stage-0 venture pauses behind a real PENDING chairman decision — the machine can no longer approve for him. With the escalation predicate narrow and the SLA machinery dormant, a ready venture's gate decision has no reliable path to the chairman, and the pause would read as a regression of the fix. The surfacing SD is the run's third leg alongside the two FIX SDs.

---

## Negative-space pass — recurring loop-classes (missing machinery, not missing effort)

**C1 — WRITE-ONLY SINK.** Evidence trail: 2,320/2,320 harness_backlog rows still `new` (zero closures in the table's life); retro action items "promoted" into the same table and dying there (S4 → S1 cross-confirmation ids `9abb187a`, `a395fbc3`); the doc-drift proposal filed 6 times with no disposition. Machinery fix: closure is a WRITE-TIME design property — witness records route to a terminal state at creation; actionable records get recurrence-fingerprint promotion (the 3-occurrence rule that already exists for worker signals, extended to this table); everything gets an age-out.

**C2 — DORMANT MACHINERY (registered-but-never-dispatched).** Evidence trail: `chairman-decision-timeout.js` + `chairman-sla-enforcer.js` — zero call sites outside their tests; nursery resurfacing dead code (Delta-C8, no production caller); the previously-catalogued registered-verifier-never-dispatched gap. Machinery fix: a wiring census + CI liveness check — every module registered as periodic/enforcement must name its dispatcher, and a test asserts the dispatcher references it (the same witness discipline the ship lane already uses).

**C3 — FIX-CANT-REACH-RUNNING-SESSION** (the read-stamped family sibling the brief asked for). Evidence trail: WAKE-ON-DIRECTIVE (3 incidents before its fix — the named precedent); `c7f9b144` checkin-own-claim (fix merged mid-session, running session predates it); `8b9782a5` singleton-refresh (fix completed, symptom resurfacing 185h later, reachability never verified); reproduced live during this adjudication — the adjudicating session's own tooling warned "12 commits behind origin/main" twice mid-loop. Machinery fix: (a) stale-checkout detection + self-refresh at role-session loop entry; (b) a reachability-verification step in the completion tail for any fix whose consumer is a long-lived session (DB status `completed` ≠ fix reaching its consumer).

**C4 — ONE-PATH GOVERNANCE (predicate narrowness).** Evidence trail: `shouldAutoEscalate` covers only `raised_by='adam'` while stage-gate machinery inserts bypass it; `stage_creates_decision(0)` returning false nearly no-opped today's chairman-gate fix (caught at LEAD); Solomon's structural lesson from the Stage-0 ledgers ("new governance keeps landing wired to ONE path while three run ungoverned"). Machinery fix: every governance predicate ships with an ALL-PATHS acceptance clause + a coverage test enumerating its producers — already Solomon-recommended for Stage-0 SDs; generalize it.

**C5 — ROLE-SLOT IDENTITY ROTATION.** Evidence trail: S8 — same-sender continuity checks systematically under-detect follow-through because coordinator/Adam/orchestrator `sender_session` rotates per relaunch. Machinery direction: durable role-keyed (not session-keyed) commitment records. Deliberately DEFERRED: sample shows 7/8 commitments honored; build this only when a real dropped commitment (not a detection artifact) appears.

**C6 — ACK-STAMP FALSE METRICS.** Evidence trail: S5 (422 "unacked" rows, 0 confirmed breaches — replies arrive as fresh messages); S2 (46 "breaches" largely explained by the same semantics plus dead addressees). Machinery fix: stop treating `acknowledged_at IS NULL` as an SLA metric anywhere; if reply-tracking is ever needed, correlate by `correlation_id`, not ack stamps.

**C7 — MACHINE TELEMETRY IN HUMAN QUEUES.** Evidence trail: 66/75 of the chairman's pending flag_review rows are one auto-filed detector title; precedent: fixture ventures leaking into the live chairman queue/email (QF-20260703-236). Machinery fix: audience routing at write time — auto-filed telemetry aggregates into dashboards/counters, never lands row-per-event in a human decision view.

---

## Coverage map (honest)

- **Swept with verdicts**: all 9 packet surfaces adjudicated; S9 re-verified live for this map (79-row split and the 66-row telemetry count are fresh queries, not packet echoes).
- **Sample-based, explicitly NOT exhaustive**: S1's 536 actionable rows and S4's 42 leftover items carry PENDING-SWEEP verdicts (one bounded Sonnet sweep is itself a staged close action); S8's ~707 untriaged matches remain untriaged by explicit decision; S5's classification relies on the packet's 92-row review.
- **Not swept at all**: surfaces beyond the brief's 9 (e.g., EHG-repo issue trackers, cron/workflow failure logs) — out of brief scope, noted for a future sweep if the chairman wants one.
- **Constraint compliance**: no record was acked, dispositioned, or closed during adjudication; every close is routed to its owner above.

## Chairman summary (three sentences)

Of everything the organization left open, only two mechanisms are actually broken — the harness-feedback table is a write-only sink (2,320 filings, zero ever closed) and your decision queue's plumbing (narrow escalation predicate + never-wired SLA enforcer + telemetry noise drowning 4 real approvals), which as of today's Stage-0 fix also gates the Discovery run. Most alarming-looking numbers dissolve on inspection: worker signals and commitments show 0 and 1 confirmed drops respectively, and 66 of your 79 "pending decisions" are one repeating machine-telemetry title. Seven named systemic classes with machinery-shaped fixes are ready to become next week's belt; nothing found requires Fable-tier work before Sunday.
