/**
 * Strategic Context Loader
 *
 * Aggregates mission, vision, OKR gaps, and strategic themes from the database
 * to provide strategic alignment context for Stage 0 ideation.
 *
 * Each sub-loader catches independently and never throws, ensuring that
 * Stage 0 continues even if some strategic data is unavailable.
 *
 * Part of SD-LEO-FIX-ADD-MISSION-VISION-001
 */

import { computePortfolioMaturity } from '../../capabilities/scanner-context.js';

// SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-A: the distinct vision_key for the
// chairman-governed holdco portfolio-strategy artifact. Disambiguated from the
// existing active VISION-EHG-L1-001 (mission/vision) — both legitimately
// coexist at level=L1 as role-distinct artifacts (VALIDATION/RISK sub-agents
// confirmed no unique index blocks this). Always read by exact vision_key,
// never "the active L1 row".
export const PORTFOLIO_STRATEGY_VISION_KEY = 'VISION-PORTFOLIO-STRATEGY-001';

/**
 * Load all strategic context for Stage 0 ideation.
 *
 * @param {Object} supabase - Supabase client (service role recommended)
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<Object>} { formattedPromptBlock, raw, isEmpty }
 */
export async function loadStrategicContext(supabase, options = {}) {
  const { logger = console } = options;

  if (!supabase) {
    return emptyResult();
  }

  // Run all sub-loaders in parallel - each catches independently
  const [mission, visionDimensions, okrGaps, themes, portfolioMaturity, portfolioStrategy] = await Promise.all([
    loadMission(supabase, logger),
    loadVisionDimensions(supabase, logger),
    loadOkrGaps(supabase, logger),
    loadStrategicThemes(supabase, logger),
    loadPortfolioMaturity(supabase, logger),
    loadPortfolioStrategy(supabase, logger),
  ]);

  const agentEconomyContext = getAgentEconomyContext();

  const raw = { mission, visionDimensions, okrGaps, themes, agentEconomyContext, portfolioMaturity, portfolioStrategy };

  // portfolioMaturity is purely supplementary/derived context — excluded from isEmpty (existing behavior).
  // portfolioStrategy is NOT excluded: it is the chairman-ratified artifact this loader exists to
  // guarantee gets injected (SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-A FR-3) — if it is the only
  // signal present, the short-circuit below must not silently drop it.
  const isEmpty = !mission
    && visionDimensions.length === 0
    && okrGaps.length === 0
    && themes.length === 0
    && !portfolioStrategy;

  if (isEmpty) {
    logger.log('   Strategic context: no data available');
    return { formattedPromptBlock: '', raw, isEmpty: true };
  }

  const formattedPromptBlock = formatPromptBlock(raw);
  logger.log(`   Strategic context loaded: mission=${mission ? 'yes' : 'no'}, visions=${visionDimensions.length}, okrGaps=${okrGaps.length}, themes=${themes.length}, portfolioStrategy=${portfolioStrategy ? 'yes' : 'no'}`);

  return { formattedPromptBlock, raw, isEmpty: false };
}

/**
 * Load the most recent mission.
 */
async function loadMission(supabase, logger) {
  try {
    const { data, error } = await supabase
      .from('missions')
      .select('title, description, core_values') // schema-lint-disable-line — pre-existing (predates SD-LEO-INFRA-SYNTHESIS-SCORING-HARDENING-001), not fixed here to avoid scope creep
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return data;
  } catch (err) {
    logger.warn(`   Warning: Mission load failed: ${err.message}`);
    return null;
  }
}

/**
 * Load approved/published vision dimensions.
 * Uses extracted_dimensions (not dimensions) per design sub-agent finding.
 * Selects only title + extracted_dimensions to avoid loading large content blobs.
 */
async function loadVisionDimensions(supabase, logger) {
  try {
    const { data, error } = await supabase
      .from('eva_vision_documents')
      .select('title, extracted_dimensions') // schema-lint-disable-line — pre-existing, not fixed here to avoid scope creep
      .in('status', ['approved', 'published'])
      .order('created_at', { ascending: false })
      .limit(3);

    if (error || !data) return [];
    return data;
  } catch (err) {
    logger.warn(`   Warning: Vision dimensions load failed: ${err.message}`);
    return [];
  }
}

