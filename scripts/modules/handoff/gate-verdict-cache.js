/**
 * Gate-Verdict Cache — SD-MAN-ORCH-LEO-HARNESS-EFFICIENCY-001-B (program L5)
 *
 * Reuses per-gate PASS verdicts across handoff retries when the declared
 * inputs of a gate are byte-identical. 177 rejections in 4 days each re-ran
 * the ENTIRE pipeline, duplicating evaluations of gates whose inputs had not
 * changed.
 *
 * ZERO QUALITY LOSS BY CONSTRUCTION:
 *  - Caching is OPT-IN per gate via a declared input extractor. Live seam
 *    verification showed most gates self-query the DB (inputs invisible at
 *    the loop), so ONLY gates whose validator is a pure function of declared
 *    ctx fields are registered. Undeclared gates ALWAYS re-run.
 *  - Reuse requires: identical sha256 over the stable-stringified extracted
 *    inputs AND prior verdict passed===true. FAIL/CONDITIONAL/WAIT verdicts
 *    are NEVER reused.
 *  - LEAD-FINAL-APPROVAL is hard-excluded (final bar). --no-cache forces a
 *    full re-run. Any doubt (extractor throw, missing prior row, version
 *    mismatch) means re-evaluate.
 *
 * Initial registry (verified pure — validator(ctx) delegates to a pure
 * function of ctx.sd, 0 supabase references in gate or delegate):
 *  - GATE_SD_METRICS_SUFFICIENCY  → validateMetricsSufficiency(ctx.sd)
 *  - GATE_SD_QUALITY              → validateSdQuality(ctx.sd)
 *  - GATE_PLACEHOLDER_CONTENT_DETECTION → validatePlaceholderContent(ctx.sd)
 * All three share one OVER-INCLUSIVE extractor: the union of every SD field
 * any of them evaluates. Over-inclusion is SAFE — an unrelated content-field
 * change only costs a cache miss, never a stale reuse.
 *
 * QF-20260902-476: GATE_MECHANISM_CLAIM_VERIFIER (mechanism-claim-verifier.js,
 * also verified pure — 0 supabase/.from()/LLM references) gets its OWN
 * extractor rather than reusing extractSdContent verbatim: the verifier also
 * reads sd.rationale (folded into SD_CONTENT_FIELDS, over-inclusive-safe for
 * the other three gates too) and sd.metadata.mechanism_verifications, which is
 * NOT a top-level SD field and would otherwise be invisible to the hash — an
 * SD author citing a verifier via that structured field (the gate's own
 * remediation message's primary path) would then never bust the cache,
 * defeating "a later run after editing the SD re-evaluates".
 *
 * FAIL-REPLAY (Solomon amend 75558b62): a registered gate's cached FAIL is
 * replayed (never re-executed) when the declared-input hash is unchanged
 * AND GATE_CODE_VERSION[gate] matches the version stamped on that cached row.
 * The version check is required because the input hash says nothing about
 * whether the VERIFIER'S OWN LOGIC changed since that FAIL was produced — an
 * input-only key would keep replaying a FAIL after the gate itself was fixed.
 * PASS reuse is unaffected and keeps its existing input-only key (a fixed
 * verifier only ever makes PASS more likely, so reusing an old PASS stays
 * safe). Bump the version here whenever a FAIL_REPLAY_GATES gate's rule set
 * changes.
 */

import crypto from 'node:crypto';

export const GATE_RESULTS_VERSION_HASHED = 2;

/** Union of every SD field evaluated by the registered pure gates
 * (sd-quality-scoring.js JSONB_FIELDS + description/scope/sd_type +
 * sd-validation.js metrics-sufficiency reads). */
export const SD_CONTENT_FIELDS = [
  'title',
  'description',
  'sd_type',
  'scope',
  'rationale',
  'strategic_objectives',
  'dependencies',
  'implementation_guidelines',
  'success_criteria',
  'success_metrics',
  'key_changes',
  'key_principles',
  'risks',
  'target_application',
];

function extractSdContent(ctx) {
  const sd = ctx && ctx.sd;
  if (!sd || typeof sd !== 'object') return null; // unhashable
  const out = {};
  for (const f of SD_CONTENT_FIELDS) out[f] = sd[f] ?? null;
  return out;
}

/** GATE_MECHANISM_CLAIM_VERIFIER's inputs: extractSdContent PLUS the
 * structured metadata field its remediation path writes to. */
function extractMechanismClaimInputs(ctx) {
  const base = extractSdContent(ctx);
  if (base == null) return null;
  const sd = ctx.sd;
  return { ...base, mechanism_verifications: sd.metadata?.mechanism_verifications ?? null };
}

/** Opt-in registry: gate name → input extractor (ctx) => object|null. */
export const GATE_INPUT_EXTRACTORS = {
  GATE_SD_METRICS_SUFFICIENCY: extractSdContent,
  GATE_SD_QUALITY: extractSdContent,
  GATE_PLACEHOLDER_CONTENT_DETECTION: extractSdContent,
  GATE_MECHANISM_CLAIM_VERIFIER: extractMechanismClaimInputs,
};

/** Per-gate code-version stamp, required for FAIL-REPLAY (see module docblock). */
export const GATE_CODE_VERSION = {
  GATE_MECHANISM_CLAIM_VERIFIER: 1,
};

