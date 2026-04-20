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

// SD-type-aware thresholds (SD-LEARN-FIX-ADDRESS-PAT-AUTO-068)
// Infrastructure/fix/documentation SDs have lower fidelity requirements
// because architecture plans are less common and translations are simpler.
const PASSING_SCORES = {
  feature: 70,
  enhancement: 70,
  orchestrator: 70,
  infrastructure: 60,
  fix: 60,
  documentation: 60,
  refactor: 65,
};
const DEFAULT_PASSING_SCORE = 70;

function getPassingScore(sdType) {
  return PASSING_SCORES[sdType] || DEFAULT_PASSING_SCORE;
}

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
      // SD-LEO-INFRA-ORCHESTRATOR-GATE-FIXES-ORCH-001-B: also check parent_sd_id
      // (leo-create-sd.js sets parent_sd_key in metadata, not parent_orchestrator)
      if (sd?.metadata?.parent_orchestrator || sd?.metadata?.auto_generated || sd?.parent_sd_id) {
        console.log('   ⏭️  Orchestrator child detected — exempt from standalone fidelity check');
        return buildSemanticResult({
          passed: true, score: 100, confidence: 1.0,
          warnings: ['Orchestrator child: translation fidelity deferred to parent']
        });
      }

      try {
        // Always re-run the LLM comparison — no caching.
        // The SD may have been updated between creation and handoff,
        // so a fresh evaluation is required every time.

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
        const sdType = sd?.sd_type || 'feature';
        const passingScore = getPassingScore(sdType);
        const passed = score >= passingScore && criticalGaps.length === 0;

        console.log(`   Score: ${score}/100 | Threshold: ${passingScore} (${sdType}) | Gaps: ${gapCount} (${criticalGaps.length} critical)`);

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
          console.log(`   ❌ Translation fidelity FAILED (${score}/100, need ${passingScore} for ${sdType})`);
        }

        return buildSemanticResult({
          passed,
          score,
          confidence: 1.0,
          issues: passed ? [] : [
            ...(score < passingScore ? [`Translation fidelity score ${score}/100 below threshold ${passingScore} (${sdType})`] : []),
            ...(criticalGaps.length > 0 ? [`Translation fidelity blocked by ${criticalGaps.length} critical gap(s) in architecture → SD translation`] : []),
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
    weight: 0.9,
    llmPowered: true
  };
}

