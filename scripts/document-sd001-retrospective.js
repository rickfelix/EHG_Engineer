#!/usr/bin/env node

/**
 * Document SD-001 Sub-Agent Activation Failure Retrospective
 * Records lessons learned from failed sub-agent activation
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function documentSD001Retrospective() {
  console.log('📝 Documenting SD-001 Sub-Agent Activation Retrospective');
  console.log('=' .repeat(60));

  // Create the retrospective record
  const retrospectiveData = {
    title: 'SD-001 Sub-Agent Activation Failure - Mid-Sprint Retrospective',
    description: 'Critical retrospective on failure to activate sub-agents during SD-001 implementation',
    retro_type: 'INCIDENT',
    sd_id: 'SD-001',
    sprint_number: 1,
    project_name: 'AI Agents: CrewAI-Style Dashboard',
    conducted_date: new Date(),
    period_start: new Date('2025-09-24T00:00:00Z'),
    period_end: new Date(),

    what_went_well: [
      {
        text: 'Successfully identified database separation issue and found EHG credentials',
        category: 'discovery'
      },
      {
        text: 'Created comprehensive database schema for business agents',
        category: 'implementation'
      },
      {
        text: 'Eventually activated all required sub-agents after user prompt',
        category: 'recovery'
      },
      {
        text: 'Established clear sub-agent working directory architecture',
        category: 'architecture'
      }
    ],

    what_needs_improvement: [
      {
        text: 'PLAN agent failed to activate VALIDATION, DATABASE, SECURITY, DESIGN sub-agents before creating PRD',
        category: 'process'
      },
      {
        text: 'EXEC agent skipped all sub-agents until explicitly prompted by user',
        category: 'process'
      },
      {
        text: 'No automatic enforcement mechanism for sub-agent activation',
        category: 'automation'
      },
      {
        text: 'Agents confused about their roles - not orchestrating, just executing',
        category: 'understanding'
      },
      {
        text: 'No pre-handoff validation checklist for sub-agent activation',
        category: 'validation'
      }
    ],

    key_learnings: [
      {
        text: 'Sub-agent activation must be MANDATORY, not optional - agents will skip them otherwise',
        category: 'process'
      },
      {
        text: 'Database separation between EHG and EHG_ENGINEER is critical for proper SD execution',
        category: 'technical'
      },
      {
        text: 'Sub-agents need explicit context about target_application to work in correct directories',
        category: 'technical'
      },
      {
        text: 'User intervention was required to catch missing sub-agent activation - automation needed',
        category: 'process'
      }
    ],

    quality_score: 60, // Low due to sub-agent activation failures
    objectives_met: false, // Still in progress
    on_schedule: false, // Delayed due to rework
    business_value_delivered: 'Partial - database schema created but dashboard not implemented',
    agents_involved: ['LEAD', 'PLAN', 'EXEC'],

    success_patterns: ['discovery', 'recovery', 'architecture-clarity'],
    failure_patterns: ['sub-agent-skip', 'role-confusion', 'missing-automation'],
    improvement_areas: ['sub-agent-enforcement', 'pre-handoff-validation', 'agent-orchestration'],

    generated_by: 'SUB_AGENT',
    trigger_event: 'user_requested_retrospective',
    status: 'PUBLISHED'
  };

  // Insert the retrospective
  const { data: retrospective, error: retroError } = await supabase
    .from('retrospectives')
    .insert(retrospectiveData)
    .select()
    .single();

  if (retroError) {
    console.error('❌ Failed to create retrospective:', retroError);
    return;
  }

  console.log('✅ Retrospective created:', retrospective.id);

  // Create insights
  const insights = [
    {
      retrospective_id: retrospective.id,
      insight_type: 'FAILURE_MODE',
      title: 'Sub-Agent Activation Bypass Pattern',
      description: 'Both PLAN and EXEC agents bypassed sub-agent activation despite protocol requirements',
      impact_level: 'CRITICAL',
      confidence_score: 95,
      is_actionable: true,
      affects_agents: ['PLAN', 'EXEC'],
      recommended_actions: [{
        action: 'Implement mandatory sub-agent activation checkpoints',
        assignTo: 'SYSTEM'
      }],
      relates_to_patterns: ['sub-agent-skip']
    },
    {
      retrospective_id: retrospective.id,
      insight_type: 'PROCESS_IMPROVEMENT',
      title: 'Missing Enforcement Mechanisms',
      description: 'No automated enforcement exists for sub-agent activation requirements',
      impact_level: 'HIGH',
      confidence_score: 100,
      is_actionable: true,
      affects_agents: ['ALL'],
      recommended_actions: [{
        action: 'Create enforce-subagent-gates.js script',
        assignTo: 'EXEC'
      }],
      relates_to_patterns: ['missing-automation']
    },
    {
      retrospective_id: retrospective.id,
      insight_type: 'TECHNICAL_LEARNING',
      title: 'Database Separation Critical for SD Execution',
      description: 'SDs with target_application field require correct database context',
      impact_level: 'HIGH',
      confidence_score: 100,
      is_actionable: false,
      affected_areas: ['database', 'architecture']
    },
    {
      retrospective_id: retrospective.id,
      insight_type: 'BUSINESS_LEARNING',
      title: 'User Intervention Required for Quality',
      description: 'Without user prompting, critical quality steps are skipped',
      impact_level: 'CRITICAL',
      confidence_score: 90,
      is_actionable: true,
      recommended_actions: [{
        action: 'Build autonomous quality gates',
        assignTo: 'SYSTEM'
      }]
    }
  ];

  // Insert insights
  const { error: insightError } = await supabase
    .from('retrospective_insights')
    .insert(insights);

  if (insightError) {
    console.error('⚠️ Warning: Failed to insert insights:', insightError);
  } else {
    console.log(`✅ Created ${insights.length} insights`);
  }

  // Create action items
  const actionItems = [
    {
      retrospective_id: retrospective.id,
      action_title: 'Create sub-agent activation tracking table',
      action_description: 'Track when sub-agents are activated for each SD',
      priority: 'HIGH',
      assigned_to: 'EXEC',
      status: 'IN_PROGRESS',
      due_date: new Date(Date.now() + 24 * 60 * 60 * 1000) // Tomorrow
    },
    {
      retrospective_id: retrospective.id,
      action_title: 'Implement pre-handoff validation script',
      action_description: 'Validate sub-agent activation before allowing handoffs',
      priority: 'HIGH',
      assigned_to: 'EXEC',
      status: 'PENDING',
      due_date: new Date(Date.now() + 48 * 60 * 60 * 1000) // 2 days
    },
    {
      retrospective_id: retrospective.id,
      action_title: 'Update CLAUDE.md with mandatory checkpoints',
      action_description: 'Document mandatory sub-agent activation requirements',
      priority: 'MEDIUM',
      assigned_to: 'EXEC',
      status: 'COMPLETED',
      completed_date: new Date()
    },
    {
      retrospective_id: retrospective.id,
      action_title: 'Resume SD-001 with proper sub-agent tracking',
      action_description: 'Continue implementation with all sub-agents properly activated',
      priority: 'HIGH',
      assigned_to: 'EXEC',
      status: 'PENDING',
      due_date: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  ];

  // Insert action items
  const { error: actionError } = await supabase
    .from('retrospective_action_items')
    .insert(actionItems);

  if (actionError) {
    console.error('⚠️ Warning: Failed to insert action items:', actionError);
  } else {
    console.log(`✅ Created ${actionItems.length} action items`);
  }

  // Link to cross-agent intelligence
  const intelligenceData = {
    agent_code: 'RETRO',
    event_type: 'retrospective_completed',
    event_description: 'SD-001 sub-agent activation failure analysis',
    decision_made: 'Mandatory enforcement mechanisms required',
    confidence_level: 95,
    metadata: {
      retrospective_id: retrospective.id,
      sd_id: 'SD-001',
      failure_type: 'sub-agent-activation',
      severity: 'critical'
    },
    patterns_identified: ['sub-agent-skip', 'role-confusion', 'missing-automation'],
    success: true
  };

  const { error: intelligenceError } = await supabase
    .from('agent_events')
    .insert(intelligenceData);

  if (!intelligenceError) {
    console.log('✅ Linked to cross-agent intelligence system');
  }

  // Summary
  console.log('\n📊 Retrospective Summary:');
  console.log('=' .repeat(40));
  console.log(`ID: ${retrospective.id}`);
  console.log(`Type: ${retrospectiveData.retro_type}`);
  console.log(`Quality Score: ${retrospectiveData.quality_score}/100`);
  console.log(`What Went Well: ${retrospectiveData.what_went_well.length} items`);
  console.log(`Needs Improvement: ${retrospectiveData.what_needs_improvement.length} items`);
  console.log(`Key Learnings: ${retrospectiveData.key_learnings.length}`);
  console.log(`Insights Generated: ${insights.length}`);
  console.log(`Action Items Created: ${actionItems.length}`);
  console.log('\n🎯 Next Steps:');
  console.log('1. Create sub-agent activation tracking table');
  console.log('2. Implement pre-handoff validation');
  console.log('3. Resume SD-001 with proper tracking');
}

documentSD001Retrospective().catch(console.error);