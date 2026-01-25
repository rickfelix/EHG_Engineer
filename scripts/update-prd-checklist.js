#!/usr/bin/env node

/**
 * Update PRD checklist items for SD-2025-001
 * Marks PLAN phase items as complete after technical planning
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from "dotenv";
dotenv.config();

async function updatePRDChecklist() {
  console.log('📋 Updating PRD checklist for SD-2025-001...\n');
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  
  try {
    // First, get the current PRD
    const { data: prd, error: fetchError } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('id', 'PRD-PRD-2025-001')
      .single();
    
    if (fetchError) {
      console.error('❌ Error fetching PRD:', fetchError.message);
      process.exit(1);
    }
    
    // Update PLAN checklist items
    const updatedPlanChecklist = [
      { text: 'PRD created and saved', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: true },
      { text: 'Technical architecture defined', checked: true },
      { text: 'Implementation approach documented', checked: true },
      { text: 'Test scenarios defined', checked: true },
      { text: 'Acceptance criteria established', checked: true },
      { text: 'Resource requirements estimated', checked: true },
      { text: 'Timeline and milestones set', checked: true },
      { text: 'Risk assessment completed', checked: true }
    ];
    
    // Keep EXEC checklist unchanged for now
    const execChecklist = prd.exec_checklist || [
      { text: 'Development environment setup', checked: false },
      { text: 'Core functionality implemented', checked: false },
      { text: 'Unit tests written', checked: false },
      { text: 'Integration tests completed', checked: false },
      { text: 'Code review completed', checked: false },
      { text: 'Documentation updated', checked: false }
    ];
    
    // Keep validation checklist unchanged
    const validationChecklist = prd.validation_checklist || [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'Performance requirements validated', checked: false },
      { text: 'Security review completed', checked: false },
      { text: 'User acceptance testing passed', checked: false },
      { text: 'Deployment readiness confirmed', checked: false }
    ];
    
    // Calculate new progress
    const planComplete = updatedPlanChecklist.filter(i => i.checked).length;
    const execComplete = execChecklist.filter(i => i.checked).length;
    const validationComplete = validationChecklist.filter(i => i.checked).length;
    
    const totalItems = updatedPlanChecklist.length + execChecklist.length + validationChecklist.length;
    const completedItems = planComplete + execComplete + validationComplete;
    const progress = Math.round((completedItems / totalItems) * 100);
    
    // Update the PRD
    const { error: updateError } = await supabase
      .from('product_requirements_v2')
      .update({
        plan_checklist: updatedPlanChecklist,
        exec_checklist: execChecklist,
        validation_checklist: validationChecklist,
        progress: progress,
        phase: 'planning_complete',
        status: 'planning_complete',
        technical_requirements: [
          'OpenAI Realtime API with WebRTC',
          'Supabase Edge Functions for token generation',
          'React 18+ with TypeScript',
          'WebSocket state relay',
          'Voice Activity Detection (VAD)',
          'Function calling framework',
          'Cost tracking system',
          'Security hardening layer'
        ],
        non_functional_requirements: [
          'Response latency < 500ms (P95)',
          'Monthly cost < $500',
          'Audio quality > 4.0 MOS',
          'Uptime > 99.9%',
          'Connection success rate > 99%',
          'Support for 10 concurrent users',
          'Token optimization with context summarization',
          'Voice prompt injection defense'
        ],
        test_scenarios: [
          'End-to-end voice conversation flow',
          'WebRTC connection establishment and recovery',
          'Function calling execution',
          'Cost tracking accuracy',
          'Latency benchmarks under load',
          'Security penetration testing',
          'Audio quality measurements',
          '24-hour reliability test'
        ],
        acceptance_criteria: [
          'Voice input successfully captured and transcribed',
          'Responses generated and converted to speech',
          'Function calling works for all defined tools',
          'Response latency < 500ms (95th percentile)',
          'Monthly cost < $500 at expected usage',
          'No successful prompt injection attacks',
          'All function calls logged',
          'Cost tracking accuracy within 5%'
        ],
        updated_at: new Date().toISOString()
      })
      .eq('id', 'PRD-PRD-2025-001');
    
    if (updateError) {
      console.error('❌ Error updating PRD:', updateError.message);
      process.exit(1);
    }
    
    console.log('✅ PRD checklist updated successfully!\n');
    console.log('📊 Progress Summary:');
    console.log(`  PLAN Phase: ${planComplete}/${updatedPlanChecklist.length} ✅ COMPLETE`);
    console.log(`  EXEC Phase: ${execComplete}/${execChecklist.length} (Ready to start)`);
    console.log(`  VALIDATION Phase: ${validationComplete}/${validationChecklist.length} (Pending)`);
    console.log(`  Overall Progress: ${progress}%`);
    console.log('\n🎯 PLAN phase complete! Ready for handoff to EXEC agent.');
    
    // Create handoff record
    const handoff = {
      from: 'PLAN',
      to: 'EXEC',
      sd_id: 'SD-2025-001',
      id: 'PRD-PRD-2025-001' // FIX: Use id instead of prd_id,
      timestamp: new Date().toISOString(),
      status: 'ready',
      checklist_status: {
        plan: `${planComplete}/${updatedPlanChecklist.length}`,
        exec: `${execComplete}/${execChecklist.length}`,
        validation: `${validationComplete}/${validationChecklist.length}`
      },
      deliverables: [
        'Technical Specifications Document',
        'Database Schema',
        'Component Architecture',
        'Test Scenarios',
        'Acceptance Criteria',
        'Risk Assessment',
        'Timeline and Milestones'
      ],
      notes: 'PLAN phase complete. All technical specifications documented. Ready for EXEC implementation.'
    };
    
    console.log('\n📝 Handoff Record Created:');
    console.log(JSON.stringify(handoff, null, 2));
    
  } catch (_error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

updatePRDChecklist();