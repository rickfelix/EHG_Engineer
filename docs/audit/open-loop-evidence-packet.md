---
category: Reference
status: Draft
version: 1.0.0
author: Claude Code (Golf-2)
last_updated: 2026-07-10
tags: [open-loop-sweep, audit, phase-1-gather, chairman-directed]
---

# Open-Loop Sweep — Phase 1 GATHER Evidence Packet

**Requester**: Chairman ("use Fable to look for other loops that haven't been closed yet and figure out how we close them"). **Framed by**: Adam. **Dispatcher**: coordinator (Phase 1 to Golf-2 at child-C completion; Phase 2 to a Fable seat behind commission work).

**Scope**: read-only inventory across 9 named surfaces. Cited facts only — **no adjudication, no acking, no dispositioning, no closing of any record**. An empty/zero result is reported as an explicit finding, never silently skipped. Gathered via 4 parallel research passes (each covering 2-3 surfaces); every number below is the sub-agent's own query result, not an estimate.

**Coverage map (honest)**: all 9 surfaces named in the brief were swept. Volumes were, in every case, far larger than the brief's own estimates (e.g. surface 1 alone is ~40x the briefed count) — several surfaces (worker-signal rows, "I will" commitments) were sampled/spot-verified rather than exhaustively triaged row-by-row; this is flagged explicitly per surface below, not glossed over.

---

## Surface 1 — `feedback` table: category=harness_backlog, status=new

**Headline finding**: actual volume is **2,320 rows** (exact paginated count), not the ~56-60 the brief anticipated. Breakdown by origin: `completion_flag` (via `capture-completion-flags.js`) = 1,784; `log-harness-bug.js` = 516; `signal-router.cjs` = 7; `unknown` = 12; `adam_fossil_groom` = 1. Oldest row: 2026-06-07T00:03 (33.6 days old). 100 rows created today alone (72 completion_flag + 28 direct harness-bug reports). **Every one of the 2,320 rows is still `status='new'`** — zero evidence of triage/close found in this table. The volume + total absence of closure IS the primary finding for this surface.

**Named items from the brief:**
- `b1e50a31-8725-4520-a153-6064047d545c` — "FABLE-PROMPT AUDIT (chairman-commissioned research)..." | opened 2026-07-10T14:24:44 | age ~1.5h | **FOUND**, exactly as briefed, category=harness_backlog, status=new.
- `235dae2a-f1f3-4e64-a77e-12d944ca688c` (doc-drift proposal) — "Adam doc-drift proposal (65 completions, 3d)..." | opened 2026-07-10T13:30:14 | age 0.5d | **FOUND, with caveat**: lives in `category='adam_doc_drift'`, NOT `harness_backlog` — a strict category filter misses it. Part of a **recurring, entirely-unaddressed series**: 6 near-identical rows all `status='new'` since 2026-06-28 (`b444295b`, `3d2dffaf`, `29939cce`, `0db02003`, `cdbf303c`, `235dae2a`) — none show disposition.
- GH-health advisory — **NOT-FOUND**. Searched harness_backlog/new rows and the full 6,995-row feedback table (all categories/statuses); no title/description matches. Reported as genuinely NOT-FOUND rather than guessed at.

**Oldest (30+ days), the real "never closed" concern (sample of 536 non-completion-flag entries):**
- `32f6ff34` — "Self-claim DEDUP gap: v_sd_next_candidates does NOT exclude SDs already claimed..." | 2026-06-07T22:21 | 32.7d
- `f32a6df5` — "complete-quick-fix.js hangs in autonomous /checkin flow when a QF's PR was already merged..." | 2026-06-08T07:50 | 32.3d
- `b9c4946f` — "COORDINATION-CHANNEL BUG: coordinator->Adam messages auto-marked read_at AND acknowledged_at within seconds..." | 2026-06-08T14:14 | 32.1d
- `8e79e28d` — "worker-checkin claimed_assignment path re-claims an ALREADY-COMPLETED SD..." | 2026-06-08T21:22 | 31.8d
- `c86d5027` — "RCA tiered enforcement false-positives on the coordinator keepalive..." | 2026-06-08T21:28 | 31.8d
- `dba65de5` — "DATA-LOSS (HIGH): worktree-reaper.mjs reaped a LIVE-claimed in_progress QF worktree mid-build, destroying ~56 LOC..." | 2026-06-09T17:30 | 30.9d
- `a6bc948a` — "Worktree-reaper / stale-session-sweep reaped a PARKED-ALIVE /loop worker's worktree AND released its SD claim..." | 2026-06-09T17:35 | 30.9d

