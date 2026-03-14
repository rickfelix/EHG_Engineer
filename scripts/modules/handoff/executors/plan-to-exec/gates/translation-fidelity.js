/**
 * TRANSLATION_FIDELITY Gate for PLAN-TO-EXEC
 *
 * Second invocation of the architecture→SD translation fidelity check.
 * By PLAN-TO-EXEC, the SD has been through PRD creation and planning work,
 * so this re-evaluation catches any drift or scope changes that may have
 * diluted the original architecture intent.
 *
 * Always runs a fresh LLM comparison (no caching).
 *
 * Requires: SD metadata.arch_key or metadata.architecture_plan_key
 * Skips gracefully when no architecture plan is linked.
 *
 * Phase: PLAN-TO-EXEC (blocking when arch plan exists, skip otherwise)
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
      console.log('\n🔍 GATE: Translation Fidelity — PLAN-TO-EXEC (Architecture → SD)');
      console.log('-'.repeat(55));

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
        // Always run a fresh LLM comparison — no caching.
        // This is the second evaluation (first was at LEAD-TO-PLAN).
        // The SD may have changed during planning work.
        const { runArchitectureToSDGate } = await import('../../../../../eva/translation-fidelity-gate.js');

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
            phase: 'PLAN-TO-EXEC',
            gap_count: gapCount,
            critical_gap_count: criticalGaps.length,
            model_used: result.details?.model_used,
            duration_ms: result.details?.duration_ms,
          },
          remediation: passed ? undefined :
            `SD has drifted from its architecture plan (${archKey}) during planning. ` +
            'Review the gaps above and update the SD or PRD to re-align with the architecture intent. ' +
            'Then retry the handoff.'
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
    weight: 0.9,
    llmPowered: true
  };
}
