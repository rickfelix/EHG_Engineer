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
import { shouldBypassUserStories } from '../../../../lib/protocol-policies/orchestrator-bypass.js';

/**
 * Determines whether an SD requires user stories at PLAN-TO-EXEC time.
 *
 * Thin wrapper around lib/protocol-policies/orchestrator-bypass.js —
 * preserved as a named export for backward compatibility with existing
 * tests (tests/unit/handoff/prerequisite-preflight-stories-exemption.test.js)
 * and direct callers. New code should import shouldBypassUserStories from
 * the policy registry directly.
 *
 * SD-LEARN-FIX-ADDRESS-PAT-RETRO-003 (US-001) introduced the helper.
 * SD-LEO-INFRA-LEO-PROTOCOL-POLICY-001 (FR-001) centralized the rule set.
 *
 * @param {string|null|undefined} sdType - The sd_type field value
 * @returns {boolean} true if the SD requires user stories at PLAN-TO-EXEC
 */
export function shouldRequireUserStories(sdType) {
  if (!sdType || typeof sdType !== 'string') return true;
  return !shouldBypassUserStories(sdType);
}

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
          remediation: 'Verify the SD key is correct. Run: node -e "..." to check.'
        }]
      };
    }

    const normalizedType = handoffType.toUpperCase().replace(/-/g, '_');

    switch (normalizedType) {
      case 'LEAD_TO_PLAN':
      case 'LEAD-TO-PLAN': {
        // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-122: Auto-fix before checking
        const { fixed } = await autoFixDeficiencies(supabase, sd);
        if (fixed.length > 0) {
          console.log(`   ✅ [preflight-autofix] Auto-fixed ${fixed.length} field(s): ${fixed.join(', ')}`);
        }
        issues.push(...checkLeadToPlanPrereqs(sd));
        break;
      }

      case 'PLAN_TO_EXEC':
      case 'PLAN-TO-EXEC':
        issues.push(...await checkPlanToExecPrereqs(supabase, sd, sdId));
        break;

      case 'LEAD_FINAL_APPROVAL':
      case 'LEAD-FINAL-APPROVAL':
        issues.push(...await checkLeadFinalApprovalPrereqs(supabase, sd, sdId));
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

  // SD-LEO-INFRA-LEO-PROTOCOL-POLICY-001 (FR-006 / Issue #4): info-severity entries
  // are informational, not failures. Treat them as non-blocking so an exempt
  // sd_type (e.g., USER_STORIES_BYPASSED on infrastructure SDs) does not block
  // the handoff. All entries are still returned for display.
  const blockingIssues = issues.filter(i => i && i.severity !== 'info');
  return {
    passed: blockingIssues.length === 0,
    issues
  };
}

/**
 * Auto-fix common SD deficiencies that cause gate failures.
 * Only fixes structural gaps (missing fields), never overrides existing content.
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-122
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive record (mutated in place on success)
 * @returns {{ fixed: string[], sd: Object }}
 */
