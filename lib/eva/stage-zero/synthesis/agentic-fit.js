/**
 * Synthesis Component: Agentic-Fit Venture-Selection Lens
 *
 * Scores ideas on EHG's unfair-advantage axis — can an AI-agent fleet do most of the
 * work, does it compound, can demand be validated cheaply/fast, and does it need chairman
 * taste only at gates. A SEPARATE machine-improvement multiplier lets a factory-improving
 * venture jump the queue even with middling per-venture fit. A disadvantage filter SOFT
 * down-weights + prominently FLAGS structurally-hard idea types (never a hard auto-kill —
 * matches soft-early-gate calibration + preserves chairman override).
 *
 * Four fit dimensions (0-100 each), weights from the config SSOT (evaluation_profiles):
 *  - agent_leverage    0.35  can AI agents do most of the work (incl. standardizable workflow)
 *  - compounding       0.25  reusable assets + a template for future ventures
 *  - kill_speed        0.20  cheap/fast demand validation (portfolio throughput)
 *  - attention_economy 0.20  needs chairman taste only at gates
 *
 * agentic_fit is a weighted COMPONENT of the Stage-0 venture_score (primary insertion) and
 * an ADVISORY signal at S3 (NOT a kill — S5 stays the first authoritative economic kill).
 *
 * Part of SD-EHG-FACTORY-AGENTIC-FIT-SELECTION-001
 */

import { getValidationClient } from '../../../llm/client-factory.js';
import { extractUsage } from '../../utils/parse-json.js';

// ---------------------------------------------------------------------------
// Config SSOT v1 (ratified starting hypothesis). The CANONICAL re-tunable copy
// lives in evaluation_profiles.weights / .agentic_fit_params (so the deferred
// calibration loop can re-tune without a code edit); these are the defaults +
// fallback when no profile value is present.
// ---------------------------------------------------------------------------
export const AF_WEIGHTS = {
  agent_leverage: 0.35,
  compounding: 0.25,
  kill_speed: 0.20,
  attention_economy: 0.20,
};

export const AF_DIMENSIONS = Object.keys(AF_WEIGHTS);

// Near-threshold: a very low agent_leverage must SINK the composite (the
// standardizable-workflow axis dominates — a venture agents cannot run is not a fit
// no matter how strong the other dimensions). Below the floor, the composite is scaled
// down proportionally (leverage/floor), so leverage=0 → composite 0.
export const AGENT_LEVERAGE_FLOOR = 30;

// Machine-improvement multiplier params: a bonus of up to MAX_BONUS applied on TOP of the
// fit composite (NOT a 5th weighted dimension), so a high-machine-improvement venture can
// outrank an equal-fit peer (queue jump).
export const AF_MULTIPLIER_PARAMS = {
  max_bonus: 0.5, // a machine_improvement of 100 adds +50% to the composite
};

// Disadvantage types: SOFT down-weight + prominent flag. NEVER a hard auto-kill.
// The two structurally-un-agent-able subtypes are flagged HARDEST for chairman review.
export const DISADVANTAGE_FACTORS = {
  capital_heavy: 0.85,
  human_trust_dependent: 0.85,
  deep_rd_moat: 0.85,
  winner_take_all: 0.9,
  // hardest — structurally un-agent-able; heavier soft down-weight + chairman_review flag
  requires_regulatory_permission: 0.7,
  requires_large_upfront_capital: 0.7,
};

export const HARDEST_DISADVANTAGES = ['requires_regulatory_permission', 'requires_large_upfront_capital'];

