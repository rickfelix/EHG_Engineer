import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const phase2SD = {
  id: 'SD-VWC-PHASE2-001',
  sd_key: 'VWC-PHASE2-001',
  title: 'Phase 2: Quick Wins & User Guidance',
  version: '1.0',
  status: 'draft',
  category: 'product_feature',
  priority: 'high',
  target_application: 'EHG',
  current_phase: 'PLAN',
  description: 'Add preset selector for workflow configuration (MVP/Standard/Deep/Custom), enhance error recovery messaging with specific guidance, complete accessibility implementation with ARIA labels and screen reader announcements. User guidance improvements with moderate implementation complexity (~650 LOC).',
  strategic_intent: 'Improve usability with preset configurations that reduce cognitive load for Chairman. Provide clearer error messages that guide users to resolution. Ensure full accessibility compliance for inclusive user experience.',
  rationale: 'Chairman needs quick workflow selection without manual tier/stage configuration. Current error messages are generic and unhelpful. Screen reader users cannot effectively use the wizard without proper ARIA labels and announcements.',
  scope: 'PresetSelector component creation, error message enhancement across wizard and intelligence components, ARIA label completion for all form elements, background continuation for interrupted async operations, accessible status announcements.',
  strategic_objectives: [
    'Create PresetSelector component with 4 presets (MVP/Standard/Deep/Custom)',
    'Wire preset selection to automatic tier + stage configuration',
    'Enhance error messages with specific recovery actions (what failed, why, how to fix)',
    'Add background continuation for interrupted async operations',
    'Complete ARIA labels for all form elements (inputs, buttons, selects, cards)',
    'Add form validation error announcements for screen readers',
    'Show operation progress with accessible status updates',
    'Implement graceful error recovery messaging'
  ],
  success_criteria: [
    'PresetSelector displays 4 options with clear tier/stage mapping',
    'MVP preset auto-configures Tier 0 workflow',
    'Standard preset auto-configures Tier 1 workflow',
    'Deep preset auto-configures Tier 2 workflow',
    'Custom preset allows manual tier/stage selection',
    'Error messages show: specific failure point, root cause, recovery steps',
    'Interrupted async operations resume in background without user intervention',
    'All form elements have descriptive ARIA labels',
    'Screen readers announce validation errors immediately',
    'Operation progress updates accessible to assistive technologies',
    'E2E tests verify preset selection flows and error recovery',
    'Accessibility audit passes WCAG 2.1 AA standards'
  ],
  key_changes: [
    'Create PresetSelector.tsx component (~200 LOC) with preset cards',
    'Add preset state management to VentureCreationPage',
    'Enhance error messages in IntelligenceDrawer with actionable guidance',
    'Add background continuation logic to executeWithRetry utility',
    'Add aria-label, aria-describedby to all Card components',
    'Add aria-label to all Input, Button, Select elements',
    'Create announceError utility (~50 LOC) for screen reader announcements',
    'Add aria-live regions for progress announcements',
    'Wire preset selection to tier/stage auto-configuration'
  ],
  key_principles: [
    'Preset UX: Show tier/stage counts, estimated time, quality gate thresholds',
    'Error messages: Specific over generic, actionable over descriptive',
    'Accessibility: WCAG 2.1 AA compliance minimum (targeting AAA where feasible)',
    'Background operations: Never block UI, always show progress indicators',
    'Graceful degradation: Features fail safely without breaking workflow'
  ],
  metadata: {
    parent_sd_id: 'SD-VWC-PARENT-001',
    sequence_order: 2,
    layer: 'user_guidance',
    estimated_effort_hours: '8-10',
    estimated_loc: 650,
    components_to_create: [
      'PresetSelector.tsx (200 LOC) - Card-based preset selection UI',
      'announceError.ts (50 LOC) - Screen reader announcement utility'
    ],
    components_to_modify: [
      'VentureCreationPage.tsx (+150 LOC for preset integration and state management)',
      'IntelligenceDrawer.tsx (+100 LOC for enhanced error messaging)',
      'executeWithRetry.ts (+50 LOC for background continuation)',
      'Multiple components (+100 LOC total for comprehensive ARIA labels)'
    ],
    database_changes: ['None - no new tables required'],
    testing_requirements: {
      e2e: 'Preset selection flows, error recovery scenarios, background continuation',
      unit: 'PresetSelector component, announceError utility',
      accessibility: 'Screen reader testing with NVDA/JAWS, keyboard navigation verification',
      contract: 'Preset configuration shape (tier, stages, quality gates)'
    },
    accessibility_targets: {
      wcag_level: 'AA minimum, AAA target',
      screen_readers: ['NVDA', 'JAWS', 'VoiceOver'],
      keyboard_support: 'Full navigation without mouse',
      aria_coverage: '100% of interactive elements'
    }
  },
  created_by: 'PLAN',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

async function main() {
  console.log('📋 Creating Phase 2 SD:', phase2SD.id);
  console.log('   Sequence: 2 of 4 phases');
  console.log('   Layer:', phase2SD.metadata.layer);
  
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(phase2SD)
    .select()
    .single();
  
  if (error) {
    console.error('❌ Error:', error.message);
    console.error('   Details:', error);
    process.exit(1);
  }
  
  console.log('✅ Phase 2 SD created successfully!');
  console.log('   ID:', data.id);
  console.log('   Title:', data.title);
  console.log('   Priority:', data.priority);
  console.log('   Status:', data.status);
  console.log('   Parent:', phase2SD.metadata.parent_sd_id);
  console.log('   Estimated effort:', phase2SD.metadata.estimated_effort_hours, 'hours');
  console.log('   Estimated LOC:', phase2SD.metadata.estimated_loc);
}

main();