/**
 * Load OKR gaps (key results where current < target).
 */
async function loadOkrGaps(supabase, logger) {
  try {
    const { data, error } = await supabase
      .from('key_results')
      .select('title, current_value, target_value, confidence_level') // schema-lint-disable-line — pre-existing, not fixed here to avoid scope creep
      .lt('current_value', supabase.raw ? undefined : 999999)
      .limit(10);

    if (error || !data) return [];

    // Filter client-side: current_value < target_value
    return data
      .filter(kr => kr.current_value != null && kr.target_value != null && kr.current_value < kr.target_value)
      .slice(0, 5);
  } catch (err) {
    logger.warn(`   Warning: OKR gaps load failed: ${err.message}`);
    return [];
  }
}

/**
 * Load strategic themes (no status filter - per database sub-agent finding,
 * all rows are currently 'draft').
 */
async function loadStrategicThemes(supabase, logger) {
  try {
    const { data, error } = await supabase
      .from('strategic_themes')
      .select('name, description') // schema-lint-disable-line — pre-existing, not fixed here to avoid scope creep
      .limit(5);

    if (error || !data) return [];
    return data;
  } catch (err) {
    logger.warn(`   Warning: Strategic themes load failed: ${err.message}`);
    return [];
  }
}

/**
 * Load the portfolio-maturity signal (SD-LEO-INFRA-MATURITY-WEIGHTED-PORTFOLIO-001).
 * Surfaces explore-early/exploit-late state to the strategic context. Fail-soft (the
 * underlying compute never throws); never blocks Stage-0.
 */
async function loadPortfolioMaturity(supabase, logger) {
  try {
    return await computePortfolioMaturity(supabase);
  } catch (err) {
    logger.warn(`   Warning: Portfolio maturity load failed: ${err.message}`);
    return null;
  }
}

/**
 * Load the chairman-ratified holdco portfolio-strategy artifact by its exact,
 * distinct vision_key (SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-A). Additive
 * only — does NOT read via the generic loadVisionDimensions() above, which a
 * VALIDATION/RISK sub-agent pass found separately broken (non-existent column,
 * invalid status filter, silently returns zero rows) — repairing that is out
 * of scope here. Fail-soft: never throws, returns null on any miss.
 */
async function loadPortfolioStrategy(supabase, logger) {
  try {
    const { data, error } = await supabase
      .from('eva_vision_documents')
      .select('vision_key, content, extracted_dimensions')
      .eq('vision_key', PORTFOLIO_STRATEGY_VISION_KEY)
      .eq('status', 'active')
      .maybeSingle();

    if (error || !data) return null;
    return data;
  } catch (err) {
    logger.warn(`   Warning: Portfolio strategy load failed: ${err.message}`);
    return null;
  }
}

/**
 * Format all strategic context into a prompt block for LLM injection.
 */
