#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';





/**
 * LEAD Agent: Create Strategic Directive for SDIP
 * Following LEO Protocol v4.1.2_database_first
 */

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createSDIPStrategicDirective() {
  console.log('🎯 LEAD Agent: Creating Strategic Directive for SDIP');
  console.log('================================================');
  
  const sdId = 'SD-2025-0903-SDIP';
  const now = new Date().toISOString();

  // Strategic Directive data (database-first, no files)
  // Using actual schema from strategic_directives_v2 table
  const strategicDirective = {
    id: sdId,
    title: 'Strategic Directive Initiation Protocol (SDIP) - MVP+ Implementation',
    version: '1.0',
    status: 'active',
    category: 'product_feature', // Required field
    priority: 'high',
    description: 'Implement a comprehensive validation workflow for Strategic Directive creation in the EHG_Engineer dashboard. This feature will transform raw Chairman feedback into properly validated and structured Strategic Directives through a 6-step validation process.',
    strategic_intent: 'Transform unstructured Chairman feedback into validated, actionable Strategic Directives through systematic validation workflow',
    rationale: 'Chairman requires efficient method to create Strategic Directives from raw feedback. Current ad-hoc process lacks validation and consistency.',
    scope: 'EHG_Engineer Dashboard Enhancement - Directive Lab Feature',
    
    // Using JSONB columns that actually exist in the schema
    strategic_objectives: [
      'Enable Chairman to create Strategic Directives from raw feedback',
      'Ensure consistent validation and quality control',
      'Reduce directive creation time from hours to minutes',
      'Maintain audit trail and compliance with Mission v3 standards',
      'Improve clarity and actionability of Strategic Directives'
    ],
    
    success_criteria: [
      'Chairman can complete full workflow in <10 minutes',
      'All validation gates enforced without bypassing',
      'Intent confirmation accuracy >85%',
      'Strategic/Tactical classification accuracy >80%',
      'Client summaries understood by executives without technical background'
    ],
    
    key_changes: [
      'Add new Directive Lab tab to dashboard',
      'Implement 6-step validation workflow',
      'Create SDIP database tables',
      'Build critical mode analyzer',
      'Integrate with existing SD creation flow'
    ],
    
    key_principles: [
      'Database-first approach (no files)',
      'Mandatory validation gates',
      'Critical mode analysis only',
      'PACER backend-only',
      'Step-driven UI (accordion style)'
    ],
    
    metadata: {
      created_by: 'LEAD',
      created_at: now,
      protocol_version: 'v4.1.2_database_first',
      source: 'Chairman feedback brainstorming session',
      complexity: 'HIGH',
      strategic_percentage: 70,
      tactical_percentage: 30,
      timeline: {
        start_date: now,
        target_completion: '2025-09-18',
        phases: {
          backend: '5 days',
          frontend: '5 days',
          integration: '5 days'
        }
      },
      stakeholders: {
        primary: 'Chairman (primary user)',
        secondary: ['LEAD Agent', 'PLAN Agent', 'Executive team'],
        technical: ['Development team', 'Sub-agents']
      },
      constraints: [
        'Must integrate with existing LEO Protocol dashboard',
        'Critical mode only (no supportive mode in MVP+)',
        'PACER analysis backend-only (not displayed)',
        'All 6 validation gates are mandatory',
        'Must use existing Supabase infrastructure'
      ]
    },
    
    created_by: 'LEAD',
    created_at: now
  };

  // Insert into database (no files per protocol)
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(strategicDirective)
    .select()
    .single();

  if (error) {
    console.error('❌ Failed to create Strategic Directive:', error);
    return;
  }

  console.log('✅ Strategic Directive created successfully');
  console.log('📄 SD ID:', sdId);
  console.log('🎯 Title:', strategicDirective.title);
  console.log('📊 Status:', strategicDirective.status);
  console.log('⚡ Priority:', strategicDirective.priority);
  
  console.log('\n📋 Strategic Objectives:');
  strategicDirective.strategic_objectives.forEach((obj, i) => {
    console.log(`   ${i + 1}. ${obj}`);
  });
  
  console.log('\n✅ Success Criteria:');
  strategicDirective.success_criteria.forEach((criteria, i) => {
    console.log(`   ${i + 1}. ${criteria}`);
  });
  
  console.log('\n🔄 Key Changes:');
  strategicDirective.key_changes.forEach((change, i) => {
    console.log(`   ${i + 1}. ${change}`);
  });
  
  console.log('\n⚠️  Constraints:');
  strategicDirective.metadata.constraints.forEach((constraint, i) => {
    console.log(`   ${i + 1}. ${constraint}`);
  });
  
  console.log('\n📅 Timeline:');
  console.log(`   Start: ${strategicDirective.metadata.timeline.start_date}`);
  console.log(`   Target: ${strategicDirective.metadata.timeline.target_completion}`);
  console.log(`   Backend: ${strategicDirective.metadata.timeline.phases.backend}`);
  console.log(`   Frontend: ${strategicDirective.metadata.timeline.phases.frontend}`);
  console.log(`   Integration: ${strategicDirective.metadata.timeline.phases.integration}`);
  
  // Create handoff record
  const handoff = {
    id: `HANDOFF-${sdId}-LEAD-TO-PLAN`,
    from_agent: 'LEAD',
    to_agent: 'PLAN',
    document_id: sdId,
    document_type: 'strategic_directive',
    status: 'pending',
    
    handoff_checklist: {
      executive_summary: true,
      completeness_report: true,
      deliverables_manifest: true,
      key_decisions: true,
      known_issues: true,
      resource_utilization: true,
      action_items: true
    },
    
    executive_summary: 'SDIP is a comprehensive validation workflow for Strategic Directive creation. Chairman needs ability to transform feedback into validated SDs through 6-step process. MVP+ includes full validation features with mandatory gates.',
    
    completeness_report: {
      objectives_defined: true,
      success_criteria_established: true,
      constraints_identified: true,
      timeline_set: true,
      stakeholders_identified: true
    },
    
    deliverables_manifest: [
      'Strategic Directive (this document)',
      'Business objectives and success criteria',
      'Timeline and resource requirements',
      'Constraint definitions'
    ],
    
    key_decisions: {
      'MVP+ Scope': 'Full validation features, not barebones MVP',
      'Critical Mode': 'Default to critical analysis only',
      'PACER': 'Backend-only, not displayed in UI',
      'Validation': 'All 6 gates mandatory, no bypassing',
      'UI': 'Step-driven accordion interface'
    },
    
    known_issues: [
      'OpenAI dependency for intelligent analysis',
      '15-day timeline is aggressive',
      'Complex UI with 6-step validation'
    ],
    
    resource_utilization: {
      estimated_effort: '15 person-days',
      required_skills: ['React', 'Node.js', 'Supabase', 'AI/LLM integration'],
      budget_estimate: 'Standard development budget'
    },
    
    action_items: [
      'Create Product Requirements Document (PRD)',
      'Define technical architecture',
      'Identify sub-agent responsibilities',
      'Create Execution Enhancement Sequences (EES)'
    ],
    
    created_at: now
  };

  // Insert handoff record
  const { data: handoffData, error: handoffError } = await supabase
    .from('leo_handoffs')
    .insert(handoff)
    .select()
    .single();

  if (handoffError) {
    console.error('⚠️  Warning: Failed to create handoff record:', handoffError);
  } else {
    console.log('\n✅ Handoff record created');
    console.log('📤 From: LEAD');
    console.log('📥 To: PLAN');
    console.log('📄 Handoff ID:', handoff.id);
  }

  // Update LEO status
  const { error: statusError } = await supabase
    .from('leo_status')
    .upsert({
      id: 'current',
      active_role: 'PLAN',
      current_sd: sdId,
      phase: 'planning',
      last_updated: now
    });

  if (statusError) {
    console.error('⚠️  Warning: Failed to update LEO status:', statusError);
  } else {
    console.log('\n🔄 LEO Protocol status updated');
    console.log('👤 Active Role: PLAN');
    console.log('📊 Phase: Planning');
  }

  console.log('\n' + '='.repeat(50));
  console.log('🎯 LEAD Phase Complete (20% of workflow)');
  console.log('➡️  Handoff to PLAN Agent ready');
  console.log('📋 Next: PLAN creates PRD and technical specifications');
  console.log('='.repeat(50));
}

// Execute
createSDIPStrategicDirective().catch(console.error);
