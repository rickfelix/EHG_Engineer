/**
 * Compute a 0-100 strategic-fit score for a discovery candidate by measuring
 * keyword overlap between the candidate's narrative fields and the strategic
 * context themes loaded by `loadStrategicContext`.
 *
 * Used as the 0.15-weighted input in rankCandidates' v2 composite score.
 *
 * Falls back to 50 (neutral) when context is null/malformed — the worst case is
 * a neutral contribution, never a thrown error.
 *
 * @param {Object} candidate - LLM-emitted candidate ({target_market, solution, revenue_model, ...})
 * @param {Object|null|undefined} strategicContext - Loaded by lib/eva/stage-zero/strategic-context-loader.js
 *   Either {themes: string[]} or {formattedPromptBlock: string} or {strategic_objectives, vision_statement, ...}
 * @param {{logger?: Console}} [opts]
 * @returns {number} integer in [0, 100]
 */
export function computeStrategicFit(candidate, strategicContext, opts = {}) {
  const { logger = console } = opts;

  if (!candidate || typeof candidate !== 'object') return 50;

  const themes = extractThemes(strategicContext);
  if (themes.length === 0) {
    if (strategicContext != null) {
      try { logger.warn?.('   computeStrategicFit: strategicContext provided but no themes extracted; returning neutral 50'); } catch { /* ignore logger errors */ }
    }
    return 50;
  }

  const candidateText = [
    candidate.target_market,
    candidate.solution,
    candidate.revenue_model,
    candidate.problem_statement,
    candidate.automation_approach,
  ].filter(Boolean).join(' ').toLowerCase();

  if (!candidateText) return 50;

  const candidateTokens = new Set(tokenize(candidateText));
  let overlap = 0;
  for (const theme of themes) {
    for (const tok of tokenize(theme)) {
      if (candidateTokens.has(tok)) {
        overlap += 1;
        break;
      }
    }
  }

  const fraction = themes.length > 0 ? overlap / themes.length : 0;
  return Math.min(100, Math.max(0, Math.round(fraction * 100)));
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'with', 'as', 'by',
  'this', 'that', 'these', 'those', 'it', 'its', 'has', 'have', 'had',
  'we', 'us', 'our', 'you', 'your', 'they', 'their',
]);

function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

function extractThemes(strategicContext) {
  if (!strategicContext || typeof strategicContext !== 'object') return [];

  if (Array.isArray(strategicContext.themes)) {
    return strategicContext.themes.filter(t => typeof t === 'string' && t.length > 0);
  }
  if (typeof strategicContext.formattedPromptBlock === 'string' && strategicContext.formattedPromptBlock.length > 0) {
    return [strategicContext.formattedPromptBlock];
  }
  const fallback = [];
  if (Array.isArray(strategicContext.strategic_objectives)) {
    for (const o of strategicContext.strategic_objectives) {
      if (typeof o === 'string' && o.length > 0) fallback.push(o);
      else if (o && typeof o === 'object' && typeof o.objective === 'string') fallback.push(o.objective);
    }
  }
  if (typeof strategicContext.vision_statement === 'string' && strategicContext.vision_statement.length > 0) {
    fallback.push(strategicContext.vision_statement);
  }
  return fallback;
}
