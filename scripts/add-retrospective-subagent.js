#!/usr/bin/env node

/**
 * Add Retrospective Sub-Agent to LEO Protocol System
 * This script adds the RETRO sub-agent to the database with appropriate triggers
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function addRetrospectiveSubAgent() {
  console.log('🔄 Adding Retrospective Sub-Agent to LEO system...\n');

  try {
    // 1. Insert the Retrospective Sub-Agent (let database generate UUID)
    const subAgent = {
      name: 'Retrospective Sub-Agent',
      code: 'RETRO',
      description: 'Automatically generates retrospectives, extracts learnings, and feeds insights into cross-agent intelligence system',
      activation_type: 'automatic',
      priority: 85,
      context_file: 'retrospective-context.md',
      script_path: 'scripts/retrospective-sub-agent.js',
      active: true
    };

    const { data: subAgentData, error: subAgentError } = await supabase
      .from('leo_sub_agents')
      .insert(subAgent)
      .select()
      .single();

    if (subAgentError) {
      if (subAgentError.message.includes('duplicate')) {
        console.log('ℹ️ Retrospective Sub-Agent already exists, updating...');
        const { data: updateData, error: updateError } = await supabase
          .from('leo_sub_agents')
          .update(subAgent)
          .eq('code', 'RETRO')
          .select()
          .single();

        if (updateError) throw updateError;
        console.log('✅ Updated existing Retrospective Sub-Agent');
      } else {
        throw subAgentError;
      }
    } else {
      console.log('✅ Created Retrospective Sub-Agent');
    }

    // Get the sub-agent ID that was created
    const subAgentId = subAgentData?.id || subAgentData?.id;
    console.log(`Sub-agent ID: ${subAgentId}`);

    // 2. Add Sub-Agent Triggers
    const triggers = [
      {
        sub_agent_id: subAgentId,
        trigger_phrase: 'sprint completed',
        trigger_type: 'event',
        active: true,
        priority: 90,
        context: { auto_generate: true, template: 'sprint_retrospective' }
      },
      {
        sub_agent_id: subAgentId,
        trigger_phrase: 'SD completed',
        trigger_type: 'event',
        active: true,
        priority: 95,
        context: { auto_generate: true, template: 'sd_completion_retrospective' }
      },
      {
        sub_agent_id: subAgentId,
        trigger_phrase: 'retrospective',
        trigger_type: 'keyword',
        active: true,
        priority: 85,
        context: { manual_trigger: true }
      },
      {
        sub_agent_id: subAgentId,
        trigger_phrase: 'lessons learned',
        trigger_type: 'keyword',
        active: true,
        priority: 80,
        context: { extract_learnings: true }
      },
      {
        sub_agent_id: subAgentId,
        trigger_phrase: 'what went wrong',
        trigger_type: 'keyword',
        active: true,
        priority: 85,
        context: { focus: 'failures' }
      },
      {
        sub_agent_id: subAgentId,
        trigger_phrase: 'post-mortem',
        trigger_type: 'keyword',
        active: true,
        priority: 90,
        context: { template: 'incident' }
      },
      {
        sub_agent_id: subAgentId,
        trigger_phrase: 'milestone achieved',
        trigger_type: 'event',
        active: true,
        priority: 75,
        context: { template: 'milestone' }
      },
      {
        sub_agent_id: subAgentId,
        trigger_phrase: 'weekly review',
        trigger_type: 'schedule',
        active: true,
        priority: 70,
        context: { template: 'weekly', cron: '0 17 * * 5' } // Every Friday at 5 PM
      }
    ];

    // Insert triggers
    for (const trigger of triggers) {
      const { error: triggerError } = await supabase
        .from('leo_sub_agent_triggers')
        .upsert(trigger, { onConflict: ['sub_agent_id', 'trigger_phrase'] });

      if (triggerError) {
        console.warn(`⚠️ Warning: Could not add trigger "${trigger.trigger_phrase}":`, triggerError.message);
      } else {
        console.log(`✅ Added trigger: "${trigger.trigger_phrase}"`);
      }
    }

    // 3. Add Sub-Agent to Handoff Rules
    const handoffRules = [
      {
        from_agent: 'EXEC',
        to_agent: 'RETRO',
        condition_type: 'status_change',
        condition_details: { status: 'completed', entity: 'sprint' },
        priority: 85,
        description: 'Trigger retrospective when EXEC completes a sprint'
      },
      {
        from_agent: 'LEAD',
        to_agent: 'RETRO',
        condition_type: 'approval',
        condition_details: { approval_type: 'final', result: 'approved' },
        priority: 90,
        description: 'Generate retrospective after LEAD final approval'
      },
      {
        from_agent: 'PLAN',
        to_agent: 'RETRO',
        condition_type: 'milestone',
        condition_details: { milestone: 'verification_complete' },
        priority: 80,
        description: 'Create retrospective after PLAN verification'
      }
    ];

    for (const rule of handoffRules) {
      const { error: ruleError } = await supabase
        .from('leo_handoff_rules')
        .upsert(rule, { onConflict: ['from_agent', 'to_agent', 'condition_type'] });

      if (ruleError) {
        console.warn(`⚠️ Note: Handoff rules table may not exist:`, ruleError.message);
      } else {
        console.log(`✅ Added handoff rule: ${rule.from_agent} → ${rule.to_agent}`);
      }
    }

    // 4. Create retrospective trigger configurations
    const retroTriggers = [
      {
        trigger_name: 'auto_sprint_completion',
        trigger_type: 'EVENT',
        event_conditions: {
          entity: 'sprint',
          status_change: 'completed',
          auto_generate: true
        },
        auto_generate: true,
        requires_approval: false,
        is_active: true
      },
      {
        trigger_name: 'auto_sd_completion',
        trigger_type: 'EVENT',
        event_conditions: {
          entity: 'strategic_directive',
          status_change: 'completed',
          auto_generate: true
        },
        auto_generate: true,
        requires_approval: false,
        is_active: true
      },
      {
        trigger_name: 'weekly_scheduled',
        trigger_type: 'SCHEDULE',
        schedule_cron: '0 17 * * 5', // Every Friday at 5 PM
        auto_generate: true,
        requires_approval: true,
        is_active: true
      },
      {
        trigger_name: 'high_bug_threshold',
        trigger_type: 'THRESHOLD',
        threshold_conditions: {
          metric: 'bugs_count',
          operator: '>',
          value: 10,
          window: '7d'
        },
        auto_generate: true,
        requires_approval: true,
        is_active: true
      }
    ];

    // Note: These would be inserted into retrospective_triggers table
    // which gets created by the migration script
    console.log('\n📝 Retrospective triggers configured (will be active after migration)');

    console.log('\n✨ Retrospective Sub-Agent successfully added to LEO system!');
    console.log('\nNext steps:');
    console.log('1. Run the database migration: node scripts/execute-ddl-migration.js database/migrations/2025-09-24-retrospective-system.sql');
    console.log('2. Migrate existing retrospectives: node scripts/migrate-retrospectives-to-db.js');
    console.log('3. Update CLAUDE.md: node scripts/generate-claude-md-from-db.js');

  } catch (error) {
    console.error('❌ Error adding Retrospective Sub-Agent:', error);
    process.exit(1);
  }
}

// Execute
addRetrospectiveSubAgent();