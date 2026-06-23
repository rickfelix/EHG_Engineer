/**
 * LLM brainstorm distiller.
 *
 * SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001-C (FR-1/FR-4), child idx 2 of
 * SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001.
 *
 * Turns a raw (enriched) brainstorm item into a STRUCTURED distilled SD payload that the chairman
 * can review: {title, description, scope, rationale, sd_type, confidence_tier}. The downstream
 * disposition gate (child idx 1) controls whether such a candidate may ever auto-mint — this
 * module NEVER mints. It only produces a payload; the CLI writes it to the chairman review queue.
 *
 * Reuses the refine-score.js LLM pattern: getClassificationClient() -> client.complete(system,user,
 * {maxTokens}) wrapped in a Promise.race timeout; complete() may return a string OR {content};
 * a deterministic keyword/heuristic fallback fires on stub/timeout/parse-fail so there is no hard
 * dependency on cloud LLM availability.
 */

import { getClassificationClient } from '../llm/client-factory.js';

export const DISTILL_CONFIG = {
  AI_TIMEOUT_MS: 90_000,
  MAX_TOKENS: 2048,
  SD_TYPES: ['feature', 'infrastructure', 'bugfix', 'refactor', 'documentation', 'discovery_spike'],
  CONFIDENCE_TIERS: ['high', 'medium', 'low'],
};

/**
 * Normalize an enriched wave item into the fields the distiller reasons over.
 * (Mirrors scripts/eva-intake-refine.js enrichment shape.)
 */
function normalizeItem(item = {}) {
  return {
    wave_item_id: item.wave_item_id || item.id || null,
    title: item.title || '(untitled)',
    description: item.description || '',
    target_application: item.target_application || '',
    target_aspects: Array.isArray(item.target_aspects) ? item.target_aspects : [],
    chairman_intent: item.chairman_intent || '',
    refine_composite_score:
      item.refine_composite_score ?? item.metadata?.refine_composite_score ?? null,
  };
}

/**
 * Build the distillation prompt for a single enriched item. Pure.
 */
export function buildDistillPrompt(item) {
  const n = normalizeItem(item);
  return [
    'Distill the following raw brainstorm capture into a single buildable Strategic Directive.',
    'Respond with ONLY valid JSON of shape:',
    '{"title": string (<=120 chars, imperative), "description": string (2-4 sentences, what+why),',
    ' "scope": string (concrete deliverables + boundaries), "rationale": string (why it matters now),',
    ` "sd_type": one of ${JSON.stringify(DISTILL_CONFIG.SD_TYPES)},`,
    ` "confidence_tier": one of ${JSON.stringify(DISTILL_CONFIG.CONFIDENCE_TIERS)} (how build-ready/clear this is)}`,
    '',
    'Raw capture:',
    `- title: ${n.title}`,
    `- description: ${n.description}`,
    `- chairman_intent: ${n.chairman_intent}`,
    `- target_application: ${n.target_application}`,
    `- target_aspects: ${JSON.stringify(n.target_aspects)}`,
  ].join('\n');
}

/**
 * Parse the LLM distillation response into a validated payload, or null on failure. Pure.
 */
export function parseDistillResponse(response) {
  try {
    const text = typeof response === 'string' ? response : response?.content;
    if (!text) return null;
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return coercePayload(parsed);
  } catch {
    return null;
  }
}

/**
 * Coerce/validate a raw object into the distilled payload contract, or null if unusable. Pure.
 */
export function coercePayload(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const title = typeof obj.title === 'string' ? obj.title.trim().slice(0, 120) : '';
  if (!title) return null;
  const sd_type = DISTILL_CONFIG.SD_TYPES.includes(obj.sd_type) ? obj.sd_type : 'feature';
  const confidence_tier = DISTILL_CONFIG.CONFIDENCE_TIERS.includes(obj.confidence_tier)
    ? obj.confidence_tier
    : 'medium';
  return {
    title,
    description: typeof obj.description === 'string' ? obj.description.trim() : '',
    scope: typeof obj.scope === 'string' ? obj.scope.trim() : '',
    rationale: typeof obj.rationale === 'string' ? obj.rationale.trim() : '',
    sd_type,
    confidence_tier,
  };
}

/**
 * Deterministic keyword/heuristic distillation — the fallback when the LLM is a stub,
 * times out, or returns unparseable output. Pure, no I/O.
 */
export function keywordDistill(item) {
  const n = normalizeItem(item);
  const baseTitle = (n.title && n.title !== '(untitled)' ? n.title : n.description || 'Untitled brainstorm capture')
    .toString()
    .trim()
    .slice(0, 120);

  // sd_type heuristic from intent + aspects/app.
  const hay = `${n.chairman_intent} ${n.target_application} ${n.target_aspects.join(' ')} ${n.description}`.toLowerCase();
  let sd_type = 'feature';
  if (/\b(infra|infrastructure|pipeline|gate|engine|coordinator|fleet)\b/.test(hay)) sd_type = 'infrastructure';
  else if (/\b(bug|fix|broken|regression)\b/.test(hay)) sd_type = 'bugfix';
  else if (/\b(refactor|cleanup|simplif)\b/.test(hay)) sd_type = 'refactor';
  else if (/\b(doc|documentation|guide)\b/.test(hay)) sd_type = 'documentation';
  else if (/\b(spike|research|investigate|explore)\b/.test(hay)) sd_type = 'discovery_spike';

  // confidence tier from the refine composite score, when present.
  const score = typeof n.refine_composite_score === 'number' ? n.refine_composite_score : null;
  let confidence_tier = 'low';
  if (score != null && score >= 70) confidence_tier = 'high';
  else if (score != null && score >= 50) confidence_tier = 'medium';

  return {
    title: baseTitle,
    description: n.description || `Distilled from a ${n.target_application || 'brainstorm'} capture (intent: ${n.chairman_intent || 'unspecified'}).`,
    scope: `Deliver: ${baseTitle}. Boundaries: keep to the captured intent; defer adjacent ideas.`,
    rationale: `Surfaced from the brainstorm corpus${score != null ? ` with a refine score of ${score}` : ''}; kept for chairman review (keyword-distilled, LLM unavailable).`,
    sd_type,
    confidence_tier,
  };
}

/**
 * Distill a single enriched item into a payload.
 * @param {Object} item   enriched wave item ({title, description, chairman_intent, target_application, target_aspects, refine_composite_score, wave_item_id})
 * @param {Object} [opts]
 * @param {Object} [opts.client]  injectable classification client (defaults to getClassificationClient())
 * @returns {Promise<{payload: Object, method: 'ai'|'keyword'}>}
 */
export async function distillItem(item, opts = {}) {
  let client = opts.client;
  try {
    if (!client) client = await getClassificationClient();
    if (client && client.isInlineOnly) {
      // Inline stub cannot produce JSON reliably → deterministic fallback.
      return { payload: keywordDistill(item), method: 'keyword' };
    }
    const prompt = buildDistillPrompt(item);
    let timeoutId;
    const response = await Promise.race([
      client.complete(
        'You are an SD distiller. Turn a raw brainstorm capture into one buildable Strategic Directive. Respond with only valid JSON.',
        prompt,
        { maxTokens: DISTILL_CONFIG.MAX_TOKENS },
      ),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('AI timeout')), DISTILL_CONFIG.AI_TIMEOUT_MS);
        if (timeoutId.unref) timeoutId.unref();
      }),
    ]);
    if (timeoutId) clearTimeout(timeoutId);

    const payload = parseDistillResponse(response);
    if (payload) return { payload, method: 'ai' };
  } catch {
    // fall through to keyword fallback
  }
  return { payload: keywordDistill(item), method: 'keyword' };
}

/**
 * Map a distilled payload + source wave item into the chairman-review-queue writer contract
 * (lib/eva/consultant/distillation-queue-writer.js enqueueDistilledCandidate). Pure.
 */
export function toQueueCandidate(payload, sourceWaveItemId, confidenceScore = null) {
  return {
    sourceWaveItemId,
    distilledPayload: payload,
    title: payload.title,
    description: payload.description,
    confidenceTier: payload.confidence_tier,
    ...(confidenceScore != null ? { priorityScore: confidenceScore } : {}),
  };
}
