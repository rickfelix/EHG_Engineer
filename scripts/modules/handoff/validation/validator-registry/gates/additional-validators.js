/**
 * Additional Validators from Handoff System Guide
 * Part of SD-LEO-REFACTOR-VALIDATOR-REG-001
 */

import { validateRetrospectiveQuality } from '../../../../sd-quality-validation.js';
import { shouldSkipCodeValidation } from '../../../../../../lib/utils/sd-type-validation.js';

/**
 * Register additional validators
 * @param {import('../core.js').ValidatorRegistry} registry
 */
export function registerAdditionalValidators(registry) {
  registry.register('sdTransitionReadiness', async (context) => {
    const { sd } = context;
    const issues = [];

    if (!sd) {
      return { passed: false, score: 0, max_score: 100, issues: ['SD not provided'] };
    }

    if (sd.status === 'blocked') {
      issues.push('SD is blocked');
    }

    // SD-LIFECYCLE-GAP-005: Include 'draft' as valid starting status for LEAD-TO-PLAN
    const validStatuses = ['approved', 'planning', 'in_progress', 'draft'];
    if (!validStatuses.includes(sd.status)) {
      issues.push(`SD status ${sd.status} not valid for transition`);
    }

    return {
      passed: issues.length === 0,
      score: issues.length === 0 ? 100 : 0,
      max_score: 100,
      issues
    };
  }, 'SD transition readiness');

  registry.register('targetApplicationValidation', async (context) => {
    const { sd } = context;
    const validTargets = ['EHG', 'EHG_Engineer'];
    const target = sd?.target_application;

    if (!target) {
      return { passed: true, score: 100, max_score: 100, warnings: ['No target application specified, will use default'] };
    }

    if (!validTargets.includes(target)) {
      return {
        passed: false,
        score: 0,
        max_score: 100,
        issues: [`Invalid target application: ${target}. Valid: ${validTargets.join(', ')}`]
      };
    }

    return { passed: true, score: 100, max_score: 100, issues: [] };
  }, 'Target application validation');

  registry.register('branchEnforcement', async () => {
    // Simplified check - assume branch exists if we got this far
    return { passed: true, score: 100, max_score: 100, issues: [], warnings: ['Branch enforcement check simplified'] };
  }, 'Git branch enforcement');

  registry.register('architectureVerification', async () => {
    // Optional gate - always passes with warning
    return {
      passed: true,
      score: 100,
      max_score: 100,
      warnings: ['Architecture verification not implemented - auto-pass']
    };
  }, 'Architecture verification');

  registry.register('explorationAudit', async () => {
    // Optional gate - always passes with warning
    return {
      passed: true,
      score: 100,
      max_score: 100,
      warnings: ['Exploration audit not implemented - auto-pass']
    };
  }, 'Exploration audit');

  registry.register('subAgentOrchestration', async (context) => {
    const { sd_id, supabase } = context;

    // Check if this SD type should skip sub-agent orchestration validation
    const { data: sdData } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_type, title')
      .eq('id', sd_id)
      .single();

    if (sdData && shouldSkipCodeValidation(sdData)) {
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [`Sub-agent orchestration skipped for ${sdData.sd_type} SD`]
      };
    }

    const requiredAgents = ['DESIGN', 'DATABASE'];
    const issues = [];

    for (const agentCode of requiredAgents) {
      const { data, error } = await supabase
        .from('sub_agent_execution_results')
        .select('id, verdict')
        .eq('sd_id', sd_id)
        .eq('sub_agent_code', agentCode)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) {
        issues.push(`${agentCode} sub-agent not executed`);
      }
    }

    return {
      passed: issues.length === 0,
      score: issues.length === 0 ? 100 : 50,
      max_score: 100,
      issues
    };
  }, 'Sub-agent orchestration');

  registry.register('retrospectiveQualityGate', async (context) => {
    const { sd, sd_id, supabase } = context;

    // Check for retrospective
    // NOTE: Table is 'retrospectives' not 'sd_retrospectives'
    const { data, error } = await supabase
      .from('retrospectives')
      .select('*')
      .eq('sd_id', sd_id || sd?.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return {
        passed: true,
        score: 50,
        max_score: 100,
        warnings: ['No retrospective found']
      };
    }

    const retro = data[0];
    const result = await validateRetrospectiveQuality(retro, sd);
    return registry.normalizeResult(result);
  }, 'Retrospective quality gate');

  registry.register('gitCommitEnforcement', async () => {
    // Simplified check
    return {
      passed: true,
      score: 100,
      max_score: 100,
      warnings: ['Git commit enforcement check simplified']
    };
  }, 'Git commit enforcement');

  registry.register('planToLeadHandoffExists', async (context) => {
    const { sd_id, supabase } = context;

    const { data, error } = await supabase
      .from('sd_phase_handoffs')
      .select('id, status')
      .eq('sd_id', sd_id)
      .eq('handoff_type', 'PLAN-TO-LEAD')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return {
        passed: false,
        score: 0,
        max_score: 100,
        issues: ['PLAN-TO-LEAD handoff not found']
      };
    }

    if (data[0].status !== 'accepted') {
      return {
        passed: false,
        score: 50,
        max_score: 100,
        issues: [`PLAN-TO-LEAD handoff status: ${data[0].status}, expected: accepted`]
      };
    }

    return { passed: true, score: 100, max_score: 100, issues: [] };
  }, 'PLAN-TO-LEAD handoff exists');

  registry.register('userStoriesComplete', async (context) => {
    const { sd_id, supabase } = context;

    const { data: stories, error } = await supabase
      .from('user_stories')
      .select('id, status, validation_status')
      .eq('sd_id', sd_id);

    if (error || !stories || stories.length === 0) {
      return {
        passed: false,
        score: 0,
        max_score: 100,
        issues: ['No user stories found']
      };
    }

    const incomplete = stories.filter(s =>
      s.status !== 'completed' && s.status !== 'validated'
    );

    if (incomplete.length > 0) {
      return {
        passed: false,
        score: Math.round(((stories.length - incomplete.length) / stories.length) * 100),
        max_score: 100,
        issues: [`${incomplete.length}/${stories.length} user stories incomplete`]
      };
    }

    return { passed: true, score: 100, max_score: 100, issues: [] };
  }, 'User stories completion');

  registry.register('retrospectiveExists', async (context) => {
    const { sd_id, supabase } = context;

    // SD-QUALITY-UI-001 FIX: Table name is 'retrospectives' not 'sd_retrospectives'
    const { data, error } = await supabase
      .from('retrospectives')
      .select('id')
      .eq('sd_id', sd_id)
      .limit(1);

    if (error || !data || data.length === 0) {
      return {
        passed: false,
        score: 0,
        max_score: 100,
        issues: ['Retrospective not found for this SD']
      };
    }

    return { passed: true, score: 100, max_score: 100, issues: [] };
  }, 'Retrospective exists');

  registry.register('prMergeVerification', async (context) => {
    const { sd } = context;
    // SD-QUALITY-UI-001 FIX: pr_url column doesn't exist in strategic_directives_v2
    // PR creation/merge typically happens AFTER approval via /ship command
    const prUrl = sd?.pr_url || sd?.metadata?.pr_url;

    if (!prUrl) {
      return {
        passed: true, // Changed from false - PR is created after approval
        score: 50,
        max_score: 100,
        warnings: ['PR not yet created - will be created during /ship step after approval']
      };
    }

    // Simplified check - PR URL exists
    return {
      passed: true,
      score: 100,
      max_score: 100,
      warnings: ['PR merge verification simplified - checking URL presence only']
    };
  }, 'PR merge verification');
}
