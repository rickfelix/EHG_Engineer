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

- **MF1 — atomic single-winner claim.** After the age-gate flags the heartbeat stale, the
  revive is gated by a compare-and-swap on `instance_id`:
  `UPDATE eva_scheduler_heartbeat SET instance_id=<token> WHERE id=1 AND
  instance_id=<observed>`. PostgreSQL row-locks serialize concurrent watchers; the first
  swaps the observed instance to its token, so every later watcher's CAS predicate no longer
  matches and affects **0 rows**. On a **fresh deployment** (empty table) the claim instead
  `INSERT`s the singleton (`status='stopped'`) — the primary key rejects the loser, so the
  single-winner property holds there too. No advisory lock / pg pooler required. The claim
  writes **only** `instance_id` — never `status` (that column carries a
  `CHECK (running|stopping|stopped)` and is owned by the daemon, which sets `running` on
  start), and never `last_poll_at` (see MF2).
- **MF2 — confirm takeover, no false-"alive" mask.** Because the claim does **not** bump
  `last_poll_at`, a failed spawn/confirm leaves the row stale so the **very next tick retries
  immediately** (no 5-minute mask). After spawning, the watcher polls the heartbeat (up to
  8s) until `instance_id` becomes a value that is **neither** the supervisor token **nor**
  the pre-claim (observed) instance — the daemon stamps a fresh `scheduler-<hex>` on start.
  Excluding the observed instance means a hung-but-alive **old** daemon that merely re-stamps
  its original id does not falsely confirm. Confirmed → exit 0; timed out or the child exited
  early → exit 1.
- **MF4 — creds guard + observable detached spawn.** SUPABASE creds are asserted **before**
  any spawn so a misconfigured host fails fast (exit 2) instead of forking a credential-less
  crash-loop. The daemon is spawned `detached`, `unref`'d, with `windowsHide`, and its
  stdout/stderr are redirected to `logs/eva-scheduler-daemon.log` (not discarded) with an
  `exit` listener, so a startup crash is captured and reported instead of surfacing only as
  an opaque confirm timeout.

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
- **Dry run**: `node scripts/cron/eva-scheduler-watcher.mjs --dry-run` reports whether it
  *would* revive — fully **read-only**, it mutates nothing (no claim, no spawn).
- **Persistent exit 1**: the daemon is being spawned but never stamps a fresh instance —
  read `logs/eva-scheduler-daemon.log` for the startup error, confirm the host can run
  `node scripts/eva-scheduler.js start` (env, dependencies), and that `EVA_SCHEDULER_ENABLED`
  is not `false`.
- **Known follow-up**: the watcher prevents *concurrent watchers* from double-spawning, but
  it cannot prevent a hung-but-alive **old daemon** from coexisting with a freshly spawned one
  (the daemon has no cross-process start lock). True duplicate prevention requires the daemon
  itself to take a `pg_advisory_lock` on start — tracked as a separate hardening item.
