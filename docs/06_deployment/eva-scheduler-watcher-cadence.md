# EVA Scheduler Watcher — Cadence Contract & Runbook

- **Category**: Report
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: SD-LEO-INFRA-REVIVE-EVA-SCHEDULER-SERVICE-001
- **Last Updated**: 2026-06-09
- **Tags**: eva, scheduler, cron, supervisor, operations

## What it is

`scripts/cron/eva-scheduler-watcher.mjs` is a **one-shot supervisor** for the
`EvaMasterScheduler` daemon (`lib/eva/eva-master-scheduler.js`, launched by
`node scripts/eva-scheduler.js start`).

The daemon is a long-lived foreground poller that guards itself only with an
in-process flag — there is **no cross-process supervisor**. If the daemon process
dies, its singleton heartbeat row (`eva_scheduler_heartbeat` id=1) freezes:
`last_poll_at` stops advancing while `status` stays `'running'` (a lie). Nothing
restarts it. This watcher closes that gap: one pass per invocation, it detects death
by heartbeat **age** and relaunches the daemon — exactly once across any number of
concurrent watchers.

## Cadence contract

| Property | Value |
|---|---|
| npm script | `npm run eva:scheduler:watch:cron` |
| Invocation | `node scripts/cron/eva-scheduler-watcher.mjs --once` |
| Recommended schedule | every **5 minutes** (matches the other `*:cron` watchers) |
| Daemon poll interval | 60s (`EVA_SCHEDULER_POLL_INTERVAL_SECONDS`, default) |
| Staleness threshold | 5 min (`EVA_SCHEDULER_STALE_MS`, default `300000`) |
| Mode | one pass + exit (the cron re-invokes; **no** internal loop) |

**Detection latency**: a dead daemon is revived within roughly
`EVA_SCHEDULER_STALE_MS + watcher_interval` (≈5–10 min at the defaults). Keep the
watcher interval **≤ `EVA_SCHEDULER_STALE_MS`** so every death is caught within one
stale window. The threshold is intentionally ~5× the 60s poll interval so a single
slow poll never trips a false revive.

## Exit codes

| Code | Meaning | Cron interpretation |
|---|---|---|
| `0` | Healthy — scheduler alive, revive confirmed, claim lost to a peer watcher, dry-run, or `EVA_SCHEDULER_ENABLED=false` | success, no alert |
| `1` | Operational — heartbeat read/claim DB error, spawn error, or revive **unconfirmed** within 8s | transient; next tick retries. Alert only if it persists across consecutive ticks |
| `2` | Fatal misconfiguration — missing `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` | page the operator — host is misconfigured and **no** daemon was spawned |

## Single-instance guarantee

Multiple watchers (overlapping cron ticks, multiple hosts) **never** spawn more than
one daemon:

- **MF1 — atomic single-winner claim.** The revive is gated by a conditional UPDATE
  of the singleton row: `UPDATE eva_scheduler_heartbeat SET instance_id=<token>,
  last_poll_at=now() WHERE id=1 AND (last_poll_at IS NULL OR last_poll_at <
  now()-STALE)`. PostgreSQL row-locks serialize concurrent updaters; the first sets
  `last_poll_at=now()` (fresh), so every later watcher's predicate no longer matches and
  affects **0 rows**. Only the watcher that matched exactly one row spawns. No advisory
  lock / pg pooler required — the conditional singleton UPDATE is itself the atomic gate.
  The claim stamps only `instance_id` + `last_poll_at`; it does **not** write `status`
  (that column carries a `CHECK (running|stopping|stopped)` and is owned by the daemon's
  heartbeat — the daemon sets `running` on start).
- **MF2 — confirm takeover.** After spawning, the watcher polls the heartbeat (up to
  8s) until `instance_id` moves off its supervisor token — the daemon stamps its own
  `scheduler-<hex>` on start. Confirmed → exit 0; timed out → exit 1 (the claim set
  `last_poll_at=now`, so the next tick waits one stale window before re-revival).
- **MF4 — creds guard + detached spawn.** SUPABASE creds are asserted **before** any
  spawn so a misconfigured host fails fast (exit 2) instead of forking a
  credential-less crash-loop. The daemon is spawned `detached`, `unref`'d, with
  `windowsHide` and `stdio: 'ignore'` so it outlives the one-shot watcher cross-platform.

## Environment

| Var | Purpose |
|---|---|
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | required to read the heartbeat and to run the spawned daemon |
| `EVA_SCHEDULER_STALE_MS` | staleness threshold in ms (default `300000`) |
| `EVA_SCHEDULER_ENABLED` | `'false'` suppresses revival entirely (mirrors `eva-scheduler.js start`) |

## Operations

- **Manual check** (read-only): `npm run eva:scheduler:status` shows the live heartbeat
  age and instance.
- **Manual revive**: `npm run eva:scheduler:watch:cron` (safe to run anytime — no-op if
  the daemon is alive; single-winner if a peer is also reviving).
- **Dry run**: `node scripts/cron/eva-scheduler-watcher.mjs --dry-run` detects staleness
  and performs the atomic claim but **skips the spawn** (note: a dry run still writes the
  `reviving` claim to the heartbeat, briefly masking staleness for one stale window).
- **Persistent exit 1**: the daemon is being spawned but never stamps its instance —
  check the host can run `node scripts/eva-scheduler.js start` (env, dependencies) and
  that `EVA_SCHEDULER_ENABLED` is not `false`.
