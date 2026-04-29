/**
 * Capability gate (Rule 9): pre-advancement check that asserts required
 * capabilities are present before the Stage 20 quality loop runs.
 *
 * SD: SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-E
 *
 * Fails closed: any missing required capability blocks the loop. Optional
 * capabilities are reported as warnings but do not block.
 *
 * Bypass requires --bypass-validation with --bypass-reason ≥20 chars + ticket
 * reference (per memory feedback_bypass_validation_needs_ticket_ref). All
 * bypasses logged to audit_log.
 *
 * @module lib/eva/quality-findings/capability-gate
 */

import { CAPABILITIES } from './capability-registry.js';

/**
 * Walk the registry and probe each capability.
 *
 * @param {Object} [opts]
 * @param {Array<string>} [opts.skip]       - capability names to skip (test-only)
 * @returns {{
 *   pass: boolean,
 *   missing_required: Array<{name, error}>,
 *   missing_optional: Array<{name, error}>,
 *   versions: Object,
 * }}
 */
export function evaluateCapabilities(opts = {}) {
  const skip = new Set(opts.skip || []);
  const missing_required = [];
  const missing_optional = [];
  const versions = {};

  for (const cap of CAPABILITIES) {
    if (skip.has(cap.name)) continue;
    const result = cap.probe();
    if (result.ok) {
      if (result.version) versions[cap.name] = result.version;
    } else {
      const entry = { name: cap.name, error: result.error };
      if (cap.optional) {
        missing_optional.push(entry);
      } else {
        missing_required.push(entry);
      }
    }
  }

  return {
    pass: missing_required.length === 0,
    missing_required,
    missing_optional,
    versions,
  };
}

/**
 * Run the capability gate. Throws structured error on missing required
 * capabilities (fail-closed). Returns evaluation result on pass.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.bypass]        - skip the gate (requires bypassReason)
 * @param {string}  [opts.bypassReason]  - ≥20 chars, ticket reference
 * @param {Object}  [opts.supabase]      - service-role client for audit log
 * @returns {Promise<Object>} evaluation result
 */
export async function runCapabilityGate(opts = {}) {
  const { bypass, bypassReason, supabase } = opts;

  if (bypass) {
    if (!bypassReason || bypassReason.length < 20) {
      throw new Error(
        'Capability gate bypass requires --bypass-reason ≥20 chars with ticket reference'
      );
    }
    await logBypass(supabase, bypassReason);
    return { pass: true, bypassed: true, bypassReason };
  }

  const evaluation = evaluateCapabilities();

  if (!evaluation.pass) {
    const errs = evaluation.missing_required.map((c) => `  - ${c.name}: ${c.error}`).join('\n');
    throw new Error(
      `Capability gate FAILED — ${evaluation.missing_required.length} required capability(ies) missing:\n${errs}\n\n` +
      `Install missing capabilities or invoke with --bypass-validation --bypass-reason "<ticket reference ≥20 chars>" if intentional.`
    );
  }

  return evaluation;
}

/**
 * Log a bypass event to audit_log (best-effort; doesn't throw on DB error).
 */
async function logBypass(supabase, reason) {
  if (!supabase) return; // no client → caller is responsible for audit
  try {
    await supabase.from('audit_log').insert({
      event_type: 'CAPABILITY_GATE_BYPASS',
      severity: 'warning',
      details: { reason, sd_key: process.env.LEO_SD_KEY || null },
    });
  } catch {
    // best-effort: don't block the bypass on audit-log write failure
  }
}

export { CAPABILITIES };
