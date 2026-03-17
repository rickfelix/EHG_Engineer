#!/usr/bin/env node

/**
 * Fix PRD linkage and add EES items for SD-2025-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function fixAndAddEES() {
  console.log('🔧 Fixing PRD and adding EES items...\n');
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  
  try {
    // 1. Fix PRD directive_id
    console.log('Updating PRD directive_id...');
    const { error: updateError } = await supabase
      .from('product_requirements_v2')
      .update({ 
        directive_id: 'SD-2025-001',
        status: 'ready',
        title: 'OpenAI Realtime Voice Technical Implementation',
        executive_summary: 'Technical implementation for consolidating three voice interfaces into single OpenAI Realtime Voice solution using WebRTC, ephemeral tokens, and Supabase Edge Functions.'
      })
      .eq('id', 'PRD-PRD-2025-001');
    
    if (updateError) {
      console.error('❌ Error updating PRD:', updateError.message);
    } else {
      console.log('✅ PRD updated and linked to SD-2025-001');
    }
    
    // 2. Add EES items
    console.log('\nAdding EES items...');
    const eesItems = [
      {
        id: 'EES-2025-001-01',
        directive_id: 'SD-2025-001',
        sequence_number: 1,
        title: 'Infrastructure Setup',
        description: 'Create token generation and state relay Edge Functions, set up database schema',
        status: 'pending',
        phase: 'Implementation',
        phase_description: 'OpenAI Realtime Voice Infrastructure',
        progress: 0,
        deliverables: [
          'Token generation Edge Function',
          'State relay WebSocket',
          'Database schema updates'
        ],
        assigned_to: ['EXEC'],
        dependencies: []
      },
      {
        id: 'EES-2025-001-02', 
        product_requirement_id: 'PRD-PRD-2025-001',
        sequence_order: 2,
        title: 'WebRTC Client Implementation',
        description: 'Build EVAVoiceAssistant React component with WebRTC connection management',
        status: 'pending',
        estimated_hours: 4,
        dependencies: ['EES-2025-001-01']
      },
      {
        id: 'EES-2025-001-03',
        product_requirement_id: 'PRD-PRD-2025-001',
        sequence_order: 3,
        title: 'Function Calling Integration',
        description: 'Implement tool schemas and execution framework for portfolio queries',
        status: 'pending',
        estimated_hours: 3,
        dependencies: ['EES-2025-001-02']
      },
      {
        id: 'EES-2025-001-04',
        product_requirement_id: 'PRD-PRD-2025-001',
        sequence_order: 4,
        title: 'Context & Cost Management',
        description: 'Implement rolling summarization and cost tracking',
        status: 'pending',
        estimated_hours: 2,
        dependencies: ['EES-2025-001-03']
      },
      {
        id: 'EES-2025-001-05',
        product_requirement_id: 'PRD-PRD-2025-001',
        sequence_order: 5,
        title: 'Security Hardening',
        description: 'Add voice prompt injection defense and output filtering',
        status: 'pending',
        estimated_hours: 2,
        dependencies: ['EES-2025-001-04']
      },
      {
        id: 'EES-2025-001-06',
        product_requirement_id: 'PRD-PRD-2025-001',
        sequence_order: 6,
        title: 'Legacy Code Removal',
        description: 'Remove 11Labs components and broken implementations',
        status: 'pending',
        estimated_hours: 1,
        dependencies: ['EES-2025-001-05']
      },
      {
        id: 'EES-2025-001-07',
        product_requirement_id: 'PRD-PRD-2025-001',
        sequence_order: 7,
        title: 'Testing & Verification',
        description: 'Complete unit, integration, and performance testing',
        status: 'pending',
        estimated_hours: 3,
        dependencies: ['EES-2025-001-06']
      }
    ];
    
    for (const ees of eesItems) {
      const { error } = await supabase
        .from('execution_sequences_v2')
        .upsert({
          ...ees,
          created_by: 'PLAN-v4.1',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id'
        });
      
      if (error) {
        console.error(`❌ Error adding ${ees.id}:`, error.message);
      } else {
        console.log(`✅ ${ees.id}: ${ees.title}`);
      }
    }
    
    console.log('\n✅ Database updates complete!');
    console.log('Run: node scripts/verify-database-state.js to confirm');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixAndAddEES();