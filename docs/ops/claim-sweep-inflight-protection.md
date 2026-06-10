---
category: documentation
status: approved
version: 1.0.0
author: rickfelix
last_updated: 2026-06-06
tags: [documentation, ops]
---

# Claim-sweep in-flight protection (enablement runbook)

**SD-LEO-INFRA-ENABLE-CLAIM-SWEEP-001**

Activates the (previously inert) protection that stops the stale-session sweep from
releasing a worker's claim while it is mid-`Task`/`Agent` sub-agent run — the failure
mode where fleet workers "go dormant" because `cleanup_stale_sessions` released their
claim during a long sub-agent that fires no heartbeat.

## The chain (writer → telemetry → consumer)

```
long Task/Agent dispatch
   └─(writer)─> claude_sessions.expected_silence_until = now() + window   [pre-tool-enforce.cjs FR-1]
                   │
   cleanup_stale_sessions() runs ──(consumer)──> WHEN sweep_respect_inflight_agent = true
                                                  AND expected_silence_until > now()
                                                  AND NOT past the 45-min hard-cap
                                                     => SKIP release (claim survives)
```

## Three enablement pieces (all required for end-to-end)

1. **Consumer** — `cleanup_stale_sessions()` honors `expected_silence_until`
   (flag-gated, NULL-safe/fail-open, 45-min hard-cap preserved). Applied via the audited
   `apply-migration.js --prod-deploy`
   (`database/migrations/20260606033759_cleanup_stale_sessions_respect_inflight_agent.sql`).
2. **Flag** — `chairman_dashboard_config.metadata.sweep_respect_inflight_agent = true`
   (default-OFF; flipped true by this SD, **after** the consumer was confirmed live).
3. **Writer** — `SWEEP_RESPECT_INFLIGHT_AGENT=1` in `.claude/settings.json` `env` so the
   PreToolUse hook **await-persists** `expected_silence_until` on Task/Agent dispatch
   (the else-branch fire-and-forget write is killed by `process.exit`; the gated branch awaits).

## Safety properties (verified TS-1..TS-4, BEGIN..ROLLBACK)

- **In-flight protected** — future `expected_silence_until` + flag true ⇒ NOT released.
- **Hard-cap preserved** — a session past the 45-minute cap is ALWAYS released
  (`sd_key` + `worktree_path` + `worktree_branch` cleared together).
- **Fail-open** — a NULL/absent `expected_silence_until` never blocks the sweep.
- **Flag-gated** — with the flag false, behavior reverts to legacy (no exemption).

## Deploy nuance

The PreToolUse hook reads `.claude/settings.json` from the **main checkout**
(`CLAUDE_PROJECT_DIR`), not from a worktree. The `SWEEP_RESPECT_INFLIGHT_AGENT=1` env
takes effect for the running fleet only **after the main checkout updates** to include
this change (merged ≠ deployed). The DB-layer pieces (consumer + flag) are already live.

## Rollback

- **Instant DB-layer revert**: set `chairman_dashboard_config.metadata.sweep_respect_inflight_agent = false`
  (the exemption predicate is gated off immediately; the sweep returns to legacy behavior).
- Optionally remove `SWEEP_RESPECT_INFLIGHT_AGENT` from `.claude/settings.json` to stop
  the writer. The 45-minute hard-cap remains in force throughout.
