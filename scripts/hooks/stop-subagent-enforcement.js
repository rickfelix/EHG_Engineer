#!/usr/bin/env node
/**
 * Stop Hook: Sub-Agent Enforcement with Auto-Remediation
 *
 * LEO Protocol v4.3.3+
 * SD-LEO-INFRA-STOP-HOOK-SUB-001
 *
 * Behavior:
 * 1. Detects current SD from git branch
 * 2. Determines required + recommended sub-agents based on SD type/category
 * 3. Validates sub-agents ran in correct phase windows
 * 4. AUTO-RUNS missing sub-agents (remediation)
 * 5. Blocks session end until all validations pass
 * 6. Bypass requires explanation + retrospective entry
 *
 * Exit codes:
 *   0 - All validations passed (or not on SD branch)
 *   2 - Blocking: Missing sub-agents (triggers Claude to continue)
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

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
  },
  byCategory: {
    'Quality Assurance': ['TESTING', 'UAT', 'VALIDATION'],
    'quality': ['TESTING', 'UAT', 'VALIDATION'],
    'testing': ['TESTING', 'UAT'],
    'audit': ['VALIDATION', 'RCA'],
    'security': ['SECURITY', 'RISK'],
    'bug_fix': ['RCA', 'REGRESSION'],
    'ux_improvement': ['DESIGN', 'UAT'],
    'UX Improvement': ['DESIGN', 'UAT'],
    'product_feature': ['DESIGN', 'STORIES', 'API'],
    'database': ['DATABASE'],
    'database_schema': ['DATABASE', 'SECURITY']
  },
  universal: ['RETRO']
};

const TIMING_RULES = {
  DESIGN: { after: 'LEAD-TO-PLAN', before: 'PLAN-TO-EXEC', phase: 'PLAN' },
  STORIES: { after: 'LEAD-TO-PLAN', before: 'PLAN-TO-EXEC', phase: 'PLAN' },
  API: { after: 'LEAD-TO-PLAN', before: 'PLAN-TO-EXEC', phase: 'PLAN' },
  DATABASE: { after: 'LEAD-TO-PLAN', before: 'EXEC-TO-PLAN', phase: 'PLAN/EXEC' },
  TESTING: { after: 'PLAN-TO-EXEC', before: 'LEAD-FINAL-APPROVAL', phase: 'EXEC' },
  REGRESSION: { after: 'PLAN-TO-EXEC', before: 'EXEC-TO-PLAN', phase: 'EXEC' },
  PERFORMANCE: { after: 'PLAN-TO-EXEC', before: 'EXEC-TO-PLAN', phase: 'EXEC' },
  SECURITY: { after: null, before: 'LEAD-FINAL-APPROVAL', phase: 'ANY' },
  UAT: { after: 'EXEC-TO-PLAN', before: 'LEAD-FINAL-APPROVAL', phase: 'VERIFICATION' },
  VALIDATION: { after: null, before: 'LEAD-FINAL-APPROVAL', phase: 'ANY' },
  RCA: { after: null, before: null, phase: 'EARLY' },
  RETRO: { after: 'PLAN-TO-LEAD', before: null, phase: 'COMPLETION' },
  GITHUB: { after: 'PLAN-TO-EXEC', before: 'LEAD-FINAL-APPROVAL', phase: 'EXEC' },
  DOCMON: { after: null, before: 'LEAD-FINAL-APPROVAL', phase: 'ANY' },
  RISK: { after: null, before: 'PLAN-TO-EXEC', phase: 'EARLY' }
};

const REMEDIATION_ORDER = [
  'RCA', 'DESIGN', 'STORIES', 'DATABASE', 'API', 'SECURITY',
  'TESTING', 'REGRESSION', 'PERFORMANCE', 'UAT', 'VALIDATION',
  'GITHUB', 'DOCMON', 'RETRO'
];

// ============================================================================
// MAIN LOGIC
// ============================================================================

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 1. Check for bypass
  const bypassResult = await checkBypass(supabase);
  if (bypassResult.allowed) {
    process.exit(0);
  }
  if (bypassResult.blocked) {
    console.log(JSON.stringify(bypassResult.response));
    process.exit(2);
  }

  // 2. Get current branch to extract SD ID
  let branch;
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    process.exit(0); // Not in git repo
  }

  // 3. Extract SD ID from branch
  // Pattern matches: SD-XXX-...-NNN format (e.g., SD-LEO-INFRA-STOP-HOOK-SUB-001)
  const sdMatch = branch.match(/SD-[A-Z]+-(?:[A-Z]+-)*[0-9]+/i);
  if (sdMatch === null) {
    process.exit(0); // No SD in branch
  }
  const sdKey = sdMatch[0];

  // 4. Get SD details
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, legacy_id, title, sd_type, category, current_phase, status')
    .or(`sd_key.eq.${sdKey},legacy_id.eq.${sdKey},id.eq.${sdKey}`)
    .single();

  if (sdError || sd === null) {
    process.exit(0); // SD not found
  }

  // 5. Skip if completed
  if (sd.status === 'completed' || sd.current_phase === 'COMPLETED') {
    process.exit(0);
  }

  // 6. Determine required + recommended sub-agents
  const sdType = sd.sd_type || 'feature';
  const category = sd.category || '';

  const typeReqs = REQUIREMENTS.byType[sdType] || { required: [], recommended: [] };
  const categoryReqs = REQUIREMENTS.byCategory[category] || [];

  const required = new Set([...typeReqs.required, ...categoryReqs]);
  const recommended = new Set(typeReqs.recommended);

  // Add universal if near completion
  if (['PLAN', 'LEAD', 'PLAN_VERIFY', 'LEAD_FINAL'].includes(sd.current_phase)) {
    REQUIREMENTS.universal.forEach(s => required.add(s));
  }

  // Merge recommended into execution list (auto-run)
  const allToRun = new Set([...required, ...recommended]);

  // 7. Get handoff timestamps
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_type, status, created_at')
    .eq('sd_id', sd.id)
    .eq('status', 'accepted')
    .order('created_at', { ascending: true });

  const handoffTimes = {};
  if (handoffs) {
    handoffs.forEach(h => {
      handoffTimes[h.handoff_type] = new Date(h.created_at);
    });
  }

  // 8. Get sub-agent executions
  const { data: executions } = await supabase
    .from('sub_agent_execution_results')
    .select('sub_agent_code, verdict, created_at')
    .eq('sd_id', sd.id);

  // 9. Validate each sub-agent
  const missing = [];
  const wrongTiming = [];
  const cached = [];

  for (const agent of allToRun) {
    const agentExecs = (executions || []).filter(e => e.sub_agent_code === agent);
    const passingExecs = agentExecs.filter(e =>
      ['PASS', 'CONDITIONAL_PASS'].includes(e.verdict)
    );

    // Check cache
    const recentPass = passingExecs.find(e =>
      (Date.now() - new Date(e.created_at).getTime()) < CACHE_DURATION_MS
    );

    if (recentPass) {
      cached.push(agent);
      continue; // Cached, skip
    }

    if (passingExecs.length === 0) {
      missing.push(agent);
      continue;
    }

    // Check timing
    const rule = TIMING_RULES[agent];
    if (rule) {
      const afterTime = rule.after ? handoffTimes[rule.after] : null;
      const beforeTime = rule.before ? handoffTimes[rule.before] : null;

      const validExec = passingExecs.some(e => {
        const execTime = new Date(e.created_at);
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

  // 10. If issues found, provide feedback for auto-remediation
  if (missing.length > 0 || wrongTiming.length > 0) {
    console.error(`\n🔍 Sub-Agent Enforcement for ${sdKey} (${sdType})`);
    console.error(`   Phase: ${sd.current_phase}`);
    console.error(`   Cached: ${cached.length} sub-agents`);

    if (missing.length > 0) {
      console.error(`   Missing: ${missing.join(', ')}`);
    }
    if (wrongTiming.length > 0) {
      console.error(`   Wrong timing: ${wrongTiming.map(w => w.agent).join(', ')}`);
    }

    // Sort missing by remediation order
    const toRemediate = [...missing, ...wrongTiming.map(w => w.agent)];
    const sorted = toRemediate.sort((a, b) =>
      REMEDIATION_ORDER.indexOf(a) - REMEDIATION_ORDER.indexOf(b)
    );

    // Return blocking response with remediation instructions
    const output = {
      decision: 'block',
      reason: `SD ${sdKey} (${sdType}) requires sub-agent validation`,
      details: {
        sd_key: sdKey,
        sd_type: sdType,
        category: category,
        current_phase: sd.current_phase,
        missing: missing,
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

  // 11. All validations passed
  console.error(`✅ Sub-Agent Enforcement: ${sdKey} passed (${cached.length} cached, ${allToRun.size - cached.length} validated)`);
  process.exit(0);
}

// ============================================================================
// BYPASS HANDLING
// ============================================================================

async function checkBypass(supabase) {
  const bypassFile = path.join(
    process.env.CLAUDE_PROJECT_DIR || process.cwd(),
    '.stop-hook-bypass.json'
  );

  if (fs.existsSync(bypassFile) === false) {
    return { allowed: false, blocked: false };
  }

  try {
    const bypass = JSON.parse(fs.readFileSync(bypassFile, 'utf-8'));

    // Validate explanation
    if (bypass.explanation === undefined || bypass.explanation.length < 50) {
      return {
        allowed: false,
        blocked: true,
        response: {
          decision: 'block',
          reason: 'Bypass explanation must be at least 50 characters',
          current_length: bypass.explanation?.length || 0
        }
      };
    }

    // Validate retrospective committed
    if (bypass.retrospective_committed !== true) {
      return {
        allowed: false,
        blocked: true,
        response: {
          decision: 'block',
          reason: 'Bypass requires retrospective entry',
          action: 'Run: node scripts/generate-retrospective.js --bypass-entry'
        }
      };
    }

    // Log bypass to audit
    try {
      await supabase.from('audit_log').insert({
        event_type: 'STOP_HOOK_BYPASS',
        severity: 'warning',
        details: {
          sd_key: bypass.sd_key,
          explanation: bypass.explanation,
          skipped_agents: bypass.skipped_agents,
          retrospective_id: bypass.retrospective_id
        }
      });
    } catch (e) {
      console.error('Failed to log bypass to audit:', e.message);
    }

    // Clean up bypass file
    fs.unlinkSync(bypassFile);

    console.error(`⚠️ Bypass allowed for ${bypass.sd_key}: ${bypass.explanation.slice(0, 80)}...`);
    return { allowed: true, blocked: false };

  } catch (e) {
    return {
      allowed: false,
      blocked: true,
      response: {
        decision: 'block',
        reason: `Invalid bypass file: ${e.message}`
      }
    };
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

main().catch(err => {
  console.error('Stop hook error:', err.message);
  process.exit(0); // Don't block on internal errors
});
