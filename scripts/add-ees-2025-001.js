#!/usr/bin/env node

/**
 * Add EES items for SD-2025-001 (OpenAI Realtime Voice)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function addEES() {
  console.log('📋 Adding EES items for SD-2025-001...\n');
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  
  const eesItems = [
    {
      id: 'EES-2025-001-01',
      directive_id: 'SD-2025-001',
      sequence_number: 1,
      title: 'Infrastructure Setup',
      description: 'Create token generation and state relay Edge Functions, set up database schema',
      status: 'in_progress',
      phase: 'Phase 1',
      phase_description: 'OpenAI Realtime Infrastructure',
      progress: 0,
      deliverables: [
        'Ephemeral token Edge Function',
        'State relay WebSocket',
        'Conversation storage schema'
      ],
      assigned_to: ['EXEC', 'Security', 'Database'],
      dependencies: [],
      created_by: 'PLAN'
    },
    {
      id: 'EES-2025-001-02',
      directive_id: 'SD-2025-001',
      sequence_number: 2,
      title: 'WebRTC Client Implementation',
      description: 'Build EVAVoiceAssistant React component with WebRTC connection management',
      status: 'in_progress',
      phase: 'Phase 2',
      phase_description: 'Client Implementation',
      progress: 0,
      deliverables: [
        'EVAVoiceAssistant component',
        'WebRTC connection logic',
        'Audio stream handling'
      ],
      assigned_to: ['EXEC', 'Performance'],
      dependencies: ['EES-2025-001-01'],
      created_by: 'PLAN'
    },
    {
      id: 'EES-2025-001-03',
      directive_id: 'SD-2025-001',
      sequence_number: 3,
      title: 'Function Calling Integration',
      description: 'Implement tool schemas and execution framework for portfolio queries',
      status: 'in_progress',
      phase: 'Phase 3',
      phase_description: 'Core Functionality',
      progress: 0,
      deliverables: [
        'Portfolio query tools',
        'Strategic analysis functions',
        'Execution framework'
      ],
      assigned_to: ['EXEC'],
      dependencies: ['EES-2025-001-02'],
      created_by: 'PLAN'
    },
    {
      id: 'EES-2025-001-04',
      directive_id: 'SD-2025-001',
      sequence_number: 4,
      title: 'Context & Cost Management',
      description: 'Implement rolling summarization and cost tracking',
      status: 'in_progress',
      phase: 'Phase 4',
      phase_description: 'Optimization',
      progress: 0,
      deliverables: [
        'Context summarization logic',
        'Cost tracking dashboard',
        'VAD optimization'
      ],
      assigned_to: ['EXEC', 'Performance'],
      dependencies: ['EES-2025-001-03'],
      created_by: 'PLAN'
    },
    {
      id: 'EES-2025-001-05',
      directive_id: 'SD-2025-001',
      sequence_number: 5,
      title: 'Security Hardening',
      description: 'Add voice prompt injection defense and output filtering',
      status: 'in_progress',
      phase: 'Phase 5',
      phase_description: 'Security',
      progress: 0,
      deliverables: [
        'Input classification layer',
        'System prompt hardening',
        'Output filtering'
      ],
      assigned_to: ['EXEC', 'Security'],
      dependencies: ['EES-2025-001-04'],
      created_by: 'PLAN'
    },
    {
      id: 'EES-2025-001-06',
      directive_id: 'SD-2025-001',
      sequence_number: 6,
      title: 'Legacy Code Removal',
      description: 'Remove 11Labs components and broken implementations',
      status: 'in_progress',
      phase: 'Phase 6',
      phase_description: 'Cleanup',
      progress: 0,
      deliverables: [
        'Remove 11Labs dependencies',
        'Delete broken voice components',
        'Clean package.json'
      ],
      assigned_to: ['EXEC'],
      dependencies: ['EES-2025-001-05'],
      created_by: 'PLAN'
    },
    {
      id: 'EES-2025-001-07',
      directive_id: 'SD-2025-001',
      sequence_number: 7,
      title: 'Testing & Verification',
      description: 'Complete unit, integration, and performance testing',
      status: 'in_progress',
      phase: 'Phase 7',
      phase_description: 'Verification',
      progress: 0,
      deliverables: [
        'Unit test suite (>80% coverage)',
        'Integration tests',
        'Performance benchmarks',
        'Security tests'
      ],
      assigned_to: ['EXEC', 'Testing'],
      dependencies: ['EES-2025-001-06'],
      created_by: 'PLAN'
    }
  ];
  
  let successCount = 0;
  
  for (const ees of eesItems) {
    const { error } = await supabase
      .from('execution_sequences_v2')
      .upsert(ees, {
        onConflict: 'id'
      });
    
    if (error) {
      console.error(`❌ Error adding ${ees.id}:`, error.message);
    } else {
      console.log(`✅ ${ees.id}: ${ees.title}`);
      successCount++;
    }
  }
  
  console.log(`\n📊 Summary: ${successCount}/${eesItems.length} EES items added`);
  
  if (successCount === eesItems.length) {
    console.log('✅ All EES items successfully added to database!');
    console.log('\nNext: Run node scripts/verify-database-state.js');
  } else {
    console.log('❌ Some EES items failed to insert');
    process.exit(1);
  }
}

addEES();