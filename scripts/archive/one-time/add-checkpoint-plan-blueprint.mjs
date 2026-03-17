#!/usr/bin/env node

/**
 * Add Checkpoint Plan to PRD-SD-BLUEPRINT-ENGINE-001
 * Addresses BMAD validation failure: checkpoint plan missing for large SD (10 stories)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const checkpointPlan = {
  total_stories: 10,
  total_story_points: 63,
  checkpoints: [
    {
      id: 'CP-1',
      name: 'Foundation Complete',
      description: 'Core blueprint display and browse functionality',
      target_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      stories: ['BLUEPRINT-ENGINE-001:US-001', 'BLUEPRINT-ENGINE-001:US-002'],
      story_points: 8,
      acceptance_criteria: [
        'Blueprint grid renders with real data from opportunity_blueprints table',
        'Category/tag filtering works with URL state sync',
        'Mobile responsive layout confirmed'
      ],
      gate_requirements: ['Unit tests pass', 'Visual review approved']
    },
    {
      id: 'CP-2',
      name: 'Scoring Engine Live',
      description: 'Capability and portfolio alignment scoring visible in UI',
      target_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      stories: ['BLUEPRINT-ENGINE-001:US-003', 'BLUEPRINT-ENGINE-001:US-004'],
      story_points: 16,
      acceptance_criteria: [
        'Capability alignment score computed and displayed',
        'Portfolio synergy score visible on blueprint cards',
        'Score breakdown tooltip functional'
      ],
      gate_requirements: ['CrewAI integration verified', 'Performance <500ms per score']
    },
    {
      id: 'CP-3',
      name: 'User Interaction Complete',
      description: 'Preview, selection, and transition to Stage 2 working',
      target_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      stories: ['BLUEPRINT-ENGINE-001:US-005', 'BLUEPRINT-ENGINE-001:US-006', 'BLUEPRINT-ENGINE-001:US-007'],
      story_points: 13,
      acceptance_criteria: [
        'Scaffold preview modal shows detailed blueprint structure',
        'Blueprint selection creates venture with proper stage transition',
        'Signal capture preview visible before selection'
      ],
      gate_requirements: ['E2E test for selection flow', 'Stage transition verified']
    },
    {
      id: 'CP-4',
      name: 'Learning Signals & Crew Integration',
      description: 'Full CrewAI integration with learning loop',
      target_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      stories: ['BLUEPRINT-ENGINE-001:US-008', 'BLUEPRINT-ENGINE-001:US-009', 'BLUEPRINT-ENGINE-001:US-010'],
      story_points: 26,
      acceptance_criteria: [
        'Selection/rejection signals captured to database',
        'Portfolio synergy analyzer integrated with blueprint cards',
        'Blueprint Assessment Crew deployed and callable from UI'
      ],
      gate_requirements: ['Full E2E suite passes', 'Performance benchmarks met', 'UAT approval']
    }
  ],
  risk_mitigation: {
    schedule_buffer: '20% buffer built into estimates',
    fallback_plan: 'CP-4 can be deferred if core functionality (CP-1-3) needs more time',
    dependencies: ['CrewAI agent platform must be accessible', 'Database migrations applied']
  },
  success_metrics: [
    { metric: 'Checkpoint on-time delivery', target: '80% of checkpoints hit target date' },
    { metric: 'Story point velocity', target: '15-20 points per sprint' },
    { metric: 'Defect rate', target: '<2 bugs per checkpoint' }
  ]
};

async function addCheckpointPlan() {
  console.log('\n📋 Adding Checkpoint Plan to PRD');
  console.log('='.repeat(60));

  // Get current PRD
  const { data: prd, error: fetchError } = await supabase
    .from('product_requirements_v2')
    .select('id, metadata')
    .eq('id', 'PRD-SD-BLUEPRINT-ENGINE-001')
    .single();

  if (fetchError) {
    console.error('❌ Error fetching PRD:', fetchError.message);
    process.exit(1);
  }

  console.log('✅ Found PRD:', prd.id);

  // Update PRD with checkpoint plan in metadata
  const updatedMetadata = {
    ...(prd.metadata || {}),
    checkpoint_plan: checkpointPlan
  };

  const { error: updateError } = await supabase
    .from('product_requirements_v2')
    .update({
      metadata: updatedMetadata,
      updated_at: new Date().toISOString()
    })
    .eq('id', 'PRD-SD-BLUEPRINT-ENGINE-001');

  if (updateError) {
    console.error('❌ Error updating PRD:', updateError.message);
    process.exit(1);
  }

  console.log('✅ Checkpoint plan added to PRD metadata');
  console.log('\n📊 Checkpoint Summary:');
  checkpointPlan.checkpoints.forEach(cp => {
    console.log(`   ${cp.id}: ${cp.name}`);
    console.log(`      Stories: ${cp.stories.length} | Points: ${cp.story_points}`);
    console.log(`      Target: ${cp.target_date}`);
  });

  console.log('\n✅ BMAD checkpoint plan requirement satisfied');
}

addCheckpointPlan().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
