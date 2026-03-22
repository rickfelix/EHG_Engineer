/**
 * Scanner Context Module
 * SD: SD-CAPABILITYAWARE-SCANNERS-AND-ANTHROPIC-ORCH-001-B
 *
 * Queries v_capability_ledger and formats capability data as concise context
 * blocks for injection into Stage 0 discovery scanner LLM prompts.
 *
 * Each scanner type gets a differently formatted block optimized for its
 * analysis approach. All blocks are capped at 2000 characters.
 */

const MAX_CONTEXT_CHARS = 2000;
const MAX_CAPABILITIES = 20;

/**
 * Get a formatted capability context block for a specific scanner type.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} scannerType - One of: trend_scanner, democratization_finder, capability_overhang, nursery_reeval
 * @returns {Promise<string>} Formatted markdown context block, or empty string if no data
 */
export async function getCapabilityContextBlock(supabase, scannerType) {
  if (!supabase) return '';

  try {
    const { data: capabilities, error } = await supabase
      .from('v_capability_ledger')
      .select('capability_key, name, capability_type, plane1_score, maturity_score, reuse_count, registered_by_sd, first_registered_at')
      .order('plane1_score', { ascending: false })
      .limit(MAX_CAPABILITIES);

    if (error) {
      console.warn(`[scanner-context] Query error: ${error.message}`);
      return '';
    }

    if (!capabilities || capabilities.length === 0) {
      return '';
    }

    const formatters = {
      trend_scanner: formatForTrendScanner,
      democratization_finder: formatForDemocratization,
      capability_overhang: formatForOverhang,
      nursery_reeval: formatForNurseryReeval,
    };

    const formatter = formatters[scannerType] || formatForOverhang;
    const block = formatter(capabilities);

    // Hard cap enforcement
    if (block.length > MAX_CONTEXT_CHARS) {
      return block.substring(0, MAX_CONTEXT_CHARS - 3) + '...';
    }

    return block;
  } catch (err) {
    console.warn(`[scanner-context] Error: ${err.message}`);
    return '';
  }
}

/**
 * Trend Scanner: Group capabilities by category to identify where EHG
 * has existing strengths that align with market trends.
 */
function formatForTrendScanner(capabilities) {
  const byType = {};
  for (const cap of capabilities) {
    const type = cap.capability_type || 'other';
    if (!byType[type]) byType[type] = [];
    byType[type].push(cap);
  }

  let block = '## EHG Internal Capabilities (by category)\n';
  block += 'When suggesting ventures, consider how these existing capabilities provide a head start:\n\n';

  for (const [type, caps] of Object.entries(byType)) {
    block += `**${type}**: ${caps.map(c => c.name || c.capability_key).join(', ')}\n`;
  }

  return block;
}

/**
 * Democratization Finder: Highlight capabilities with high reuse potential
 * that could be used to democratize premium services.
 */
function formatForDemocratization(capabilities) {
  // Sort by reuse_count to highlight most reusable capabilities
  const sorted = [...capabilities].sort((a, b) => (b.reuse_count || 0) - (a.reuse_count || 0));

  let block = '## EHG Reusable Capabilities\n';
  block += 'These internal capabilities can power democratized versions of premium services:\n\n';

  for (const cap of sorted.slice(0, 15)) {
    const reuse = cap.reuse_count ? ` (reused ${cap.reuse_count}x)` : '';
    block += `- **${cap.name || cap.capability_key}** [${cap.capability_type}]${reuse}\n`;
  }

  return block;
}

/**
 * Capability Overhang: Full detail including plane1_score and maturity
 * to enable true overhang gap analysis against market opportunities.
 */
function formatForOverhang(capabilities) {
  let block = '## EHG Capability Ledger (Internal Strengths)\n';
  block += 'Use this real data to identify ventures where EHG has an existing capability advantage:\n\n';
  block += '| Capability | Type | Score | Maturity | Reuse |\n';
  block += '|---|---|---|---|---|\n';

  for (const cap of capabilities) {
    const score = cap.plane1_score != null ? cap.plane1_score.toFixed(1) : 'N/A';
    const maturity = cap.maturity_score != null ? cap.maturity_score : 'N/A';
    const reuse = cap.reuse_count || 0;
    block += `| ${cap.name || cap.capability_key} | ${cap.capability_type} | ${score} | ${maturity} | ${reuse}x |\n`;
  }

  block += '\nLook for gaps between these capabilities and market opportunities not yet productized.\n';

  return block;
}

/**
 * Nursery Re-eval: Focus on recently added capabilities that may
 * unblock previously parked ventures.
 */
function formatForNurseryReeval(capabilities) {
  // Sort by scored_at (most recent first) to highlight new capabilities
  const sorted = [...capabilities].sort((a, b) => {
    const dateA = a.first_registered_at ? new Date(a.first_registered_at).getTime() : 0;
    const dateB = b.first_registered_at ? new Date(b.first_registered_at).getTime() : 0;
    return dateB - dateA;
  });

  let block = '## Recently Added EHG Capabilities\n';
  block += 'Consider whether these new/updated capabilities unblock any parked ventures:\n\n';

  for (const cap of sorted.slice(0, 15)) {
    const date = cap.first_registered_at ? new Date(cap.first_registered_at).toISOString().split('T')[0] : 'unknown';
    block += `- **${cap.name || cap.capability_key}** [${cap.capability_type}] — added ${date}\n`;
  }

  return block;
}