function formatPromptBlock(raw) {
  const sections = [];

  sections.push('STRATEGIC CONTEXT (from EHG governance):');

  if (raw.mission) {
    sections.push(`\nMISSION: ${raw.mission.title}`);
    if (raw.mission.description) {
      sections.push(`  ${raw.mission.description}`);
    }
    if (raw.mission.core_values && Array.isArray(raw.mission.core_values)) {
      sections.push(`  Core Values: ${raw.mission.core_values.join(', ')}`);
    }
  }

  if (raw.visionDimensions.length > 0) {
    sections.push('\nVISION DIMENSIONS:');
    for (const v of raw.visionDimensions) {
      sections.push(`  - ${v.title}`);
      if (v.extracted_dimensions && Array.isArray(v.extracted_dimensions)) {
        for (const dim of v.extracted_dimensions.slice(0, 3)) {
          const label = typeof dim === 'string' ? dim : dim.name || dim.dimension || JSON.stringify(dim);
          sections.push(`    • ${label}`);
        }
      }
    }
  }

  if (raw.okrGaps.length > 0) {
    sections.push('\nOKR GAPS (opportunities for venture alignment):');
    for (const kr of raw.okrGaps) {
      const gap = kr.target_value - kr.current_value;
      sections.push(`  - ${kr.title}: current=${kr.current_value}, target=${kr.target_value} (gap: ${gap})`);
    }
  }

  if (raw.themes.length > 0) {
    sections.push('\nSTRATEGIC THEMES:');
    for (const t of raw.themes) {
      sections.push(`  - ${t.name}${t.description ? ': ' + t.description : ''}`);
    }
  }

  if (raw.portfolioStrategy) {
    sections.push('\nPORTFOLIO STRATEGY (chairman-ratified holdco artifact):');
    sections.push(`  ${raw.portfolioStrategy.content}`);
  }

  if (raw.portfolioMaturity) {
    const pm = raw.portfolioMaturity;
    const pct = Math.round((pm.maturityScore ?? 0) * 100);
    const stance = (pm.maturityScore ?? 0) < 0.33 ? 'EXPLORE (favor latent capability + market opportunity)'
      : (pm.maturityScore ?? 0) < 0.66 ? 'BALANCED' : 'EXPLOIT (lean on proven capabilities)';
    sections.push('\nPORTFOLIO MATURITY:');
    sections.push(`  Maturity: ${pct}% → stance: ${stance}`);
    sections.push(`  Signals: ${pm.productionGradeCount} production-grade capabilities, ${pm.reuseVolume} reuse events, ${pm.ventureCount} ventures`);
  }

  if (raw.agentEconomyContext) {
    const ctx = raw.agentEconomyContext;
    // M3 (Delta-ledger 41a2e6da): this is static placeholder data with no source or
    // as-of-date — label it E0 (ungrounded) directly in the prompt so the LLM (and any
    // downstream evidence-grading) treats it as directional context, not fact.
    sections.push('\nAGENT ECONOMY CONTEXT (E0 — ungrounded, static placeholder, no source/as-of-date; treat as directional only):');
    sections.push(`  Market Size (2026): ${ctx.market_size_2026}`);
    sections.push(`  CAGR: ${ctx.cagr}`);
    sections.push(`  Enterprise Adoption: ${ctx.enterprise_adoption}`);
    sections.push(`  Key Protocols: ${ctx.key_protocols}`);
    sections.push(`  Pricing Shift: ${ctx.pricing_shift}`);
    sections.push(`  Risk Signal: ${ctx.risk_signal}`);
  }

  return sections.join('\n');
}

/**
 * Static agent economy context — Phase 1 data (no live feed).
 * Updated periodically as market data evolves.
 */
export function getAgentEconomyContext() {
  return {
    market_size_2026: '$4.8B (AI agent platforms and tooling)',
    cagr: '34% (2024-2028 projected)',
    enterprise_adoption: '28% of enterprises piloting agent workflows',
    key_protocols: 'MCP (Model Context Protocol), OpenAPI 3.1, JSON-LD, schema.org',
    pricing_shift: 'Outcome-based pricing emerging; per-agent-action billing models growing',
    risk_signal: 'Agent reliability and hallucination risk remain top enterprise concern',
    // M3 (Delta-ledger 41a2e6da): no source or as-of-date backs these figures — E0
    // (ungrounded) per the evidence-grading convention (SD-LEO-INFRA-STAGE0-EVIDENCE-
    // GRADING-001). Not removed (still useful directional context) — only labeled.
    evidence_grade: 'E0',
  };
}

/**
 * Return an empty result when no supabase client is provided.
 */
function emptyResult() {
  return {
    formattedPromptBlock: '',
    raw: { mission: null, visionDimensions: [], okrGaps: [], themes: [], agentEconomyContext: null, portfolioMaturity: null, portfolioStrategy: null },
    isEmpty: true,
  };
}
