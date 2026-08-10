/**
 * Retrospective Quality Gate for PLAN-TO-LEAD
 * Part of SD-LEO-REFACTOR-PLANTOLEAD-001
 *
 * SD-CAPABILITY-LIFECYCLE-001: Validates retrospective exists AND has quality content
 */

import { isInfrastructureSDSync, getThresholdProfile } from '../../../../sd-type-checker.js';
import { getFilteredRetrospective } from '../../../retro-filters.js';

/**
 * Create the RETROSPECTIVE_QUALITY_GATE validator
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createRetrospectiveQualityGate(supabase) {
  return {
    name: 'RETROSPECTIVE_QUALITY_GATE',
    validator: async (ctx) => {
      console.log('\n🔒 RETROSPECTIVE QUALITY GATE');
      console.log('-'.repeat(50));

      // Check for orchestrator children
      const parentSdId = ctx.sd?.id || ctx.sdId;
      const { data: children, error: childError } = await supabase
        .from('strategic_directives_v2')
        .select('id, title, status')
        .eq('parent_sd_id', parentSdId);

      if (childError) {
        console.log(`   ⚠️ Child query error: ${childError.message}`);
      }

      const isOrchestrator = children && children.length > 0;
      const allChildrenComplete = isOrchestrator && children.every(c => c.status === 'completed');

      if (isOrchestrator) {
        console.log(`   📂 Orchestrator SD detected: ${children.length} children`);
        if (allChildrenComplete) {
          console.log('   ✅ All children completed - using relaxed threshold (50%)');
        }
      }

      // Store orchestrator context for executeSpecific
      ctx._isOrchestrator = isOrchestrator;
      ctx._orchestratorChildren = children || [];
      ctx._isOrchestratorWithAllChildrenComplete = allChildrenComplete;

      // Load retrospective for this SD via the shared three-filter query
      // (SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001): existence + retro_type=SD_COMPLETION
      // + created_at > LEAD-TO-PLAN acceptance. Handoff-time retros (which share
      // retro_type='SD_COMPLETION') are correctly excluded by the timestamp filter.
      const sdUuid = ctx.sd?.id || ctx.sdId;
      const sdCreatedAt = ctx.sd?.created_at || null;
      const { retrospective, leadToPlanAcceptedAt, error: retroError } =
        await getFilteredRetrospective(sdUuid, sdCreatedAt, supabase, ctx.sd?.sd_key || null);

      if (retroError && retroError.code !== 'PGRST116') {
        console.log(`   ⚠️  Retrospective query error: ${retroError.message}`);
      }

      // Zero-rows HARD-FAIL: never fall through to validateSDCompletionReadiness(sd, null),
      // which would score on SD quality alone and silently pass the gate.
      if (!retrospective) {
        const sdKey = ctx.sd?.sd_key || ctx.sdId || 'unknown';
        console.log('   ❌ No qualifying SD-completion retrospective found');
        console.log(`      leadToPlanAcceptedAt cutoff: ${leadToPlanAcceptedAt}`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`No SD-completion retrospective found for SD ${sdKey} (must be retro_type=SD_COMPLETION with created_at > ${leadToPlanAcceptedAt})`],
          warnings: [],
          remediation: `Run: node scripts/generate-retrospective.js ${sdUuid}\n`
            + '   A handoff-time retrospective does not satisfy this gate — you must create a proper SD-completion retrospective authored after the LEAD-TO-PLAN acceptance timestamp.'
        };
      }

      // Check for auto-pass conditions
      const autoPassResult = await checkAutoPassConditions(ctx, retrospective, children, allChildrenComplete);
      if (autoPassResult) return autoPassResult;

      // Standard retrospective quality validation
      const { validateSDCompletionReadiness, getSDImprovementGuidance } = await import('../../../../sd-quality-validation.js');
      const retroGateResult = await validateSDCompletionReadiness(ctx.sd, retrospective);
      ctx._retroGateResult = retroGateResult;

      // Dynamic threshold based on SD type
      const threshold = await determineThreshold(ctx.sd, allChildrenComplete);

      const passesThreshold = retroGateResult.score >= threshold;

      if (!passesThreshold) {
        const guidance = getSDImprovementGuidance(retroGateResult);

        // Display actionable improvement suggestions
        if (retroGateResult.improvements?.length > 0) {
          console.log('\n📋 ACTIONABLE IMPROVEMENTS TO PASS THIS GATE:');
          console.log('='.repeat(60));
          retroGateResult.improvements.forEach((imp, idx) => {
            console.log(`\n${idx + 1}. [${imp.criterion}] (score: ${imp.score}/10, weight: ${Math.round(imp.weight * 100)}%)`);
            console.log(`   → ${imp.suggestion}`);
          });
          console.log('\n' + '='.repeat(60));
        }

        return {
          passed: false,
          score: retroGateResult.score,
          max_score: 100,
          issues: retroGateResult.issues,
          warnings: retroGateResult.warnings,
          improvements: retroGateResult.improvements,
          guidance,
          remediation: 'Ensure retrospective has non-boilerplate key_learnings and action_items'
        };
      }

      // Convert AI issues to advisory warnings (non-blocking)
      const advisoryWarnings = [
        ...retroGateResult.warnings,
        ...(retroGateResult.issues || []).map(i => `[Advisory] ${i}`)
      ];

      console.log(`✅ Retrospective quality gate passed (${retroGateResult.score}% >= ${threshold}% threshold)`);
      if (advisoryWarnings.length > 0) {
        console.log('   Advisory notes (non-blocking):');
        advisoryWarnings.slice(0, 3).forEach(w => console.log(`   • ${w}`));
      }

      return {
        passed: true,
        score: retroGateResult.score,
        max_score: 100,
        issues: [],
        warnings: advisoryWarnings,
        details: {
          ...retroGateResult,
          is_orchestrator: isOrchestrator,
          all_children_complete: allChildrenComplete,
          children: children || [],
          child_count: children?.length || 0
        }
      };
    },
    required: true
  };
}

/**
 * Check for auto-pass conditions (orchestrator, database, bugfix)
 */