*(Full 28-item today's-log and complete category/date breakdown available in the raw sub-agent transcript; the above is a representative, not exhaustive, citation set — the counts/breakdown themselves are complete and exact.)*

---

## Surface 2 — Coordinator-review SLA breaches

**Mechanism**: `scripts/coordinator-self-review.mjs` fires a periodic review request (message_type=`COACHING`, subject "Coordinator review (every N SDs)...") once ≥8 SDs have shipped since the last review. Expected reply: `/signal feedback` prefixed `COORDINATOR-FEEDBACK`/`COORD-REVIEW`/etc.

- Total review-request rows ever sent: **617**
- Rows >24h old, `acknowledged_at IS NULL`, no matching reply found: **46** (brief estimated ~33 — reporting actual count)
- 46 specific breach rows identified with id / coordinator_session / worker_session / sent_at (full table in raw transcript; spans 2026-06-10 through 2026-07-07)
- **Caveat**: coordinator/Adam-facing dialogue rarely stamps `acknowledged_at` even when a substantive reply exists as a fresh message elsewhere, and worker sessions are short-lived (median ~9 min), so several of the 46 are plausibly explained by the addressed worker session dying before it ever saw the request — not by a live worker ignoring it. Still a real finding: the ask went unanswered by that specific worker instance.

---

## Surface 3 — Promised-fixes-unverified (the "reachability" class)

- **No closure evidence found — "CONFIRMED DEPLOY/REACHABILITY GAP"** (Solomon ledger, originally raised 2026-07-02, id `8b9782a5-4b28-4716-a7c9-d7f1e471c9ce`). A "closing" fix shipped and was marked `completed` (SD `SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001` + QF-20260702-222/976). **Evidence it was NOT actually confirmed closed**: the identical `[SOLOMON_LEDGER_PENDING] ... CONFIRMED DEPLOY/REACHABILITY GAP` message keeps auto-resurfacing at increasing age — 93h (07-06), 113h (07-07), 136h (07-08, acked), **179h (07-09, unacked), 183h (07-09, unacked), 185h (07-10, unacked, most recent)**. No final disposition/close message found after the fix SD completed.
- **No closure evidence found (newly surfaced, not yet tracked)** — 2026-07-10T14:02 UTC message (`c7f9b144-ee71-4cf1-af08-27bc12e5e49e`): "CHECKIN-OWN-CLAIM-DETECT merged 12:58Z but Golf-3 SESSION predates the merge — same fix-cant-reach-running-session class as my WAKE-ON-DIRECTIVE gap this morning... candidate for the backlog." No QF/SD filed for this specific instance yet. **0 evidence of any verification action taken.**
- Closure evidence found (precedent, cited for context only): the "read-stamped-not-processed" class — 3rd recurrence entry confirms "FIX SHIPPED + ADOPTED" (WAKE-ON-DIRECTIVE-001, `delivered_at` column added).
- Closure evidence found (confirmed reachable): `SD-LEO-INFRA-NONCLONE-VISION-S19-DRAFT-DOC-SHAPE-001` (PR #5287) — memory explicitly confirms this reachability gap was closed.
- Broader DB search of ~59 SDs + 16 QFs matching "reachab*" in title/description: all except the two no-closure-evidence items above are `status='completed'` — no other unclosed reachability instance found.

---

## Surface 4 — Retro action items from this week never promoted to SDs/QFs

**Scope**: 373 retrospectives created 2026-07-03 through 2026-07-10 (LEAD_TO_PLAN=170 excluded as SD-internal checklists; SD_COMPLETION=183 + INCIDENT=20 = 203 retros reviewed). 72 non-boilerplate forward-looking items found across `future_enhancements`/`protocol_improvements`/`unnecessary_work_identified`. 15 already self-name their own continuation SD (excluded). 8 are byte-identical auto-template boilerplate (consolidated as one systemic pattern, not 8 loops). **2 items are cross-confirmed still-open via Surface 1** (feedback ids `9abb187a` and `a395fbc3`, both `status='new'` since 2026-07-04 — "promoted" to the same unclosed feedback sink documented in Surface 1, not to an SD/QF).

**45 items with no apparent follow-on SD/QF** (heuristic keyword match, spot-checked — full list in raw transcript), representative sample:
- retro `b119bba1` (SD-LEO-INFRA-SHIP-WITNESS-MERGEWORK-001) — "Wire quick-fix mergeToMain... to observe via evaluateMergeWorkLadder()" | 7.6d
- retro `a50dd499` (SD-LEO-INFRA-SHIP-WITNESS-APPLICATIONS-001) — "Add actor columns to ship_review_findings so P2 witness evaluation..." | 7.5d
- retro `98e6619a` (SD-LEO-INFRA-SHIP-WITNESS-ENFORCE-001) — "Build the escapeAuth DDL + dual-key audit substrate so P4 can move from not_applicable to evaluable" | 7.5d
- retro `277025b0` (SD-LEO-INFRA-CLOSE-ADAM-SOLOMON-001) — "RCA the #5420 merge-timing race so a future adversarial-review finding cannot ship live before its own fix lands" | 7.4d
- retro `d2fff886` (test-fixture ventures leak) — "File and fix the killed-CI-run cleanup gap in tests/integration/s17-parity.test.js's afterAll..." | 6.5d
- retro `5fe33c80` (SD-LEO-INFRA-ADOPTED-RESUME-FINAL-001) — "Committed, repeatable automated e2e fixture for TS-1/TS-7..." | 5.9d
- retro `7691db09` (SD-LEO-INFRA-UNIVERSAL-VENTURE-TELEMETRY-001) — "Prevents a hard Postgres ON CONFLICT arbiter-inference failure..." (→ links to Surface 1's `9abb187a`, still open) | 5.8d

---

## Surface 5 — 360+ accumulated worker-signal rows (noise vs unactioned ask)

**Storage**: `scripts/worker-signal.cjs` → `session_coordination`, `payload.signal_type` ∈ {stuck, need-sweep, prd-ambiguous, gate-bug, spec-conflict, harness-bug, unfit, other, feedback}.

- Actual total since inception (2026-05-04): **3,133** rows, not "360+" (no natural cut of this table matches that number). By type: feedback 1988, stuck 601, harness-bug 266, need-sweep 78, spec-conflict 61, other 55, gate-bug 46, prd-ambiguous 21, unfit 17.
- `acknowledged_at IS NULL`: **422** total (388 feedback-type, 34 friction-type).
- Of the 422 unacked, 42 contain question/directive language; all 42 individually reviewed plus a 50-row noise-baseline sample (~92 rows total reviewed).
- **Noise**: ~30 of 42 (routine status/idle pings, coordinator-review reply confirmations).
- **Carries an unactioned ask**: 12 flagged, spot-verified — **4 confirmed answered within 5-13 min** ("Anything queued for me?" broadcasts), 1 answered 95s later, 2 answered within 2 min (directive-conflict / F3-fence dispositions), 2 ambiguous/likely self-resolved (`b7024d14`, `bed6e7d0`), **1 genuinely open but too fresh to judge SLA** (`280dc183`, "OWNERSHIP CHECK before I act", 2026-07-10 15:22:05 — the most recent row in the whole table at query time).
- **Net finding**: `acknowledged_at IS NULL` is NOT a reliable "unreplied" signal for this fleet — most real asks get a fresh targeted reply within minutes rather than an ack-stamp on the original row. **0 confirmed unactioned-ask SLA breaches** in the checkable sample; 1 too-recent-to-judge.

---

## Surface 6 — Adam's ~100-row SOLOMON_LEDGER_PENDING disposition queue (inventory + age only — NOT dispositioned)

**Table**: `solomon_advice_outcome_ledger` (confirmed via `scripts/solomon-ledger-pending-resurface.cjs`).

- Total rows (any status): 194 — `decision='pending'`: **149**, `decision='accepted'`: 45.
- Oldest pending: id `9408f27a-c9e7-4951-b08b-bf7e1698e2a3`, created 2026-07-01T22:38:56Z, age ≈ 8.7 days.
- Age distribution of the 149 pending: >7d = **45**, >14d = **0**, >30d = **0** (a real, explicit zero — nothing predates ~9 days).
- 10 oldest pending rows cited with id/created_at/age/summary (full list in raw transcript) — topics span a chairman directive, Solomon oracle Q&A on SD/QF ranking, PING-ON-SILENCE, a "DROPPED-RELAY FINDING (audited)" item, and multiple coordinator-feedback cycles from Solomon.
- **Structural note**: `scripts/solomon-ledger-pending-resurface.cjs`'s only automated sweep caps at `.limit(50)` per run — with 149 rows pending, a single sweep cannot resurface the whole queue; depth already exceeds the per-run ceiling.
- No rows acked/updated/dispositioned by this investigation — read-only SELECT only, per the brief's explicit constraint.

---

## Surface 7 — WATCH items in session-state files and memory

- `.claude/session-state.md`: no WATCH/revisit markers present (stale, dated 2026-03-24, unrelated content).
- **No closure evidence found — Gemini 3.5 GA re-run watch** (`project_gemini_35_release_rerun_j2a_harness.md`, chairman directive 2026-07-05): trigger = "Gemini 3.5 Pro GA (target mid-July 2026) or 3.5 Flash pricing stabilizes" → re-run the J2A A/B harness. No evidence the trigger has fired or the harness re-run. Standing, not-yet-due.
- **No closure evidence found — window-close posture reversion checklist** (`feedback_leverage_solomon_frequently_during_fable_windows.md`, chairman directive 2026-07-10, same-day): 4 postures flipped for the current cheap-Fable window (ends "Sun Jul 13 night PT"). Explicit commitment: "At window close: revert ALL FOUR explicitly." No evidence of reversion yet — expected, window not yet closed. Flagged as a standing dated commitment to verify at/after Jul 13.
- **No closure evidence found — chairman taste-verdict pending on distinctiveness-pass design sample** (`docs/design/samples/README.md`, tagged `watch-and-review`): sample 2 (DataDistill v2, scored 4.83 PASS, chairman emailed 2026-07-07T10:57 UTC). Both underlying SDs are DB-status `completed` (code shipped), but the doc states explicitly the chairman's taste verdict is what "alone advances the WATCH-AND-REVIEW trust line." No recorded verdict found for sample 2 specifically (sample 1's verdict, a different closed loop, is recorded and dated 2026-07-06 — not to be confused with this one).
- No other `docs/protocol/*.md` or `docs/*.md` file contains "WATCH" as a literal heading/bullet marker (broader hits were false positives on "WATCHER"/"watchdog").

---

## Surface 8 — Unconfirmed commitments in session_coordination ("I will…", "flag me when…", "next tick I'll…")

Raw match counts: "I will" (excl. "I will not") = 523; "flag me when" = 19; "next tick I'll" = 1; "I'll check" = 1; "I'll follow up" = 0. Combined distinct rows = **715**.

Given the volume, the full 19-row "flag me when" set plus a stale-tail sample of "I will" (unacked, >7d old) were fetched, and 8 concrete single-action commitments were topically verified:

- **7 of 8 confirmed closed** — topically-matched follow-through found, several within minutes to hours (e.g. Adam's "I will source it today with YOUR chosen evidence-derived path" fulfilled 7 min later; a coordinator hold-commitment resolved same day via a shipped SD).
- **1 of 8 open/unconfirmed**: `a80daa6b` (orchestrator→Adam, 2026-07-10 12:40:19): *"YOU are first claim on Child B the moment A lands clean — I will unfence B and direct-assign B..."* — no subsequent "Child B"/"unfence" message found. Conditional (contingent on "A lands clean"); may not have triggered yet, or was actioned via a DB flag flip with no chat message. **Listed as open**, not confirmed closed.
- **Structural finding, independent of any single row**: `coordinator`/`adam`/`orchestrator` are role slots whose `sender_session` rotates on every relaunch/compaction — same-sender continuity checks systematically under-detect follow-through (role-X's commitment can be honored by role-Y session with zero shared sender id). This is itself worth flagging as a process gap.
- **Explicit sampling caveat**: only ~8 of 715 raw matches were individually triaged (7 closed, 1 open) — the remaining ~707 were NOT triaged. This is a sample, not an exhaustive audit.

---

## Surface 9 — Chairman-decision queue: anything awaiting his input never surfaced

**Sources**: `chairman_decisions` (base table), `chairman_unified_decisions`/`chairman_pending_decisions` (views, `database/migrations/20260611_chairman_decision_queue.sql`).

- `chairman_decisions`, `status='pending'`: **5 rows** (`f83dde76` session_question, `9868fa64` stage_gate, `241eaba4` gate_decision, `d2c84ce1` outbound_publish_approval, `449ec12b` stage_gate).
- `chairman_pending_decisions` view, all branches: **80 rows** — 75 `flag_review` (from `feedback`, severity critical/high) + 5 `chairman_approval` (mapping to the 5 above).
- **Per-decision surfacing evidence** (via `brief_data.escalation_email_sent_at`, the only durable decision-level "was this emailed" marker):
  - `f83dde76` — **SURFACED**, `escalation_email_sent_at=2026-07-06T02:40:18Z` (met the auto-escalate predicate: `raised_by='adam'` + blocking).
  - `241eaba4` — **NOT-FOUND**. Blocking=true but `raised_by='lead-worker-scope-narrowing'` (not literally `'adam'`) → `shouldAutoEscalate` never fires. A real predicate gap, not bad luck.
  - `d2c84ce1` — **NOT-FOUND**, doesn't meet the escalation predicate at all (non-blocking, `raised_by=null`).
  - `9868fa64`, `449ec12b` — **NOT-FOUND**, inserted directly by venture stage-gate machinery, bypassing the escalation path entirely — no escalation channel was ever available to them.
- **Hourly exec-summary channel** (`scripts/adam-exec-summary.mjs`, the only mechanism that ever renders the FULL `chairman_pending_decisions` list): its durable send marker (`audit_log.event_type='adam_exec_email_sent'`) shows **last send 2026-06-28T18:05:53Z — ~12 days of silence**. The script's own header comment corroborates: "The chairman disabled the hourly exec-summary and now relies on on-demand decision emails." **All 75 `flag_review` rows were created AFTER the last successful send** (earliest 2026-06-30) — none of them was ever included in an actual email.
- **Net finding**: of 80 pending rows, **only 1 (`f83dde76`) has any evidence of reaching a chairman-facing email**; **79/80 have zero surfacing evidence**.
- Checked and ruled out as a mitigant: an SLA-timeout subsystem (`lib/eva/chairman-decision-timeout.js`, `chairman-sla-enforcer.js`) exists but has **zero call sites outside its own test file** — not invoked by any script or CI workflow — and even if running, its escalation action does not send an email.
- `chairman_email_channel_health` (channel-level only): `alarm_state='clear'`, but shows a 2026-07-09 ~9.5h outage window (`alarm_raised_at`→`alarm_cleared_at`) — confirms channel health, cannot confirm any specific decision was delivered (no per-decision linkage).
- No rows acked/updated/dispositioned — read-only SELECT only.

---

## Methodology notes (for Phase 2 adjudication)

- Every surface's "empty result" cases are stated explicitly above (GH-health advisory NOT-FOUND; >14d/>30d Solomon-ledger buckets are genuine zeros; etc.) rather than omitted.
- Volumes were consistently and substantially larger than the brief's own estimates across every countable surface (Surface 1: ~40x; Surface 2: 46 vs ~33 briefed; Surface 5: 3,133 vs "360+" briefed) — Phase 2 should treat the brief's numbers as directional, not as ground truth.
- Two structural (not single-instance) findings surfaced organically during gathering and are flagged for the systemic-class pass: (a) role-slot `sender_session` rotation under-detects commitment follow-through fleet-wide (Surface 8); (b) the hourly chairman exec-summary channel has been silently dead for ~12 days while the auto-escalate predicate only covers `raised_by='adam'` — together these leave the large majority of the pending-decision queue with no realistic path to chairman visibility (Surface 9).
- No record in any surface was acked, updated, or dispositioned during this gather pass.