export const AGENTIC_FIT_BANDS = [
  { min: 0, max: 24, band: 'AF-Low', interpretation: 'Weak agentic fit — agents cannot run most of the work' },
  { min: 25, max: 49, band: 'AF-Moderate', interpretation: 'Partial agentic fit — meaningful human/leverage gaps' },
  { min: 50, max: 74, band: 'AF-High', interpretation: 'Strong agentic fit — agent-runnable and compounding' },
  { min: 75, max: 100, band: 'AF-Strong', interpretation: 'Exceptional agentic fit — agent-native, compounding, chairman-light' },
];

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/**
 * Compute the 0-100 agentic-fit COMPOSITE (the four weighted fit dimensions, with the
 * near-threshold agent_leverage rule). Multiplier + disadvantage filter are applied
 * separately by scoreAgenticFit — this is the pure fit composite.
 * @param {{agent_leverage,compounding,kill_speed,attention_economy}} dims  0-100 each
 * @param {object} [weights=AF_WEIGHTS]  config-driven weights (SSOT)
 * @returns {number} 0-100
 */
export function computeAgenticFitScore(dims, weights = AF_WEIGHTS) {
  if (!dims) return 0;
  const w = weights || AF_WEIGHTS;
  const leverage = clamp(dims.agent_leverage ?? 0, 0, 100);
  const weighted =
    leverage * (w.agent_leverage ?? AF_WEIGHTS.agent_leverage) +
    clamp(dims.compounding ?? 0, 0, 100) * (w.compounding ?? AF_WEIGHTS.compounding) +
    clamp(dims.kill_speed ?? 0, 0, 100) * (w.kill_speed ?? AF_WEIGHTS.kill_speed) +
    clamp(dims.attention_economy ?? 0, 0, 100) * (w.attention_economy ?? AF_WEIGHTS.attention_economy);

  // Near-threshold sink: below the agent_leverage floor, scale the composite down
  // proportionally so a structurally un-agent-able idea cannot ride high on the other dims.
  const sink = leverage < AGENT_LEVERAGE_FLOOR ? leverage / AGENT_LEVERAGE_FLOOR : 1;
  return Math.round(clamp(weighted, 0, 100) * sink);
}

/**
 * Apply the machine-improvement MULTIPLIER on top of the fit composite (separate from the
 * weighted dimensions, so a high-machine-improvement venture can jump the queue).
 * @param {number} composite  0-100 fit composite
 * @param {number} machineImprovement  0-100
 * @param {object} [params=AF_MULTIPLIER_PARAMS]
 * @returns {{score:number, bonus:number}} score is NOT clamped to 100 — a queue-jumper may exceed 100
 */
export function applyMachineImprovementMultiplier(composite, machineImprovement, params = AF_MULTIPLIER_PARAMS) {
  const p = params || AF_MULTIPLIER_PARAMS;
  const mi = clamp(machineImprovement ?? 0, 0, 100);
  const bonus = (mi / 100) * (p.max_bonus ?? AF_MULTIPLIER_PARAMS.max_bonus);
  return { score: Math.round(clamp(composite, 0, 100) * (1 + bonus)), bonus };
}

/**
 * Classify disadvantage flags into a SOFT down-weight factor + prominent flags. Never a
 * hard auto-kill. The hardest (un-agent-able) subtypes set chairman_review_required.
 * @param {string[]} flags  e.g. ['capital_heavy','requires_large_upfront_capital']
 * @returns {{downWeightFactor:number, flags:string[], chairman_review_required:boolean, hardest_flags:string[]}}
 */
export function classifyDisadvantages(flags) {
  const list = Array.isArray(flags) ? flags.filter((f) => typeof f === 'string') : [];
  let factor = 1;
  const recognized = [];
  const hardest = [];
  for (const f of list) {
    if (Object.prototype.hasOwnProperty.call(DISADVANTAGE_FACTORS, f)) {
      factor *= DISADVANTAGE_FACTORS[f];
      recognized.push(f);
      if (HARDEST_DISADVANTAGES.includes(f)) hardest.push(f);
    }
  }
  return {
    downWeightFactor: factor,
    flags: recognized,
    hardest_flags: hardest,
    chairman_review_required: hardest.length > 0,
  };
}

/** Map a 0-100 agentic-fit score to a governance band. */
export function classifyAgenticFitBand(score) {
  const s = clamp(Math.round(score), 0, 100);
  for (const b of AGENTIC_FIT_BANDS) if (s >= b.min && s <= b.max) return { band: b.band, interpretation: b.interpretation };
  return { band: 'AF-Strong', interpretation: AGENTIC_FIT_BANDS[AGENTIC_FIT_BANDS.length - 1].interpretation };
}

