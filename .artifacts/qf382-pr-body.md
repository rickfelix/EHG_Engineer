## QF-20260911-382 — batch-mint holds never released after the bounded wait; consult=none stamps; consult rows rerouted off Solomon

Three defects in `scripts/cron/batch-mint-sweep.mjs`, one mechanism (measured 2026-09-11 by Adam 49eabb23, corrected by the coordinator reply fa03eff3).

### 1. No elapsed-wait producer (facet 1)
`checkVerdictsAndRelease` released only on a FOUND reply. When `BOUNDED_WAIT_MS` elapsed with no reply, nothing called `releaseQfOracleHold`, so every hold outlived its own timer until a human ran `release-oracle-hold.js` (12 holds sat 3.5h past `review_at`; the 14:52Z run released 0).

**Fix:** no reply AND `isBoundedWaitElapsed(consultRow.created_at, nowMs)` → release with `releasedBy='bounded-wait'`. `nowMs` is an injectable option (the FR-9 clock seam that already existed for exactly this).

### 2. consult=none stamps (facet 2, corrected framing)
`openConsultRow` treated the dispatch choke point's `{data:null, landed:true, parkedRowId}` return (already-delivered dedupe / backpressure-parked — the row DID land) as "no row", so groups 2 and 3 were stamped `consult=none` and could not be released by the specified path.

**Fix:** resolve the parked/deduped row's `id, created_at` and cite it. When no row exists at all, log loudly and **refuse to stamp the group** (members surface in `failed[]` with cause `consult_row_missing`; `main()` exits 1). A hold that cannot be released is worse than an unheld batch.

### 3. Wrong addressee (facet 3, root cause differs from the ticket's guess)
The sweep DID target the live Solomon at send time. The private kind `oracle_read_pending_consult` is not in Solomon's drain set — the 09-05 registry migration `20260905_role_drain_sets_add_oracle_read_pending_consult.sql` is still `@approved-by: PENDING` (chairman-gated, unapplied) — so `lib/fleet/orphan-reroute-sweep.js` rerouted every consult row to the coordinator as `coordinator_reminder` 16 minutes after send. Live proof on row `885ad953` `payload.reroute`: `from_kind=oracle_read_pending_consult from_target=d3430608 (solomon) → to_kind=coordinator_reminder to_target=3616c697 (coordinator)` at 11:08:01Z.

**Fix:** write the already-registered `PAYLOAD_KINDS.SOLOMON_CONSULT` with `consult_purpose='batch_mint_hold'` as the shape discriminator — the same lane `lib/adam/presend-consult-lane.cjs` uses and `fleet-dashboard.cjs` renders. No migration needed; the pending 09-05 migration becomes redundant (left untouched here, flagged to the coordinator).

### Out of scope
Facet (d), clearing stale stamps on terminal transitions — noted, not changed.

### Tests (`tests/unit/scripts/batch-mint-sweep.test.js`, 37 passing with hold-writer)
- 31-minute-old consult, no reply → released, `verification_notes` contains `by bounded-wait` and the cited consult row; 29 minutes → 0 released.
- failed consult insert → zero `quick_fixes` updates, all members in `failed[]` with `consult_row_missing`.
- parked insert (`landed:true, parkedRowId`) → cites the parked row.
- kind `solomon_consult`, `consult_purpose`, target = resolved Solomon, `targetRoleHint:'solomon'` asserted.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Mv5M4xjdfTVnASfSRD4yKb
