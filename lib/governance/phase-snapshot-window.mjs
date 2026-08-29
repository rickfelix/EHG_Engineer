/**
 * lib/governance/phase-snapshot-window.mjs — SD-LEO-INFRA-BURN-TELEMETRY-PER-001-D (FR-1, FR-2)
 *
 * Pure builder for the pre-registered phase-boundary snapshot window stamped onto the
 * sd_phase_handoffs row that OPENS the phase a handoff transitions INTO (to_phase). This row
 * is created before any work in the new phase has occurred (scripts/modules/handoff/recording/
 * HandoffRecorder.js's createArtifact fires after gate validation completes, at the instant the
 * new phase begins), so stamping it here is a genuine pre-registration point.
 *
 * Immutability (the actual guarantee the chairman-approved M1+M2 burn-lever amendment needs) is
 * enforced database-side by the phase_snapshot_window_freeze trigger (database/chairman-gated/
 * 20260829_phase_snapshot_windows_agent_class_rates.sql) -- this module only builds the payload,
 * it never re-registers a window for an already-stamped row.
 */

/**
 * Build the window payload for a newly-inserted sd_phase_handoffs row.
 * @param {{sdId: string, fromPhase: string, toPhase: string, registeredAt?: string}} params
 * @returns {{window_registered_at: string, baseline_snapshot: object}}
 */
export function buildPhaseSnapshotWindow({ sdId, fromPhase, toPhase, registeredAt } = {}) {
  const window_registered_at = registeredAt || new Date().toISOString();
  return {
    window_registered_at,
    baseline_snapshot: {
      sd_id: sdId ?? null,
      from_phase: fromPhase ?? null,
      to_phase: toPhase ?? null,
      registered_at: window_registered_at,
      // Reserved for the burn-lever gauge (Solomon-owned) to populate with per-loop/per-seat
      // metrics once sibling -C's context_usage_log population fix lands. Left explicitly empty
      // rather than fabricated, per this SD's own scope: acting on/computing burn metrics is out
      // of scope here -- only the pre-registration mechanics are.
      metrics: {},
    },
  };
}
