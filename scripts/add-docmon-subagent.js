#!/usr/bin/env node

/**
 * Add Documentation Monitor Sub-Agent to Database
 * Creates DOCMON sub-agent with LEO Protocol event triggers
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function addDocMonSubAgent() {
  console.log('📚 Adding Documentation Monitor Sub-Agent to database...\n');

  try {
    // Create the DOCMON sub-agent
    const docmonAgent = {
      code: 'DOCMON',
      name: 'Documentation Monitor Sub-Agent',
      description: 'Monitors folder structures, enforces database-first approach, integrated with LEO Protocol workflow. Prevents file creation violations and ensures all work products are stored in database.',
      active: true,
      priority: 95,  // High priority for enforcement
      activation_type: 'automatic',
      script_path: 'scripts/documentation-monitor-subagent.js',
      context_file: null
    };

    // Insert the sub-agent
    const { data: agent, error: agentError } = await supabase
      .from('leo_sub_agents')
      .insert(docmonAgent)
      .select()
      .single();

    if (agentError) {
      console.error('❌ Failed to create DOCMON:', agentError.message);
      return;
    }

    console.log(`✅ Created DOCMON sub-agent: ${agent.id}\n`);

    // Define LEO Protocol event triggers for DOCMON
    const docmonTriggers = [
      // LEAD Events
      {
        sub_agent_id: agent.id,
        trigger_phrase: 'LEAD_SD_CREATION',
        trigger_type: 'keyword',
        active: true,
        priority: 95
      },
      {
        sub_agent_id: agent.id,
        trigger_phrase: 'LEAD_HANDOFF_CREATION',
        trigger_type: 'keyword',
        active: true,
        priority: 95
      },
      {
        sub_agent_id: agent.id,
        trigger_phrase: 'LEAD_APPROVAL',
        trigger_type: 'keyword',
        active: true,
        priority: 90
      },

      // PLAN Events
      {
        sub_agent_id: agent.id,
        trigger_phrase: 'PLAN_PRD_GENERATION',
        trigger_type: 'keyword',
        active: true,
        priority: 95
      },
      {
        sub_agent_id: agent.id,
        trigger_phrase: 'PLAN_VERIFICATION',
        trigger_type: 'keyword',
        active: true,
        priority: 85
      },

      // EXEC Events
      {
        sub_agent_id: agent.id,
        trigger_phrase: 'EXEC_IMPLEMENTATION',
        trigger_type: 'keyword',
        active: true,
        priority: 90
      },
      {
        sub_agent_id: agent.id,
        trigger_phrase: 'EXEC_COMPLETION',
        trigger_type: 'keyword',
        active: true,
        priority: 95
      },

      // Handoff Events
      {
        sub_agent_id: agent.id,
        trigger_phrase: 'HANDOFF_CREATED',
        trigger_type: 'keyword',
        active: true,
        priority: 95
      },
      {
        sub_agent_id: agent.id,
        trigger_phrase: 'HANDOFF_ACCEPTED',
        trigger_type: 'keyword',
        active: true,
        priority: 85
      },

      // Phase Transitions
      {
        sub_agent_id: agent.id,
        trigger_phrase: 'PHASE_TRANSITION',
        trigger_type: 'keyword',
        active: true,
        priority: 85
      },

      // Retrospective Events
      {
        sub_agent_id: agent.id,
        trigger_phrase: 'RETRO_GENERATED',
        trigger_type: 'keyword',
        active: true,
        priority: 90
      },

      // File Monitoring Events
      {
        sub_agent_id: agent.id,
        trigger_phrase: 'FILE_CREATED',
        trigger_type: 'keyword',
        active: true,
        priority: 100  // Highest priority for violations
      },
      {
        sub_agent_id: agent.id,
        trigger_phrase: 'VIOLATION_DETECTED',
        trigger_type: 'keyword',
        active: true,
        priority: 100
      },

      // Comprehensive Check
      {
        sub_agent_id: agent.id,
        trigger_phrase: 'DAILY_DOCMON_CHECK',
        trigger_type: 'keyword',
        active: true,
        priority: 70
      }
    ];

    console.log('🔗 Adding LEO Protocol event triggers...\n');

    let successCount = 0;
    for (const trigger of docmonTriggers) {
      const { error } = await supabase
        .from('leo_sub_agent_triggers')
        .insert(trigger);

      if (error) {
        console.warn(`⚠️ Could not add trigger "${trigger.trigger_phrase}": ${error.message}`);
      } else {
        console.log(`✅ Added trigger: ${trigger.trigger_phrase} (priority: ${trigger.priority})`);
        successCount++;
      }
    }

    console.log(`\n🎉 DOCMON Sub-Agent successfully added!`);
    console.log(`📈 Statistics:`);
    console.log(`- Agent ID: ${agent.id}`);
    console.log(`- Triggers added: ${successCount}/${docmonTriggers.length}`);
    console.log(`- Activation: ${agent.activation_type}`);
    console.log(`- Priority: ${agent.priority}`);

    console.log('\n🔍 DOCMON Features:');
    console.log('- Monitors all file creation attempts');
    console.log('- Enforces database-first for PRDs, handoffs, retrospectives');
    console.log('- Auto-archives violations to prevent clutter');
    console.log('- Tracks agent compliance with database-first approach');
    console.log('- Integrated with all LEO Protocol phases');

  } catch (error) {
    console.error('❌ Error adding DOCMON:', error.message);
  }
}

// Execute
addDocMonSubAgent();