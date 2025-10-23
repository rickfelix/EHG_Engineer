import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const parentSD = {
  id: 'SD-VWC-PARENT-001',
  sd_key: 'VWC-PARENT-001',
  title: 'Venture Wizard UX Completion - 12-Feature Implementation',
  version: '1.0',
  status: 'draft',
  category: 'product_feature',
  priority: 'high',
  target_application: 'EHG',
  current_phase: 'PLAN',
  description: 'Complete venture creation wizard with comprehensive UX enhancements: Tier 0 activation, inline intelligence, GCIA controls, cost transparency, presets, error recovery, portfolio impact, analytics, and accessibility. Phased rollout across 4 phases.',
  strategic_intent: 'Transform venture wizard from basic MVP into production-ready Chairman tool with intelligent guidance, progressive disclosure, and complete UX polish.',
  rationale: 'Current wizard is 55% complete (per audit): missing Tier 0 UI, inline intelligence integration, cost transparency, error recovery, portfolio context, and analytics.',
  scope: '12 UX features across 4 phases (2,700 LOC total). All features integrate into existing VentureCreationPage without breaking changes.',
  strategic_objectives: [
    'Activate Tier 0 UI with stage gating',
    'Embed IntelligenceDrawer into wizard flow',
    'Add GCIA cache refresh controls with ETA and cost display',
    'Show real-time cost/latency transparency'
  ],
  success_criteria: [
    'All 12 features implemented and E2E tested',
    'Zero regressions in existing wizard functionality'
  ],
  key_changes: [
    'Add Tier 0 button to VentureCreationPage',
    'Embed IntelligenceDrawer into wizard Steps 2-3'
  ],
  key_principles: [
    'Database-first: Reuse existing tables',
    'Server-driven flags'
  ],
  metadata: {
    is_parent: true,
    sub_directive_ids: ['SD-VWC-PHASE1-001', 'SD-VWC-PHASE2-001', 'SD-VWC-PHASE3-001', 'SD-VWC-PHASE4-001']
  },
  created_by: 'LEAD',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

async function main() {
  console.log('📋 Creating parent SD:', parentSD.id);
  
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(parentSD)
    .select()
    .single();
  
  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
  
  console.log('✅ Parent SD created successfully!');
  console.log('   ID:', data.id);
  console.log('   Title:', data.title);
  console.log('   Priority:', data.priority);
  console.log('   Status:', data.status);
}

main();
