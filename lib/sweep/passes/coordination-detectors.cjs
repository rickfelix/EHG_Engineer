// SD-ARCH-HOTSPOT-SWEEP-001: extracted from scripts/stale-session-sweep.cjs main()
// (was lines ~2715-2779): signal-router aggregation, coordination anomaly detectors,
// inert-worker-revival surfacing, and completion-boundary silent-exit surfacing.
// Fully self-contained — reads only supabase and its own lazily-required lib modules,
// no dependency on `classified`/`actions`/`warnings`/anything else in ctx. Each
// sub-step is independently fail-open (a failure in one never aborts the others or
// the sweep). Left OUT OF SCOPE for this pass (stays inline in main(), a distinct
// concern — notification delivery, not detector invocation, and not flag-gated):
// the SIGNAL_RESOLVED notification block that follows.

const signalRouterModule = require('../../coordinator/signal-router.cjs');
const coordEventsModule = require('../../coordinator/coordination-events.cjs');
const priorPhasesModule = require('../../coordinator/prior-phases.cjs'); // FR-5
const workerSignalStarvationModule = require('../../coordinator/worker-signal-starvation.cjs');

async function run(ctx) {
  const { supabase } = ctx;

  // Best-effort signal-router aggregation — failure does not abort sweep.
  try {
    const result = await signalRouterModule.aggregateSignals(supabase);
    if (result.error) {
      console.log('SIGNAL ROUTER: error=' + result.error.message);
    } else if (result.promoted > 0 || result.skipped > 0) {
      console.log('SIGNAL ROUTER: promoted=' + result.promoted + ' skipped=' + result.skipped);
      for (const row of (result.promotedRows || [])) {
        console.log('  HARNESS_BACKLOG_CREATED: feedback_id=' + row.feedback_id + ' type=' + row.signal_type + ' callsigns=' + row.callsigns.join(',') + ' count=' + row.signal_count);
      }
    }
  } catch (routerErr) {
    console.log('SIGNAL ROUTER: ' + (routerErr && routerErr.message ? routerErr.message : 'unknown'));
  }

  // QF-20260726-921: worker-signal starvation COUNT in the tick line (read-only, always printed even
  // at =0, deliberately NOT behind COORD_DETECTORS_V2). Full rationale lives in the helper, which the
  // SWEEP_PASS_REGISTRY=off twin in legacy-fallback.cjs calls too so this cannot become a one-sided fix.
  await workerSignalStarvationModule.reportWorkerSignalStarvation(supabase);

  // Coordination anomaly detectors — DEFAULT-OFF behind COORD_DETECTORS_V2.
  // READ-ONLY over claim state; fail-open; fully inert when the flag is off.
  try {
    if (coordEventsModule.coordDetectorsEnabled()) {
      const coordInputs = await coordEventsModule.gatherDetectorInputs(supabase, {});
            // SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 (FR-5): supply the phase each claim held at the
      // start of the staleness window. detectStuckWorker has always implemented the phase-unchanged
      // guard and runDetectors has always threaded priorPhases — no production caller ever supplied
      // the data, so 'alive but not moving' could not be distinguished from 'alive and progressing'.
      // Derived from sd_phase_handoffs (already durable) rather than a snapshot table, so it survives
      // sweep restarts and missed ticks. Fail-open: null => detector behaves exactly as before.
      // INERT until COORD_DETECTORS_V2 is ungated, which is a separate deliberate step.
      const priorPhases = await priorPhasesModule.fetchPriorPhases(supabase, coordInputs.claims);
      const coordMatches = await coordEventsModule.runAndLogDetectors(supabase, coordInputs, { priorPhases });
      for (const m of coordMatches) {
        console.log('  COORD_DETECTOR: ' + m.event_type + ' [' + m.severity + '] ' + m.reason + (m.logged ? '' : ' (event-log-failed)'));
      }
      if (coordMatches.length > 0) console.log('COORD_DETECTORS: ' + coordMatches.length + ' anomaly event(s) flagged');
    }
  } catch (coordDetErr) {
    console.log('COORD_DETECTORS: ' + (coordDetErr && coordDetErr.message ? coordDetErr.message : 'unknown'));
  }

  // Inert-worker-revival surfacing — DEFAULT-OFF behind SURFACE_INERT_WORKER_V1,
  // READ-ONLY over worker_spawn_requests, fail-open. Emits ONE de-duped operator
  // alert when pending spawn requests age past threshold with no consumer.
  try {
    const inert = await coordEventsModule.runInertWorkerSurfacing(supabase, {});
    if (inert && inert.matched) {
      const a = inert.alert || {};
      const tail = a.skipped ? ' (alert deduped)' : a.ok ? ' - operator alert emitted' : ' (alert emit failed)';
      console.log('  INERT_WORKER: ' + inert.aged_count + ' aged unconsumed spawn request(s)' + tail);
    }
  } catch (inertErr) {
    console.log('INERT_WORKER: ' + (inertErr && inertErr.message ? inertErr.message : 'unknown'));
  }

  // Completion-boundary silent-exit surfacing (QF-20260705-817) — DEFAULT-OFF behind
  // SURFACE_COMPLETION_BOUNDARY_EXIT_V1, READ-ONLY, fail-open. Emits ONE de-duped
  // operator alert when a worker's loop exited right after completing a phase/SD
  // while unclaimed work waits.
  try {
    const exitSurf = await coordEventsModule.runCompletionBoundaryExitSurfacing(supabase, {});
    if (exitSurf && exitSurf.matched) {
      const a = exitSurf.alert || {};
      const tail = a.skipped ? ' (alert deduped)' : a.ok ? ' - operator alert emitted' : ' (alert emit failed)';
      console.log('  COMPLETION_BOUNDARY_EXIT: ' + exitSurf.exited_count + ' worker(s) silent-exited post-completion' + tail);
    }
  } catch (exitErr) {
    console.log('COMPLETION_BOUNDARY_EXIT: ' + (exitErr && exitErr.message ? exitErr.message : 'unknown'));
  }
}

module.exports = { name: 'coordination-detectors', run };
