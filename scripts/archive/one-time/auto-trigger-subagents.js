#!/usr/bin/env node

/**
 * AUTO-TRIGGER SUB-AGENTS
 * Automatically detects trigger keywords and activates required sub-agents
 * Prevents missing critical sub-agent consultations
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Define trigger mappings from CLAUDE.md
const SUB_AGENT_TRIGGERS = {
  'CONTINUOUS_IMPROVEMENT_COACH': [
    'LEAD_APPROVAL_COMPLETE',
    'LEAD_REJECTION',
    'PLAN_VERIFICATION_COMPLETE',
    'PLAN_COMPLEXITY_HIGH',
    'EXEC_SPRINT_COMPLETE',
    'EXEC_QUALITY_ISSUE',
    'HANDOFF_REJECTED',
    'HANDOFF_DELAY',
    'PHASE_COMPLETE',
    'SD_STATUS_COMPLETED',
    'SD_STATUS_BLOCKED',
    'PATTERN_DETECTED',
    'SUBAGENT_MULTIPLE_FAILURES',
    'WEEKLY_LEO_REVIEW',
    'LEAD_PRE_APPROVAL_REVIEW'
  ],
  'DEVOPS_PLATFORM_ARCHITECT': [
    'EXEC_IMPLEMENTATION_COMPLETE',
    'create pull request',
    'gh pr create',
    'LEAD_APPROVAL_COMPLETE',
    'create release',
    'PLAN_VERIFICATION_PASS',
    'github deploy',
    'github status'
  ],
  'DESIGN_SUB_AGENT': [
    'component',
    'visual',
    'design system',
    'styling',
    'CSS',
    'Tailwind',
    'interface',
    'UI',
    'button',
    'form',
    'modal',
    'theme',
    'dark mode',
    'light mode',
    'responsive',
    'mobile',
    'user flow',
    'navigation',
    'journey',
    'interaction',
    'wireframe',
    'prototype',
    'UX',
    'user experience',
    'accessibility',
    'WCAG',
    'ARIA',
    'screen reader'
  ],
  'QA_ENGINEERING_DIRECTOR': [
    'coverage',
    'test',
    'quality'
  ],
  'PRINCIPAL_DATABASE_ARCHITECT': [
    'schema',
    'migration',
    'database'
  ],
  'PRINCIPAL_SYSTEMS_ANALYST': [
    'existing implementation',
    'duplicate',
    'conflict',
    'already implemented',
    'codebase check'
  ]
};

/**
 * Check which sub-agents should be triggered based on event/context
 */
function detectRequiredSubAgents(event, context = '') {
  const required = new Set();
  const fullText = `${event} ${context}`.toLowerCase();

  for (const [subAgent, triggers] of Object.entries(SUB_AGENT_TRIGGERS)) {
    for (const trigger of triggers) {
      if (fullText.includes(trigger.toLowerCase())) {
        required.add(subAgent);
        break;
      }
    }
  }

  return Array.from(required);
}

/**
 * Generate checklist for required sub-agents
 */
function generateSubAgentChecklist(event, sdKey) {
  const required = detectRequiredSubAgents(event);

  if (required.length === 0) {
    console.log('✅ No sub-agents required for this event');
    return;
  }

  console.log('\n🤖 REQUIRED SUB-AGENTS DETECTED:');
  console.log('═'.repeat(60));
  console.log(`Event: ${event}`);
  console.log(`SD: ${sdKey || 'N/A'}`);
  console.log('');

  required.forEach((subAgent, index) => {
    console.log(`${index + 1}. ${subAgent}`);

    // Show relevant triggers
    const matchedTriggers = SUB_AGENT_TRIGGERS[subAgent].filter(trigger =>
      event.toLowerCase().includes(trigger.toLowerCase())
    );
    console.log(`   Triggers: ${matchedTriggers.join(', ')}`);
    console.log('');
  });

  console.log('📋 CHECKLIST:');
  required.forEach((subAgent, index) => {
    console.log(`[ ] ${index + 1}. Activate ${subAgent}`);
  });
  console.log('');

  return required;
}

/**
 * Store sub-agent activation record
 */
async function recordSubAgentActivation(sdId, subAgent, event, result) {
  try {
    const { data: _data, error } = await supabase
      .from('sub_agent_executions')
      .insert({
        sd_id: sdId,
        sub_agent_code: subAgent,
        trigger_event: event,
        execution_result: result,
        activated_at: new Date().toISOString()
      })
      .select();

    if (error) {
      console.error(`⚠️  Failed to record activation: ${error.message}`);
    } else {
      console.log(`✅ Recorded ${subAgent} activation`);
    }
  } catch (err) {
    console.error('Error recording activation:', err.message);
  }
}

/**
 * Main function - can be called programmatically or from CLI
 */
async function main() {
  const args = process.argv.slice(2);
  const event = args[0] || 'SD_STATUS_COMPLETED';
  const sdKey = args[1];

  console.log('🔍 AUTO-TRIGGER SUB-AGENTS');
  console.log('═'.repeat(60));

  const required = generateSubAgentChecklist(event, sdKey);

  if (required && required.length > 0) {
    console.log('⚠️  WARNING: These sub-agents MUST be activated before proceeding!');
    console.log('');
    console.log('💡 TIPS:');
    console.log('   • Activate sub-agents in the order listed');
    console.log('   • Store results in database');
    console.log('   • Include in handoff documentation');
    console.log('');

    return required;
  }
}

// Run if called directly
main();

// Export for use in other scripts
export {
  detectRequiredSubAgents,
  generateSubAgentChecklist,
  recordSubAgentActivation,
  SUB_AGENT_TRIGGERS
};
