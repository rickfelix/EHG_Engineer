/**
 * Feedback audience classification — write-time routing for closure-map class C7.
 * SD-LEO-INFRA-TELEMETRY-AUDIENCE-ROUTING-001.
 *
 * Single source of truth for "who should see this feedback row": derives an
 * audience from feedback.category so emitFeedback() can route machine-telemetry
 * writes to an aggregate (dedup-and-increment) form instead of one row per
 * detector firing.
 *
 * SCOPE NOTE (deliberately narrower than the docs-only denylist in
 * docs/governance/chairman-decision-surfaces.md, which also names
 * harness_backlog/process_enforcement): 'harness_backlog' is emitFeedback()'s
 * own DEFAULT category (used broadly by dozens of callers — scripts/log-harness-bug.js,
 * lifecycle-sd-bridge.js's PA-5 warning, retro sub-agents, etc. — many carrying
 * genuinely distinct, human-relevant content, not repetitive detector noise).
 * Discovered via the existing test suite failing when harness_backlog was
 * included: force-aggregating it would silently collapse distinct backlog
 * items into one row per day, a WORSE "never signal" failure than the
 * original noise problem. The allowlist below is scoped to ONLY the
 * empirically-proven incident (closure-map C7: 66/75 chairman-queue rows,
 * one detector, lib/fleet/dormancy-watchdog.cjs, category='fleet_dormancy')
 * — extend it only with the same live-verification rigor, never by pattern-
 * matching a docs convention.
 *
 * Note: 'chairman-actionable' is NOT derivable from category alone — that
 * determination is driven by feedback.severity + resolution status (see
 * chairman_unified_decisions' flag_review branch predicate) and is already
 * correctly excluded at the decision_type level by
 * lib/chairman/chairman-actionable.mjs's TELEMETRY_DECISION_TYPES — this module
 * does not duplicate that check. It only answers the binary this SD's write path
 * needs: is this category known machine telemetry, or everything else (which
 * fails open to normal, unchanged insert behavior — never silently dropped).
 *
 * @module lib/governance/feedback-audience
 */

/** Categories known to be auto-filed machine telemetry, never a human decision. */
export const MACHINE_TELEMETRY_CATEGORIES = Object.freeze([
  'fleet_dormancy',
  // NOT 'wind_down_survey', and the reason is worth recording because it is not obvious.
  // SD-LEO-INFRA-TERMINAL-RITUAL-ENFORCEMENT-001 floods this table (~266 rows/4.5h in the human
  // lane) and adding it here LOOKS like the one-line fix — I made that change and the pin below
  // caught it. Membership routes a category through the aggregate UPSERT in emit-feedback.js:232,
  // whose hash is ALWAYS `${today}::telemetry::${category}` with the caller's dedup_key
  // deliberately ignored: ALL rows for a category collapse into ONE per day. wind_down_survey's
  // value is entirely in its PER-ROW metadata.reason breakdown (blocked_unarmed vs
  // second_stop_still_unarmed vs turn_end_*) — that is the instrument the SD's own step-C gate
  // reads and DEV-5 was decided on. Aggregating it would silence the detector to fix the volume.
  // The right fix keeps one row per event and keeps it OUT of the human queue; that needs a
  // non-aggregating machine lane, which belongs to this module's owner, not to a hook SD.
]);

/**
 * @param {string} category feedback.category value
 * @returns {'coordinator-operational' | 'machine-telemetry'}
 */
export function resolveFeedbackAudience(category) {
  if (MACHINE_TELEMETRY_CATEGORIES.includes(category)) return 'machine-telemetry';
  return 'coordinator-operational';
}
