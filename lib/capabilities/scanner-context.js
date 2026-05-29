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

// SD-LEO-INFRA-MATURITY-WEIGHTED-PORTFOLIO-001: maturity-weighted, portfolio-aware anchoring.
// The capability block's INFLUENCE scales with portfolio maturity (explore-early / exploit-late):
// at immaturity the block is softened (fewer capabilities + an exploratory preamble that favors
// latent capability + market opportunity over the thin proven ledger), preventing the degenerate
// "echo the trunk's internal infra back as venture ideas" cron-bias. As proven, reusable capability
// accumulates, the block rises to full strength.
const MIN_CAPABILITIES = 3;        // floor — soften, never fully empty, the block at immaturity
const EXPLOIT_THRESHOLD = 0.33;    // maturityScore below this gets the exploratory preamble
// Saturation constants for the maturity signal (documented thresholds; tuned for an immature
// portfolio so current data yields a deliberately LOW score).
const PROD_SATURATION = 100;       // production-grade capabilities for full prod-signal
const REUSE_SATURATION = 50;       // reuse events for full reuse-signal
const VENTURE_SATURATION = 20;     // shipped ventures for full venture-signal

const EXPLORATORY_PREAMBLE =
  '> NOTE: EHG\'s proven, reusable capability base is still small (early-stage portfolio). ' +
  'Treat the capabilities below as a WEAK prior, not a mandate — prioritize latent capability ' +
  'and market opportunity over echoing existing internal strengths.\n\n';

/**
 * Compute a portfolio-maturity signal from the populated capability graph.
 * Derived on-the-fly (no dedicated table): production-grade count + reuse volume + venture count,
 * each saturated to [0,1] and averaged into maturityScore ∈ [0,1].
 *
 * Fail-soft: on any error (or when reuse_log is empty) the signal degrades gracefully. A total
 * failure returns maturityScore=1 so the block falls back to current FULL-strength behavior
 * (no regression) — the documented PRD tradeoff (FR-1 / fail-soft AC).
 *
 * @param {Object} supabase
 * @returns {Promise<{productionGradeCount:number, reuseVolume:number, ventureCount:number, maturityScore:number}>}
 */
export async function computePortfolioMaturity(supabase) {
  const fullWeight = { productionGradeCount: 0, reuseVolume: 0, ventureCount: 0, maturityScore: 1 };
  if (!supabase) return fullWeight;
  try {
    const [prodRes, reuseRes, ventureRes] = await Promise.all([
      supabase.from('v_unified_capabilities').select('*', { count: 'exact', head: true }).eq('maturity_level', 'production'),
      supabase.from('capability_reuse_log').select('*', { count: 'exact', head: true }),
      supabase.from('ventures').select('*', { count: 'exact', head: true }),
    ]);
    // A query error on any single signal is treated as 0 for that signal (valid low signal),
    // NOT a total failure — only a thrown exception triggers the full-weight fallback.
    const productionGradeCount = prodRes.error ? 0 : (prodRes.count || 0);
    const reuseVolume = reuseRes.error ? 0 : (reuseRes.count || 0);
    const ventureCount = ventureRes.error ? 0 : (ventureRes.count || 0);

    const prodC = Math.min(1, productionGradeCount / PROD_SATURATION);
    const reuseC = Math.min(1, reuseVolume / REUSE_SATURATION);
    const ventureC = Math.min(1, ventureCount / VENTURE_SATURATION);
    const maturityScore = (prodC + reuseC + ventureC) / 3;

    return { productionGradeCount, reuseVolume, ventureCount, maturityScore };
  } catch (err) {
    console.warn(`[scanner-context] portfolio-maturity computation failed, defaulting to full weight: ${err.message}`);
    return fullWeight;
  }
}

/**
 * Monotonic map: how many capabilities the block surfaces at a given maturity.
 * maturityScore 0 → MIN_CAPABILITIES; 1 → MAX_CAPABILITIES. Strictly non-decreasing.
 */
