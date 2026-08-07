# Session state — SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001

Worker Alpha-3 (fable/high), session cff8013c-93e3-41d2-bea1-f511c2189051, under coordinator 909d861e.
Compacted 2026-08-07 at the FR-2/FR-5 boundary. Branch `feat/SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001` @ c78a4c2679f, tree clean, status active/EXEC.

## The defect, in its corrected form

Not "rows decay unexpectedly". The dead-letter → audit-trail → reap-after-7-days lifecycle is **designed and documented**. **The remedy stage between stamp and reap was never built.**

Two re-route instruments partition the problem with **zero overlap**:
- `lib/fleet/orphan-reroute-sweep.js` — live-role / **unrecognized-kind**. Scheduled every 15 min. Predicate `isOrphanCandidate` (:51-55) is kind-recognition only and **never inspects target liveness**.
- `lib/coordination/dead-letter-drain.js` — **dead-target** / any-kind. Was invoked by nothing but its own CLI wrapper + one unit test.

So a well-recognized kind addressed to a reaped session was covered by neither.

## Shipped this session

| Commit | What |
|---|---|
| `8ac51445f6d` | FR-1a: removed the `acknowledged_at`+`read_at` co-stamp (blinded 4 surfaces at once); mutation-tested static guard |
| `e757e38be72` | STEP 0: read-only manifest of 2,644 dead-letter row ids (`docs/evidence/…-dead-letter-manifest.json`) |
| `51af15fb6cf` | FR-1b live role successors + FR-1c heartbeat liveness oracle |
| `b1ebdba9d1b` | FR-1d: stamp branch writes **no timestamp column**; survival test |
| `c78a4c2679f` | FR-2: hourly cron, **dry-run**, writes double-gated |

240 tests green across 23 files.

## Load-bearing measurements (bind criteria to bounds/ratios, never these exact numbers — table moved 3711→3772 in ~15 min)

- **ZERO rows purge-eligible right now.** `expires_at` is past but the `read_at` arm matures **2026-08-12**. Population is SAFE until then; the deadline is confirmed from the predicate, not a projection.
- Purge predicate: `expires_at < now() AND (acknowledged_at IS NOT NULL OR read_at <= now()-7d)`. The **acked arm has no grace** — that is why FR-1d had to drop `acknowledged_at` too.
- FR-1c dry-run before→after: live-backlog(excluded) 2971→143, dead-letter 691→3526, retarget 102→516.
- `status` and `is_alive` **lie in both directions**. Dominant dead target held 91.6% of the backlog while reporting `status='active'`, `is_alive=true`, heartbeat 45h stale.
- Live table is ~8% of all rows ever written (44,002 lifetime vs ~3,700 live) → **a full-lane gauge must join `retention_archive` or it measures the purge, not the drain.**
- 162 rows (4.3%) carry **no `payload.kind`** — incl. the WORKER_SIGNAL friction channel, which keys on `signal_type`.
- `expires_at IS NULL` = **zero** table-wide (column DEFAULT `now()+1h`), so the per-producer TTL axis is refuted. Cut classification on the immunity axis: 518 rows immortal, 100% because `acknowledged_at IS NULL AND read_at IS NULL`.

## Remaining work

- **FR-5** (next, smallest): `payload.consult_purpose` exists at `scripts/worker-signal.cjs:464-469` but is optional, unset by the producer (`scripts/adam-quiet-tick.mjs:654`), never read by `drainInbox` (`scripts/solomon-advisory.cjs:358-433`, label :418 kind-only, order :374 created_at ASC, exported :1117). Producer must SET it; drain must READ+ORDER on it. Precedent: `payload.via='cc_originator'` (:607-609).
- **FR-3**: EXTEND `lib/fleet/worker-status.cjs` — never a second registry (`tests/static-guards/drain-set-registry-readers.test.js:31-143` fails shadow lists). Classify: ping_on_silence, adam_channel_health_probe, adam_action_wake, inert_worker_alert, completion_boundary_exit_alert, claim_reconciliation, periodic_liveness_ladder, account_switch_notice, row_growth_anomaly, review_supply. Needs a POSITIVE assertion (AC-8) — the guard passes today and cannot show delivery.
- **FR-4**: extract the gauge from unexported `main()` (`scripts/coordinator-quiet-tick.mjs:294-419`), widen READ path only (deferral rationale :47-50). THREE-armed control; the ~24h arm is mandatory because `readSalientState` is 30-min windowed (:195) while the defect is 20-27h rows.
- **FR-6**: schedule or explicitly retire `lib/coordination/lane-lint-gauge.cjs`.

Then `node scripts/handoff.js execute EXEC-TO-PLAN SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001` (needs fresh TESTING + SECURITY evidence).

## Standing constraints

- **Never** widen the `adam-advisory-store` kind filter (`:48-49`) — shared by peek AND ack; widening mass-retires ~1800 rows.
- No test may write to the live `session_coordination` lane. Unit tier only; capture-spy at `tests/unit/fleet/orphan-reroute-sweep.test.js:11-47`.
- Evidence rows via `storeSubAgentResults` (`lib/sub-agent-executor/results-storage.js:371`), never a hand-rolled insert.
- Restore `package-lock.json` before committing. Never `--no-verify` (ENF-16). Bash heredocs, not PowerShell here-strings. Always name spawned sub-agents. `npx vitest --reporter=basic` is invalid in vitest 4.

## The lesson this SD keeps teaching (four instances)

A check I was confident in guarded a **narrower** thing than I believed:
1. FR-1a guard asserted two columns are never set together — never that the row **survives**.
2. Gauge control asserted non-zero-then-zero — passes vacuously inside a 30-min window when the defect is 20-27h rows.
3. Registry guard passes **today**, so it can never demonstrate FR-3 was delivered.
4. A naive FR-2 guard would have passed with **no schedule at all**.

For every remaining FR: ask *what would still be broken if this test passed?*, add the arm that answers it, add a control proving the test can fail, and mutation-prove by breaking the thing and watching it go red.

## Coordinator ruling 797bec7a (banked in SD metadata)

Race the deadline as **ordering, not haste**; quality gates unrelaxed. Evidence stay first (done, snapshot half). The old CLI must never be scheduled as-is. The dead hardcoded successor is in scope here, no separate filing.
