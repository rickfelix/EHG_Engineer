#!/usr/bin/env node

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function registerResearchAgent() {
  console.log('🚀 Registering Research Agent sub-agent for SD-RESEARCH-001...\n');

  const researchAgentData = {
    id: randomUUID(),
    code: 'RESEARCH',
    name: 'Research Agent',
    description: 'Portfolio Intelligence - Competitive monitoring, trend detection, and risk forecasting for RAID table automation',
    activation_type: 'manual', // MVP: manual RAID entry, Phase 2: automated
    priority: 50,
    context_file: '/tmp/database-architect-raid-schema-consultation.md',
    script_path: null, // No automation script for MVP
    active: true,
    capabilities: JSON.stringify([
      'RAID_ENTRY_MANUAL',
      'STAGE_6_RISK_EVALUATION',  // Phase 2
      'STAGE_35_GTM_TIMING',       // Phase 2
      'STAGE_37_RISK_FORECASTING', // Phase 2
      'STAGE_39_MULTI_VENTURE'     // Phase 2
    ]),
    metadata: {
      sd_id: '7a033041-56df-4dfe-a809-58cfc6b8942d',
      implementation_phase: 'MVP - Manual Entry Only',
      phase_2_features: [
        'Automated competitive monitoring (Crunchbase API)',
        'Trend detection (NLP on news articles)',
        'Risk forecasting (market intelligence APIs)'
      ],
      raid_table_integration: true
    }
  };

  try {
    // Check if already exists
    const { data: existing } = await supabase
      .from('leo_sub_agents')
      .select('id, code, name')
      .eq('code', 'RESEARCH')
      .single();

    if (existing) {
      console.log('⚠️  Research Agent already exists:', existing.name);
      console.log('   ID:', existing.id);
      console.log('   Code:', existing.code);
      console.log('\nSkipping insertion (already registered).\n');
      return;
    }

    // Insert new sub-agent
    const { data, error } = await supabase
      .from('leo_sub_agents')
      .insert(researchAgentData)
      .select();

    if (error) {
      console.error('❌ Error registering Research Agent:', error);
      process.exit(1);
    }

    console.log('✅ Research Agent registered successfully!\n');
    console.log('📋 Sub-Agent Details:');
    console.log('   ID:', data[0].id);
    console.log('   Code:', data[0].code);
    console.log('   Name:', data[0].name);
    console.log('   Role:', data[0].role);
    console.log('   Activation:', data[0].activation_type);
    console.log('   Priority:', data[0].priority);
    console.log('   Active:', data[0].active);
    console.log('\n📊 Implementation:');
    console.log('   MVP: Manual RAID entry workflow');
    console.log('   Phase 2: Automated competitive monitoring');
    console.log('\n✅ Research Agent ready for use!');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

registerResearchAgent();
