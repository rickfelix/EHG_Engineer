#!/usr/bin/env node

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
  console.error('   NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseKey ? 'Set' : 'Missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const { randomUUID } = require('crypto');

const sdData = {
  id: 'SD-RESEARCH-001',
  sd_key: 'SD-RESEARCH-001',
  title: 'Research Agent + RAID Table Integration',
  status: 'draft',
  category: 'Portfolio Intelligence',
  priority: 'high',
  target_application: 'EHG',
  description: 'Implement Research Agent for competitive intelligence and RAID table (Risks, Actions, Issues, Decisions) for portfolio risk management with automated backlog integration',
  strategic_intent: 'Create portfolio intelligence layer between Ventures and Governance to automate competitive monitoring, risk detection, and mitigation tracking',
  rationale: 'Current risk tracking is embedded in venture records with no traceability to mitigation actions. Research Agent automation does not exist. RAID table fills critical gap between venture feedback and strategic directives by providing external market intelligence that drives both new backlog items (opportunities) and risk tracking (threats).',
  scope: JSON.stringify({
    layers: ['Ventures (EHG)', 'Portfolio Intelligence (Research Agent)', 'Governance (EHG_Engineer)', 'Oversight (EVA + Chairman)'],
    components: ['RAID Table', 'Research Agent Sub-Agent', 'EVA Integration', 'Chairman Dashboard Extension'],
    stages: [6, 35, 37, 39]
  }),
  strategic_objectives: JSON.stringify([
    'Automate competitive monitoring and trend detection',
    'Create traceable risk-to-mitigation workflow via RAID table',
    'Integrate Research Agent into EVA orchestration',
    'Extend Chairman dashboard with Top 10 Risks view',
    'Link risks to backlog items for mitigation tracking'
  ]),
  success_criteria: JSON.stringify([
    'RAID table implemented with FK to backlog_items',
    'Research Agent outputs structured RAID data',
    'EVA auto-updates RAID severity when risks change',
    'Formal backlog review includes RAID-linked items',
    'Mitigated risks auto-update via deployment telemetry',
    'Chairman dashboard shows Top 10 active risks with linked mitigation paths'
  ]),
  metadata: {
    specification_source: 'Chairman directive 2025-10-04',
    integration_analysis_complete: true,
    prerequisite_sds: [],
    database_tables_required: ['raid_log', 'decisions'],
    codebase_integration_points: [
      'sd_backlog_map (existing)',
      'EVAOrchestrationDashboard.tsx',
      'VenturePortfolioOverview.tsx',
      'Stage 6/35/37/39 workflow hooks'
    ],
    complexity_assessment: 'HIGH - new sub-agent + new tables + 4 integration points',
    implementation_notes: {
      no_duplication: 'Research Agent does NOT exist in active codebase',
      raid_table_new: 'RAID table does not exist, no schema conflicts',
      backlog_integration: 'Uses existing sd_backlog_map.backlog_id FK',
      stage_37_synergy: 'RAID tracks actual risks, Stage 37 forecasts future risks'
    }
  },
  progress: 0,
  current_phase: 'LEAD',
  phase_progress: 0,
  is_active: true
};

async function createSD() {
  console.log('🚀 Creating SD-RESEARCH-001: Research Agent + RAID Table Integration\n');

  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(sdData)
      .select();

    if (error) {
      console.error('❌ Error creating SD:', error);
      process.exit(1);
    }

    console.log('✅ SD-RESEARCH-001 created successfully!\n');
    console.log('📋 SD Details:');
    console.log('   ID:', data[0].id);
    console.log('   SD Key:', data[0].sd_key);
    console.log('   Title:', data[0].title);
    console.log('   Status:', data[0].status);
    console.log('   Priority:', data[0].priority);
    console.log('   Target App:', data[0].target_application);
    console.log('   Phase:', data[0].current_phase);
    console.log('\n📊 Next Steps:');
    console.log('   1. View in dashboard: http://localhost:3000');
    console.log('   2. LEAD review and approval');
    console.log('   3. Create LEAD→PLAN handoff');
    console.log('   4. Generate PRD with 4-layer architecture');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

createSD();
