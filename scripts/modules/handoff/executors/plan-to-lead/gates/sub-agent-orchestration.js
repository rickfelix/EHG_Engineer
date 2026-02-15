/**
 * Sub-Agent Orchestration Gate for PLAN-TO-LEAD
 * Part of SD-LEO-REFACTOR-PLANTOLEAD-001
 * Updated by SD-LEARN-FIX-ADDRESS-PAT-AUTO-014 (SD-type exemption parity)
 *
 * Orchestrates LEAD_FINAL phase sub-agents
 */

/**
 * Create the SUB_AGENT_ORCHESTRATION gate validator
 *
 * @param {Object} supabase - Supabase client for SD-type validation profile lookup
 * @returns {Object} Gate configuration
 */
export function createSubAgentOrchestrationGate(supabase) {
  return {
    name: 'SUB_AGENT_ORCHESTRATION',
    validator: async (ctx) => {
      console.log('\n🤖 Step 0: Sub-Agent Orchestration (LEAD_FINAL phase)');
      console.log('-'.repeat(50));

      // SD-TYPE-AWARE SUB-AGENT EXEMPTIONS (parity with EXEC-TO-PLAN gate)
      if (supabase) {
        const sdType = (ctx.sd?.sd_type || '').toLowerCase();

        try {
          const { data: validationProfile } = await supabase
            .from('sd_type_validation_profiles')
            .select('requires_sub_agents')
            .eq('sd_type', sdType)
            .single();

          const skipSubAgents = validationProfile?.requires_sub_agents === false;

          if (skipSubAgents) {
            console.log(`   ℹ️  ${sdType} type SD - sub-agent orchestration SKIPPED`);
            console.log('   → Database: sd_type_validation_profiles.requires_sub_agents = false');
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
        } catch (err) {
          console.log(`   ⚠️  SD-type exemption check failed: ${err.message} — proceeding with orchestration`);
        }
      }

      // Lazy load orchestrator
      const { orchestrate } = await import('../../../../../orchestrate-phase-subagents.js');

      const result = await orchestrate('LEAD_FINAL', ctx.sdId);
      ctx._orchestrationResult = result;

      if (!result.can_proceed) {
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [result.message, `Failed agents: ${result.failed}`, `Blocked agents: ${result.blocked}`],
          warnings: [],
          remediation: `node scripts/generate-comprehensive-retrospective.js ${ctx.sdId}`
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
