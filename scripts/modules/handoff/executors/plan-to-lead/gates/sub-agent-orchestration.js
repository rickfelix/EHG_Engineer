/**
 * Sub-Agent Orchestration Gate for PLAN-TO-LEAD
 * Part of SD-LEO-REFACTOR-PLANTOLEAD-001
 *
 * Orchestrates LEAD_FINAL phase sub-agents
 */

/**
 * Create the SUB_AGENT_ORCHESTRATION gate validator
 *
 * @returns {Object} Gate configuration
 */
export function createSubAgentOrchestrationGate() {
  return {
    name: 'SUB_AGENT_ORCHESTRATION',
    validator: async (ctx) => {
      console.log('\n🤖 Step 0: Sub-Agent Orchestration (LEAD_FINAL phase)');
      console.log('-'.repeat(50));

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
