/**
 * Prerequisite Preflight Checks
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-078
 *
 * Quick prerequisite validation that runs BEFORE full gate validation.
 * Catches the most common causes of 0% gate scores:
 * - Missing SD JSONB fields (LEAD-TO-PLAN)
 * - Missing PRD or user stories (PLAN-TO-EXEC)
 * - Missing prerequisite handoffs (LEAD-FINAL-APPROVAL)
 *
 * These checks are fast (single DB query each) and provide immediate
 * actionable feedback, preventing expensive 24-gate validation runs
 * that would score 0%.
 */

import { SD_TYPE_THRESHOLDS, DEFAULT_THRESHOLD, JSONB_FIELDS } from '../../sd-quality-scoring.js';

/**
 * Run prerequisite preflight checks for a given handoff type.
 * Returns { passed, issues[] } where each issue has { code, message, remediation }.
 */
export async function runPrerequisitePreflight(supabase, handoffType, sdId) {
  const issues = [];

  try {
    // Load SD record
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('sd_key', sdId)
      .single();

    if (sdError || !sd) {
      return {
        passed: false,
        issues: [{
          code: 'SD_NOT_FOUND',
          message: `Strategic Directive ${sdId} not found in database`,
          remediation: `Verify the SD key is correct. Run: node -e "..." to check.`
        }]
      };
    }

    const normalizedType = handoffType.toUpperCase().replace(/-/g, '_');

    switch (normalizedType) {
      case 'LEAD_TO_PLAN':
      case 'LEAD-TO-PLAN':
        issues.push(...checkLeadToPlanPrereqs(sd));
        break;

      case 'PLAN_TO_EXEC':
      case 'PLAN-TO-EXEC':
        issues.push(...await checkPlanToExecPrereqs(supabase, sd, sdId));
        break;

      case 'LEAD_FINAL_APPROVAL':
      case 'LEAD-FINAL-APPROVAL':
        issues.push(...await checkLeadFinalApprovalPrereqs(supabase, sdId));
        break;

      // EXEC-TO-PLAN and PLAN-TO-LEAD have fewer prerequisite issues
      default:
        break;
    }
  } catch (err) {
    // Fail-open: don't block handoff if preflight itself errors
    console.warn(`   ⚠️  Prerequisite preflight error (non-blocking): ${err.message}`);
    return { passed: true, issues: [] };
  }

  return {
    passed: issues.length === 0,
    issues
  };
}

/**
 * LEAD-TO-PLAN: Check SD JSONB field completeness
 * Catches: PAT-HF-LEADTOPLAN (SD does not meet completeness standards)
 */
function checkLeadToPlanPrereqs(sd) {
  const issues = [];
  const sdType = sd.sd_type || 'default';
  const threshold = SD_TYPE_THRESHOLDS[sdType] || DEFAULT_THRESHOLD;
  const requiredCount = threshold.requiredFields;

  // Check JSONB field population
  const populated = JSONB_FIELDS.filter(field => {
    const val = sd[field];
    return val && (Array.isArray(val) ? val.length > 0 : Object.keys(val).length > 0);
  });

  if (populated.length < requiredCount) {
    const missing = JSONB_FIELDS.filter(field => {
      const val = sd[field];
      return !val || (Array.isArray(val) ? val.length === 0 : Object.keys(val).length === 0);
    });

    issues.push({
      code: 'JSONB_FIELDS_INCOMPLETE',
      message: `SD has ${populated.length}/${requiredCount} required JSONB fields populated (type: ${sdType})`,
      remediation: `Populate these fields before LEAD-TO-PLAN: ${missing.join(', ')}. ` +
        `Expected structure: success_criteria=[{criterion,measure}], key_changes=[{change,type}], risks=[{risk,mitigation}]`
    });
  }

  // Check description word count
  const descWords = (sd.description || '').split(/\s+/).filter(w => w.length > 0).length;
  const minWords = threshold.minDescriptionWords;
  if (descWords < minWords) {
    issues.push({
      code: 'DESCRIPTION_TOO_SHORT',
      message: `SD description has ${descWords} words (minimum: ${minWords} for ${sdType})`,
      remediation: `Expand the description field to at least ${minWords} words.`
    });
  }

  // Check smoke_test_steps
  const smokeSteps = sd.smoke_test_steps;
  if (!smokeSteps || !Array.isArray(smokeSteps) || smokeSteps.length === 0) {
    issues.push({
      code: 'SMOKE_TEST_MISSING',
      message: 'No smoke_test_steps defined',
      remediation: 'Add smoke_test_steps: [{instruction: "...", expected_outcome: "..."}]'
    });
  } else {
    const validSteps = smokeSteps.filter(s => s.instruction && s.expected_outcome);
    if (validSteps.length === 0) {
      issues.push({
        code: 'SMOKE_TEST_INVALID',
        message: 'smoke_test_steps exist but none have both instruction and expected_outcome',
        remediation: 'Each step needs: {instruction: "...", expected_outcome: "..."}'
      });
    }
  }

  return issues;
}

