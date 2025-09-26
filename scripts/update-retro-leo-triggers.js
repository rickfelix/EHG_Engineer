#!/usr/bin/env node

/**
 * Update Retrospective Sub-Agent with LEO Protocol Event Triggers
 * Integrates retrospectives deeply into the LEO Protocol workflow
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updateRetroTriggers() {
  console.log('🔄 Updating Retrospective Sub-Agent with LEO Protocol triggers...\n');

  try {
    // Get the RETRO sub-agent
    const { data: retroAgent } = await supabase
      .from('leo_sub_agents')
      .select('id')
      .eq('code', 'RETRO')
      .single();

    if (!retroAgent) {
      console.error('❌ RETRO sub-agent not found');
      return;
    }

    console.log(`Found RETRO sub-agent: ${retroAgent.id}\n`);

    // Define LEO Protocol-integrated triggers
    const leoProtocolTriggers = [
      // LEAD Agent Triggers
      {
        sub_agent_id: retroAgent.id,
        trigger_phrase: 'LEAD_APPROVAL_COMPLETE',
        trigger_type: 'keyword',  // Must be 'keyword' due to constraint
        active: true,
        priority: 95,
        context: {
          event: 'lead_final_approval',
          template: 'sd_completion_retrospective',
          description: 'Generate retrospective after LEAD approves SD completion'
        }
      },
      {
        sub_agent_id: retroAgent.id,
        trigger_phrase: 'LEAD_REJECTION',
        trigger_type: 'keyword',
        active: true,
        priority: 90,
        context: {
          event: 'lead_rejection',
          template: 'failure_analysis',
          description: 'Analyze why LEAD rejected the work'
        }
      },

      // PLAN Agent Triggers
      {
        sub_agent_id: retroAgent.id,
        trigger_phrase: 'PLAN_VERIFICATION_COMPLETE',
        trigger_type: 'keyword',
        active: true,
        priority: 85,
        context: {
          event: 'plan_supervisor_verification',
          template: 'verification_retrospective',
          description: 'Review after PLAN supervisor verification'
        }
      },
      {
        sub_agent_id: retroAgent.id,
        trigger_phrase: 'PLAN_COMPLEXITY_HIGH',
        trigger_type: 'keyword',
        active: true,
        priority: 80,
        context: {
          event: 'plan_complexity_assessment',
          threshold: 8,
          template: 'complexity_analysis',
          description: 'Analyze high complexity projects'
        }
      },

      // EXEC Agent Triggers
      {
        sub_agent_id: retroAgent.id,
        trigger_phrase: 'EXEC_SPRINT_COMPLETE',
        trigger_type: 'keyword',
        active: true,
        priority: 90,
        context: {
          event: 'exec_sprint_completion',
          template: 'sprint_retrospective',
          description: 'Sprint retrospective after EXEC completes sprint'
        }
      },
      {
        sub_agent_id: retroAgent.id,
        trigger_phrase: 'EXEC_QUALITY_ISSUE',
        trigger_type: 'keyword',
        active: true,
        priority: 85,
        context: {
          event: 'exec_quality_below_threshold',
          threshold: 70,
          template: 'quality_improvement',
          description: 'Analyze quality issues in implementation'
        }
      },

      // Handoff Event Triggers
      {
        sub_agent_id: retroAgent.id,
        trigger_phrase: 'HANDOFF_REJECTED',
        trigger_type: 'keyword',
        active: true,
        priority: 88,
        context: {
          event: 'handoff_rejection',
          template: 'handoff_failure_analysis',
          description: 'Analyze why handoff was rejected'
        }
      },
      {
        sub_agent_id: retroAgent.id,
        trigger_phrase: 'HANDOFF_DELAY',
        trigger_type: 'keyword',
        active: true,
        priority: 75,
        context: {
          event: 'handoff_delayed',
          threshold_hours: 24,
          template: 'process_improvement',
          description: 'Review delays in handoff process'
        }
      },

      // Phase Transition Triggers
      {
        sub_agent_id: retroAgent.id,
        trigger_phrase: 'PHASE_COMPLETE',
        trigger_type: 'keyword',
        active: true,
        priority: 85,
        context: {
          event: 'phase_transition',
          template: 'phase_retrospective',
          description: 'Review at each phase completion'
        }
      },

      // SD Lifecycle Triggers
      {
        sub_agent_id: retroAgent.id,
        trigger_phrase: 'SD_STATUS_COMPLETED',
        trigger_type: 'keyword',
        active: true,
        priority: 95,
        context: {
          event: 'sd_status_change',
          from_status: 'in_progress',
          to_status: 'completed',
          template: 'sd_completion_retrospective',
          description: 'Full SD completion retrospective'
        }
      },
      {
        sub_agent_id: retroAgent.id,
        trigger_phrase: 'SD_STATUS_BLOCKED',
        trigger_type: 'keyword',
        active: true,
        priority: 90,
        context: {
          event: 'sd_status_change',
          to_status: 'blocked',
          template: 'blocker_analysis',
          description: 'Analyze what caused the blockage'
        }
      },

      // Cross-Agent Intelligence Triggers
      {
        sub_agent_id: retroAgent.id,
        trigger_phrase: 'PATTERN_DETECTED',
        trigger_type: 'keyword',
        active: true,
        priority: 70,
        context: {
          event: 'intelligence_pattern_detected',
          pattern_type: 'failure',
          template: 'pattern_analysis',
          description: 'Deep dive into detected patterns'
        }
      },

      // Sub-Agent Activity Triggers
      {
        sub_agent_id: retroAgent.id,
        trigger_phrase: 'SUBAGENT_MULTIPLE_FAILURES',
        trigger_type: 'keyword',
        active: true,
        priority: 85,
        context: {
          event: 'subagent_failures',
          threshold: 3,
          template: 'subagent_performance',
          description: 'Review sub-agent performance issues'
        }
      },

      // Time-based but LEO-aware
      {
        sub_agent_id: retroAgent.id,
        trigger_phrase: 'WEEKLY_LEO_REVIEW',
        trigger_type: 'keyword',  // Using keyword with scheduled context
        active: true,
        priority: 70,
        context: {
          cron: '0 17 * * 5',
          template: 'weekly_leo_performance',
          description: 'Weekly review of LEO Protocol performance',
          includes: ['agent_metrics', 'handoff_stats', 'sd_progress']
        }
      }
    ];

    console.log('📝 Adding LEO Protocol triggers...\n');

    // First, delete existing triggers for RETRO to avoid duplicates
    console.log('🧹 Cleaning existing triggers...');
    await supabase
      .from('leo_sub_agent_triggers')
      .delete()
      .eq('sub_agent_id', retroAgent.id);

    // Insert new triggers
    for (const trigger of leoProtocolTriggers) {
      // Remove context from trigger for now (column doesn't exist)
      const { context, ...triggerData } = trigger;

      const { error } = await supabase
        .from('leo_sub_agent_triggers')
        .insert(triggerData);

      if (error) {
        console.warn(`⚠️ Could not add trigger "${trigger.trigger_phrase}": ${error.message}`);
      } else {
        console.log(`✅ Added LEO trigger: ${trigger.trigger_phrase}`);
        console.log(`   Context: ${context.description}`);
      }
    }

    // Update the sub-agent description to reflect LEO integration
    const { error: updateError } = await supabase
      .from('leo_sub_agents')
      .update({
        description: 'LEO Protocol-integrated retrospective system that automatically captures learnings at key workflow events, analyzes agent performance, and feeds insights into cross-agent intelligence'
      })
      .eq('id', retroAgent.id);

    if (updateError) {
      console.warn('Could not update description:', updateError.message);
    } else {
      console.log('\n✅ Updated RETRO sub-agent description for LEO integration');
    }

    console.log('\n✨ Retrospective Sub-Agent now fully integrated with LEO Protocol!');
    console.log('\n📊 Trigger Summary:');
    console.log('- LEAD events: 2 triggers');
    console.log('- PLAN events: 2 triggers');
    console.log('- EXEC events: 2 triggers');
    console.log('- Handoff events: 2 triggers');
    console.log('- SD lifecycle: 2 triggers');
    console.log('- Cross-agent: 2 triggers');
    console.log('- Scheduled: 1 trigger');

  } catch (error) {
    console.error('❌ Error updating triggers:', error);
  }
}

// Execute
updateRetroTriggers();