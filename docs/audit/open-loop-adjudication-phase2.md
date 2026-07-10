---
category: Reference
status: Draft
version: 1.0.0
author: Claude Code (Alpha-4, Fable seat)
last_updated: 2026-07-10
tags: [open-loop-sweep, audit, phase-2-adjudication, chairman-directed]
---

# Open-Loop Sweep — Phase 2 ADJUDICATION

**Input**: Phase-1 GATHER packet (`open-loop-evidence-packet.md`, PR #5821, Golf-2). **Adjudicator**: Alpha-4 (Fable seat, per the packet's dispatch note). **Method**: per-surface verdict + disposition with a named owner; systemic classes separated from single instances; no record acked/closed here except where explicitly noted as safe — closures are routed to their owners, not bulk-executed by the adjudicator (per the never-bulk-ack rule for disposition queues).

**Headline**: of the 9 surfaces, TWO are load-bearing emergencies (S9 chairman-invisibility, S1 write-only backlog sink), THREE are healthy-or-noise once the evidence is read correctly (S5, S2, most of S8), and the rest are bounded follow-ups. One cross-surface compounding risk is called out below that Phase 1 could not see: **S9 now gates the Discovery run.**

---

## Cross-surface finding (new in Phase 2): S9 became load-bearing today

Phase 1 gathered before the stage0-fixset landed. As of PR #5825 (SD-LEO-INFRA-STAGE0-CHAIRMAN-DECISION-AUTHORITY-001), every 'ready' Stage-0 venture **pauses behind a real PENDING chairman decision** — by design, the machine can no longer approve for him. That converts S9 from "hygiene debt" into the **critical path of the Discovery run**: if pending decisions don't reach the chairman (79/80 currently have zero surfacing evidence) and the SLA enforcer has **zero call sites** (dormant — registered machinery never dispatched, a known defect class), ready ventures will wedge paused indefinitely and the pause will be misread as a regression of the fix. The S9 disposition below is therefore ranked FIRST.

---

## Surface 9 — Chairman decision queue invisible (VERDICT: SYSTEMIC, act first)

**Verdict**: three independent breaks compound: (1) `shouldAutoEscalate` predicate only fires on `raised_by='adam'` — stage-gate machinery inserts bypass it structurally; (2) the hourly exec-summary (the only full-queue renderer) has been silently dead ~12 days; (3) `chairman-decision-timeout.js` / `chairman-sla-enforcer.js` have zero production call sites — the 24h fallback SLA everyone assumes exists never fires.

**Disposition (mint-ready SD shape, owner: Adam to source, priority critical — sequence BEFORE the Discovery run issues)**:
- FR-1: widen the escalation predicate — any `blocking=true` pending decision escalates regardless of `raised_by`; stage-gate (`decision_type='stage_gate'`) pending rows escalate by class.
- FR-2: wire the SLA enforcer into a real scheduled runner (cron/queue-processor tick) — the dormant-class fix; add a `stage_gate` SLA matrix key (the 24h fallback assumption is already flagged as feedback `3acb9cdd`).
- FR-3: a groomed decisions digest on the on-demand email channel (chairman prefs: one email per action item, none 23:00–05:00 ET) — the 75 `flag_review` rows must be **groomed by the coordinator to a shortlist first**, never dumped raw.
- Immediate coordinator action (no SD needed): groom the 4 real pending decisions (`241eaba4`, `d2c84ce1`, `449ec12b`, + the S7 sample-2 taste verdict) into the next decisions email. (`9868fa64` was the assessment's test-fixture park probe — resolved by QF-20260710-291's backfill, no chairman action needed.)

## Surface 1 — feedback/harness_backlog: 2,320 rows, zero ever closed (VERDICT: SYSTEMIC — fix the sink, don't shovel it)

**Verdict**: this is a write-only channel by construction. 1,784/2,320 rows are `completion_flag` witness residue — records whose JOB was to be durable, not to be triaged; burying the 516 actionable `log-harness-bug` rows under them is the defect. Hand-triaging 2,320 rows would be waste.

**Disposition**:
- Mint-ready SD (owner: Adam/coordinator co-author): harness-backlog drain policy — (a) route `completion_flag` rows to a distinct category or terminal status at write time (they are witness records; `capture-completion-flags.js` change); (b) recurrence promotion for the actionable remainder (fingerprint 3+ occurrences → QF candidate, mirroring the signal-promotion path that already exists); (c) age-out policy for informational rows.
- Bounded enumeration sweep (owner: any cheap seat, one pass): the 536 non-completion-flag rows, deduped BY DONE-STATE against shipped SDs/QFs before any new work is minted — several of the 30d+ cited items look already-fixed by later SDs (e.g. the worktree-reaper data-loss pair predates the reaper hardening work).
- The 6-row `adam_doc_drift` series: route to Adam for ONE disposition on the series; the recurrence itself shows the proposal loop lacks an owner — fold that observation into the drain-policy SD.

## Surface 3 — Reachability class (VERDICT: two real items, one is a class)

- `8b9782a5` CONFIRMED DEPLOY/REACHABILITY GAP resurfacing unacked at 185h **after its fix SD completed**: textbook fix-shipped-symptom-recurs → the reachability of the fix itself must be verified before the ledger row is dispositioned. Owner: **Adam** (it sits in his Solomon-ledger disposition queue; never bulk-ack). If the fix is verified reachable, disposition with evidence; if not, the recurrence IS the evidence for a follow-up SD.
- `c7f9b144` fix-cant-reach-running-session (CHECKIN-OWN-CLAIM-DETECT merged mid-session): a CLASS, not an instance — long-lived role sessions run pre-fix checkouts (independently reproduced today: worker-signal warned "12 commits behind" mid-loop in this very session). Mint-ready QF/SD shape: stale-checkout self-refresh (or at minimum hard-warn + git pull prompt) on role-session loop entry. Owner: coordinator to co-author.

## Surface 4 — 45 unpromoted retro items (VERDICT: bounded batch, one cluster)

**Disposition**: do NOT file 45 SDs. (a) The three ship-witness items (`b119bba1`, `a50dd499`, `98e6619a`) are one coherent cluster → one mint-ready SD (ship-witness completion: mergeToMain observation, actor columns, escapeAuth substrate). (b) The remainder go through the same enumeration sweep as S1(b) with dedup-by-done-state. (c) Root cause is the same sink as S1: retro items "promoted" into feedback die there — the S1 drain-policy SD is the systemic fix; no separate mechanism SD needed.

## Surface 6 — Solomon ledger: 149 pending, resurface cap 50 (VERDICT: queue healthy, pump undersized)

**Disposition**: age profile is healthy (zero >14d). Two actions: (a) mint-ready QF: `solomon-ledger-pending-resurface.cjs` round-robins past its `.limit(50)` (cursor or rotating offset) so depth 149 fully cycles; (b) the queue itself is **Adam's per-item disposition duty** — no adjudication here beyond the pump fix.

## Surface 7 — WATCH items (VERDICT: all standing, one needs a dated tickler)

- Gemini 3.5 GA re-run: trigger not fired; keep standing. No action.
- Window-close posture reversion (due Sun Jul 13 night PT): **owner: coordinator — set a dated tickler/cron now**; a memory-only commitment with a hard date is exactly the class this sweep exists to catch. The four postures are enumerated in the memory file.
- Sample-2 taste verdict: awaiting the chairman since 07-07 → folded into the S9 groomed digest (above).

## Surface 2 — 46 coordinator-review "breaches" (VERDICT: mostly artifact)

**Disposition**: the caveat is the finding — requests addressed to median-9-minute worker sessions can't be answered by them. Close the 46 historical rows as a stale batch (owner: coordinator, one sweep). Optional small QF: coordinator-self-review targets only sessions with a live heartbeat, or re-routes on addressee death. No per-row chase.

## Surface 5 — Worker signals (VERDICT: healthy; ack-stamp is not a signal)

**Disposition**: zero confirmed unactioned-ask breaches. One-line doc note (fleet-coordination doc): `acknowledged_at IS NULL` must not be used as an "unreplied" metric — replies arrive as fresh targeted messages. No SD, no QF, no sweep.

## Surface 8 — 715 commitment matches, 1 open of 8 triaged (VERDICT: spot-check now, no tooling)

**Disposition**: (a) `a80daa6b` (Child-B unfence contingent on A landing clean): owner coordinator — check Child A's state NOW and unfence/direct-assign if the condition fired; this is a 2-minute action. (b) The role-slot sender-rotation under-detection is real but building commitment-tracking tooling for it is poor ROI while S1/S9 sinks exist; recorded as an observation, revisit only if a real dropped commitment (not a detection artifact) surfaces. (c) The untriaged ~707 stay untriaged — the sample's 7/8 closure rate does not justify an exhaustive pass.

---

## Disposition register (one line per owner)

| # | Item | Owner | Action class | Urgency |
|---|------|-------|--------------|---------|
| 1 | S9 chairman-surfacing SD (predicate + dormant SLA wiring + groomed digest) | Adam (source) | SD, critical | Before Discovery run |
| 2 | S9 groom 4 real pending decisions + sample-2 verdict into next decisions email | Coordinator | direct action | Today |
| 3 | S1 harness-backlog drain-policy SD (completion-flag rerouting + recurrence promotion) | Adam + coordinator | SD | This window |
| 4 | S1(b)/S4(b) enumeration sweep of 536 actionable rows + 42 retro items, dedup-by-done-state | Any cheap seat | bounded sweep | This window |
| 5 | S4 ship-witness completion cluster SD (3 retro items, one scope) | Adam (source) | SD | Normal |
| 6 | S3 verify reachability of the singleton-refresh fix, then disposition ledger row 8b9782a5 | Adam | disposition w/ evidence | Prompt (185h stale) |
| 7 | S3 stale-checkout self-refresh QF/SD (fix-cant-reach-running-session class) | Coordinator co-author | QF/SD | Normal |
| 8 | S6 resurface-pump round-robin past limit(50) | Any seat | QF | Normal |
| 9 | S7 posture-reversion dated tickler for Jul 13 | Coordinator | direct action | Before Jul 13 |
| 10 | S2 close 46 stale review rows as batch; optional live-heartbeat targeting QF | Coordinator | batch close | Low |
| 11 | S8 check Child-A state; unfence Child B if landed clean (a80daa6b) | Coordinator | direct action | Today |
| 12 | S5 doc note: acknowledged_at is not an unreplied metric | Any seat | doc line | Low |

**Explicitly adjudicated as NO ACTION**: S5 as a surface (healthy); S8 mass-triage (sample closure rate 7/8); hand-triage of the 1,784 completion-flag rows (witness records, not work); per-row chase of S2's 46.
