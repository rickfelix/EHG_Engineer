/**
 * Sub-Agent Enforcement Validation Gate for EXEC-TO-PLAN
 * Part of SD-LEO-HARDEN-VALIDATION-001
 *
 * LEO v4.4.3: Per-handoff sub-agent enforcement
 * Evidence: Stop hook enforcement only runs at session END, not per-handoff
 *
 * This gate provides advisory warnings (not blocking) when required sub-agents
 * haven't been executed before the EXEC-TO-PLAN handoff.
 */

/**
 * Sub-agent requirements by SD type - mirrors stop-subagent-enforcement.js
 */
const REQUIREMENTS = {
  byType: {
    feature: {
      required: ['TESTING', 'DESIGN', 'STORIES'],
      recommended: ['UAT', 'API']
    },
    implementation: {
      required: ['TESTING', 'API'],
      recommended: ['DATABASE']
    },
    infrastructure: {
      required: ['GITHUB', 'DOCMON'],
      recommended: ['VALIDATION']
    },
    database: {
      required: ['DATABASE', 'SECURITY'],
      recommended: ['REGRESSION']
    },
    security: {
      required: ['SECURITY', 'DATABASE'],
      recommended: ['TESTING', 'RCA']
    },
    documentation: {
      required: ['DOCMON'],
      recommended: ['VALIDATION']
    },
    bugfix: {
      required: ['RCA', 'REGRESSION', 'TESTING'],
      recommended: ['UAT']
    },
    refactor: {
      required: ['REGRESSION', 'VALIDATION'],
      recommended: ['TESTING']
    },
    performance: {
      required: ['PERFORMANCE', 'TESTING'],
      recommended: ['REGRESSION']
    },
    orchestrator: {
      required: [],
      recommended: ['RETRO']
    }
  }
};

/**
 * Sub-agents that should be completed BEFORE EXEC-TO-PLAN handoff
 */
const EXEC_PHASE_AGENTS = ['TESTING', 'REGRESSION', 'PERFORMANCE', 'GITHUB', 'API'];

/**
 * Create the SUBAGENT_ENFORCEMENT_VALIDATION gate validator
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createSubAgentEnforcementValidationGate(supabase) {
  return {
    name: 'SUBAGENT_ENFORCEMENT_VALIDATION',
    validator: async (ctx) => {
      console.log('\n🔍 SUB-AGENT ENFORCEMENT VALIDATION (LEO v4.4.3)');
      console.log('-'.repeat(50));

      const sdType = (ctx.sd?.sd_type || 'feature').toLowerCase();
      const sdUuid = ctx.sd?.id || ctx.sdId;

      // Get requirements for this SD type
      const typeReqs = REQUIREMENTS.byType[sdType] || { required: [], recommended: [] };

      // Filter to EXEC-phase agents only for this handoff
      const requiredForExec = typeReqs.required.filter(a => EXEC_PHASE_AGENTS.includes(a));
      const recommendedForExec = typeReqs.recommended.filter(a => EXEC_PHASE_AGENTS.includes(a));

      if (requiredForExec.length === 0 && recommendedForExec.length === 0) {
        console.log(`   ℹ️  ${sdType} type - no EXEC-phase sub-agents required`);
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { skipped: true, reason: `${sdType} has no EXEC-phase requirements` }
        };
      }

      // Query for sub-agent execution results
      const { data: executions, error } = await supabase
        .from('sub_agent_execution_results')
        .select('sub_agent_code, verdict, created_at')
        .eq('sd_id', sdUuid)
        .in('verdict', ['PASS', 'CONDITIONAL_PASS']);

      if (error) {
        console.log(`   ⚠️  Error checking sub-agent executions: ${error.message}`);
        return {
          passed: true, // Advisory mode - don't block on error
          score: 70,
          max_score: 100,
          issues: [],
          warnings: [`Could not verify sub-agent executions: ${error.message}`]
        };
      }

      const executedAgents = new Set((executions || []).map(e => e.sub_agent_code));
      const missingRequired = requiredForExec.filter(a => !executedAgents.has(a));
      const missingRecommended = recommendedForExec.filter(a => !executedAgents.has(a));

      // Report findings
      console.log(`   📋 SD Type: ${sdType}`);
      console.log(`   📋 Required for EXEC: ${requiredForExec.join(', ') || 'none'}`);
      console.log(`   📋 Recommended for EXEC: ${recommendedForExec.join(', ') || 'none'}`);
      console.log(`   ✅ Executed: ${[...executedAgents].filter(a => EXEC_PHASE_AGENTS.includes(a)).join(', ') || 'none'}`);

      const warnings = [];
      let score = 100;

      if (missingRequired.length > 0) {
        console.log(`   ⚠️  Missing REQUIRED: ${missingRequired.join(', ')}`);
        warnings.push(`Missing required sub-agents: ${missingRequired.join(', ')} (consider running before handoff)`);
        score -= missingRequired.length * 10;
      }

      if (missingRecommended.length > 0) {
        console.log(`   ℹ️  Missing recommended: ${missingRecommended.join(', ')}`);
        warnings.push(`Missing recommended sub-agents: ${missingRecommended.join(', ')}`);
        score -= missingRecommended.length * 5;
      }

      // Ensure minimum score
      score = Math.max(score, 50);

      if (warnings.length === 0) {
        console.log('   ✅ All expected sub-agents executed');
      } else {
        console.log('\n   ADVISORY: This gate is informational only');
        console.log('   → Stop hook will enforce at session end');
      }

      return {
        passed: true, // Advisory mode - always pass
        score,
        max_score: 100,
        issues: [], // No blocking issues
        warnings,
        details: {
          sd_type: sdType,
          required_for_exec: requiredForExec,
          recommended_for_exec: recommendedForExec,
          executed: [...executedAgents],
          missing_required: missingRequired,
          missing_recommended: missingRecommended,
          advisory: true
        }
      };
    },
    required: false // Advisory gate - does not block handoff
  };
}
