/**
 * Stage-0 Traversability Gate
 * SD-LEO-INFRA-STAGE0-TRAVERSABILITY-GATE-001 (spec R6, deep-challenge commission)
 *
 * Post-generation HARD gate: every candidate's declared required capabilities are
 * checked against the LIVE capability envelope (v_unified_capabilities). A candidate
 * requiring a capability the factory has not delivered FAILS traversability regardless
 * of rank/score — the stub class begins at selection, and this gate ends it there.
 *
 * Design invariants:
 * - FAIL-CLOSED: an unreachable envelope throws EnvelopeUnavailableError; there is no
 *   fallback envelope constant and no silent pass (twin of PostureResolutionError).
 * - MECHANICAL: matching is normalized-name containment only — no fuzzy scoring, no
 *   LLM judgment inside the gate. Auditability over cleverness.
 * - HONEST: candidates that declare no requirements PASS but are stamped
 *   `traversability: 'no_requirements_declared'` and counted — visible, never silent.
 * - NOT SILENTLY DROPPED: failed candidates park into the LIVE venture_nursery schema
 *   with machine-readable resurfacing conditions ('viable when capability X ships').
 *   NOTE: venture-nursery.js parkVenture()/runNurseryReeval() are drifted against the
 *   live table (flagged separately, feedback ecab6c51) — this module deliberately
 *   writes the verified live columns and does not call them.
 */

/** Delivered = the ledger's own claim of what genuinely ships today (spec R6). */
const DEFAULT_DELIVERED_MATURITY = ['production'];

export class EnvelopeUnavailableError extends Error {
  /** @param {string} reason - no_supabase_client | view_unavailable
   *  @param {string} [detail] */
  constructor(reason, detail) {
    super(`Capability envelope unavailable (${reason})${detail ? `: ${detail}` : ''} — traversability gate fails closed; selection cannot proceed without the live envelope (spec R6)`);
    this.name = 'EnvelopeUnavailableError';
    this.reason = reason;
  }
}

/** lowercase, collapse non-alphanumerics to single spaces, trim. */
export function normalizeCapabilityName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Read the live capability envelope. Fail-closed.
 *
 * @param {Object} deps
 * @param {Object} deps.supabase - required
 * @param {Object} [deps.logger]
 * @param {string[]} [deps.deliveredMaturityLevels] - default ['production']
 * @returns {Promise<{delivered: Object[], deliveredNames: string[], loadedAt: string, count: number}>}
 * @throws {EnvelopeUnavailableError}
 */
export async function loadCapabilityEnvelope(deps = {}) {
  const { supabase, logger = console, deliveredMaturityLevels = DEFAULT_DELIVERED_MATURITY } = deps;

  if (!supabase) {
    throw new EnvelopeUnavailableError('no_supabase_client');
  }

  const { data, error } = await supabase
    .from('v_unified_capabilities')
    .select('name, capability_type, maturity_level, scope')
    .in('maturity_level', deliveredMaturityLevels);

  if (error) {
    throw new EnvelopeUnavailableError('view_unavailable', error.message);
  }
  if (data == null) {
    throw new EnvelopeUnavailableError('view_unavailable', 'null result with no error');
  }

  const delivered = data;
  const deliveredNames = delivered.map(r => normalizeCapabilityName(r.name)).filter(Boolean);
  logger.log(`   Traversability gate: live envelope loaded — ${delivered.length} delivered capabilit${delivered.length === 1 ? 'y' : 'ies'}`);

  // An EMPTY delivered envelope is an honest (thin) envelope, not an error.
  return { delivered, deliveredNames, loadedAt: new Date().toISOString(), count: delivered.length };
}

/** A requirement matches iff a delivered name contains it, or it contains a delivered name. */
function requirementMatches(reqNameNorm, deliveredNames) {
  if (!reqNameNorm) return false;
  return deliveredNames.some(cap => cap && (cap.includes(reqNameNorm) || reqNameNorm.includes(cap)));
}

