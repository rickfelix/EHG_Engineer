/**
 * Sub-Agent Orchestration Gate for EXEC-TO-PLAN
 * Part of SD-LEO-REFACTOR-EXECTOPLAN-001
 *
 * Orchestrates sub-agents for PLAN_VERIFY phase
 */

// External validators (will be lazy loaded)
let orchestrate;

/**
 * Create the SUB_AGENT_ORCHESTRATION gate validator
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createSubAgentOrchestrationGate(supabase) {
  return {
    name: 'SUB_AGENT_ORCHESTRATION',
    validator: async (ctx) => {
      console.log('\n🤖 Step 0: Sub-Agent Orchestration (PLAN_VERIFY phase)');
      console.log('-'.repeat(50));

      // Load orchestrate function if not loaded
      if (!orchestrate) {
        const orch = await import('../../../../../orchestrate-phase-subagents.js');
        orchestrate = orch.orchestrate;
      }

      // SD-TYPE-AWARE SUB-AGENT EXEMPTIONS
      const sdType = (ctx.sd?.sd_type || '').toLowerCase();

      // Query database for SD type validation profile
      const { data: validationProfile } = await supabase
        .from('sd_type_validation_profiles')
        .select('requires_sub_agents, validation_requirements')
        .eq('sd_type', sdType)
        .single();

      // Check if sub-agents are NOT required for this SD type
      const skipSubAgents = validationProfile?.requires_sub_agents === false;

      if (skipSubAgents) {
        console.log(`   ℹ️  ${sdType} type SD - sub-agent orchestration SKIPPED`);
        console.log('   → Database: sd_type_validation_profiles.requires_sub_agents = false');
        if (sdType === 'orchestrator') {
          console.log('   → Orchestrator SDs: children handle sub-agent validation');
        } else if (['documentation', 'docs'].includes(sdType)) {
          console.log('   → Documentation SDs: no code paths to validate');
        } else if (sdType === 'infrastructure') {
          console.log('   → Infrastructure SDs: infrastructure-specific validation only');
        }
        ctx._orchestrationResult = { can_proceed: true, passed: 0, total_agents: 0, skipped: true };
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`Sub-agent orchestration skipped for ${sdType} type SD (db: requires_sub_agents=false)`],
          details: { skipped: true, reason: `${sdType} type - requires_sub_agents: false`, source: 'database' }
        };
      }

      // Get security baseline for retrospective mode
      const securityBaseline = await getSecurityBaseline(supabase);

      // Check for existing PASS or CONDITIONAL_PASS TESTING result before orchestration
      const { data: existingTestingPass } = await supabase
        .from('sub_agent_execution_results')
        .select('verdict, created_at, detailed_analysis')
        .eq('sd_id', ctx.sdId)
        .eq('sub_agent_code', 'TESTING')
        .in('verdict', ['PASS', 'CONDITIONAL_PASS'])
        .order('created_at', { ascending: false })
        .limit(1);

      // If we have a recent PASS/CONDITIONAL_PASS result, skip orchestration for TESTING
      if (existingTestingPass && existingTestingPass.length > 0) {
        const passAge = (Date.now() - new Date(existingTestingPass[0].created_at)) / 3600000;
        const cachedVerdict = existingTestingPass[0].verdict;
        if (passAge < 24) {
          console.log(`   ✅ Found existing TESTING ${cachedVerdict} result (${passAge.toFixed(1)}h old) - using cached result`);
          ctx._orchestrationResult = {
            can_proceed: true,
            verdict: cachedVerdict,
            passed: 1,
            total_agents: 1,
            message: `TESTING already ${cachedVerdict.toLowerCase()} - using cached result`,
            results: [{ sub_agent_code: 'TESTING', verdict: cachedVerdict }]
          };
          return {
            passed: true,
            score: 100,
            max_score: 100,
            issues: [],
            warnings: [`Using cached TESTING ${cachedVerdict} result`],
            details: ctx._orchestrationResult
          };
        }
      }

      const result = await orchestrate('PLAN_VERIFY', ctx.sdId, {
        validation_mode: 'retrospective',
        security_baseline: securityBaseline
      });
      ctx._orchestrationResult = result;

      if (!result.can_proceed) {
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [result.message, `Failed agents: ${result.failed}`, `Blocked agents: ${result.blocked}`],
          warnings: []
        };
      }

      console.log(`✅ Sub-agent orchestration passed: ${result.passed}/${result.total_agents} agents`);

      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [],
        details: result
      };
    },
    required: true
  };
}

/**
 * Get security baseline from sd_baseline_issues table
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Baseline counts by issue type
 */
async function getSecurityBaseline(supabase) {
  const defaultBaseline = {
    sql_concatenation: 0,
    eval_usage: 0,
    dangerous_html: 0
  };

  try {
    const { data: issues, error } = await supabase
      .from('sd_baseline_issues')
      .select('description, metadata')
      .eq('category', 'security')
      .in('status', ['open', 'acknowledged', 'in_progress']);

    if (error) {
      console.log(`   ℹ️  Security baseline query: ${error.message}`);
      return defaultBaseline;
    }

    if (!issues || issues.length === 0) {
      return defaultBaseline;
    }

    const baseline = { ...defaultBaseline };

    for (const issue of issues) {
      const desc = (issue.description || '').toLowerCase();
      const issueType = issue.metadata?.issue_type;

      if (issueType === 'sql_concatenation' || desc.includes('sql') || desc.includes('concatenat')) {
        baseline.sql_concatenation++;
      } else if (issueType === 'eval_usage' || desc.includes('eval')) {
        baseline.eval_usage++;
      } else if (issueType === 'dangerous_html' || desc.includes('innerhtml') || desc.includes('dangerous')) {
        baseline.dangerous_html++;
      }
    }

    console.log(`   📊 Security baseline loaded: ${issues.length} known issues`);
    return baseline;
  } catch (error) {
    console.log(`   ⚠️  Security baseline error: ${error.message}`);
    return defaultBaseline;
  }
}
