/**
 * Sub-Agent Validation
 *
 * Validates sub-agent execution requirements:
 * - Required sub-agents block if missing
 * - Recommended sub-agents warn if missing
 * - Timing validation against handoff windows
 *
 * @module stop-subagent-enforcement/sub-agent-validator
 */

import { normalizeToUTC } from './time-utils.js';
import {
  CACHE_DURATION_MS,
  TIMING_RULES,
  REMEDIATION_ORDER,
  getRequiredSubAgents
} from './config.js';

/**
 * Validate sub-agent executions for an SD
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive
 * @param {string} sdKey - SD key
 * @returns {{ missingRequired: string[], missingRecommended: string[], wrongTiming: Object[], cached: string[] }}
 */
export async function validateSubAgents(supabase, sd, sdKey) {
  const { required, recommended } = getRequiredSubAgents(sd);

  // Get handoff timestamps
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_type, status, created_at')
    .eq('sd_id', sd.id)
    .eq('status', 'accepted')
    .order('created_at', { ascending: true });

  const handoffTimes = {};
  if (handoffs) {
    handoffs.forEach(h => {
      handoffTimes[h.handoff_type] = normalizeToUTC(h.created_at);
    });
  }

  // Get sub-agent executions
  const { data: executions } = await supabase
    .from('sub_agent_execution_results')
    .select('sub_agent_code, verdict, created_at')
    .eq('sd_id', sd.id);

  const missingRequired = [];
  const missingRecommended = [];
  const wrongTiming = [];
  const cached = [];

  // Check required sub-agents
  for (const agent of required) {
    const agentExecs = (executions || []).filter(e => e.sub_agent_code === agent);
    const passingExecs = agentExecs.filter(e =>
      ['PASS', 'CONDITIONAL_PASS'].includes(e.verdict)
    );

    // Check cache
    const recentPass = passingExecs.find(e =>
      (Date.now() - normalizeToUTC(e.created_at).getTime()) < CACHE_DURATION_MS
    );

    if (recentPass) {
      cached.push(agent);
      continue;
    }

    if (passingExecs.length === 0) {
      missingRequired.push(agent);
      continue;
    }

    // Check timing
    const rule = TIMING_RULES[agent];
    if (rule) {
      const afterTime = rule.after ? handoffTimes[rule.after] : null;
      const beforeTime = rule.before ? handoffTimes[rule.before] : null;

      const validExec = passingExecs.some(e => {
        const execTime = normalizeToUTC(e.created_at);
        const afterOk = afterTime === null || afterTime === undefined || execTime >= afterTime;
        const beforeOk = beforeTime === null || beforeTime === undefined || execTime <= beforeTime;
        return afterOk && beforeOk;
      });

      if (validExec === false) {
        wrongTiming.push({
          agent,
          rule: `Must run in ${rule.phase} phase (after ${rule.after || 'any'}, before ${rule.before || 'any'})`,
          lastRun: passingExecs[0]?.created_at
        });
      }
    }
  }

  // Check recommended sub-agents
  for (const agent of recommended) {
    if (required.has(agent)) continue;

    const agentExecs = (executions || []).filter(e => e.sub_agent_code === agent);
    const passingExecs = agentExecs.filter(e =>
      ['PASS', 'CONDITIONAL_PASS'].includes(e.verdict)
    );

    const recentPass = passingExecs.find(e =>
      (Date.now() - normalizeToUTC(e.created_at).getTime()) < CACHE_DURATION_MS
    );

    if (recentPass) {
      cached.push(agent);
    } else if (passingExecs.length === 0) {
      missingRecommended.push(agent);
    }
  }

  return { missingRequired, missingRecommended, wrongTiming, cached, required, recommended };
}

/**
 * Output validation results and exit if blocking
 *
 * @param {string} sdKey - SD key
 * @param {string} sdType - SD type
 * @param {string} category - SD category
 * @param {string} currentPhase - Current phase
 * @param {Object} validation - Validation results
 */
export function handleValidationResults(sdKey, sdType, category, currentPhase, validation) {
  const { missingRequired, missingRecommended, wrongTiming, cached, required } = validation;

  if (missingRequired.length > 0 || wrongTiming.length > 0) {
    console.error(`\n🔍 Sub-Agent Enforcement for ${sdKey} (${sdType})`);
    console.error(`   Phase: ${currentPhase}`);
    console.error(`   Cached: ${cached.length} sub-agents`);

    if (missingRequired.length > 0) {
      console.error(`   ❌ Missing REQUIRED: ${missingRequired.join(', ')}`);
    }
    if (missingRecommended.length > 0) {
      console.error(`   ⚠️  Missing recommended: ${missingRecommended.join(', ')} (non-blocking)`);
    }
    if (wrongTiming.length > 0) {
      console.error(`   Wrong timing: ${wrongTiming.map(w => w.agent).join(', ')}`);
    }

    // Sort missing required by remediation order
    const toRemediate = [...missingRequired, ...wrongTiming.map(w => w.agent)];
    const sorted = toRemediate.sort((a, b) =>
      REMEDIATION_ORDER.indexOf(a) - REMEDIATION_ORDER.indexOf(b)
    );

    const output = {
      decision: 'block',
      reason: `SD ${sdKey} (${sdType}) requires sub-agent validation`,
      details: {
        sd_key: sdKey,
        sd_type: sdType,
        category: category,
        current_phase: currentPhase,
        missing_required: missingRequired,
        missing_recommended: missingRecommended,
        wrong_timing: wrongTiming,
        cached: cached.length
      },
      remediation: {
        auto_run: true,
        agents_to_run: sorted,
        command: `node scripts/orchestrate-phase-subagents.js ${sdKey} --agents ${sorted.join(',')}`
      },
      bypass_instructions: {
        step1: 'Create .stop-hook-bypass.json with explanation (min 50 chars)',
        step2: 'Run: node scripts/generate-retrospective.js --bypass-entry',
        step3: 'Set retrospective_committed: true in bypass file'
      }
    };

    console.log(JSON.stringify(output));
    process.exit(2);
  }

  // Warn about missing recommended
  if (missingRecommended.length > 0) {
    console.error(`\n⚠️  Sub-Agent Advisory for ${sdKey} (${sdType})`);
    console.error(`   Missing recommended: ${missingRecommended.join(', ')}`);
    console.error(`   💡 Consider running: node scripts/orchestrate-phase-subagents.js ${sdKey} --agents ${missingRecommended.join(',')}`);
    console.error('   (Not blocking - these are optional but improve quality)');
  }

  // Success
  const totalChecked = required.size + validation.recommended.size;
  console.error(`✅ Sub-Agent Enforcement: ${sdKey} passed (${cached.length} cached, ${totalChecked - cached.length} validated)`);
}