/** Accept required_capabilities entries as {name, kind} objects or bare strings. */
function toRequirement(entry) {
  if (entry == null) return null;
  if (typeof entry === 'string') return { name: entry, kind: 'unspecified' };
  if (typeof entry === 'object' && entry.name) return { name: entry.name, kind: entry.kind || 'unspecified' };
  return null;
}

/**
 * Hard-check candidates against the delivered envelope. Pure and deterministic.
 *
 * @param {Object[]} candidates - ranked candidates (may carry required_capabilities)
 * @param {{deliveredNames: string[]}} envelope - from loadCapabilityEnvelope()
 * @returns {{passed: Object[], failed: Object[], stats: Object}}
 */
export function checkTraversability(candidates, envelope) {
  if (!envelope || !Array.isArray(envelope.deliveredNames)) {
    throw new EnvelopeUnavailableError('view_unavailable', 'checkTraversability called without a loaded envelope');
  }

  const passed = [];
  const failed = [];
  let undeclared = 0;

  for (const candidate of candidates || []) {
    const requirements = (Array.isArray(candidate.required_capabilities) ? candidate.required_capabilities : [])
      .map(toRequirement)
      .filter(Boolean);

    if (requirements.length === 0) {
      undeclared += 1;
      passed.push({ ...candidate, traversability: 'no_requirements_declared' });
      continue;
    }

    const missing = requirements.filter(r => !requirementMatches(normalizeCapabilityName(r.name), envelope.deliveredNames));

    if (missing.length === 0) {
      passed.push({ ...candidate, traversability: 'passed' });
    } else {
      failed.push({
        candidate,
        missing,
        resurfacing_conditions: missing.map(m => ({
          type: 'capability_ships',
          capability: m.name,
          kind: m.kind,
          condition: `viable when capability ${m.name} ships`,
        })),
      });
    }
  }

  return {
    passed,
    failed,
    stats: {
      total: (candidates || []).length,
      passed: passed.length,
      failed: failed.length,
      undeclared,
    },
  };
}

/**
 * Park an envelope-failed candidate into venture_nursery — the LIVE schema
 * (name, description, maturity_level ∈ seed|sprout|ready, trigger_conditions jsonb,
 * current_score, source_type ∈ ...|discovery_mode, source_ref jsonb).
 *
 * @param {Object} failure - one entry from checkTraversability().failed
 * @param {Object} context - { posture_version?, strategy? }
 * @param {Object} deps - { supabase, logger }
 * @returns {Promise<Object>} inserted row
 */
export async function parkFailedCandidate(failure, context = {}, deps = {}) {
  const { supabase, logger = console } = deps;
  if (!supabase) throw new Error('supabase client is required');

  const c = failure.candidate;
  const missingNames = failure.missing.map(m => m.name).join(', ');

  const { data, error } = await supabase
    .from('venture_nursery')
    .insert({
      name: c.name,
      description: `${c.problem_statement || ''} → ${c.solution || ''}`.trim() ||
        `Parked by traversability gate (missing: ${missingNames})`,
      maturity_level: 'seed',
      trigger_conditions: failure.resurfacing_conditions,
      current_score: Number.isFinite(c.composite_score) ? c.composite_score : null,
      source_type: 'discovery_mode',
      source_ref: {
        gate: 'traversability',
        sd: 'SD-LEO-INFRA-STAGE0-TRAVERSABILITY-GATE-001',
        missing: failure.missing,
        posture_version: context.posture_version || null,
        strategy: context.strategy || null,
        candidate: {
          name: c.name,
          problem_statement: c.problem_statement || null,
          solution: c.solution || null,
          target_market: c.target_market || null,
          composite_score: c.composite_score ?? null,
          prompt_version: c.prompt_version ?? null,
        },
      },
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to park envelope-failed candidate '${c.name}': ${error.message}`);

  logger.log(`   Traversability gate: parked '${c.name}' (missing: ${missingNames})`);
  return data;
}
