/**
 * Fail-soft breakage-alert call-site boundary — SD-LEO-INFRA-BREAKAGE-DETECTOR-SURFACE-001-C (child C).
 *
 * The SINGLE boundary the three passive detectors (schema-reference-lint, migration-apply-state,
 * row-growth) use to surface a breakage into system_alerts. It resolves a service client and delegates
 * to child-B's FAIL-LOUD recordSystemAlert (lib/breakage/alert-writer.cjs), then CATCHES — so alerting
 * is additive observability and NEVER a new failure mode for a lint / migration / row-growth run
 * (TR-2). Detectors pass only the FROZEN child-A break_class id (lib/coordinator/break-class-taxonomy);
 * this boundary never re-encodes the taxonomy or hand-rolls an insert.
 *
 * Importing recordSystemAlert here is what makes alert-writer.cjs genuinely reachable (the
 * removal-conditioned wire-check exemption on that module is removed by this child as a result —
 * the literal marker token is deliberately NOT written here so this file is itself wire-checked).
 *
 * @module lib/breakage/emit-breakage-alert
 */
'use strict';

const { recordSystemAlert } = require('./alert-writer.cjs');

/**
 * Best-effort surface of a breakage to system_alerts. Returns a verdict object, NEVER throws.
 * @param {string} breakClass - a frozen child-A break class id (e.g. 'schema-drift')
 * @param {string} sourceService - the detector identity (NOT NULL on system_alerts)
 * @param {object} [opts] - { severity?, title?, message?, sourceEntityId?, metadata? } forwarded to recordSystemAlert
 * @param {object} [deps] - { supabase?, getClient? } injection seam for tests (no live writes)
 * @returns {Promise<{ok:boolean, id?:string, deduped?:boolean, error?:string}>}
 */
async function emitBreakageAlert(breakClass, sourceService, opts = {}, deps = {}) {
  try {
    const supabase = deps.supabase
      || (deps.getClient ? deps.getClient() : require('../supabase-client.cjs').createSupabaseServiceClient());
    const res = await recordSystemAlert(supabase, { breakClass, sourceService, ...opts });
    return { ok: true, ...res };
  } catch (e) {
    // FAIL-SOFT: log to stderr and continue — the detector's primary signal/exit code must stand.
    // (recordSystemAlert is fail-loud internally; the call site is where we decide not to propagate.)
    console.warn(`[breakage-alert] ${sourceService}/${breakClass} alert write skipped (fail-soft): ${e && e.message}`);
    return { ok: false, error: e && e.message };
  }
}

module.exports = { emitBreakageAlert };
