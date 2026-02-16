/**
 * Tournament Scorer - Multi-Dimension Rubric Engine
 * SD-MAN-ORCH-EVA-INTELLIGENCE-LAYER-001-E (FR-2)
 *
 * Scores GTM generation outputs across 4 dimensions:
 *   - Specificity (0-25): Concrete details vs generic filler
 *   - Actionability (0-25): Executable channels with real budgets/KPIs
 *   - Market-fit (0-25): Persona/pain alignment with venture context
 *   - Financial-coherence (0-25): TAM>SAM>SOM consistency, CAC realism
 *
 * @module lib/eva/crews/tournament-scorer
 */

const MAX_DIMENSION_SCORE = 25;

/**
 * Score a single GTM generation output.
 *
 * @param {Object} result - Parsed GTM output (tiers, channels, launch_timeline)
 * @param {Object} context - Venture context for market-fit evaluation
 * @param {string} [context.description] - Venture description
 * @param {string} [context.targetMarket] - Target market
 * @returns {{ total: number, specificity: number, actionability: number, marketFit: number, financialCoherence: number }}
 */
export function scoreGeneration(result, context = {}) {
  const specificity = scoreSpecificity(result);
  const actionability = scoreActionability(result);
  const marketFit = scoreMarketFit(result, context);
  const financialCoherence = scoreFinancialCoherence(result);

  return {
    total: specificity + actionability + marketFit + financialCoherence,
    specificity,
    actionability,
    marketFit,
    financialCoherence,
  };
}

/**
 * Specificity (0-25): Concrete details vs generic filler.
 * Penalizes: 'TBD', empty strings, default placeholder names.
 */
function scoreSpecificity(result) {
  let score = 0;
  const tiers = result.tiers || [];
  const channels = result.channels || [];

  // Tier specificity (up to 12 points)
  for (const tier of tiers) {
    if (tier.name && !tier.name.startsWith('Tier ')) score += 1;
    if (tier.description && tier.description !== 'TBD' && tier.description.length > 20) score += 1;
    if (tier.persona && tier.persona.length > 10) score += 1;
    if (Array.isArray(tier.painPoints) && tier.painPoints.length > 0) score += 1;
  }

  // Channel specificity (up to 8 points)
  const defaultNames = ['Organic Search', 'Paid Search', 'Social Media', 'Content Marketing',
    'Email Marketing', 'Partnerships', 'Events', 'Direct Sales'];
  for (const ch of channels) {
    if (ch.name && !defaultNames.includes(ch.name)) score += 0.5;
    if (ch.primary_kpi && ch.primary_kpi !== 'TBD' && ch.primary_kpi.length > 5) score += 0.5;
  }

  // Launch timeline specificity (up to 5 points)
  const timeline = result.launch_timeline || [];
  for (const m of timeline.slice(0, 5)) {
    if (m.date && /^\d{4}-\d{2}-\d{2}$/.test(m.date)) score += 1;
  }

  return clamp(Math.round(score));
}

/**
 * Actionability (0-25): Executable channels with real budgets/KPIs.
 * Rewards: non-zero budgets, specific KPIs, diverse channel types.
 */
function scoreActionability(result) {
  let score = 0;
  const channels = result.channels || [];

  // Budget diversity (up to 10 points)
  const activeChannels = channels.filter(ch => ch.monthly_budget > 0);
  score += Math.min(activeChannels.length * 2, 10);

  // KPI quality (up to 8 points)
  for (const ch of channels) {
    if (ch.primary_kpi && ch.primary_kpi !== 'TBD' && ch.primary_kpi.length > 5) score += 1;
  }

  // Channel type diversity (up to 4 points)
  const types = new Set(channels.map(ch => ch.channelType).filter(Boolean));
  score += Math.min(types.size, 4);

  // Primary tier references (up to 3 points)
  const tierRefs = new Set(channels.map(ch => ch.primaryTier).filter(Boolean));
  score += Math.min(tierRefs.size, 3);

  return clamp(Math.round(score));
}

/**
 * Market-fit (0-25): Persona/pain alignment with venture context.
 * Evaluates whether tiers and channels match the venture description.
 */
function scoreMarketFit(result, context) {
  let score = 0;
  const tiers = result.tiers || [];
  const description = (context.description || '').toLowerCase();
  const targetMarket = (context.targetMarket || '').toLowerCase();

  // Persona presence and quality (up to 12 points)
  for (const tier of tiers) {
    if (tier.persona && tier.persona.length > 20) score += 2;
    if (Array.isArray(tier.painPoints) && tier.painPoints.length >= 2) score += 2;
  }

  // TAM/SAM/SOM presence (up to 6 points)
  for (const tier of tiers) {
    if (tier.tam > 0 && tier.sam > 0 && tier.som > 0) score += 2;
  }

  // Context alignment bonus (up to 7 points)
  if (description || targetMarket) {
    const contextWords = `${description} ${targetMarket}`.split(/\s+/).filter(w => w.length > 3);
    let matches = 0;
    const tierText = tiers.map(t => `${t.name} ${t.description} ${t.persona || ''}`).join(' ').toLowerCase();
    for (const word of contextWords) {
      if (tierText.includes(word)) matches++;
    }
    score += Math.min(Math.round(matches / Math.max(contextWords.length, 1) * 7), 7);
  }

  return clamp(Math.round(score));
}

/**
 * Financial-coherence (0-25): TAM>SAM>SOM consistency, CAC realism.
 * Validates logical relationships between financial figures.
 */
function scoreFinancialCoherence(result) {
  let score = 0;
  const tiers = result.tiers || [];
  const channels = result.channels || [];

  // TAM > SAM > SOM hierarchy (up to 9 points)
  for (const tier of tiers) {
    if (tier.tam > 0 && tier.sam > 0 && tier.som > 0) {
      if (tier.tam >= tier.sam && tier.sam >= tier.som) score += 3;
      else score += 1; // partial credit for having values
    }
  }

  // CAC realism (up to 8 points)
  const cacValues = channels.filter(ch => ch.expected_cac > 0).map(ch => ch.expected_cac);
  if (cacValues.length > 0) {
    score += Math.min(cacValues.length, 4); // points for having CAC values
    const avgCac = cacValues.reduce((a, b) => a + b, 0) / cacValues.length;
    if (avgCac > 1 && avgCac < 10000) score += 4; // reasonable range
  }

  // Budget allocation realism (up to 8 points)
  const totalBudget = channels.reduce((sum, ch) => sum + (ch.monthly_budget || 0), 0);
  if (totalBudget > 0) {
    const budgetChannels = channels.filter(ch => ch.monthly_budget > 0);
    score += Math.min(budgetChannels.length, 4); // diverse allocation
    // Not all budget in one channel
    const maxBudget = Math.max(...channels.map(ch => ch.monthly_budget || 0));
    if (maxBudget < totalBudget * 0.7) score += 4; // no single channel > 70%
  }

  return clamp(Math.round(score));
}

/** Clamp score to [0, MAX_DIMENSION_SCORE] */
function clamp(value) {
  return Math.max(0, Math.min(MAX_DIMENSION_SCORE, value));
}

export { MAX_DIMENSION_SCORE };
