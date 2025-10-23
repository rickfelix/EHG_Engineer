import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const phase1SD = {
  id: 'SD-VWC-PHASE1-001',
  sd_key: 'VWC-PHASE1-001',
  title: 'Phase 1: Critical UX Blockers & Tier 0 Activation',
  version: '1.0',
  status: 'draft',
  category: 'product_feature',
  priority: 'critical',
  target_application: 'EHG',
  current_phase: 'PLAN',
  description: 'Implement critical missing features: Tier 0 UI with stage gating, inline intelligence integration, GCIA cache refresh, cost/latency transparency, keyboard navigation, error recovery. Unblocks Chairman workflow with essential functionality (~750 LOC).',
  strategic_intent: 'Deliver immediate value by fixing blocking UX gaps. Enable Tier 0 rapid validation, show cost before execution, integrate intelligence into flow, prevent data loss.',
  rationale: 'Chairman cannot use Tier 0 (UI missing), intelligence drawer is disconnected from wizard flow, costs are hidden (violates transparency principle), keyboard users blocked, errors lose draft data. These are production blockers.',
  scope: 'VentureCreationPage modifications, IntelligenceDrawer embedding, TierGraduationModal creation, GCIA controls, cost extraction, error wrappers, keyboard nav, i18n prep.',
  strategic_objectives: [
    'Add Tier 0 button to tier selection UI (algorithm exists, just add UI)',
    'Implement Tier 0 stage gating (cap at Stage 3, prevent progression)',
    'Create TierGraduationModal with ≥85% re-validation required tooltip',
    'Embed IntelligenceDrawer into wizard Steps 2-3 (not separate)',
    'Add GCIA Request fresh scan button with cache age display',
    'Show ETA and cost before GCIA execution',
    'Extract real LLM cost/token data from intelligenceAgents responses',
    'Implement executeWithRetry wrapper for async operations',
    'Add keyboard navigation (Tab, Enter, Escape)',
    'Wrap all UI text in t() for future i18n',
    'Track all interactions via existing activity_logs table'
  ],
  success_criteria: [
    'Tier 0 button visible and functional',
    'Tier 0 ventures cannot progress beyond Stage 3',
    'TierGraduationModal shows at Stage 3 cap',
    'IntelligenceDrawer embedded in Steps 2-3',
    'GCIA shows cache age and refresh option',
    'Cost/ETA displayed before GCIA scan execution',
    'Real cost/token data extracted and displayed (not TODO)',
    'All async operations retry on failure (max 3 attempts)',
    'Full keyboard navigation works',
    'All text wrapped in t() (i18n ready)',
    'Analytics events fire for key interactions',
    'E2E tests pass for Tier 0 full flow'
  ],
  key_changes: [
    'VentureCreationPage.tsx: Add Tier 0 button (lines 607-634 area)',
    'VentureCreationPage.tsx: Add stage gating logic for Tier 0',
    'Create TierGraduationModal.tsx component (~150 LOC)',
    'IntelligenceDrawer.tsx: Embed mode (pass ventureId, autoOpen props)',
    'VentureCreationPage Steps 2-3: Embed IntelligenceDrawer',
    'IntelligenceDrawer.tsx: Add GCIA cache controls (~50 LOC)',
    'intelligenceAgents.ts: Extract cost/tokens from LLM responses',
    'Create executeWithRetry utility (~80 LOC)',
    'Create useKeyboardNav hook (~100 LOC)',
    'Wrap all CardTitle, CardDescription, Button text in t()',
    'Add analytics tracking (activity_logs inserts)'
  ],
  key_principles: [
    'Tier 0 tooltip: Fast sandbox capped at early stages. Promotion requires ≥85% re-validation',
    'GCIA controls: Show cache age, ETA, cost BEFORE execution',
    'Error recovery: Retry with backoff, show user-friendly messages, preserve drafts',
    'Keyboard nav: All interactive elements accessible via keyboard',
    'Analytics: Track without blocking, fail gracefully if table unavailable'
  ],
  metadata: {
    parent_sd_id: 'SD-VWC-PARENT-001',
    sequence_order: 1,
    layer: 'critical_fixes',
    estimated_effort_hours: '10-12',
    estimated_loc: 750,
    components_to_create: [
      'TierGraduationModal.tsx (150 LOC)',
      'executeWithRetry.ts (80 LOC)',
      'useKeyboardNav.ts (100 LOC)'
    ],
    components_to_modify: [
      'VentureCreationPage.tsx (+200 LOC for Tier 0 UI, intelligence embedding, keyboard nav)',
      'IntelligenceDrawer.tsx (+120 LOC for GCIA controls, embed mode)',
      'intelligenceAgents.ts (+50 LOC for cost extraction)'
    ],
    database_changes: ['None - reuse existing activity_logs and venture_augmentation_results tables']
  },
  created_by: 'PLAN',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

async function main() {
  console.log('📋 Creating Phase 1 SD:', phase1SD.id);
  
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(phase1SD)
    .select()
    .single();
  
  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
  
  console.log('✅ Phase 1 SD created successfully!');
  console.log('   ID:', data.id);
  console.log('   Title:', data.title);
  console.log('   Priority:', data.priority);
  console.log('   Status:', data.status);
  console.log('   Parent:', phase1SD.metadata.parent_sd_id);
}

main();
