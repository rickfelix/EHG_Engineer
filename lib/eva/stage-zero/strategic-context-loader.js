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
  const [mission, visionDimensions, okrGaps, themes] = await Promise.all([
    loadMission(supabase, logger),
    loadVisionDimensions(supabase, logger),
    loadOkrGaps(supabase, logger),
    loadStrategicThemes(supabase, logger),
  ]);

  const agentEconomyContext = getAgentEconomyContext();

  const raw = { mission, visionDimensions, okrGaps, themes, agentEconomyContext };

  const isEmpty = !mission
    && visionDimensions.length === 0
    && okrGaps.length === 0
    && themes.length === 0;

  if (isEmpty) {
    logger.log('   Strategic context: no data available');
    return { formattedPromptBlock: '', raw, isEmpty: true };
  }

  const formattedPromptBlock = formatPromptBlock(raw);
  logger.log(`   Strategic context loaded: mission=${mission ? 'yes' : 'no'}, visions=${visionDimensions.length}, okrGaps=${okrGaps.length}, themes=${themes.length}`);

  return { formattedPromptBlock, raw, isEmpty: false };
}

/**
 * Load the most recent mission.
 */
async function loadMission(supabase, logger) {
  try {
    const { data, error } = await supabase
      .from('missions')
      .select('title, description, core_values')
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
      .select('title, extracted_dimensions')
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
      .select('title, current_value, target_value, confidence_level')
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
      .select('name, description')
      .limit(5);

    if (error || !data) return [];
    return data;
  } catch (err) {
    logger.warn(`   Warning: Strategic themes load failed: ${err.message}`);
    return [];
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

  if (raw.agentEconomyContext) {
    const ctx = raw.agentEconomyContext;
    sections.push('\nAGENT ECONOMY CONTEXT:');
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
function getAgentEconomyContext() {
  return {
    market_size_2026: '$4.8B (AI agent platforms and tooling)',
    cagr: '34% (2024-2028 projected)',
    enterprise_adoption: '28% of enterprises piloting agent workflows',
    key_protocols: 'MCP (Model Context Protocol), OpenAPI 3.1, JSON-LD, schema.org',
    pricing_shift: 'Outcome-based pricing emerging; per-agent-action billing models growing',
    risk_signal: 'Agent reliability and hallucination risk remain top enterprise concern',
  };
}

/**
 * Return an empty result when no supabase client is provided.
 */
function emptyResult() {
  return {
    formattedPromptBlock: '',
    raw: { mission: null, visionDimensions: [], okrGaps: [], themes: [], agentEconomyContext: null },
    isEmpty: true,
  };
}
