#!/usr/bin/env node

/**
 * Analyze Sub-Agent Coverage Throughout LEO Protocol Lifecycle
 * Identifies trigger gaps and recommends comprehensive coverage
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Define LEO Protocol phases and where each sub-agent should be active
const LEO_PHASES = {
  'LEAD_STRATEGIC_PLANNING': {
    description: 'LEAD creates Strategic Directives and sets priorities',
    should_activate: ['VALIDATION', 'SECURITY', 'PERFORMANCE', 'DOCMON', 'RETRO']
  },
  'LEAD_TO_PLAN_HANDOFF': {
    description: 'LEAD hands off to PLAN for technical planning',
    should_activate: ['DOCMON', 'VALIDATION', 'DATABASE']
  },
  'PLAN_PRD_CREATION': {
    description: 'PLAN creates PRD from Strategic Directive',
    should_activate: ['STORIES', 'TESTING', 'SECURITY', 'PERFORMANCE', 'DATABASE', 'DESIGN', 'VALIDATION']
  },
  'PLAN_TECHNICAL_DESIGN': {
    description: 'PLAN designs technical approach and architecture',
    should_activate: ['DATABASE', 'SECURITY', 'PERFORMANCE', 'VALIDATION', 'GITHUB']
  },
  'PLAN_TO_EXEC_HANDOFF': {
    description: 'PLAN hands off to EXEC for implementation',
    should_activate: ['DOCMON', 'VALIDATION', 'STORIES']
  },
  'EXEC_IMPLEMENTATION': {
    description: 'EXEC implements based on PRD',
    should_activate: ['TESTING', 'SECURITY', 'PERFORMANCE', 'DATABASE', 'DESIGN', 'GITHUB']
  },
  'EXEC_TO_PLAN_HANDOFF': {
    description: 'EXEC hands back to PLAN for verification',
    should_activate: ['TESTING', 'DOCMON', 'VALIDATION', 'GITHUB']
  },
  'PLAN_VERIFICATION': {
    description: 'PLAN verifies implementation meets requirements',
    should_activate: ['TESTING', 'SECURITY', 'PERFORMANCE', 'STORIES', 'VALIDATION']
  },
  'FINAL_APPROVAL': {
    description: 'LEAD provides final approval',
    should_activate: ['RETRO', 'DOCMON', 'GITHUB', 'VALIDATION']
  }
};

// Current keyword triggers from CLAUDE.md analysis
const CURRENT_TRIGGERS = {
  'DATABASE': ['schema', 'migration'],
  'TESTING': ['coverage'],
  'VALIDATION': ['existing implementation', 'duplicate', 'conflict', 'already implemented', 'codebase check'],
  'GITHUB': ['EXEC_IMPLEMENTATION_COMPLETE', 'create pull request', 'gh pr create', 'LEAD_APPROVAL_COMPLETE', 'create release', 'PLAN_VERIFICATION_PASS', 'github deploy', 'github status'],
  'DOCMON': ['LEAD_SD_CREATION', 'LEAD_HANDOFF_CREATION', 'LEAD_APPROVAL', 'PLAN_PRD_GENERATION', 'PLAN_VERIFICATION', 'EXEC_IMPLEMENTATION', 'EXEC_COMPLETION', 'HANDOFF_CREATED', 'HANDOFF_ACCEPTED', 'PHASE_TRANSITION', 'RETRO_GENERATED', 'FILE_CREATED', 'VIOLATION_DETECTED', 'DAILY_DOCMON_CHECK'],
  'RETRO': ['LEAD_APPROVAL_COMPLETE', 'LEAD_REJECTION', 'PLAN_VERIFICATION_COMPLETE', 'PLAN_COMPLEXITY_HIGH', 'EXEC_SPRINT_COMPLETE', 'EXEC_QUALITY_ISSUE', 'HANDOFF_REJECTED', 'HANDOFF_DELAY', 'PHASE_COMPLETE', 'SD_STATUS_COMPLETED', 'SD_STATUS_BLOCKED', 'PATTERN_DETECTED', 'SUBAGENT_MULTIPLE_FAILURES', 'WEEKLY_LEO_REVIEW', 'LEAD_PRE_APPROVAL_REVIEW'],
  'STORIES': ['PRD created', 'acceptance criteria', 'user stories', 'generate stories'],
  'SECURITY': ['authentication', 'security'],
  'PERFORMANCE': ['optimization'],
  'DESIGN': ['accessibility']
};

async function analyzeSubAgentCoverage() {
  console.log('🔍 ANALYZING SUB-AGENT COVERAGE IN LEO PROTOCOL');
  console.log('='.repeat(55));

  // Get all active sub-agents
  const { data: subAgents } = await supabase
    .from('leo_sub_agents')
    .select('name, code, description, active')
    .eq('active', true)
    .order('name');

  console.log('\n📋 CURRENT ACTIVE SUB-AGENTS:');
  subAgents.forEach(sa => {
    console.log(`   ✅ ${sa.name} (${sa.code})`);
  });

  console.log('\n🚨 COMPREHENSIVE TRIGGER RECOMMENDATIONS:');
  console.log('='.repeat(50));

  Object.entries(LEO_PHASES).forEach(([phase, info]) => {
    console.log(`\n🔹 ${phase}:`);
    console.log(`   📝 ${info.description}`);
    console.log('   🎯 Should activate:');

    info.should_activate.forEach(agentCode => {
      const agent = subAgents.find(sa => sa.code === agentCode);
      if (agent) {
        console.log(`      ✅ ${agent.name} (${agentCode})`);

        // Show current triggers for this agent
        if (CURRENT_TRIGGERS[agentCode]) {
          console.log(`         Current triggers: ${CURRENT_TRIGGERS[agentCode].slice(0, 3).join(', ')}${CURRENT_TRIGGERS[agentCode].length > 3 ? '...' : ''}`);
        } else {
          console.log(`         ⚠️  NO TRIGGERS CONFIGURED`);
        }
      } else {
        console.log(`      ❌ ${agentCode} (NOT FOUND)`);
      }
    });
  });

  // Identify coverage gaps
  console.log('\n🚨 COVERAGE GAPS ANALYSIS:');
  console.log('='.repeat(35));

  const allShouldActivate = new Set();
  Object.values(LEO_PHASES).forEach(phase => {
    phase.should_activate.forEach(code => allShouldActivate.add(code));
  });

  subAgents.forEach(agent => {
    if (!allShouldActivate.has(agent.code)) {
      console.log(`⚠️  ${agent.name} (${agent.code}) - NO PHASE ASSIGNMENTS`);
    }
  });

  // Generate comprehensive trigger recommendations
  console.log('\n📝 RECOMMENDED TRIGGER ENHANCEMENTS:');
  console.log('='.repeat(40));

  const recommendations = {
    'DATABASE': {
      current: CURRENT_TRIGGERS['DATABASE'] || [],
      recommended: ['schema', 'migration', 'database', 'query', 'index', 'constraint', 'table', 'PLAN_TECHNICAL_DESIGN', 'EXEC_DATABASE_CHANGES', 'data model', 'sql', 'postgres']
    },
    'TESTING': {
      current: CURRENT_TRIGGERS['TESTING'] || [],
      recommended: ['coverage', 'test', 'testing', 'QA', 'verify', 'validation', 'EXEC_IMPLEMENTATION_COMPLETE', 'PLAN_VERIFICATION_START', 'unit test', 'integration test', 'e2e']
    },
    'SECURITY': {
      current: CURRENT_TRIGGERS['SECURITY'] || [],
      recommended: ['security', 'authentication', 'authorization', 'encrypt', 'permission', 'access control', 'PLAN_SECURITY_REVIEW', 'EXEC_SECURITY_IMPL', 'vulnerability', 'threat']
    },
    'PERFORMANCE': {
      current: CURRENT_TRIGGERS['PERFORMANCE'] || [],
      recommended: ['optimization', 'performance', 'speed', 'latency', 'throughput', 'PLAN_PERFORMANCE_REVIEW', 'EXEC_PERFORMANCE_IMPL', 'benchmark', 'load test', 'scaling']
    },
    'DESIGN': {
      current: CURRENT_TRIGGERS['DESIGN'] || [],
      recommended: ['accessibility', 'UX', 'UI', 'design', 'user experience', 'interface', 'PLAN_UX_REVIEW', 'EXEC_UI_IMPL', 'usability', 'responsive']
    },
    'STORIES': {
      current: CURRENT_TRIGGERS['STORIES'] || [],
      recommended: ['PRD created', 'user stories', 'acceptance criteria', 'story', 'PLAN_PRD_CREATION', 'requirements', 'backlog', 'epic']
    },
    'VALIDATION': {
      current: CURRENT_TRIGGERS['VALIDATION'] || [],
      recommended: ['existing implementation', 'duplicate', 'conflict', 'validation', 'verify', 'LEAD_STRATEGIC_PLANNING', 'PLAN_VALIDATION', 'impact analysis', 'dependency']
    },
    'GITHUB': {
      current: CURRENT_TRIGGERS['GITHUB'] || [],
      recommended: ['pull request', 'deploy', 'release', 'git', 'EXEC_IMPLEMENTATION_COMPLETE', 'FINAL_APPROVAL', 'CI/CD', 'merge', 'branch']
    },
    'DOCMON': {
      current: CURRENT_TRIGGERS['DOCMON'] || [],
      recommended: ['documentation', 'handoff', 'phase transition', 'FILE_CREATED', 'VIOLATION_DETECTED', 'LEAD_SD_CREATION', 'PLAN_PRD_GENERATION', 'knowledge base']
    },
    'RETRO': {
      current: CURRENT_TRIGGERS['RETRO'] || [],
      recommended: ['retrospective', 'lesson learned', 'improvement', 'PHASE_COMPLETE', 'SD_STATUS_COMPLETED', 'FINAL_APPROVAL', 'post-mortem', 'feedback']
    }
  };

  Object.entries(recommendations).forEach(([agentCode, data]) => {
    const agent = subAgents.find(sa => sa.code === agentCode);
    if (agent) {
      console.log(`\n🔧 ${agent.name} (${agentCode}):`);
      console.log(`   Current: ${data.current.length} triggers`);
      console.log(`   Recommended: ${data.recommended.length} triggers`);

      const missing = data.recommended.filter(r => !data.current.includes(r));
      if (missing.length > 0) {
        console.log(`   ➕ Add: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`);
      }
    }
  });

  return { subAgents, phases: LEO_PHASES, recommendations };
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  analyzeSubAgentCoverage()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Analysis failed:', error);
      process.exit(1);
    });
}

export { analyzeSubAgentCoverage };