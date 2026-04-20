/**
 * Stage 17 Strategy Recommender
 *
 * Deterministic scoring engine that analyzes upstream venture artifacts
 * (Stage 5 business model, Stage 11 brand identity, Stage 12 GTM strategy)
 * to rank the 4 design strategies (clarity-first, dense, narrative, visual-impact)
 * by audience/brand/visual fit.
 *
 * No LLM calls — pure deterministic weighted rubric.
 *
 * SD-S17-STRATEGYFIRST-DESIGN-DIRECTION-ORCH-001-A
 * @module lib/eva/stage-17/strategy-recommender
 */

import { writeArtifact } from '../artifact-persistence-service.js';
import { getStrategyReorderHints } from './strategy-stats.js';

const STRATEGIES = ['clarity-first', 'dense', 'narrative', 'visual-impact'];

/**
 * Scoring rubric: maps signal values to per-strategy bonus points.
 * Each signal contributes 0-35 points to each strategy.
 */
const SCORING_RUBRIC = {
  audience_type: {
    b2b:         { 'clarity-first': 20, dense: 30, narrative: 10, 'visual-impact': 10 },
    b2c:         { 'clarity-first': 10, dense:  5, narrative: 25, 'visual-impact': 30 },
    enterprise:  { 'clarity-first': 25, dense: 30, narrative: 10, 'visual-impact':  5 },
    consumer:    { 'clarity-first': 10, dense:  5, narrative: 20, 'visual-impact': 35 },
    _default:    { 'clarity-first': 15, dense: 15, narrative: 15, 'visual-impact': 15 },
  },
  brand_personality: {
    professional:{ 'clarity-first': 25, dense: 20, narrative: 15, 'visual-impact': 10 },
    creative:    { 'clarity-first':  5, dense: 10, narrative: 20, 'visual-impact': 35 },
    trustworthy: { 'clarity-first': 25, dense: 15, narrative: 20, 'visual-impact': 10 },
    bold:        { 'clarity-first': 10, dense: 15, narrative: 15, 'visual-impact': 30 },
    minimal:     { 'clarity-first': 35, dense:  5, narrative: 15, 'visual-impact': 15 },
    _default:    { 'clarity-first': 15, dense: 15, narrative: 15, 'visual-impact': 15 },
  },
  business_model: {
    saas:        { 'clarity-first': 20, dense: 25, narrative: 15, 'visual-impact': 10 },
    marketplace: { 'clarity-first': 10, dense: 15, narrative: 20, 'visual-impact': 25 },
    ecommerce:   { 'clarity-first': 15, dense: 10, narrative: 15, 'visual-impact': 30 },
    service:     { 'clarity-first': 15, dense: 10, narrative: 30, 'visual-impact': 15 },
    content:     { 'clarity-first': 10, dense:  5, narrative: 35, 'visual-impact': 20 },
    _default:    { 'clarity-first': 15, dense: 15, narrative: 15, 'visual-impact': 15 },
  },
  gtm_approach: {
    'product-led':  { 'clarity-first': 20, dense: 25, narrative: 10, 'visual-impact': 15 },
    'sales-led':    { 'clarity-first': 15, dense: 20, narrative: 25, 'visual-impact': 10 },
    'content-led':  { 'clarity-first': 10, dense: 10, narrative: 30, 'visual-impact': 20 },
    'community-led':{ 'clarity-first': 10, dense: 15, narrative: 25, 'visual-impact': 20 },
    _default:       { 'clarity-first': 15, dense: 15, narrative: 15, 'visual-impact': 15 },
  },
};

/** Weight of each signal in the final score (must sum to ~0.9 to leave 0.1 for prior). */
const SIGNAL_WEIGHTS = {
  audience_type: 0.30,
  brand_personality: 0.25,
  business_model: 0.20,
  gtm_approach: 0.15,
};
const PRIOR_WEIGHT = 0.10;