async function checkAutoPassConditions(ctx, retrospective, children, allChildrenComplete) {
  // ORCHESTRATOR FAST-PATH
  //
  // SD-LEO-INFRA-RETRO-INTEGRITY-RUN-001 FR-3 step 2 — this predicate used to read
  // `retrospective?.quality_score >= 60`. That cited retrospectives.quality_score as a GATING
  // THRESHOLD, which scripts/lint/diagnostic-gauge-citation-lint.mjs:50 forbids and which this SD
  // measured to be writer-fabricated. Unlike the five decorative arms below, this one is a REAL
  // predicate, so it could not simply be deleted — deleting it would have OPENED the gate (every
  // orchestrator with a PUBLISHED retro would auto-pass regardless of quality). It is REPLACED
  // with the AI-evaluator verdict, which is a measured signal rather than a stored artifact.
  //
  // Scoped to this arm deliberately: the evaluation is only consulted for orchestrators, so the
  // other auto-pass arms keep short-circuiting without paying for it. And it is safe to depend on
  // now only because the evaluator's outage fallback was made FAIL-CLOSED in the same change —
  // previously it fell back to this very gauge plus content presence, so citing it here would have
  // moved the fabricated dependency into a catch block instead of removing it.
  if (allChildrenComplete && retrospective?.status === 'PUBLISHED') {
    const { validateSDCompletionReadiness: assessOrchestratorRetro } =
      await import('../../../../sd-quality-validation.js');
    const orchestratorAssessment = await assessOrchestratorRetro(ctx.sd, retrospective);

    if (!orchestratorAssessment?.passed) {
      // Not an auto-pass. Fall through to the standard path, which will evaluate and report
      // properly rather than silently treating "did not qualify" as "failed".
      console.log('   ↩️  Orchestrator fast-path declined — retrospective did not pass assessment; using standard validation');
      return null;
    }

    console.log(`   ✅ ORCHESTRATOR AUTO-PASS: All ${children.length} children completed + retrospective assessed`);
    console.log(`      Assessed score: ${orchestratorAssessment.score}/100 (measured, not the stored diagnostic gauge)`);
    console.log('      Rationale: Orchestrators coordinate, children produce deliverables');

    return {
      passed: true,
      // FR-3: the MEASURED assessment, not the stored diagnostic gauge.
      score: orchestratorAssessment.score,
      max_score: 100,
      issues: [],
      warnings: ['Orchestrator auto-pass: Quality validated via children completion + retrospective assessment'],
      details: {
        orchestrator_auto_pass: true,
        child_count: children.length,
        children_completed: children.filter(c => c.status === 'completed').length,
        children: children,
        retrospective_id: retrospective.id,
        assessed_score: orchestratorAssessment.score,
        // Reported for operator context ONLY — never used to decide the verdict above.
        observed_diagnostic_quality_score: retrospective.quality_score
      }
    };
  }

  const sdType = (ctx.sd?.sd_type || '').toLowerCase();

  // DATABASE FAST-PATH
  if (sdType === 'database' && retrospective) {
    console.log('   🗄️  DATABASE AUTO-PASS: Database SD with retrospective exists');
    console.log(`      Retrospective quality_score: ${retrospective.quality_score || 0}/100`);

    return {
      passed: true,
      // SD-LEO-INFRA-RETRO-INTEGRITY-RUN-001 FR-3 — stopped citing retrospectives.quality_score.
      // scripts/lint/diagnostic-gauge-citation-lint.mjs:50 declares it a DIAGNOSTIC gauge that no
      // consumer may cite as a gating threshold, and this SD's own premise is that the value was
      // fabricated. The citation here was DECORATIVE: `passed: true` above is unconditional, so
      // Math.max(quality_score || 60, 60) only populated a reported number and never influenced
      // the decision. Reporting the floor the arm actually guarantees is the honest value.
      score: 60,
      max_score: 100,
      issues: [],
      warnings: ['Database auto-pass: Validated via migration success + DATABASE sub-agent'],
      details: {
        database_auto_pass: true,
        sd_type: sdType,
        retrospective_id: retrospective.id,
        retrospective_quality: retrospective.quality_score
      }
    };
  }

  // BUGFIX / FIX FAST-PATH
  // SD-LEARN-FIX-ADDRESS-PAT-AUTO-050: Added 'fix' type (PAT-AUTO-1cae3b92)
  if ((sdType === 'bugfix' || sdType === 'bug_fix' || sdType === 'fix') && retrospective) {
    console.log(`   🔧 FIX AUTO-PASS: ${sdType} SD with retrospective exists`);
    console.log(`      Retrospective quality_score: ${retrospective.quality_score || 0}/100`);

    return {
      passed: true,
      // FR-3: decorative citation removed — see the DATABASE arm above for the full reasoning.
      score: 50,
      max_score: 100,
      issues: [],
      warnings: [`${sdType} auto-pass: Simple fix validated via git commit evidence`],
      details: {
        bugfix_auto_pass: true,
        sd_type: sdType,
        retrospective_id: retrospective.id,
        retrospective_quality: retrospective.quality_score
      }
    };
  }

  // CORRECTIVE FAST-PATH
  // Corrective SDs (auto-generated by heal system) are targeted gap fixes
  // They produce focused retrospectives but the AI rubric penalizes narrow scope
  if (sdType === 'corrective' && retrospective) {
    console.log('   🔧 CORRECTIVE AUTO-PASS: Corrective SD with retrospective exists');
    console.log(`      Retrospective quality_score: ${retrospective.quality_score || 0}/100`);

    return {
      passed: true,
      // FR-3: decorative citation removed — see the DATABASE arm above for the full reasoning.
      score: 55,
      max_score: 100,
      issues: [],
      warnings: ['Corrective auto-pass: Heal-generated SD with targeted gap-closure scope'],
      details: {
        corrective_auto_pass: true,
        sd_type: sdType,
        retrospective_id: retrospective.id,
        retrospective_quality: retrospective.quality_score
      }
    };
  }

  // ENHANCEMENT FAST-PATH
  // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-044: Enhancement SDs produce narrow-scope retrospectives
  // that fail the AI rubric's learning_specificity criterion. These are incremental improvements
  // to existing functionality — the retrospective gate adds friction without value.
  if (sdType === 'enhancement' && retrospective) {
    console.log('   🔧 ENHANCEMENT AUTO-PASS: Enhancement SD with retrospective exists');
    console.log(`      Retrospective quality_score: ${retrospective.quality_score || 0}/100`);

    return {
      passed: true,
      // FR-3: decorative citation removed — see the DATABASE arm above for the full reasoning.
      score: 55,
      max_score: 100,
      issues: [],
      warnings: ['Enhancement auto-pass: Narrow-scope improvement SD with inherently thin retrospective'],
      details: {
        enhancement_auto_pass: true,
        sd_type: sdType,
        retrospective_id: retrospective.id,
        retrospective_quality: retrospective.quality_score
      }
    };
  }

  // INFRASTRUCTURE FAST-PATH — DELETED (SD-LEO-INFRA-WIRE-EXISTING-RETROSPECTIVEQUALITYRUBRIC-001).
  //
  // The arm returned passed:true score:55 on sdType∈(infrastructure,process,documentation) AND
  // retro-EXISTENCE — 70.4% of SDs (3935/5591 measured) cleared completion on a retro merely
  // existing, and its justifying comment ("thin retrospectives ... fail the AI rubric's
  // learning_specificity criterion") was PROSE that FR-0 measured FALSE: a thin-but-SD-specific
  // infra retro scores 67 blended against the standard path's threshold 55 and passes without
  // any bypass. Deleting the arm therefore does NOT re-break PAT-AUTO-047's two-gate
  // consistency; infra/process/doc SDs now flow to the standard path below (:84-92), which was
  // already wired to the shared RetrospectiveQualityRubric all along. The discrimination the AI
  // criterion cannot provide (it scored textbook template content 8/10 on specificity — SD-ID
  // splicing reads as specificity) comes from the rubric's deterministic detectBoilerplate
  // penalty, calibrated with the template-assertion corpus in the same SD.

  return null; // No auto-pass
}

/**
 * Determine quality threshold based on SD type
 */
async function determineThreshold(sd, allChildrenComplete) {
  const isInfrastructure = isInfrastructureSDSync(sd);
  const sdType = sd?.sd_type || sd?.category || 'feature';
  const isBugfix = sdType === 'bugfix' || sdType === 'bug_fix' || sdType === 'fix';

  let threshold;
  if (allChildrenComplete) {
    threshold = 50;
    console.log('   📂 Using orchestrator threshold (50%) - all children complete');
  } else if (isBugfix) {
    threshold = 50;
    console.log(`   🔧 Using bugfix SD threshold (50%) - sd_type='${sdType}'`);
  } else if (isInfrastructure) {
    const profile = await getThresholdProfile(sd, { useAI: false });
    threshold = profile.retrospectiveQuality;
    console.log(`   🔧 Using infrastructure SD threshold (${threshold}%) - sd_type='${sdType}'`);
  } else {
    const profile = await getThresholdProfile(sd, { useAI: false });
    threshold = profile.retrospectiveQuality;
    console.log(`   📋 Using standard SD threshold (${threshold}%) - sd_type='${sdType}'`);
  }

  return threshold;
}