/**
 * Full agentic-fit scoring: composite -> machine-improvement multiplier -> soft disadvantage
 * down-weight, recording every sub-score/flag for chairman explainability (FR-5).
 * @param {object} input
 * @param {object} input.dimensions  {agent_leverage,compounding,kill_speed,attention_economy} 0-100
 * @param {number} [input.machine_improvement=0]  0-100
 * @param {string[]} [input.disadvantage_flags=[]]
 * @param {object} [config]  {weights, multiplier_params} config-SSOT overrides
 * @returns {object} the full transparent record
 */
export function scoreAgenticFit(input, config = {}) {
  const dims = (input && input.dimensions) || {};
  const weights = config.weights || AF_WEIGHTS;
  const multParams = config.multiplier_params || AF_MULTIPLIER_PARAMS;

  const fit_composite = computeAgenticFitScore(dims, weights);
  const { score: afterMultiplier, bonus } = applyMachineImprovementMultiplier(
    fit_composite,
    input?.machine_improvement ?? 0,
    multParams,
  );
  const disadvantage = classifyDisadvantages(input?.disadvantage_flags ?? []);
  const agentic_fit_score = Math.round(clamp(afterMultiplier * disadvantage.downWeightFactor, 0, 100));
  const { band, interpretation } = classifyAgenticFitBand(agentic_fit_score);

  return {
    component: 'agentic_fit',
    agentic_fit_score, // 0-100 final (clamped) — what feeds the Stage-0 weighted component
    fit_composite, // 0-100 pre-multiplier/disadvantage
    queue_jump_score: afterMultiplier, // may exceed 100 — used for cross-venture ranking
    dimension_scores: {
      agent_leverage: clamp(dims.agent_leverage ?? 0, 0, 100),
      compounding: clamp(dims.compounding ?? 0, 0, 100),
      kill_speed: clamp(dims.kill_speed ?? 0, 0, 100),
      attention_economy: clamp(dims.attention_economy ?? 0, 0, 100),
    },
    machine_improvement: clamp(input?.machine_improvement ?? 0, 0, 100),
    machine_improvement_bonus: bonus,
    disadvantage_flags: disadvantage.flags,
    disadvantage_down_weight: disadvantage.downWeightFactor,
    hardest_disadvantage_flags: disadvantage.hardest_flags,
    chairman_review_required: disadvantage.chairman_review_required,
    af_band: band,
    af_interpretation: interpretation,
  };
}

/**
 * Build an ADVISORY (non-kill) S3 signal from an agentic-fit record (FR-4 secondary).
 * Returns null when there is no record (so callers can skip). NEVER carries a kill verdict —
 * S5 stays the first authoritative economic kill; this only surfaces the agentic-fit read +
 * any chairman-review disadvantage flags as advisory context at S3.
 * @param {object} record  a scoreAgenticFit() result (or the persisted agentic_fit snapshot)
 * @returns {{type:string, message:string, agentic_fit_score:number, af_band:string, chairman_review_required:boolean, disadvantage_flags:string[]}|null}
 */
export function buildAgenticFitAdvisory(record) {
  if (!record || typeof record !== 'object') return null;
  const score = clamp(record.agentic_fit_score ?? 0, 0, 100);
  const flags = Array.isArray(record.disadvantage_flags) ? record.disadvantage_flags : [];
  const review = record.chairman_review_required === true;
  const flagNote = flags.length ? ` Disadvantage flags: ${flags.join(', ')}.` : '';
  const reviewNote = review ? ' Flagged for explicit chairman review (structurally un-agent-able).' : '';
  return {
    type: 'agentic_fit_advisory',
    message: `Agentic-fit ${score}/100 (${record.af_band ?? 'AF-Unknown'}) — advisory only, does not kill.${flagNote}${reviewNote}`,
    agentic_fit_score: score,
    af_band: record.af_band ?? 'AF-Unknown',
    chairman_review_required: review,
    disadvantage_flags: flags,
  };
}