/**
 * Extract scoring signals from upstream venture artifacts.
 *
 * @param {object} supabase
 * @param {string} ventureId
 * @returns {Promise<{ signals: object, artifactsFound: string[], artifactsMissing: string[] }>}
 */
async function extractSignals(supabase, ventureId) {
  const artifactTypes = [
    'identity_persona_brand', 'identity_naming_visual', 's11_identity',
    'identity_gtm_sales_strategy',
    'truth_financial_model',
  ];

  const { data } = await supabase
    .from('venture_artifacts')
    .select('artifact_type, artifact_data')
    .eq('venture_id', ventureId)
    .in('artifact_type', artifactTypes)
    .eq('is_current', true);

  const byType = {};
  for (const row of data ?? []) {
    byType[row.artifact_type] = row.artifact_data;
  }

  const artifactsFound = Object.keys(byType);
  const artifactsMissing = artifactTypes.filter(t => !byType[t]);

  const signals = {
    audience_type: null,
    brand_personality: null,
    business_model: null,
    gtm_approach: null,
  };

  // Extract audience type from persona/brand artifact
  const persona = byType.identity_persona_brand ?? byType.s11_identity ?? byType.identity_naming_visual;
  if (persona) {
    const text = JSON.stringify(persona).toLowerCase();
    if (text.includes('enterprise')) signals.audience_type = 'enterprise';
    else if (text.includes('b2b')) signals.audience_type = 'b2b';
    else if (text.includes('consumer')) signals.audience_type = 'consumer';
    else if (text.includes('b2c')) signals.audience_type = 'b2c';

    if (text.includes('professional')) signals.brand_personality = 'professional';
    else if (text.includes('creative')) signals.brand_personality = 'creative';
    else if (text.includes('trustworth')) signals.brand_personality = 'trustworthy';
    else if (text.includes('bold')) signals.brand_personality = 'bold';
    else if (text.includes('minimal')) signals.brand_personality = 'minimal';
  }

  // Extract business model from financial model artifact
  const financial = byType.truth_financial_model;
  if (financial) {
    const text = JSON.stringify(financial).toLowerCase();
    if (text.includes('saas') || text.includes('subscription')) signals.business_model = 'saas';
    else if (text.includes('marketplace')) signals.business_model = 'marketplace';
    else if (text.includes('ecommerce') || text.includes('e-commerce')) signals.business_model = 'ecommerce';
    else if (text.includes('service') || text.includes('consulting')) signals.business_model = 'service';
    else if (text.includes('content') || text.includes('media')) signals.business_model = 'content';
  }

  // Extract GTM approach from GTM strategy artifact
  const gtm = byType.identity_gtm_sales_strategy;
  if (gtm) {
    const text = JSON.stringify(gtm).toLowerCase();
    if (text.includes('product-led') || text.includes('self-serve')) signals.gtm_approach = 'product-led';
    else if (text.includes('sales-led') || text.includes('outbound')) signals.gtm_approach = 'sales-led';
    else if (text.includes('content') || text.includes('inbound')) signals.gtm_approach = 'content-led';
    else if (text.includes('community')) signals.gtm_approach = 'community-led';
  }

  return { signals, artifactsFound, artifactsMissing };
}

/**
 * Score all 4 strategies using the extracted signals.
 *
 * @param {object} signals - { audience_type, brand_personality, business_model, gtm_approach }
 * @param {Record<string, string[]>|null} priorHints - Reorder hints from strategy-stats.js
 * @returns {Array<{ strategy: string, fit_score: number, rationale: string }>}
 */
