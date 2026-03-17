import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const phase4SD = {
  id: 'SD-VWC-PHASE4-001',
  sd_key: 'VWC-PHASE4-001',
  title: 'Phase 4: Experimental & Analytics',
  version: '1.0',
  status: 'draft',
  category: 'product_feature',
  priority: 'medium',
  target_application: 'EHG',
  current_phase: 'PLAN',
  description: 'Add comprehensive experimentation telemetry for data-driven optimization, create alternate entry paths (Browse Opportunities market-driven, Balance Portfolio portfolio-driven), enhance voice transcription with real-time captions and multi-language support. Optimization and experimental features for continuous improvement (~700 LOC).',
  strategic_intent: 'Enable data-driven optimization of wizard UX through comprehensive telemetry tracking. Provide alternate entry workflows that serve different mental models (market-first vs portfolio-first). Enhance voice accessibility with real-time captions and language selection for global team usage.',
  rationale: 'Telemetry enables A/B testing, identifies abandonment points, and guides UX improvements. Alternate entry paths serve different user mental models - some users think market-first (opportunities), others portfolio-first (gaps). Voice captions improve accessibility for hearing-impaired users and support multi-language transcription.',
  scope: 'Analytics instrumentation across all wizard events, wizard_analytics table creation (if activity_logs insufficient), BrowseOpportunitiesEntry component for market-driven flow, BalancePortfolioEntry component for portfolio-driven flow, VoiceCapture enhancements for real-time captions and language selection.',
  strategic_objectives: [
    'Verify activity_logs table schema supports wizard analytics or create wizard_analytics table',
    'Add comprehensive telemetry tracking for all wizard interactions',
    'Track metrics: preset selection, tier changes, intelligence triggers, time per step, abandonment points',
    'Create analytics dashboard queries for completion rate and bottleneck identification',
    'Build Browse Opportunities entry path that pre-fills market analysis',
    'Build Balance Portfolio entry path that shows portfolio gaps and opportunities',
    'Add alternate entry path routes: /ventures/new/browse and /ventures/new/balance',
    'Enhance VoiceCapture with real-time transcription captions during recording',
    'Add voice language selection (English, Spanish, Chinese) for transcription',
    'Ensure captions display correctly with proper timing and formatting'
  ],
  success_criteria: [
    'All wizard interactions tracked in analytics (activity_logs or wizard_analytics)',
    'Analytics capture: event type, timestamp, user_id, venture_id, step, duration, metadata',
    'Analytics dashboard shows: completion rate by tier, average time per step, abandonment funnel',
    'Browse Opportunities path pre-fills: market research, competitive landscape, white space',
    'Balance Portfolio path shows: portfolio gaps by sector, concentration risks, balance opportunities',
    'Alternate paths route correctly and integrate seamlessly with main wizard',
    'Voice captions display in real-time during recording with <2 second latency',
    'Voice language selector supports EN, ES, ZH with accurate transcription',
    'Captions formatted properly (line breaks, timing, text size)',
    'E2E tests verify alternate entry paths and analytics tracking',
    'Analytics pipeline tested with sample data verification'
  ],
  key_changes: [
    'Verify activity_logs schema or create wizard_analytics table with columns: id, event_type, user_id, venture_id, step, duration_ms, metadata JSONB, created_at',
    'Add analytics tracking utility (~50 LOC) for consistent event logging',
    'Instrument all wizard events: step_start, step_complete, tier_select, preset_select, intelligence_trigger, error_occurred, wizard_abandon, wizard_complete',
    'Create BrowseOpportunitiesEntry.tsx component (~150 LOC) with market research pre-fill',
    'Create BalancePortfolioEntry.tsx component (~150 LOC) with portfolio gap analysis',
    'Add routes to App.tsx: /ventures/new/browse and /ventures/new/balance',
    'Enhance VoiceCapture.tsx with caption display area (~100 LOC)',
    'Add language selector dropdown to VoiceCapture (~50 LOC)',
    'Integrate real-time transcription API with caption streaming',
    'Add VentureCreationPage analytics hooks at all interaction points'
  ],
  key_principles: [
    'Analytics: Non-blocking instrumentation, fail gracefully if table unavailable, privacy-conscious (no PII)',
    'Alternate paths: Pre-fill data intelligently, don\'t duplicate wizard code (use composition)',
    'Voice captions: Real-time display, support multiple languages, accessible formatting',
    'Performance: Analytics async, batch writes where possible, no UI blocking',
    'Privacy: Track events not content, anonymize where possible, respect user preferences'
  ],
  metadata: {
    parent_sd_id: 'SD-VWC-PARENT-001',
    sequence_order: 4,
    layer: 'optimization',
    estimated_effort_hours: '9-11',
    estimated_loc: 700,
    components_to_create: [
      'BrowseOpportunitiesEntry.tsx (150 LOC) - Market-driven entry path',
      'BalancePortfolioEntry.tsx (150 LOC) - Portfolio-driven entry path',
      'Analytics tracking utilities (~50 LOC) - Event logging helpers',
      'Voice caption enhancements (100 LOC) - Real-time caption display',
      'Voice language selector (50 LOC) - Language preference for transcription'
    ],
    components_to_modify: [
      'VentureCreationPage.tsx (+50 LOC for analytics hooks at interaction points)',
      'VoiceCapture.tsx (+150 LOC for captions and language selection)',
      'App.tsx (+50 LOC for alternate path routes)',
      'IntelligenceDrawer.tsx (+50 LOC for analytics tracking)'
    ],
    database_changes: [
      'Conditional: Verify activity_logs schema or CREATE TABLE wizard_analytics (id, event_type, user_id, venture_id, step, duration_ms, metadata JSONB, created_at)'
    ],
    testing_requirements: {
      e2e: 'Alternate entry paths (browse, balance), analytics event tracking, voice captions with language switching',
      unit: 'BrowseOpportunitiesEntry, BalancePortfolioEntry, analytics utilities, caption formatting',
      integration: 'Analytics pipeline verification, voice transcription API integration',
      performance: 'Analytics overhead measurement (<50ms per event), caption latency (<2s)'
    },
    analytics_events: [
      'wizard_start (entry_path: direct|browse|balance)',
      'step_start (step: 1-5, timestamp)',
      'step_complete (step: 1-5, duration_ms)',
      'tier_select (tier: 0|1|2, was_override: boolean)',
      'preset_select (preset: mvp|standard|deep|custom)',
      'intelligence_trigger (agent: STA|GCIA|PDA|HAA, mode: parallel|individual)',
      'error_occurred (error_type, step, recovery_attempted)',
      'wizard_abandon (last_step, time_spent_total_ms)',
      'wizard_complete (total_duration_ms, tier, preset_used)'
    ],
    voice_caption_features: {
      languages_supported: ['en', 'es', 'zh'],
      caption_latency_target: '<2 seconds',
      caption_formatting: 'Line breaks, proper timing, readable font size',
      transcription_accuracy_target: '>95% for English, >90% for ES/ZH'
    }
  },
  created_by: 'PLAN',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

async function main() {
  console.log('📋 Creating Phase 4 SD:', phase4SD.id);
  console.log('   Sequence: 4 of 4 phases (FINAL)');
  console.log('   Layer:', phase4SD.metadata.layer);
  console.log('   Focus: Analytics telemetry and experimental features');
  
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(phase4SD)
    .select()
    .single();
  
  if (error) {
    console.error('❌ Error:', error.message);
    console.error('   Details:', error);
    process.exit(1);
  }
  
  console.log('✅ Phase 4 SD created successfully!');
  console.log('   ID:', data.id);
  console.log('   Title:', data.title);
  console.log('   Priority:', data.priority);
  console.log('   Status:', data.status);
  console.log('   Parent:', phase4SD.metadata.parent_sd_id);
  console.log('   Estimated effort:', phase4SD.metadata.estimated_effort_hours, 'hours');
  console.log('   Estimated LOC:', phase4SD.metadata.estimated_loc);
  console.log('   Analytics events:', phase4SD.metadata.analytics_events.length);
  console.log('\n🎉 All 4 phase SDs created successfully!');
}

main();
