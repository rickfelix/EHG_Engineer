// SD-ARCH-HOTSPOT-SWEEP-001: shared ctx contract for sweep passes.
//
// ctx = {supabase, now, classified, telemetryMap, actions, warnings} at minimum,
// extended per-pass only via additive optional fields on the same ctx object
// (collisionsDetected for intent-collision-detection) — never a per-pass bespoke
// positional signature. This is a de-facto in-process interface, not persisted
// anywhere (no schema/DDL implications).
//
// No factory function is needed today (main() builds the object literal directly at
// each call site — EARLY_PASSES ctx is a subset since `classified`/`telemetryMap`
// don't exist yet at that point in main()). This file exists as the single documented
// source of truth for the shape, referenced by every pass module's header comment.

/**
 * @typedef {object} SweepPassCtx
 * @property {import('@supabase/supabase-js').SupabaseClient} supabase
 * @property {Date} now
 * @property {Array<object>} [classified] - only present in MAIN_PASSES ctx (post-classification)
 * @property {Map<string, object>} [telemetryMap] - only present in MAIN_PASSES ctx
 * @property {Array<string>} actions
 * @property {Array<string>} warnings
 * @property {Array<object>} [collisionsDetected] - INTENT collision accumulator (main()'s collisionsDetected array)
 */

module.exports = {};
