/**
 * Three-Cadence Optimization Loop
 * SD-EVA-FEAT-MARKETING-AI-001 (US-002)
 *
 * Runs optimization at three cadences:
 * - Hourly: Channel budget reallocation based on real-time ROI
 * - Daily: Champion-Challenger content rotation
 * - Weekly: Cross-venture intelligence sharing
 */

import { createSampler } from './thompson-sampler.js';

const CADENCES = {
  HOURLY: 'hourly',
  DAILY: 'daily',
  WEEKLY: 'weekly'
};

const ROI_THRESHOLD = 0.15; // 15% ROI difference triggers reallocation
const BUDGET_SHIFT_MIN = 0.10; // Minimum 10% budget shift
const CHAMPION_CONFIDENCE = 0.05; // 5% conversion rate improvement needed

/**
 * Create an optimization loop instance.
 *
 * @param {object} deps
 * @param {object} deps.supabase - Supabase client
 * @param {object} [deps.sampler] - Thompson Sampler instance (created if not provided)
 * @param {object} [deps.logger] - Logger (defaults to console)
 * @returns {OptimizationLoop}
 */
export function createOptimizationLoop(deps) {
  const { supabase, logger: _logger = console } = deps;
  const sampler = deps.sampler ?? createSampler();

  return {
    /**
     * Run hourly channel budget reallocation.
     * Shifts budget toward channels with higher ROI.
     *
     * @param {Array<{channelId: string, spend: number, revenue: number}>} channelMetrics
     * @returns {{decisions: Array, executionDurationMs: number}}
     */
    async runHourly(channelMetrics) {
      const start = Date.now();
      const decisions = [];

      if (channelMetrics.length < 2) {
        return { decisions: [], executionDurationMs: Date.now() - start };
      }

      // Calculate ROI for each channel
      const channels = channelMetrics.map(ch => ({
        ...ch,
        roi: ch.spend > 0 ? (ch.revenue - ch.spend) / ch.spend : 0
      }));

      // Find max and min ROI
      channels.sort((a, b) => b.roi - a.roi);
      const best = channels[0];
      const worst = channels[channels.length - 1];
      const roiDiff = best.roi - worst.roi;

      if (roiDiff > ROI_THRESHOLD) {
        const shiftAmount = Math.max(BUDGET_SHIFT_MIN, roiDiff * 0.5);
        const cappedShift = Math.min(shiftAmount, 0.50); // Never shift more than 50%

        decisions.push({
          type: 'budget_reallocation',
          fromChannel: worst.channelId,
          toChannel: best.channelId,
          shiftPercent: cappedShift,
          reason: `ROI gap ${(roiDiff * 100).toFixed(1)}% exceeds ${ROI_THRESHOLD * 100}% threshold`,
          bestROI: best.roi,
          worstROI: worst.roi
        });
      }

      const executionDurationMs = Date.now() - start;
      await logOptimizationRun(supabase, CADENCES.HOURLY, decisions, channelMetrics, executionDurationMs);

      return { decisions, executionDurationMs };
    },

    /**
     * Run daily Champion-Challenger rotation.
     * Promotes challenger variants that outperform the current champion.
     *
     * @param {Array<{id: string, successes: number, failures: number, isChampion: boolean}>} variants
     * @returns {{decisions: Array, executionDurationMs: number}}
     */
    async runDaily(variants) {
      const start = Date.now();
      const decisions = [];

      const champion = variants.find(v => v.isChampion);
      const challengers = variants.filter(v => !v.isChampion);

      if (!champion || challengers.length === 0) {
        return { decisions: [], executionDurationMs: Date.now() - start };
      }

      const champImpressions = champion.successes + champion.failures;
      const champRate = champImpressions > 0 ? champion.successes / champImpressions : 0;

      for (const challenger of challengers) {
        if (!sampler.canDeclareChampion(challenger)) continue;

        const challImpressions = challenger.successes + challenger.failures;
        const challRate = challImpressions > 0 ? challenger.successes / challImpressions : 0;
        const improvement = challRate - champRate;

        if (improvement > CHAMPION_CONFIDENCE) {
          decisions.push({
            type: 'champion_promotion',
            previousChampion: champion.id,
            newChampion: challenger.id,
            improvementPercent: improvement,
            championRate: champRate,
            challengerRate: challRate,
            reason: `Challenger outperforms by ${(improvement * 100).toFixed(1)}% (>${CHAMPION_CONFIDENCE * 100}% threshold)`
          });
          break; // Only promote one per cycle
        }
      }

      const executionDurationMs = Date.now() - start;
      await logOptimizationRun(supabase, CADENCES.DAILY, decisions, { champion: champion.id, challengers: challengers.length }, executionDurationMs);

      return { decisions, executionDurationMs };
    },

    /**
     * Run weekly cross-venture intelligence aggregation.
     * Identifies successful patterns in one venture that could benefit another.
     *
     * @param {Array<{ventureId: string, patterns: Array<{pattern: string, successRate: number, sampleSize: number}>}>} ventureData
     * @returns {{recommendations: Array, executionDurationMs: number}}
     */
    async runWeekly(ventureData) {
      const start = Date.now();
      const recommendations = [];

      if (ventureData.length < 2) {
        return { recommendations: [], executionDurationMs: Date.now() - start };
      }

      // Build a map of all patterns across ventures
      const patternMap = new Map();
      for (const venture of ventureData) {
        for (const p of venture.patterns) {
          if (!patternMap.has(p.pattern)) {
            patternMap.set(p.pattern, []);
          }
          patternMap.set(p.pattern, [
            ...patternMap.get(p.pattern),
            { ventureId: venture.ventureId, ...p }
          ]);
        }
      }

      // Find patterns that succeed in one venture but aren't used in others
      for (const [pattern, usages] of patternMap) {
        const successfulUsages = usages.filter(u => u.successRate > 0.5 && u.sampleSize >= 30);
        if (successfulUsages.length === 0) continue;

        const venturesUsing = new Set(usages.map(u => u.ventureId));
        const venturesNotUsing = ventureData
          .filter(v => !venturesUsing.has(v.ventureId))
          .map(v => v.ventureId);

        if (venturesNotUsing.length > 0) {
          recommendations.push({
            type: 'cross_pollination',
            pattern,
            sourceVenture: successfulUsages[0].ventureId,
            successRate: successfulUsages[0].successRate,
            sampleSize: successfulUsages[0].sampleSize,
            targetVentures: venturesNotUsing,
            reason: `Pattern "${pattern}" succeeds in ${successfulUsages[0].ventureId} (${(successfulUsages[0].successRate * 100).toFixed(0)}%) but unused in ${venturesNotUsing.join(', ')}`
          });
        }
      }

      const executionDurationMs = Date.now() - start;
      await logOptimizationRun(supabase, CADENCES.WEEKLY, recommendations, { ventures: ventureData.length }, executionDurationMs);

      return { recommendations, executionDurationMs };
    }
  };
}

/**
 * Log an optimization run to the database.
 */
async function logOptimizationRun(supabase, cadenceType, decisions, metricsUsed, executionDurationMs) {
  try {
    await supabase.from('optimization_runs').insert({
      cadence_type: cadenceType,
      decisions_made: decisions,
      metrics_used: metricsUsed,
      execution_duration_ms: executionDurationMs,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    // Non-critical: log but don't fail the optimization
    console.warn('Failed to log optimization run:', err.message);
  }
}

export { CADENCES, ROI_THRESHOLD, BUDGET_SHIFT_MIN, CHAMPION_CONFIDENCE };
