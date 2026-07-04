---
category: reference
status: approved
version: 1.0.0
author: Claude (SD-LEO-INFRA-LAUNCH-MODE-POLICY-001)
last_updated: 2026-07-04
tags: [reference, eva, launch-mode, go-live, chairman-gated]
---

# Launch-Mode Policy

Per-venture `launch_mode` (`simulated` | `live`) distinguishing whether a venture's go-live artifacts are
self-authored simulation data or externally-verified real observations. Closes the "S16 grounding-failure
class" where a labeled-simulation artifact could satisfy a go-live gate as if it were real.

## Column

`ventures.launch_mode TEXT NOT NULL DEFAULT 'simulated' CHECK (launch_mode IN ('simulated','live'))`
(`database/migrations/20260703_ventures_launch_mode.sql`, **chairman-gated** — staged, not auto-applied at
merge; the chairman applies it via the existing chairman-apply flow).

Distinct from `ventures.pipeline_mode` (lifecycle-stage axis: building/operations/growth/...) — `launch_mode`
is an artifact-authenticity axis. Set by the chairman at S23/go-live via the existing decision-queue /
StageSettingsSheet mechanism (ehg repo) — no new UI was added by this policy.

## Read helpers — `lib/eva/launch-mode.js`

- `getLaunchMode(supabase, ventureId)` — fails open to `'simulated'` on any error, including the column not
  existing yet (pre-chairman-apply `undefined_column`). Callers never need to guard for the migration's apply
  state.
- `isLiveMode(mode)` / `isSimulatedMode(mode)` — pure predicates.

## External-observation verification — `lib/eva/external-observation.js`

`verifyExternalObservation({endpointStatus, billingProductId, telemetryRowCount})` is a pure function that
fails **closed** (`verified:false`, per-check `reason:'NO_DATA_SOURCE'`) on any missing input — it never
silently passes. `collectExternalObservations({supabase, ventureId})` is the sole I/O boundary: fetches the
venture's `applications.deployment_url` (HTTP GET) and reads `applications.metadata.billing_product_id`.

**`telemetryRowCount` has no data source in this repo today** — `collectExternalObservations` always returns
`null` for it, so a `live`-mode venture will fail-closed on that check until a future SD wires a real
per-venture telemetry table. This is intentional, not a bug: no real evidence source means no pass.

## Consumer — `lib/eva/stage-templates/analysis-steps/stage-24-go-live.js`

When the chairman's go-live trigger fires (`launchedAt` set):
- `launch_mode='simulated'` (default): unchanged existing behavior, plus `payload.labeled_simulation = true`.
- `launch_mode='live'`: collects + verifies external observations. If verified, proceeds to
  `launch_status:'launched'`. If not, returns `launch_status:'hold_external_observation_unverified'`
  (`launched_at: null`) instead of launching on unverified evidence.

Both paths attach `payload.composable_evidence = { launch_mode, external_observation, verdict }` in live
mode — a forward-compatibility data contract (pinned by a contract test in
`tests/unit/eva/stage-24-go-live-launch-mode.test.js`) so a future SD formalizing "G3 done-means-shipped"
or a live per-venture spend-guardrail (neither exists in this codebase as of this writing) can consume the
artifact without another schema change.

## Known gaps (forward dependencies)

1. No real telemetry data source for the `telemetry_rows_arrive` external-observation check.
2. No "G3 done-means-shipped" module or live per-venture spend-guardrail exists yet; `composable_evidence`
   is the landing surface for whichever SD formalizes either.