export function maturityToCapCount(maturityScore) {
  const s = Math.max(0, Math.min(1, Number(maturityScore) || 0));
  return Math.max(MIN_CAPABILITIES, Math.round(MIN_CAPABILITIES + s * (MAX_CAPABILITIES - MIN_CAPABILITIES)));
}

/** Map the portfolio view's categorical maturity_level to the numeric maturity_score formatters expect. */
function maturityLevelToScore(level) {
  switch (String(level || '').toLowerCase()) {
    case 'production': return 5;
    case 'stable': return 4;
    case 'beta': return 3;
    case 'experimental': return 2;
    case 'deprecated': return 1;
    default: return 0;
  }
}

/**
 * Remap a v_unified_capabilities row to the column shape the formatters read. The portfolio view
 * exposes name/capability_type/scope/plane1_score/maturity_level but NOT the ledger's
 * capability_key/maturity_score/reuse_count/first_registered_at — without this remap the formatters
 * would emit `undefined`. (FR-3 column-contract safety.)
 */
function remapUnifiedRow(r) {
  return {
    capability_key: r.name,
    name: r.name,
    capability_type: r.capability_type,
    plane1_score: r.plane1_score,
    maturity_score: maturityLevelToScore(r.maturity_level),
    maturity_level: r.maturity_level,
    reuse_count: 0,            // reuse volume is not surfaced per-capability in the portfolio view yet
    registered_by_sd: r.source_key,
    first_registered_at: null, // portfolio view has no per-capability registration timestamp
    scope: r.scope,
  };
}

/**
 * Get a formatted capability context block for a specific scanner type, weighted by portfolio maturity.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} scannerType - One of: trend_scanner, democratization_finder, capability_overhang, nursery_reeval
 * @param {number|null} [maturityScore] - Portfolio maturity ∈ [0,1]. If null, it is computed here
 *                                         (fail-soft to full weight). Callers running multiple scanners
 *                                         can compute once and pass it to avoid recomputation.
 * @returns {Promise<string>} Formatted markdown context block, or empty string if no data
 */
export async function getCapabilityContextBlock(supabase, scannerType, maturityScore = null) {
  if (!supabase) return '';

  try {
    // SD-LEO-INFRA-ANCHOR-SIMPLE-VENTURE-001: capability anchoring is OPT-IN.
    // Only EXPLICITLY mapped scanner types receive a capability block. Unknown/unmapped types
    // (e.g. 'simple_venture') return an empty block instead of leaking internal context.
    const formatters = {
      trend_scanner: formatForTrendScanner,
      democratization_finder: formatForDemocratization,
      capability_overhang: formatForOverhang,
      nursery_reeval: formatForNurseryReeval,
    };
    const formatter = formatters[scannerType];
    if (!formatter) return '';

    const maturity = maturityScore == null
      ? (await computePortfolioMaturity(supabase)).maturityScore
      : Math.max(0, Math.min(1, Number(maturityScore) || 0));

    // FR-3: portfolio-wide source (platform + application + venture) with column remap.
    const { data: rows, error } = await supabase
      .from('v_unified_capabilities')
      .select('name, capability_type, plane1_score, maturity_level, scope, source_key')
      .order('plane1_score', { ascending: false, nullsFirst: false })
      .limit(MAX_CAPABILITIES);

    if (error) {
      console.warn(`[scanner-context] Query error: ${error.message}`);
      return '';
    }
    if (!rows || rows.length === 0) {
      return '';
    }

    // FR-2: maturity weighting — surface fewer capabilities at low maturity.
    const capCount = maturityToCapCount(maturity);
    const capabilities = rows.slice(0, capCount).map(remapUnifiedRow);

    let block = formatter(capabilities);

    // Soften framing at immaturity so the thin ledger is a weak prior, not a mandate.
    if (maturity < EXPLOIT_THRESHOLD) {
      block = EXPLORATORY_PREAMBLE + block;
    }

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
