/**
 * Strategy Effectiveness Stats for S17
 *
 * Aggregates strategy selection patterns from approved S17 artifacts
 * to track which design strategies (conversion, trust, education, engagement)
 * are preferred per page type. Detects normalization imbalance.
 *
 * SD-S17-DESIGN-MASTERY-PIPELINE-ORCH-001-C
 * @module lib/eva/stage-17/strategy-stats
 */

import { writeArtifact } from '../artifact-persistence-service.js';

const DOMINANCE_THRESHOLD = 0.6;
const MIN_SAMPLES_FOR_WARNING = 5;

/**
 * Aggregate strategy selection statistics for a venture.
 * Reads all approved S17 artifacts, groups by page type and strategy,
 * and produces an s17_strategy_stats artifact.
 *
 * @param {string} ventureId
 * @param {object} supabase - Supabase client
 * @returns {Promise<{ stats: object, artifactId: string|null }>}
 */
export async function aggregateStrategyStats(ventureId, supabase) {
  const { data: approved, error } = await supabase
    .from('venture_artifacts')
    .select('metadata')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .in('artifact_type', ['stage_17_approved_mobile', 'stage_17_approved_desktop']);

  if (error) {
    console.error('[strategy-stats] DB error:', error.message);
    return { stats: null, artifactId: null };
  }

  if (!approved || approved.length === 0) {
    return { stats: { per_page_type: {}, total_selections: 0, dominant_strategies: [] }, artifactId: null };
  }

  // Aggregate by page type and strategy
  const perPageType = {};
  let totalSelections = 0;

  for (const art of approved) {
    const meta = art.metadata ?? {};
    const pageType = meta.page_type ?? 'unknown';
    const strategy = meta.strategy_name ?? 'unknown';

    if (!perPageType[pageType]) {
      perPageType[pageType] = { total: 0, strategies: {} };
    }
    perPageType[pageType].total++;
    perPageType[pageType].strategies[strategy] = (perPageType[pageType].strategies[strategy] || 0) + 1;
    totalSelections++;
  }

  // Detect dominant strategies
  const dominantStrategies = [];
  for (const [pageType, data] of Object.entries(perPageType)) {
    if (data.total < MIN_SAMPLES_FOR_WARNING) continue;

    for (const [strategy, count] of Object.entries(data.strategies)) {
      const share = count / data.total;
      if (share > DOMINANCE_THRESHOLD) {
        dominantStrategies.push({
          page_type: pageType,
          strategy,
          share: Math.round(share * 100),
          count,
          total: data.total,
        });
        console.warn(
          `[strategy-stats] ⚠ Dominant strategy detected: "${strategy}" has ${Math.round(share * 100)}% share for "${pageType}" (${count}/${data.total} selections)`
        );
      }
    }
  }

  const stats = {
    per_page_type: perPageType,
    total_selections: totalSelections,
    dominant_strategies: dominantStrategies,
    aggregated_at: new Date().toISOString(),
  };

  // Write stats artifact
  let artifactId = null;
  try {
    artifactId = await writeArtifact(supabase, {
      ventureId,
      lifecycleStage: 17,
      artifactType: 's17_strategy_stats',
      title: 'Strategy Effectiveness Statistics',
      content: JSON.stringify(stats),
      artifactData: stats,
      qualityScore: null,
      validationStatus: null,
      source: 'stage-17-strategy-stats',
      metadata: { totalSelections, dominantCount: dominantStrategies.length },
    });
  } catch (e) {
    console.warn('[strategy-stats] Artifact write failed:', e.message);
  }

  return { stats, artifactId };
}

/**
 * Load prior strategy stats for a venture and produce reordering hints
 * for archetype generation. If a strategy is overrepresented (dominant),
 * suggest leading with underrepresented strategies instead.
 *
 * Called by archetype-generator before variant generation to close the feedback loop.
 *
 * @param {string} ventureId
 * @param {object} supabase
 * @returns {Promise<Record<string, string[]>|null>} Map of pageType → strategy order, or null if no stats
 */
export async function getStrategyReorderHints(ventureId, supabase) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('artifact_data')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 's17_strategy_stats')
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();

  if (error || !data?.artifact_data?.per_page_type) return null;

  const allStrategies = ['clarity-first', 'dense', 'narrative', 'visual-impact'];
  const hints = {};

  for (const [pageType, ptData] of Object.entries(data.artifact_data.per_page_type)) {
    if (ptData.total < MIN_SAMPLES_FOR_WARNING) continue;

    // Sort strategies by selection count ascending — underrepresented first
    const sorted = allStrategies
      .map(s => ({ strategy: s, count: ptData.strategies[s] ?? 0 }))
      .sort((a, b) => a.count - b.count)
      .map(s => s.strategy);

    // Only produce hint if ordering differs from default
    if (sorted[0] !== allStrategies[0]) {
      hints[pageType] = sorted;
      console.log(`[strategy-stats] Reorder hint for ${pageType}: ${sorted.join(' → ')} (underrepresented first)`);
    }
  }

  return Object.keys(hints).length > 0 ? hints : null;
}
