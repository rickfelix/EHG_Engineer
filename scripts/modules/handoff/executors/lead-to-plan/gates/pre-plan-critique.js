/**
 * Pre-PLAN Adversarial Critique Gate for LEAD-TO-PLAN
 * SD: SD-LEO-INFRA-PRE-PLAN-ADVERSARIAL-001 (Phase 1, advisory)
 * SD: SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 (promotion to verdict-bearing)
 *
 * VERDICT-BEARING. Measured basis for the promotion: plan_critiques held 217 rows,
 * 213 of them BLOCK severity, and not one ever blocked a handoff — an adversarial
 * critic whose findings are structurally ignorable is indistinguishable from none.
 *
 * - 'block' fails the gate UNLESS an audited override exists on the most recent
 *   blocking plan_critiques row (override_reason + override_by, the columns that have
 *   existed since the table was created). Override DOWNGRADES (gate passes at reduced
 *   score, override cited in output) — it never silences (the block row and findings
 *   remain persisted).
 * - Every could-not-run outcome reports COULD_NOT_CHECK (FR-3), passes degraded (score
 *   50) with a loud warning, and is persisted so the catch-rate monitor can separate
 *   checked-clean from could-not-check (FR-4). Blocking every handoff on a missing LLM
 *   key would be a fleet outage; hiding the blindness would be worse. This is the
 *   documented middle: degraded pass, never silent pass.
 * - The codified invariant library (FR-2) runs alongside the LLM pass and still runs
 *   when the LLM cannot.
 * - Output reports COVERAGE, never completeness (FR-3): what was checked, and that
 *   novel gap-classes require tier-2/human review.
 */

import { critiquePlanProposal, COULD_NOT_CHECK } from '../../../../../../lib/eva/devils-advocate.js';
import { runInvariantChecks } from '../../../../../../lib/eva/invariant-library.js';

const MAX_FINDING_PREVIEW = 3;
const OVERRIDE_LOOKBACK_DAYS = 14;
const SEVERITY_RANK = { block: 3, warn: 2, note: 1, pass: 0 };
const SCORE_BY_OUTCOME = {
  pass: 100,
  note: 90,
  warn: 75,
  [COULD_NOT_CHECK]: 50,
  block_overridden: 60,
  block: 0,
};

/**
 * Run pre-PLAN critique (LLM + invariant library) against the SD's PRD and arch plan.
 *
 * @param {Object} ctx - Gate context with sd, supabase, etc.
 * @returns {Promise<Object>} Gate result (verdict-bearing)
 */
