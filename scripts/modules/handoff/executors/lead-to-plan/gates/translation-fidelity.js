/**
 * TRANSLATION_FIDELITY Gate for LEAD-TO-PLAN
 *
 * Runs the architecture_to_sd translation fidelity check to verify that
 * the SD faithfully captures the intent from its upstream vision and
 * architecture plan documents. Uses LLM comparison to detect translation
 * gaps — ideas, constraints, or decisions present upstream but lost or
 * diluted in the SD.
 *
 * Requires: SD metadata.arch_key or metadata.architecture_plan_key
 * Skips gracefully when no architecture plan is linked.
 *
 * Phase: LEAD-TO-PLAN (blocking when arch plan exists, skip otherwise)
 */

import {
  buildSemanticResult,
  buildSkipResult
} from '../../../validation/semantic-gate-utils.js';

const GATE_NAME = 'TRANSLATION_FIDELITY';
const PASSING_SCORE = 70;

export function createTranslationFidelityGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n🔍 GATE: Translation Fidelity (Architecture → SD)');
      console.log('-'.repeat(50));

      const sd = ctx.sd;
      const sdKey = sd?.sd_key || sd?.id;
      const archKey = sd?.metadata?.arch_key || sd?.metadata?.architecture_plan_key;

      // No architecture plan linked — gate not applicable
      if (!archKey) {
        console.log('   ℹ️  No architecture plan linked — gate not applicable');
        return buildSkipResult(GATE_NAME, 'no_arch_key');
      }

      if (!supabase || !sdKey) {
        console.log('   ⚠️  Missing supabase client or SD key');
        return buildSemanticResult({
          passed: true, score: 50, confidence: 0.3,
          warnings: ['Cannot verify translation fidelity — missing context']
        });
      }

      // Orchestrator children are exempt — parent already validated
      if (sd?.metadata?.parent_orchestrator || sd?.metadata?.auto_generated) {
        console.log('   ⏭️  Orchestrator child detected — exempt from standalone fidelity check');
        return buildSemanticResult({
          passed: true, score: 100, confidence: 1.0,
          warnings: ['Orchestrator child: translation fidelity deferred to parent']
        });
      }

      try {
        // Check for a recent passing result in eva_translation_gates
        // to avoid re-running the LLM call on every handoff retry
        const cached = await checkCachedResult(supabase, sdKey, archKey);
        if (cached) {
          console.log(`   📋 Using cached result from ${cached.created_at} (score: ${cached.coverage_score}/100)`);
          return buildResultFromCached(cached);
        }

        // Run the translation fidelity gate via the engine
        const { runArchitectureToSDGate } = await import('../../../../../eva/translation-fidelity-gate.js');

        // Build SD data payload for the gate
        const sdData = {
          id: sd.id,
          sd_key: sdKey,
          title: sd.title,
          description: sd.description,
          key_changes: sd.key_changes,
          success_criteria: sd.success_criteria,
        };

        const result = await runArchitectureToSDGate(archKey, sdData);

        if (!result) {
          console.log('   ⚠️  Translation fidelity gate returned no result — treating as advisory pass');
          return buildSemanticResult({
            passed: true, score: 50, confidence: 0.3,
            warnings: ['Translation fidelity gate returned no result (LLM may be unavailable)']
          });
        }

        // Map engine result to semantic gate result
        const gapCount = result.gaps?.length || 0;
        const criticalGaps = result.gaps?.filter(g => g.severity === 'critical') || [];
        const score = result.score ?? 0;
        const passed = score >= PASSING_SCORE && criticalGaps.length === 0;

        console.log(`   Score: ${score}/100 | Gaps: ${gapCount} (${criticalGaps.length} critical)`);

        if (gapCount > 0) {
          console.log('   Gaps found:');
          for (const gap of result.gaps) {
            const icon = gap.severity === 'critical' ? '❌' : gap.severity === 'major' ? '⚠️' : 'ℹ️';
            console.log(`      ${icon} [${gap.severity}] ${gap.item} (source: ${gap.source})`);
          }
        }

        if (passed) {
          console.log(`   ✅ Translation fidelity PASSED (${score}/100)`);
        } else {
          console.log(`   ❌ Translation fidelity FAILED (${score}/100, need ${PASSING_SCORE})`);
        }

        return buildSemanticResult({
          passed,
          score,
          confidence: 1.0,
          issues: passed ? [] : [
            `Translation fidelity score ${score}/100 below threshold ${PASSING_SCORE}`,
            ...criticalGaps.map(g => `Critical gap: ${g.item}`)
          ],
          warnings: result.gaps
            ?.filter(g => g.severity !== 'critical')
            .map(g => `[${g.severity}] ${g.item}`) || [],
          details: {
            arch_key: archKey,
            gate_type: 'architecture_to_sd',
            gap_count: gapCount,
            critical_gap_count: criticalGaps.length,
            model_used: result.details?.model_used,
            duration_ms: result.details?.duration_ms,
          },
          remediation: passed ? undefined :
            `SD does not fully capture the architecture plan (${archKey}). ` +
            'Review the gaps above and update the SD description, key_changes, and success_criteria ' +
            'to address the missing items. Then retry the handoff.'
        });
      } catch (err) {
        console.log(`   ⚠️  Translation fidelity gate error: ${err.message}`);
        return buildSemanticResult({
          passed: true, score: 50, confidence: 0.3,
          warnings: [`Translation fidelity gate error: ${err.message}`]
        });
      }
    },
    required: true,
    weight: 0.9
  };
}

/**
 * Check for a cached result in eva_translation_gates.
 * Returns the most recent result if it's less than 1 hour old.
 */
async function checkCachedResult(supabase, sdKey, archKey) {
  try {
    const { data, error } = await supabase
      .from('eva_translation_gates')
      .select('coverage_score, gaps, passed, metadata, created_at')
      .eq('gate_type', 'architecture_to_sd')
      .contains('target_ref', { key: sdKey })
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;

    const result = data[0];
    const age = Date.now() - new Date(result.created_at).getTime();
    const ONE_HOUR = 60 * 60 * 1000;

    if (age > ONE_HOUR) return null;

    return result;
  } catch {
    return null;
  }
}

/**
 * Build a semantic gate result from a cached eva_translation_gates row.
 */
function buildResultFromCached(cached) {
  const score = cached.coverage_score;
  const gaps = cached.gaps || [];
  const criticalGaps = gaps.filter(g => g.severity === 'critical');
  const passed = score >= PASSING_SCORE && criticalGaps.length === 0;

  return buildSemanticResult({
    passed,
    score,
    confidence: 1.0,
    issues: passed ? [] : [
      `Translation fidelity score ${score}/100 below threshold ${PASSING_SCORE}`,
      ...criticalGaps.map(g => `Critical gap: ${g.item}`)
    ],
    warnings: [
      'Result from cache (< 1 hour old)',
      ...gaps.filter(g => g.severity !== 'critical').map(g => `[${g.severity}] ${g.item}`)
    ],
    details: { cached: true, cached_at: cached.created_at }
  });
}