/** Gates allowed to replay a cached FAIL (opt-in, deliberately narrow — see NON-GOALS). */
export const FAIL_REPLAY_GATES = new Set(['GATE_MECHANISM_CLAIM_VERIFIER']);

/** Deterministic stringify — recursive sorted keys, stable across key order. */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

export function computeInputHash(inputs) {
  return crypto.createHash('sha256').update(stableStringify(inputs)).digest('hex');
}

/**
 * FR-4 policy: is caching allowed for this run at all?
 * LEAD-FINAL-APPROVAL is hard-excluded (final bar, cheap insurance);
 * --no-cache (options.noCache) and LEO_GATE_VERDICT_CACHE=off disable it.
 */
export function isCacheAllowed({ noCache, handoffType, env = process.env }) {
  if (noCache) return false;
  if (String(handoffType || '').toUpperCase().replace(/_/g, '-') === 'LEAD-FINAL-APPROVAL') return false;
  if (env.LEO_GATE_VERDICT_CACHE === 'off') return false;
  return true;
}

/**
 * Probe the cache for one gate. Pure decision — no I/O.
 *
 * @param {string} gateName
 * @param {object} context — validation context (ctx.sd etc.)
 * @param {object|null} cacheCfg — context._verdictCache: { enabled, prior: {gateName: priorResult} }
 * @returns {{ hit: boolean, priorResult?: object, inputHash: string|null }}
 */
export function probeVerdictCache(gateName, context, cacheCfg) {
  let inputHash = null;
  const extractor = GATE_INPUT_EXTRACTORS[gateName];
  if (extractor) {
    try {
      const inputs = extractor(context);
      if (inputs != null) inputHash = computeInputHash(inputs);
    } catch {
      inputHash = null; // extractor failure → unhashable this run (fail-open)
    }
  }

  if (!cacheCfg || !cacheCfg.enabled || !inputHash) return { hit: false, inputHash };

  const prior = cacheCfg.prior && cacheCfg.prior[gateName];
  if (!prior) return { hit: false, inputHash };
  if (prior.input_hash !== inputHash) return { hit: false, inputHash };
  // Never reuse skipped/wait shapes, passed or not.
  if (prior.wait === true || prior.skipReason) return { hit: false, inputHash };

  if (prior.passed === true) {
    return { hit: true, mode: 'pass_reuse', priorResult: prior, inputHash };
  }

  // FAIL-REPLAY: only for gates opted in AND whose code hasn't changed since
  // the cached FAIL was produced (see GATE_CODE_VERSION / module docblock).
  if (prior.passed === false && FAIL_REPLAY_GATES.has(gateName)) {
    const codeVersion = GATE_CODE_VERSION[gateName];
    if (codeVersion != null && prior.code_version === codeVersion) {
      return { hit: true, mode: 'fail_replay', priorResult: prior, inputHash };
    }
  }

  return { hit: false, inputHash };
}

/**
 * Load the most recent prior gate_results (version >= 2, i.e. hash-bearing)
 * for the same SD + handoff type from sd_phase_handoffs — any status:
 * rejected rows are the whole point (retries follow rejections), and
 * recordFailure persists per-gate results as of this SD.
 *
 * Fail-open: any error → null (cache disabled for the run).
 */
export async function loadPriorGateResults(supabase, sdUuid, handoffType) {
  try {
    const { data, error } = await supabase
      .from('sd_phase_handoffs')
      .select('id, metadata, created_at')
      .eq('sd_id', sdUuid)
      .eq('handoff_type', handoffType)
      .order('created_at', { ascending: false })
      .limit(3);
    if (error || !data) return null;
    for (const row of data) {
      const md = row.metadata;
      if (md && md.gate_results && (md.gate_results_version || 0) >= GATE_RESULTS_VERSION_HASHED) {
        return md.gate_results;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * FR-5 telemetry — fire-and-forget GATE_VERDICT_CACHE event on the existing
 * coordination_events table. Never affects the handoff verdict.
 */
export async function logCacheTelemetry(supabase, { sdKey, handoffType, hits, reran, gates }) {
  try {
    const { error } = await supabase.from('coordination_events').insert({
      event_type: 'GATE_VERDICT_CACHE',
      severity: 'info',
      payload: { sd_key: sdKey, handoff_type: handoffType, hits, reran, gates, source: 'gate-verdict-cache' },
    });
    if (error) console.warn(`   [gate-verdict-cache] telemetry write failed (non-fatal): ${error.message}`);
  } catch (e) {
    console.warn(`   [gate-verdict-cache] telemetry threw (non-fatal): ${(e && e.message) || e}`);
  }
}

/**
 * Merge a finished attempt's PASS results into the prior map so the
 * in-process gate retry loop (BaseExecutor attempt 0..N) also reuses
 * verdicts. Same PASS-only + hash-bearing rules.
 */
export function mergePassResults(prior, gateResults) {
  const merged = { ...(prior || {}) };
  for (const [name, r] of Object.entries(gateResults || {})) {
    if (r && r.passed === true && r.input_hash && !r.wait && !r.skipReason) merged[name] = r;
  }
  return merged;
}