export async function validatePrePlanCritique(ctx) {
  const { sd, supabase } = ctx;
  const warnings = [];

  if (!sd || !sd.id) {
    // Nothing to critique is NOT_APPLICABLE — distinct from checked-clean and from
    // could-not-check. Missing context is a caller defect; say so and do not block.
    return notApplicable(['SD context missing — nothing to critique (NOT_APPLICABLE, not checked-clean)']);
  }

  let prdContent = '';
  let archContent = '';
  let prdId = null;

  // Load PRD content. No PRD at LEAD-TO-PLAN is the normal state for a fresh SD (the
  // PRD is created during PLAN) — NOT_APPLICABLE, never a failure, never checked-clean.
  try {
    const { data: prd, error } = await supabase
      .from('product_requirements_v2')
      .select('id, executive_summary, functional_requirements, system_architecture, acceptance_criteria, test_scenarios, implementation_approach, risks')
      .eq('sd_id', sd.id)
      .single();
    if (error || !prd) {
      return notApplicable([`No PRD exists yet for SD ${sd.sd_key || sd.id} — critique NOT_APPLICABLE (a fresh SD gets its PRD in PLAN)`]);
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
    return notApplicable([`PRD load error: ${err.message} — critique NOT_APPLICABLE this run`]);
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

  // FR-2: invariant library — deterministic, runs even when the LLM half cannot.
  const invariant = runInvariantChecks({ prdContent, archContent });

  // LLM adversarial critique. All its could-not-run paths return COULD_NOT_CHECK (FR-3);
  // a throw here is the same outcome, reported the same way.
  let critique;
  try {
    critique = await critiquePlanProposal({
      prdContent,
      archContent,
      sdContext: { sd_key: sd.sd_key, sd_id: sd.id, title: sd.title },
    });
  } catch (err) {
    critique = { findings: [], overall_severity: COULD_NOT_CHECK, model_used: null, token_usage: null, fallback_reason: `Critique invocation error: ${err.message}` };
  }

  const llmBlind = critique.overall_severity === COULD_NOT_CHECK;
  const findings = [...(critique.findings || []), ...invariant.findings];

  // Combined severity: findings (from either source) outrank blindness of one source.
  // could_not_check survives as the outcome ONLY when the LLM was blind AND no finding
  // exists — "found nothing" from a half-blind instrument is not checked-clean.
  let combined = 'pass';
  for (const f of findings) {
    const s = String(f.severity || 'note').toLowerCase();
    if ((SEVERITY_RANK[s] || 0) > (SEVERITY_RANK[combined] || 0)) combined = s;
  }
  if (findings.length === 0 && llmBlind) combined = COULD_NOT_CHECK;

  // FR-3: COVERAGE line, never completeness.
  const coverage = llmBlind
    ? `COVERAGE: invariant classes [${invariant.checked_classes.join(', ')}] checked; LLM adversarial critique COULD_NOT_CHECK (${critique.fallback_reason}). Novel gap-classes require tier-2/human review.`
    : `COVERAGE: LLM adversarial critique (${critique.model_used || 'unknown model'}) + invariant classes [${invariant.checked_classes.join(', ')}] checked. No claim of completeness — novel gap-classes require tier-2/human review.`;
  console.log(`   ${coverage}`);
  warnings.push(coverage);

  // Surface findings inline
  console.log(`   Critique severity: ${combined.toUpperCase()} (${findings.length} finding${findings.length === 1 ? '' : 's'})`);
  findings.slice(0, MAX_FINDING_PREVIEW).forEach((f) => {
    console.log(`   [${(f.severity || 'note').toUpperCase()}] ${f.location || '?'}: ${(f.message || '').substring(0, 120)}`);
    warnings.push(`[${(f.severity || 'note').toUpperCase()}] ${f.location || '?'}: ${(f.message || '').substring(0, 200)}`);
  });
  if (findings.length > MAX_FINDING_PREVIEW) {
    console.log(`   ... and ${findings.length - MAX_FINDING_PREVIEW} more (see plan_critiques table)`);
  }

  // FR-4: persist BEFORE deriving the verdict, on EVERY path that has a PRD — including
  // could_not_check. The old code returned from skip/fail paths before persisting, which
  // is exactly why plan_critiques could not distinguish never-ran from ran-clean.
  await persistCritique(supabase, {
    sd_id: sd.id,
    prd_id: prdId,
    findings,
    overall_severity: combined,
    model_used: critique.model_used,
    token_usage: critique.token_usage,
  }, warnings);

  // FR-1: verdict. 'block' fails unless an audited override exists.
  if (combined === 'block') {
    const override = await findActiveOverride(supabase, sd.id);
    if (override) {
      const msg = `BLOCK downgraded by audited override: ${override.override_by} — "${override.override_reason}" (critique ${override.id}, ${override.created_at})`;
      console.log(`   ⚠️  ${msg}`);
      warnings.push(msg);
      return {
        pass: true,
        score: SCORE_BY_OUTCOME.block_overridden,
        max_score: 100,
        issues: [],
        warnings,
      };
    }
    return {
      pass: false,
      score: SCORE_BY_OUTCOME.block,
      max_score: 100,
      issues: [
        `Adversarial critique found BLOCK-severity planning gaps (${findings.length} finding(s)). ` +
        'Fix the plan, or record an audited override: set override_reason and override_by on the ' +
        'blocking plan_critiques row (this downgrades the verdict; it does not delete the findings).',
      ],
      warnings,
    };
  }

  return {
    pass: true,
    score: SCORE_BY_OUTCOME[combined] ?? 75,
    max_score: 100,
    issues: [],
    warnings,
  };
}

/**
 * Persist the critique row. On the could_not_check severity the live CHECK constraint may
 * refuse until the chairman-gated migration 20260810_plan_critiques_could_not_check.sql is
 * applied — KNOWN LIMITATION, reported loudly, never worked around by writing a value the
 * run did not earn (mapping could_not_check onto pass/note would make the column lie).
 */
async function persistCritique(supabase, row, warnings) {
  try {
    const { error } = await supabase.from('plan_critiques').insert(row);
    if (error) {
      const gated = error.code === '23514' && row.overall_severity === COULD_NOT_CHECK;
      const msg = gated
        ? `plan_critiques refused '${COULD_NOT_CHECK}' (constraint not yet widened — apply database/migrations/20260810_plan_critiques_could_not_check.sql). Outcome NOT persisted; the catch-rate monitor is blind to this run.`
        : `plan_critiques insert failed: ${error.message}`;
      console.warn(`   ⚠️  ${msg}`);
      warnings.push(msg);
    }
  } catch (err) {
    console.warn(`   ⚠️  plan_critiques persist error: ${err.message}`);
    warnings.push(`Persistence error: ${err.message}`);
  }
}

/**
 * Audited escape hatch (FR-1): the most recent blocking critique row for this SD carrying
 * both override_reason and override_by, within the lookback window. The override lives on
 * the row where an operator set it — severity stays 'block', findings stay readable.
 */
async function findActiveOverride(supabase, sdId) {
  try {
    const since = new Date(Date.now() - OVERRIDE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('plan_critiques')
      .select('id, override_reason, override_by, created_at')
      .eq('sd_id', sdId)
      .eq('overall_severity', 'block')
      .not('override_reason', 'is', null)
      .not('override_by', 'is', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return null;
    const row = data[0];
    if (!String(row.override_reason).trim() || !String(row.override_by).trim()) return null;
    return row;
  } catch {
    // Fail-closed: an unreadable override table means NO override — the block stands.
    return null;
  }
}

function notApplicable(warnings = []) {
  return { pass: true, score: 100, max_score: 100, issues: [], warnings };
}

/**
 * Factory: create the Pre-PLAN Adversarial Critique Gate (verdict-bearing).
 */
export function createPrePlanCritiqueGate(supabase) {
  return {
    name: 'PRE_PLAN_ADVERSARIAL_CRITIQUE',
    validator: async (ctx) => {
      console.log('\n🎭 GATE: Pre-PLAN Adversarial Critique (Verdict-Bearing)');
      console.log('-'.repeat(50));
      return validatePrePlanCritique({ ...ctx, supabase: ctx.supabase || supabase });
    },
    required: true,
    weight: 1.0,
    remediation:
      'Review findings in plan_critiques. BLOCK severity fails this gate: fix the plan, or record ' +
      'an audited override (set override_reason + override_by on the blocking plan_critiques row) ' +
      'to downgrade — findings persist either way. COULD_NOT_CHECK passes degraded (score 50), ' +
      'never silently.',
  };
}