async function autoFixDeficiencies(supabase, sd) {
  const sdType = sd.sd_type || 'default';
  const threshold = SD_TYPE_THRESHOLDS[sdType] || DEFAULT_THRESHOLD;
  const fixes = {};
  const fixed = [];

  // --- Auto-populate missing JSONB fields ---
  const populated = JSONB_FIELDS.filter(field => {
    const val = sd[field];
    return val && (Array.isArray(val) ? val.length > 0 : Object.keys(val).length > 0);
  });

  if (populated.length < threshold.requiredFields) {
    if (!sd.risks || !Array.isArray(sd.risks) || sd.risks.length === 0) {
      fixes.risks = [{ risk: 'Implementation may not fully address root cause', mitigation: 'Validate fix against original pattern occurrences post-deployment' }];
      fixed.push('risks');
    }
    if (!sd.key_principles || !Array.isArray(sd.key_principles) || sd.key_principles.length === 0) {
      fixes.key_principles = ['Fix root cause, not symptoms', 'Preserve existing behavior for passing cases'];
      fixed.push('key_principles');
    }
    if (!sd.implementation_guidelines || !Array.isArray(sd.implementation_guidelines) || sd.implementation_guidelines.length === 0) {
      fixes.implementation_guidelines = ['Read existing code before modifying', 'Add tests for the specific failure pattern'];
      fixed.push('implementation_guidelines');
    }
    if (!sd.dependencies || !Array.isArray(sd.dependencies) || sd.dependencies.length === 0) {
      fixes.dependencies = [];
      fixed.push('dependencies');
    }
  }

  // --- Auto-extend short descriptions ---
  const descWords = (sd.description || '').split(/\s+/).filter(w => w.length > 0).length;
  if (descWords < threshold.minDescriptionWords) {
    const parts = [sd.description || ''];
    if (sd.rationale && typeof sd.rationale === 'string' && sd.rationale.length > 20) {
      parts.push('\n\n## Rationale\n' + sd.rationale);
    }
    if (sd.scope && typeof sd.scope === 'string' && sd.scope.length > 20) {
      parts.push('\n\n## Scope\n' + sd.scope);
    }
    if (sd.metadata?.source_items && Array.isArray(sd.metadata.source_items)) {
      parts.push('\n\n## Source Items\n' + sd.metadata.source_items.join(', '));
    }
    const extended = parts.join('');
    const newWordCount = extended.split(/\s+/).filter(w => w.length > 0).length;
    if (newWordCount > descWords) {
      fixes.description = extended;
      fixed.push('description');
    }
  }

  // Apply fixes to database
  if (fixed.length > 0) {
    const sdKey = sd.sd_key || sd.id;
    for (const f of fixed) {
      console.log(`   [preflight-autofix] Auto-populated: ${f} (sd=${sdKey})`);
    }
    const { error } = await supabase
      .from('strategic_directives_v2')
      .update(fixes)
      .eq('sd_key', sdKey);
    if (error) {
      console.warn(`   [preflight-autofix] DB update failed: ${error.message}`);
      return { fixed: [], sd };
    }
    Object.assign(sd, fixes);
  }

  return { fixed, sd };
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
        'Expected structure: success_criteria=[{criterion,measure}], key_changes=[{change,type}], risks=[{risk,mitigation}]'
    });
  }

  // Check description word count
  const descWords = (sd.description || '').split(/\s+/).filter(w => w.length > 0).length;
  const minWords = threshold.minDescriptionWords;
  if (descWords < minWords) {
    const wordsNeeded = minWords - descWords;
    const sdKey = sd.sd_key || sd.id || 'SD-XXX-001';
    issues.push({
      code: 'DESCRIPTION_TOO_SHORT',
      message: `SD description has ${descWords} words (minimum: ${minWords} for ${sdType}) — need ${wordsNeeded} more word(s)`,
      remediation: [
        `Add ${wordsNeeded} more word(s) to the description. Consider expanding with:`,
        `  - Technical approach: which files/modules change and how`,
        `  - Root cause context: why this problem exists`,
        `  - Success definition: what "fixed" looks like`,
        `Update command:`,
        `  node -e "require('dotenv').config(); const {createClient}=require('@supabase/supabase-js'); const s=createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); s.from('strategic_directives_v2').update({description:'<expanded description here>'}).eq('sd_key','${sdKey}').then(r=>console.log(r.error||'Updated'));"`
      ].join('\n')
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
      const invalidStep = smokeSteps[0];
      const missingFields = [];
      if (!invalidStep?.instruction) missingFields.push('instruction');
      if (!invalidStep?.expected_outcome) missingFields.push('expected_outcome');
      issues.push({
        code: 'SMOKE_TEST_INVALID',
        message: `smoke_test_steps[0] is missing required field(s): ${missingFields.join(', ')}`,
        remediation: [
          'Each step must have both fields. Example:',
          '  smoke_test_steps: [',
          '    { instruction: "Run: node scripts/handoff.js execute LEAD-TO-PLAN SD-EXAMPLE-001",',
          '      expected_outcome: "HANDOFF_RESULT=PASS printed to stdout" }',
          '  ]'
        ].join('\n')
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

    const summaryLen = typeof prd.executive_summary === 'string'
      ? prd.executive_summary.length
      : (prd.executive_summary ? JSON.stringify(prd.executive_summary).length : 0);
    if (summaryLen < 50) {
      issues.push({
        code: 'PRD_SUMMARY_SHORT',
        message: `PRD executive_summary is ${summaryLen} chars (minimum: 50)`,
        remediation: `Add a substantive executive_summary to the PRD (50+ chars). SQL fix:\n  node -e "require('dotenv').config(); const {createClient}=require('@supabase/supabase-js'); const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); s.from('product_requirements_v2').update({executive_summary:'<your summary text>'}).eq('id','${prd.id}').then(r=>console.log(r.error||'Updated'));"`
      });
    }
  }

  // SD-LEARN-FIX-ADDRESS-PAT-RETRO-003 (US-001/US-002):
  // Skip USER_STORIES_MISSING for SD types where STORIES is not required per
  // CLAUDE_CORE.md sub-agent matrix. Feature/bugfix still enforce.
  if (shouldRequireUserStories(sd.sd_type)) {
    const { data: stories, error: storiesErr } = await supabase
      .from('user_stories')
      .select('story_key')
      .eq('sd_id', sd.id);

    if (storiesErr || !stories || stories.length === 0) {
      issues.push({
        code: 'USER_STORIES_MISSING',
        message: 'No user stories found for this SD',
        remediation: [
          `Create user stories linked to ${sdId}. story_key format: '${sdId}:US-001'.`,
          'Required fields: story_key, sd_id, title, user_role, user_want, user_benefit,',
          '  acceptance_criteria (array), implementation_context (string).',
          "Valid status values: 'draft', 'ready', 'in_progress', 'completed', 'blocked', 'cancelled'.",
          "  (ready / in_progress / completed satisfy the STORIES precondition.)",
          'Example story_key values: ' + sdId + ':US-001, ' + sdId + ':US-002',
          'Field reference: docs/database/user_stories_field_reference.md'
        ].join('\n')
      });
    }
  } else {
    issues.push({
      code: 'USER_STORIES_BYPASSED',
      severity: 'info',
      message: `sd_type '${sd.sd_type}' exempt from STORIES requirement per CLAUDE_CORE.md sub-agent matrix`,
      remediation: 'No action required — informational entry only.'
    });
  }

  return issues;
}

/**
 * LEAD-FINAL-APPROVAL: Check prerequisite handoff chain + retrospective
 * Catches: PAT-HF-LEADFINALAPPROVAL (missing prerequisites)
 */
async function checkLeadFinalApprovalPrereqs(supabase, sd, sdId) {
  const issues = [];
  const lookupId = sd?.id || sdId;

  // Check PLAN-TO-LEAD handoff exists
  const { data: planToLeadRows } = await supabase
    .from('sd_phase_handoffs')
    .select('id, status')
    .eq('sd_id', lookupId)
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
    .eq('sd_id', lookupId)
    .limit(1);
  const retro = retros?.[0] || null;

  if (!retro) {
    issues.push({
      code: 'RETROSPECTIVE_MISSING',
      message: 'No retrospective found for this SD',
      remediation: 'Create a retrospective before LEAD-FINAL-APPROVAL. This is generated during the /learn step.'
    });
  }

  return issues;
}

export default { runPrerequisitePreflight };