/**
 * LLM entrypoint: derive the four dimensions + machine_improvement + disadvantage flags from
 * a venture candidate, then score them. Mirrors analyzeAttentionCapital. Fails soft to a
 * zero-fit advisory record (never throws into the synthesis runner).
 * @param {Object} pathOutput
 * @param {Object} deps  {logger, llmClient}
 */
export async function analyzeAgenticFit(pathOutput, deps = {}) {
  const { logger = console, llmClient } = deps;
  const client = llmClient || getValidationClient();
  logger.log('   Analyzing agentic fit...');

  const prompt = `You are an EHG agentic-fit analyst. EHG's unfair advantage is an AI-agent fleet that builds ventures with near-zero human labor. Score whether THIS venture fits that advantage.

VENTURE:
Name: ${pathOutput?.suggested_name ?? ''}
Problem: ${pathOutput?.suggested_problem ?? ''}
Solution: ${pathOutput?.suggested_solution ?? ''}
Market: ${pathOutput?.target_market ?? ''}

Score each dimension 0-100:
- agent_leverage: can AI agents do MOST of the work, including a standardizable workflow? (a venture needing heavy bespoke human labor scores LOW)
- compounding: does it produce reusable assets + a template that speeds FUTURE ventures?
- kill_speed: can demand be validated cheaply and fast (so we kill losers quickly)?
- attention_economy: does it need chairman taste only at gates (not constant human attention)?

Also score:
- machine_improvement (0-100): does this venture improve the FACTORY itself — train the assumption engine, improve agent performance, yield a reusable playbook, or reveal a repeatable niche?

And flag any structural disadvantages (array of: capital_heavy, human_trust_dependent, deep_rd_moat, winner_take_all, requires_regulatory_permission, requires_large_upfront_capital).

Return JSON ONLY: {"agent_leverage":N,"compounding":N,"kill_speed":N,"attention_economy":N,"machine_improvement":N,"disadvantage_flags":[...],"confidence":0-1,"summary":"..."}`;

  try {
    const response = await client.complete({ prompt, temperature: 0.2, maxTokens: 600 });
    const text = typeof response === 'string' ? response : (response?.text ?? response?.content ?? '');
    const match = text.match(/\{[\s\S]*\}/);
    const analysis = match ? JSON.parse(match[0]) : {};
    const scored = scoreAgenticFit(
      {
        dimensions: {
          agent_leverage: analysis.agent_leverage,
          compounding: analysis.compounding,
          kill_speed: analysis.kill_speed,
          attention_economy: analysis.attention_economy,
        },
        machine_improvement: analysis.machine_improvement,
        disadvantage_flags: analysis.disadvantage_flags,
      },
      deps.config || {},
    );
    return {
      ...scored,
      confidence: clamp(analysis.confidence ?? 0.5, 0, 1),
      summary: analysis.summary ?? '',
      usage: extractUsage ? extractUsage(response) : undefined,
    };
  } catch (err) {
    logger.warn?.(`   Agentic-fit analysis failed: ${err.message}`);
    return {
      ...scoreAgenticFit({ dimensions: {}, machine_improvement: 0, disadvantage_flags: [] }),
      confidence: 0,
      confidence_caveat: 'Analysis failed.',
      summary: `Failed: ${err.message}`,
    };
  }
}

export default {
  AF_WEIGHTS,
  AF_DIMENSIONS,
  AGENT_LEVERAGE_FLOOR,
  AF_MULTIPLIER_PARAMS,
  DISADVANTAGE_FACTORS,
  HARDEST_DISADVANTAGES,
  computeAgenticFitScore,
  applyMachineImprovementMultiplier,
  classifyDisadvantages,
  classifyAgenticFitBand,
  scoreAgenticFit,
  buildAgenticFitAdvisory,
  analyzeAgenticFit,
};
