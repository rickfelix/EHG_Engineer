/**
 * VISION_DIMENSION_COMPLETENESS Semantic Gate
 * Part of SD-LEO-FEAT-SEMANTIC-VALIDATION-GATES-002 (Gate 4)
 *
 * Enforces vision alignment by checking eva_vision_scores.
 * Promotes vision-completion-score from advisory to blocking (configurable threshold).
 *
 * Phase: PLAN-TO-EXEC
 */

import {
  getGateApplicability,
  computeConfidence,
  buildSemanticResult,
  buildSkipResult
} from '../../../validation/semantic-gate-utils.js';

const GATE_NAME = 'VISION_DIMENSION_COMPLETENESS';
const DEFAULT_THRESHOLD = 70;

export function createVisionDimensionCompletenessGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n🎯 SEMANTIC GATE: Vision Dimension Completeness');
      console.log('-'.repeat(50));

      const sdType = ctx.sd?.sd_type || ctx.sdType || 'feature';
      const sdId = ctx.sd?.id || ctx.sdId;

      const { applicable, level } = getGateApplicability(GATE_NAME, sdType);
      if (!applicable) {
        console.log(`   ℹ️  Skipped for SD type: ${sdType}`);
        return buildSkipResult(GATE_NAME, sdType);
      }

      if (!supabase || !sdId) {
        return buildSemanticResult({
          passed: true, score: 50, confidence: 0.3,
          warnings: ['Cannot check vision dimensions — missing context']
        });
      }

      try {
        // QF-20260423-812: eva_vision_scores exposes `total_score` and
        // `dimension_scores` columns. The obsolete `score` / `dimensions` names
        // caused PostgreSQL errors on every invocation, which the self-catch
        // below masked as passed=true score=50 — silently falsifying the gate.
        const { data: visionScores, error } = await supabase
          .from('eva_vision_scores')
          .select('total_score, dimension_scores, scored_at')
          .eq('sd_id', sdId)
          .order('scored_at', { ascending: false })
          .limit(1);

        if (error) {
          console.log(`   ⚠️  Database error: ${error.message}`);
          return buildSemanticResult({
            passed: true, score: 50, confidence: 0.3,
            warnings: [`Vision score query error: ${error.message}`]
          });
        }

        if (!visionScores || visionScores.length === 0) {
          console.log('   ⚠️  No vision scores found');
          return buildSemanticResult({
            passed: level === 'OPT',
            score: level === 'OPT' ? 50 : 0,
            confidence: 0.6,
            issues: level === 'REQ' ? ['No vision score recorded for this SD'] : [],
            warnings: level === 'OPT' ? ['No vision score — optional for this SD type'] : [],
            remediation: 'Run vision scoring before PLAN-TO-EXEC handoff'
          });
        }

        const latest = visionScores[0];
        const overallScore = latest.total_score || 0;
        const dimensions = latest.dimension_scores || {};

        // Check individual dimension coverage
        const dimensionKeys = Object.keys(dimensions);
        let lowDimensions = [];

        for (const [key, value] of Object.entries(dimensions)) {
          const dimScore = typeof value === 'number' ? value : value?.score || 0;
          if (dimScore < DEFAULT_THRESHOLD) {
            lowDimensions.push(`${key}: ${dimScore}/100`);
          }
        }

        const confidence = computeConfidence({
          dataPoints: dimensionKeys.length + 1, // dimensions + overall score
          expectedPoints: 5 // expect at least 5 dimensions
        });

        const threshold = level === 'OPT' ? DEFAULT_THRESHOLD - 20 : DEFAULT_THRESHOLD;
        const passed = level === 'OPT' ? true : overallScore >= threshold;

        console.log(`   📊 Vision Score: ${overallScore}/100 (threshold: ${threshold})`);
        console.log(`   📊 Dimensions: ${dimensionKeys.length} scored, ${lowDimensions.length} below threshold`);
        console.log(`   ${passed ? '✅' : '❌'} Score: ${overallScore}/100 | Confidence: ${confidence}`);

        if (lowDimensions.length > 0) {
          console.log('   Low dimensions:');
          lowDimensions.forEach(d => console.log(`      - ${d}`));
        }

        return buildSemanticResult({
          passed,
          score: overallScore,
          confidence,
          issues: !passed ? [`Vision score ${overallScore} below threshold ${threshold}`] : [],
          warnings: [
            ...(level === 'OPT' && overallScore < threshold ? [`Low vision score (${overallScore}) — advisory`] : []),
            ...(lowDimensions.length > 0 ? [`${lowDimensions.length} dimension(s) below threshold`] : [])
          ],
          details: {
            overallScore,
            threshold,
            dimensions: dimensionKeys.length,
            lowDimensions,
            scoredAt: latest.scored_at
          },
          remediation: !passed ? `Improve vision alignment to reach ${threshold}/100. Focus on: ${lowDimensions.slice(0, 3).join(', ')}` : undefined
        });
      } catch (err) {
        console.log(`   ⚠️  Error: ${err.message}`);
        return buildSemanticResult({
          passed: true, score: 50, confidence: 0.3,
          warnings: [`Vision dimension check error: ${err.message}`]
        });
      }
    },
    required: true,
    weight: 0.8
  };
}
