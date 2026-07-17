/**
 * score-reasoning-depth.mjs — the ONLY LLM axis (1-5). Cheap-model rubric, injected + mockable.
 * SD-LEO-INFRA-FABLE-SUITABILITY-MAP-001-B (FR-3).
 *
 * Reasoning-depth = "how much genuine judgment / look-ahead a Fable pass here would exercise" — the
 * axis that DOWN-weights high-value-but-mechanical work (a huge but rote rename should not out-rank
 * a small, deeply-entangled refactor). This is the one axis where a cheap model is warranted, because
 * it is genuine judgment rather than a countable structural fact.
 *
 * Design guards:
 *   - The model client is INJECTED (opts.client). Tests pass a mock; CI never calls a live model.
 *   - The score is obtained via CONSTRAINED/STRUCTURED decoding into an integer 1-5, never a
 *     free-text parse + regex repair (the free-text+repair failure mode).
 *   - This axis alone CANNOT float a region: score-region multiplies the three axes, so a max
 *     reasoning-depth over a low deterministic impact/opportunity still yields a low composite
 *     (the anti-gaming floor, RISK R1).
 *   - On any decode failure the axis degrades to a NEUTRAL 3 with a logged rationale — it never
 *     throws into the pipeline and never silently floats to 5.
 */
import { getFamily } from './cluster-families.mjs';

const NEUTRAL_SCORE = 3;

/**
 * The structured-output contract the injected client must satisfy. A real client wires this to a
 * constrained-decoding / tool-schema call; the mock in tests just returns a matching object.
 */
export const REASONING_DEPTH_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer', minimum: 1, maximum: 5 },
    rationale: { type: 'string' },
  },
  required: ['score', 'rationale'],
  additionalProperties: false,
};

function clampScore(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  const r = Math.round(v);
  // Out-of-contract (not 1-5) DEGRADES to neutral rather than silently clamping to 5 —
  // clamping a runaway score up to the max would be an anti-gaming hole.
  if (r < 1 || r > 5) return null;
  return r;
}

/**
 * @param {object} region  { region_key, sample?, summary? } — the material the rubric reasons over
 * @param {object} ctx     { blastRadius?, lookAhead? } deterministic hints the family weights
 * @param {object} opts
 * @param {{ scoreStructured:(args:{prompt:string, schema:object})=>Promise<{score:number,rationale:string}>}} opts.client
 * @param {string} opts.dutyCluster
 * @returns {Promise<{score:number, inputs:object, rationale:string, degraded:boolean}>}
 */
export async function scoreReasoningDepth(region = {}, ctx = {}, opts = {}) {
  const { client, dutyCluster } = opts;
  if (!client || typeof client.scoreStructured !== 'function') {
    throw new Error('scoreReasoningDepth: an injected client with scoreStructured() is required');
  }
  const w = getFamily(dutyCluster).reasoningDepth;

  const prompt = buildRubricPrompt(region, ctx, dutyCluster, w);

  let raw;
  try {
    raw = await client.scoreStructured({ prompt, schema: REASONING_DEPTH_SCHEMA });
  } catch (err) {
    return degraded(`model call failed: ${err?.message || 'unknown'}`, { blastRadius: ctx.blastRadius, lookAhead: ctx.lookAhead });
  }

  const score = clampScore(raw?.score);
  if (score === null) {
    return degraded(`model returned a non-1-5 score (${JSON.stringify(raw?.score)})`, { blastRadius: ctx.blastRadius, lookAhead: ctx.lookAhead });
  }

  return {
    score,
    degraded: false,
    inputs: { blastRadius: ctx.blastRadius ?? null, lookAhead: ctx.lookAhead ?? null, weights: w, decoded: true },
    rationale: `reasoning-depth ${score}/5 — ${String(raw.rationale || '').slice(0, 200)}`,
  };
}

function degraded(reason, inputs) {
  return {
    score: NEUTRAL_SCORE,
    degraded: true,
    inputs: { ...inputs, decoded: false },
    rationale: `reasoning-depth ${NEUTRAL_SCORE}/5 (NEUTRAL fallback) — ${reason}`,
  };
}

function buildRubricPrompt(region, ctx, dutyCluster, w) {
  return [
    `Rate the REASONING DEPTH (1-5) that a careful engineer would need to do "${dutyCluster}" work in the region "${region.region_key || '(unknown)'}".`,
    `1 = purely mechanical (rote rename, generated code); 5 = deeply entangled, high look-ahead, many interacting constraints.`,
    `Weight blast-radius ${w.blastRadius} and look-ahead ${w.lookAhead}.`,
    ctx.blastRadius != null ? `Observed blast-radius hint: ${ctx.blastRadius}.` : '',
    ctx.lookAhead != null ? `Observed look-ahead hint: ${ctx.lookAhead}.` : '',
    region.summary ? `Region summary: ${region.summary}` : '',
    `Return ONLY the structured {score, rationale}.`,
  ].filter(Boolean).join('\n');
}
