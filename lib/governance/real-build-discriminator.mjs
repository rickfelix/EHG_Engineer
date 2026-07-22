/**
 * Real-build discriminator — SD-LEO-INFRA-VENTURE-REAL-DISCRIMINATOR-AND-STALL-ALARM-001-A
 * (Part 1 of a decomposed orchestrator; Part 2 = the stall alarm, a separate child).
 *
 * @wire-check-exempt: pure derived predicate consumed by the one-time backfill CLI
 *   (scripts/one-time/backfill-real-build-provenance.mjs, itself wire-check-exempt) and by
 *   the unit suite; registered as a GRF instance (data). No static import chain from a
 *   package.json entry point today — the wiring (coordinator/stall-alarm surface) is the
 *   Child B activation follow-on. Same shape as representation-faithfulness.js's exemption.
 *
 * THE DIVERGENCE THIS CATCHES (a Governing-Representation-Faithfulness instance):
 *   R1 (source-of-truth) = whether a REAL build has actually started for the venture —
 *      evidenced by deployment_url / repo_url / workflow_started_at, or launch_mode='live'.
 *   R2 (governing gauge)  = current_lifecycle_stage, the number the whole lifecycle acts on.
 *   A GENUINE (non-fixture) venture can advance R2 to a high stage while R1 stays false —
 *      it "simulation-validated" its way forward without ever starting a real build. Canonical
 *      live case: "ApexNiche AI" at stage-19, launch_mode='simulated', deployment_url / repo_url
 *      / workflow_started_at all null. This module DERIVES that divergence and annotates it —
 *      it NEVER writes or resets current_lifecycle_stage (the gauge is read-only here). See the
 *      'stage-vs-real-build' entry in lib/governance/representation-faithfulness.js INSTANCE_REGISTRY.
 *
 * Pure (data-in / verdict-out): zero I/O, zero DB, zero schema dependency beyond the field names.
 */

/**
 * STAGE_SIMULATION_OK — the highest EARLY lifecycle stage at which a simulation-only venture
 * (no real-build evidence) is legitimately expected.
 *
 * Chosen conservatively at 18: in the venture lifecycle the real build begins at Stage 19
 * (`ventures.build_model` is documented as the "SSOT venture build path at Stage 19"), so
 * stages 1-18 are ideation / validation / design / naming where simulation-only is normal and
 * correct. A venture PAST Stage 18 (i.e. stage > 18) with no real-build evidence has advanced
 * its gauge beyond the point where a real build should have started — that is the divergence.
 * This flags ApexNiche AI at stage-19 (19 > 18) while never flagging a genuinely-early simulated
 * venture (stage <= 18).
 *
 * NOTE: this is a single flat threshold. Child B (the stall alarm) refines this with TIERED
 * clocks (how LONG a venture has sat past the threshold without real-build evidence) — this
 * constant is the divergence boundary, not the escalation policy.
 * @type {number}
 */
export const STAGE_SIMULATION_OK = 18;

/**
 * Has a REAL build started for this venture? (R1 — source of truth.) Pure, no DB, no schema
 * dependency: any ONE piece of real-build evidence is sufficient.
 *   - deployment_url set  → something was deployed
 *   - repo_url set        → a real repo exists
 *   - workflow_started_at → the build workflow actually kicked off
 *   - launch_mode==='live'→ explicitly a live (not simulated) launch
 * @param {{deployment_url?:string|null, repo_url?:string|null, workflow_started_at?:string|null, launch_mode?:string|null}} v
 * @returns {boolean}
 */
export function isRealBuildStarted(v = {}) {
  return Boolean(v.deployment_url)
    || Boolean(v.repo_url)
    || Boolean(v.workflow_started_at)
    || v.launch_mode === 'live';
}

/**
 * Assess the stage-gauge-vs-real-build divergence for one venture. READ-ONLY on the stage
 * gauge — this never writes or resets current_lifecycle_stage.
 * divergent === true  iff  the real build has NOT started AND the stage gauge is past the
 * simulation-OK boundary (stage > STAGE_SIMULATION_OK). Otherwise benign.
 * @param {{current_lifecycle_stage?:number|null, launch_mode?:string|null, deployment_url?:string|null, repo_url?:string|null, workflow_started_at?:string|null}} v
 * @returns {{ real_build_started:boolean, stage:number|null, launch_mode:string|null, divergent:boolean, annotation:string }}
 */
export function assessRealBuildDivergence(v = {}) {
  const real_build_started = isRealBuildStarted(v);
  const stage = v.current_lifecycle_stage ?? null;
  const launch_mode = v.launch_mode ?? null;
  const divergent = !real_build_started && Number(stage) > STAGE_SIMULATION_OK;

  const annotation = divergent
    ? `simulation-validated-vs-real-build divergence: stage=${stage} but real_build_started=false `
      + `(launch_mode=${launch_mode}, no deployment/repo/workflow evidence) — gauge advanced past `
      + `STAGE_SIMULATION_OK=${STAGE_SIMULATION_OK} without a real build`
    : real_build_started
      ? `real build started (launch_mode=${launch_mode}) — stage=${stage} is faithful to real-build state`
      : `no real build yet, but stage=${stage} <= STAGE_SIMULATION_OK=${STAGE_SIMULATION_OK} — `
        + `simulation-only is legitimately expected this early`;

  return { real_build_started, stage, launch_mode, divergent, annotation };
}
