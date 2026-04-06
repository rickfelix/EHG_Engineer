/**
 * Pre-PLAN Adversarial Critique Gate for LEAD-TO-PLAN
 * SD: SD-LEO-INFRA-PRE-PLAN-ADVERSARIAL-001
 *
 * Phase 1: Advisory only — never blocks the handoff regardless of critique severity.
 * Calls devils-advocate.critiquePlanProposal() and persists result to plan_critiques.
 *
 * Promotion to gating mode is deferred to a separate Phase 2 SD after 20+
 * critique results are collected and the chairman validates signal quality.
 */

import { critiquePlanProposal } from '../../../../../../lib/eva/devils-advocate.js';

const MAX_FINDING_PREVIEW = 3;

/**
 * Run pre-PLAN critique against the SD's PRD and architecture plan.
 *
 * @param {Object} ctx - Gate context with sd, supabase, etc.
 * @returns {Promise<Object>} Gate result (always passes in Phase 1)
 */
export async function validatePrePlanCritique(ctx) {
  const { sd, supabase } = ctx;
  const warnings = [];

  if (!sd || !sd.id) {
    return advisoryPass(['SD context missing — skipping critique']);
  }

  let prdContent = '';
  let archContent = '';
  let prdId = null;

  // Load PRD content
  try {
    const { data: prd, error } = await supabase
      .from('product_requirements_v2')
      .select('id, executive_summary, functional_requirements, system_architecture, acceptance_criteria, test_scenarios, implementation_approach, risks')
      .eq('sd_id', sd.id)
      .single();
    if (error || !prd) {
      return advisoryPass([`No PRD found for SD ${sd.sd_key || sd.id} — critique skipped`]);
    }
    prdId = prd.id;
    prdContent = JSON.stringify({
      executive_summary: prd.executive_summary,
      functional_requirements: prd.functional_requirements,
      acceptance_criteria: prd.acceptance_criteria,
      test_scenarios: prd.test_scenarios,
      risks: prd.risks,
    });
  } catch (err) {
    return advisoryPass([`PRD load error: ${err.message}`]);
  }

  // Load architecture plan content (best effort — not required)
  try {
    const archKey = sd.metadata?.arch_key;
    if (archKey) {
      const { data: arch } = await supabase
        .from('eva_architecture_plans')
        .select('content')
        .eq('plan_key', archKey)
        .single();
      if (arch?.content) archContent = arch.content;
    }
  } catch {
    // Best-effort — proceed without arch content
  }

  // Run the critique (fail-open)
  let critique;
  try {
    critique = await critiquePlanProposal({
      prdContent,
      archContent,
      sdContext: { sd_key: sd.sd_key, sd_id: sd.id, title: sd.title },
    });
  } catch (err) {
    return advisoryPass([`Critique invocation error: ${err.message}`]);
  }

  const findingCount = critique.findings?.length || 0;
  const severity = critique.overall_severity || 'pass';

  // Surface inline in stdout
  console.log(`   Critique severity: ${severity.toUpperCase()} (${findingCount} finding${findingCount === 1 ? '' : 's'})`);
  if (findingCount > 0) {
    critique.findings.slice(0, MAX_FINDING_PREVIEW).forEach((f, i) => {
      console.log(`   [${(f.severity || 'note').toUpperCase()}] ${f.location || '?'}: ${(f.message || '').substring(0, 120)}`);
      warnings.push(`[${(f.severity || 'note').toUpperCase()}] ${f.location || '?'}: ${(f.message || '').substring(0, 200)}`);
    });
    if (findingCount > MAX_FINDING_PREVIEW) {
      console.log(`   ... and ${findingCount - MAX_FINDING_PREVIEW} more (see plan_critiques table)`);
    }
  }

  // Persist to plan_critiques (best-effort)
  try {
    const { error } = await supabase.from('plan_critiques').insert({
      sd_id: sd.id,
      prd_id: prdId,
      findings: critique.findings || [],
      overall_severity: severity,
      model_used: critique.model_used,
      token_usage: critique.token_usage,
    });
    if (error) {
      console.warn(`   ⚠️  plan_critiques insert failed: ${error.message}`);
      warnings.push(`Persistence failed: ${error.message}`);
    }
  } catch (err) {
    console.warn(`   ⚠️  plan_critiques persist error: ${err.message}`);
    warnings.push(`Persistence error: ${err.message}`);
  }

  // Phase 1: ALWAYS pass regardless of severity (advisory only)
  return {
    pass: true,
    score: severity === 'pass' ? 100 : severity === 'note' ? 90 : severity === 'warn' ? 75 : 60,
    max_score: 100,
    issues: [],
    warnings,
  };
}

function advisoryPass(warnings = []) {
  return { pass: true, score: 100, max_score: 100, issues: [], warnings };
}

/**
 * Factory: create the Pre-PLAN Adversarial Critique Gate.
 */
export function createPrePlanCritiqueGate(supabase) {
  return {
    name: 'PRE_PLAN_ADVERSARIAL_CRITIQUE',
    validator: async (ctx) => {
      console.log('\n🎭 GATE: Pre-PLAN Adversarial Critique (Advisory)');
      console.log('-'.repeat(50));
      return validatePrePlanCritique({ ...ctx, supabase: ctx.supabase || supabase });
    },
    required: false,
    weight: 0.5,
    remediation: 'Review critique findings in plan_critiques table. Phase 1 is advisory only — findings do not block handoffs.',
  };
}