/**
 * PLAN-TO-EXEC: Check PRD exists + user stories exist
 * Catches: PAT-HF-PLANTOEXEC (PRD/stories missing)
 */
async function checkPlanToExecPrereqs(supabase, sd, sdId) {
  const issues = [];

  // Check PRD exists and is approved
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('id, status, executive_summary')
    .eq('sd_id', sd.id)
    .single();

  if (!prd) {
    issues.push({
      code: 'PRD_MISSING',
      message: 'No PRD record found for this SD',
      remediation: `Create PRD: node scripts/add-prd-to-database.js ${sdId} "Title"`
    });
  } else {
    if (!['approved', 'ready_for_exec', 'in_progress'].includes(prd.status)) {
      issues.push({
        code: 'PRD_NOT_APPROVED',
        message: `PRD status is '${prd.status}', expected: approved/ready_for_exec/in_progress`,
        remediation: `Update PRD status: UPDATE product_requirements_v2 SET status='approved' WHERE id='${prd.id}'`
      });
    }

    if (!prd.executive_summary || prd.executive_summary.length < 50) {
      issues.push({
        code: 'PRD_SUMMARY_SHORT',
        message: `PRD executive_summary is ${(prd.executive_summary || '').length} chars (minimum: 50)`,
        remediation: 'Add a substantive executive_summary to the PRD (50+ chars)'
      });
    }
  }

  // Check user stories exist
  const { data: stories, error: storiesErr } = await supabase
    .from('user_stories')
    .select('story_key')
    .eq('sd_id', sd.id);

  if (storiesErr || !stories || stories.length === 0) {
    issues.push({
      code: 'USER_STORIES_MISSING',
      message: 'No user stories found for this SD',
      remediation: `Create user stories linked to ${sdId}. Each story needs: story_key, title, user_role, user_want, user_benefit, acceptance_criteria, implementation_context`
    });
  }

  return issues;
}

/**
 * LEAD-FINAL-APPROVAL: Check prerequisite handoff chain + retrospective
 * Catches: PAT-HF-LEADFINALAPPROVAL (missing prerequisites)
 */
async function checkLeadFinalApprovalPrereqs(supabase, sdId) {
  const issues = [];

  // Check PLAN-TO-LEAD handoff exists
  const { data: planToLeadRows } = await supabase
    .from('sd_phase_handoffs')
    .select('id, status')
    .eq('sd_id', sdId)
    .eq('to_phase', 'LEAD')
    .eq('from_phase', 'PLAN')
    .in('status', ['accepted', 'completed'])
    .limit(1);
  const planToLead = planToLeadRows?.[0] || null;

  if (!planToLead) {
    issues.push({
      code: 'PLAN_TO_LEAD_MISSING',
      message: 'No accepted PLAN-TO-LEAD handoff found',
      remediation: `Run PLAN-TO-LEAD first: node scripts/handoff.js execute PLAN-TO-LEAD ${sdId}`
    });
  }

  // Check retrospective exists
  const { data: retros } = await supabase
    .from('retrospectives')
    .select('id')
    .eq('sd_id', sdId)
    .limit(1);
  const retro = retros?.[0] || null;

  if (!retro) {
    issues.push({
      code: 'RETROSPECTIVE_MISSING',
      message: 'No retrospective found for this SD',
      remediation: `Create a retrospective before LEAD-FINAL-APPROVAL. This is generated during the /learn step.`
    });
  }

  return issues;
}

export default { runPrerequisitePreflight };
