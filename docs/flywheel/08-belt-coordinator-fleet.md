---
category: documentation
status: draft
version: 0.1.0
author: docmon-agent (Information Architecture Lead)
last_updated: 2026-06-20
tags: [flywheel, belt, coordinator, fleet, dispatch, capacity]
---

# Link 8 — Belt → Coordinator → Fleet

> **Reviewed by Adam 2026-06-20 (chairman delegated the review); living doc — keep current as behavior changes.** [← back to the flywheel map](README.md)

## Role in the flywheel

This is where *sourced work becomes executing work*. The **belt** is the queue of claimable SDs;
the **coordinator** dispatches conflict-free work to live workers and keeps the belt full; the
**fleet** of ~6 workers each claim exactly one SD and drive it through LEO execution (link 9). The
coordinator's prime KPI: **an idle worker while sourceable work exists is a failure.**

> This link is already documented thoroughly in **`docs/protocol/README.md`** ("The LEO Harness").
> This page is the *flywheel-context bridge*; for full role specs follow the cross-links below
> rather than duplicating them here.

## Source of truth (verified)

- **Code:** `lib/coordinator/*` (`dispatch.cjs` fail-closed, `resolve.cjs`, `signal-router.cjs`),
  `scripts/coordinator-audit.mjs`, `scripts/coordinator-startup-check.mjs`,
  `scripts/stale-session-sweep.cjs`, `scripts/fleet-dashboard.cjs`, `scripts/worker-checkin.cjs`.
- **Tables:** `claude_sessions` (liveness: `heartbeat_at`, `loop_state`, `sd_key`, `metadata`),
  `session_coordination` (the message bus), `strategic_directives_v2` (claim fields).
- **Docs:** `docs/protocol/README.md`, `docs/protocol/fleet-coordinator-and-worker-behavior.md`,
  `docs/protocol/fleet-worker-loop-directive.md`, `docs/reference/fleet-coordination.md`,
  `.claude/commands/coordinator.md`, `.claude/commands/checkin.md`.

## The belt (claimable-SD queue)

A "belt" SD is a `strategic_directives_v2` row that is sourced, promoted
(`roadmap_wave_items.promoted_to_sd_key` set), and not yet claimed. Workers pull from it via the
tiered self-claim ladder in `worker-checkin.cjs`: resume current claim → coordinator
`WORK_ASSIGNMENT` → stranded-final recovery → baselined queue → un-baselined draft → quick-fix →
idle. Claims are atomic via the `claim_sd` RPC (one at a time; foreign-holder rejection;
stale-takeover at ≥900s heartbeat age).

## The coordinator (manager / SRE)

Runs hands-free on cron loops with four SRE duties: **resource-pool management** (keep the belt
full), **liveness supervision** (judge by `loop_state`, not heartbeat age), **flow + silent-failure
detection**, **dependency watching**. It **dispatches** (never builds), **sweeps** dead
claims/worktrees every 5 min, **revives** dead workers (requests a spawn), and **escalates** genuine
human questions to the chairman via the executive email. **No agent calls another directly** — every
interaction is a `session_coordination` row.

## Capacity forecaster / belt-low detection

The coordinator's capacity forecaster surfaces when the belt is running low ("belt-low") and, before
hand-asking Adam, checks the **sourcing engine state first** (engine flags + unpromoted
`roadmap_wave_items` count) — perpetual manual backfill is an anti-pattern
(SD-LEO-INFRA-COORDINATOR-SOURCING-ENGINE-AWARENESS-001). When belt-low + engine OFF + unpromoted
items exist, the forecaster nudges *activate/distill* rather than asking a human to hand-mine. The
needle-movement rank (link 11) and the build forecast (link 12) also feed the coordinator's backlog
ordering.

## Existing documentation

- `docs/protocol/README.md` — the canonical harness overview. **Coverage: good.**
- `docs/protocol/fleet-coordinator-and-worker-behavior.md`, `fleet-worker-loop-directive.md`,
  `coordinator-worker-revival.md`. **Coverage: good.**
- `docs/reference/fleet-coordination.md`, `docs/reference/worker-registry-guide.md`,
  `docs/reference/heartbeat-manager.md`. **Coverage: good.**
- **Gap (filled here):** none of the above placed the belt/coordinator/fleet *inside* the broader
  vision→roadmap→sourcing flywheel. This page is that bridge.

## Connects to

- **Up from:** the sourcing engine / Adam fill the belt ([07-sourcing-engine.md], [06-adam-sourcing.md]).
- **Down to:** LEO execution — a claimed SD runs LEAD→PLAN→EXEC ([09-leo-execution.md]).
- **Ordered by:** prioritization ([11-prioritization.md]); informed by the forecast
  ([12-forecasting.md]).
- **Reports up via:** the executive summary email's worker count ([15-executive-summary-email.md]).
