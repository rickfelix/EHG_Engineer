---
category: reference
status: approved
version: 1.1.0
author: Claude (SD-LEO-INFRA-LAUNCH-MODE-POLICY-001, SD-LEO-INFRA-VENTURE-SUBSTRATE-WIRING-001)
last_updated: 2026-07-17
tags: [reference, eva, launch-mode, go-live, chairman-gated, spend-guardrails, promote]
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
  Guardrail/deploy wiring below never fires on this path.
- `launch_mode='live'`: collects + verifies external observations. If verified, proceeds to
  `launch_status:'launched'` and (SD-LEO-INFRA-VENTURE-SUBSTRATE-WIRING-001) additionally: builds a guardrail
  context and calls `persistGuardrailDecisions` (`lib/venture-deploy/spend-guardrails.js`), then calls
  `promote()` (`lib/venture-deploy/promote.js`, plan-mode only — no `deps.execute`) sourcing the deploy sha
  from the latest `venture_preview_instances` row with `status='live'`. Both calls are wrapped in their own
  try/catch and record outcomes on the result (`guardrails_persisted`/`guardrails_persist_error`,
  `promote_status`/`promote_error`) — a failure here never blocks the launch itself. If verification fails,
  returns `launch_status:'hold_external_observation_unverified'` (`launched_at: null`) instead of launching
  on unverified evidence, and none of the above fires.

Both paths attach `payload.composable_evidence = { launch_mode, external_observation, verdict }` in live
mode — a forward-compatibility data contract (pinned by a contract test in
`tests/unit/eva/stage-24-go-live-launch-mode.test.js`) so a future SD formalizing "G3 done-means-shipped"
can consume the artifact without another schema change.

## Known gaps (forward dependencies)

1. No real telemetry data source for the `telemetry_rows_arrive` external-observation check.
2. No "G3 done-means-shipped" module exists yet; `composable_evidence` is the landing surface for whichever
   SD formalizes it.
3. The live per-venture spend-guardrail is now wired (see Consumer above) but only 3 of 8 guardrail inputs
   have a real measurement source (agent-token ceiling, chairman human-gate, isolation scope); the other 5
   (CI/migration determinism, D1 writes, operator-export, Neon plan, Cloud Run max-instances) have no
   measurement source anywhere in the codebase and are intentionally left `undefined` so the guardrail
   fails closed rather than fabricating a pass — see `strategic_directives_v2.metadata.guardrail_measurement_gap`
   for SD-LEO-INFRA-VENTURE-SUBSTRATE-WIRING-001.
4. `promote()` here writes `venture_deployments.status='planned'` (plan-mode), not `'routed'` — real
   execute-mode against a live venture remains SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-A's chairman-gated scope.