function scoreStrategies(signals, priorHints) {
  const scores = {};
  const rationales = {};
  for (const s of STRATEGIES) {
    scores[s] = 0;
    rationales[s] = [];
  }

  for (const [signalName, signalValue] of Object.entries(signals)) {
    const weight = SIGNAL_WEIGHTS[signalName];
    if (!weight) continue;

    const rubricRow = SCORING_RUBRIC[signalName];
    const lookup = signalValue && rubricRow[signalValue] ? signalValue : '_default';
    const bonuses = rubricRow[lookup];

    for (const s of STRATEGIES) {
      const bonus = bonuses[s] * weight;
      scores[s] += bonus;
      if (signalValue && lookup !== '_default') {
        rationales[s].push(`${signalName}=${signalValue}: +${Math.round(bonus)}`);
      }
    }
  }

  // Apply prior selection hints (10% weight)
  if (priorHints) {
    // Boost underrepresented strategies slightly
    const landingHints = priorHints.landing ?? priorHints[Object.keys(priorHints)[0]];
    if (landingHints) {
      for (let i = 0; i < landingHints.length; i++) {
        const strategy = landingHints[i];
        const priorBonus = (landingHints.length - i) * 5 * PRIOR_WEIGHT;
        scores[strategy] += priorBonus;
        rationales[strategy].push(`prior_selection_boost: +${Math.round(priorBonus)}`);
      }
    }
  }

  // Normalize to 0-100 scale
  const maxRaw = Math.max(...Object.values(scores));
  const minRaw = Math.min(...Object.values(scores));
  const range = maxRaw - minRaw || 1;

  return STRATEGIES
    .map(s => ({
      strategy: s,
      fit_score: Math.round(((scores[s] - minRaw) / range) * 60 + 40), // Scale to 40-100
      rationale: rationales[s].length > 0
        ? rationales[s].join('; ')
        : 'No specific signal data available for scoring',
    }))
    .sort((a, b) => b.fit_score - a.fit_score);
}

/**
 * Recommend strategies for a venture by analyzing upstream artifacts.
 *
 * @param {string} ventureId
 * @param {object} supabase
 * @returns {Promise<{
 *   ranked_strategies: Array<{ strategy: string, fit_score: number, rank: number, rationale: string }>,
 *   signals_used: object,
 *   upstream_artifacts_found: string[],
 *   upstream_artifacts_missing: string[],
 *   recommended_top_2: string[],
 *   fallback_used: boolean,
 *   artifact_id: string|null
 * }>}
 */
export async function recommendStrategies(ventureId, supabase) {
  const { signals, artifactsFound, artifactsMissing } = await extractSignals(supabase, ventureId);

  const hasAnySignal = Object.values(signals).some(v => v !== null);
  const fallbackUsed = !hasAnySignal;

  let priorHints = null;
  try {
    priorHints = await getStrategyReorderHints(ventureId, supabase);
  } catch (_e) { /* non-blocking */ }

  let ranked;
  if (fallbackUsed) {
    ranked = STRATEGIES.map((s, i) => ({
      strategy: s,
      fit_score: 50,
      rank: i + 1,
      rationale: 'No upstream data available — all strategies ranked equally',
    }));
  } else {
    ranked = scoreStrategies(signals, priorHints)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  const result = {
    ranked_strategies: ranked,
    signals_used: signals,
    upstream_artifacts_found: artifactsFound,
    upstream_artifacts_missing: artifactsMissing,
    recommended_top_2: ranked.slice(0, 2).map(r => r.strategy),
    fallback_used: fallbackUsed,
  };

  // Persist as artifact
  let artifactId = null;
  try {
    artifactId = await writeArtifact(supabase, {
      ventureId,
      lifecycleStage: 17,
      artifactType: 's17_strategy_recommendation',
      title: 'Strategy Recommendation',
      content: JSON.stringify(result),
      artifactData: result,
      qualityScore: fallbackUsed ? 50 : 80,
      validationStatus: 'validated',
      source: 'stage-17-strategy-recommender',
      metadata: { fallbackUsed, signalCount: Object.values(signals).filter(v => v !== null).length },
    });
  } catch (e) {
    console.warn('[strategy-recommender] Artifact write failed:', e.message);
  }

  return { ...result, artifact_id: artifactId };
}
