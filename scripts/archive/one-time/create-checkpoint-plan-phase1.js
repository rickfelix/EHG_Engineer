#!/usr/bin/env node

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function createCheckpointPlan() {
  // Create checkpoint plan for 11-story SD
  const checkpointPlan = {
    total_stories: 11,
    total_estimated_hours: 24,
    checkpoints: [
      {
        id: 'CP1',
        name: 'Database & Infrastructure',
        description: 'Database triggers, async utilities, i18n setup',
        user_story_ids: [
          'b337685c-493b-4994-895c-776a5878d7ad', // US-002: Tier 0 stage gating
          'ff32aa8a-e270-453e-b9f9-a0add61e0525'  // US-008: executeWithRetry wrapper
        ],
        estimated_hours: 6,
        dependencies: [],
        deliverables: [
          'prevent_tier0_stage_progression trigger',
          'executeWithRetry utility',
          'react-i18next infrastructure'
        ]
      },
      {
        id: 'CP2',
        name: 'Intelligence Integration',
        description: 'GCIA cost extraction, cache age, ETA estimation',
        user_story_ids: [
          '45d198eb-9069-4087-bb26-fd08a83246bb', // US-007: LLM cost/token extraction
          '68f9e2b6-bfb7-497e-82c0-b530a572a261', // US-005: GCIA fresh scan + cache age
          'aeb0c041-4ed4-4264-9cfe-3c92b0b04273'  // US-006: ETA and cost before execution
        ],
        estimated_hours: 6,
        dependencies: ['CP1'],
        deliverables: [
          'Cost extraction from OpenAI responses',
          'Cache age calculation service',
          'ETA estimation function',
          'Fresh scan button UI'
        ]
      },
      {
        id: 'CP3',
        name: 'Component Integration',
        description: 'Embed drawer, trigger modal, keyboard nav',
        user_story_ids: [
          '4ac26d8b-6ae5-4949-91df-820b0549d744', // US-004: Embed IntelligenceDrawer
          'b562c0d1-3eca-4813-ac7c-0b9a3ae55703', // US-003: TierGraduationModal trigger
          '281279f8-d5ee-4291-8d08-f805b523efd5'  // US-009: Keyboard navigation
        ],
        estimated_hours: 8,
        dependencies: ['CP2'],
        deliverables: [
          'IntelligenceDrawer embedded in Steps 2-3',
          'TierGraduationModal trigger logic',
          'Enhanced keyboard shortcuts (Ctrl+Enter)'
        ]
      },
      {
        id: 'CP4',
        name: 'i18n & Testing',
        description: 'Localization wrapper and comprehensive testing',
        user_story_ids: [
          '64a06bb0-1bab-467f-b1a4-a44f655c5d9e', // US-010: Wrap UI text in t()
          'e14eaf3c-2580-4d09-8aaa-489445a97d3c'  // US-011: Activity logging
        ],
        estimated_hours: 4,
        dependencies: ['CP3'],
        deliverables: [
          'All wizard text wrapped in t()',
          'en.json translation file',
          'Activity logging verified',
          '11 E2E tests created',
          'Unit tests for new utilities'
        ]
      }
    ],
    validation_strategy: 'Checkpoint validation: Each CP requires tests passing before next. Final: all 11 user stories validated, E2E suite green, retrospective ≥70.',
    risk_mitigation: 'CP1 blockers halt workflow; CP2 can fallback to estimated costs; CP3 can use feature flags; CP4 i18n can be wrapped incrementally.'
  };

  // Update PRD with checkpoint plan
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('id, metadata')
    .eq('sd_id', 'SD-VWC-PHASE1-001')
    .single();

  if (!prd) {
    console.log('❌ PRD not found');
    process.exit(1);
  }

  const updatedMetadata = {
    ...(prd.metadata || {}),
    checkpoint_plan: checkpointPlan
  };

  const { error } = await supabase
    .from('product_requirements_v2')
    .update({ metadata: updatedMetadata })
    .eq('id', prd.id);

  if (error) {
    console.log('❌ Error updating PRD:', error.message);
    process.exit(1);
  }

  console.log('✅ Checkpoint plan created and stored in PRD');
  console.log('');
  console.log('📋 CHECKPOINT PLAN SUMMARY:');
  console.log('   Total Stories: 11');
  console.log('   Total Hours: 24');
  console.log('   Checkpoints: 4');
  console.log('');
  checkpointPlan.checkpoints.forEach(cp => {
    console.log(`   ${cp.id}: ${cp.name}`);
    console.log(`      Stories: ${cp.user_story_ids.length}`);
    console.log(`      Hours: ${cp.estimated_hours}`);
    console.log(`      Dependencies: ${cp.dependencies.length > 0 ? cp.dependencies.join(', ') : 'None'}`);
  });
}

createCheckpointPlan().catch(console.error);
