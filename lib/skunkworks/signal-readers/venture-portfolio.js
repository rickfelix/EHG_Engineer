/**
 * Signal Reader: Venture Portfolio
 * Scans venture stages and metadata to identify stuck or stale ventures.
 *
 * SD: SD-AUTONOMOUS-SKUNKWORKS-RD-DEPARTMENT-ORCH-001-A (FR-004)
 */

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 — this reader iterates every
// active venture to emit stale/stuck/concentration signals and computes totals over the
// full set; a read silently capped at the PostgREST 1000-row max would drop ventures and
// skew the portfolio-concentration math. ventures is a growing table, so paginate.
import { fetchAllPaginated } from '../../db/fetch-all-paginated.mjs';

const STALE_DAYS = 30;

/**
 * @param {Object} deps - { supabase, logger }
 * @returns {Promise<Array<{type: string, title: string, evidence: Object, priority: number}>>}
 */
export async function readVenturePortfolioSignals(deps) {
  const { supabase, logger = console } = deps;
  const signals = [];

  try {
    // Get active ventures with their current stage.
    // Live columns: current_lifecycle_stage (int) + ai_score — ventures has NO
    // stage/synthesis_score columns (SD-LEO-FIX-FIX-PHANTOM-COLUMN-002).
    let ventures;
    try {
      ventures = await fetchAllPaginated(() => supabase
        .from('ventures')
        .select('id, name, status, current_lifecycle_stage, ai_score, updated_at, created_at, metadata')
        .in('status', ['active', 'evaluating', 'under_review'])
        .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
    } catch (readErr) {
      logger.warn(`[venture-reader] Failed to read ventures: ${readErr.message}`);
      return signals;
    }

    if (!ventures || ventures.length === 0) {
      logger.log('[venture-reader] No active ventures found');
      return signals;
    }

    const now = Date.now();

    for (const venture of ventures) {
      const updatedAt = new Date(venture.updated_at || venture.created_at).getTime();
      const daysSinceUpdate = Math.round((now - updatedAt) / (1000 * 60 * 60 * 24));

      // Stale venture — no activity for STALE_DAYS
      if (daysSinceUpdate > STALE_DAYS) {
        signals.push({
          type: 'venture_portfolio',
          title: `Stale venture: ${venture.name} (${daysSinceUpdate}d inactive)`,
          evidence: {
            venture_id: venture.id,
            venture_name: venture.name,
            stage: venture.current_lifecycle_stage,
            days_inactive: daysSinceUpdate,
            last_updated: venture.updated_at,
            ai_score: venture.ai_score,
          },
          priority: Math.min(85, 40 + daysSinceUpdate),
        });
      }

      // Stuck in early stages (stage <= 2) with low AI score
      if (venture.current_lifecycle_stage != null && venture.current_lifecycle_stage <= 2 && venture.ai_score != null && venture.ai_score < 50) {
        signals.push({
          type: 'venture_portfolio',
          title: `Low-scoring early-stage venture: ${venture.name}`,
          evidence: {
            venture_id: venture.id,
            venture_name: venture.name,
            stage: venture.current_lifecycle_stage,
            ai_score: venture.ai_score,
          },
          priority: 60,
        });
      }
    }

    // Portfolio balance check — look for stage concentration
    const stageCounts = {};
    for (const v of ventures) {
      const s = v.current_lifecycle_stage || 0;
      stageCounts[s] = (stageCounts[s] || 0) + 1;
    }

    const totalVentures = ventures.length;
    for (const [stage, count] of Object.entries(stageCounts)) {
      const pct = (count / totalVentures) * 100;
      // If >60% of ventures are concentrated in one stage, flag it
      if (pct > 60 && totalVentures >= 3) {
        signals.push({
          type: 'venture_portfolio',
          title: `Portfolio concentration: ${Math.round(pct)}% ventures in Stage ${stage}`,
          evidence: {
            stage: Number(stage),
            count,
            total_ventures: totalVentures,
            concentration_pct: Math.round(pct),
            stage_distribution: stageCounts,
          },
          priority: 55,
        });
      }
    }

    logger.log(`[venture-reader] Found ${signals.length} signals from ${ventures.length} ventures`);
  } catch (err) {
    logger.warn(`[venture-reader] Error: ${err.message}`);
  }

  return signals;
}
