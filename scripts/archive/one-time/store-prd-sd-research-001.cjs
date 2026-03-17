#!/usr/bin/env node

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const { randomUUID } = require('crypto');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function storePRD() {
  console.log('🚀 Storing PRD for SD-RESEARCH-001 in database...\n');

  // Read PRD content
  const prdContent = fs.readFileSync('/tmp/prd-sd-research-001.md', 'utf-8');

  // Prepare PRD data (using correct schema)
  const prdData = {
    id: randomUUID(),
    sd_id: '7a033041-56df-4dfe-a809-58cfc6b8942d',
    directive_id: '7a033041-56df-4dfe-a809-58cfc6b8942d',
    title: 'Research Agent + RAID Table Integration',
    version: 1,
    status: 'draft',
    category: 'Portfolio Intelligence',
    priority: 'high',
    content: prdContent,

    executive_summary: 'Create portfolio intelligence layer between Ventures and Governance to automate competitive monitoring, risk detection, and mitigation tracking. Implement RAID table (Risks, Actions, Issues, Decisions) with Research Agent sub-agent.',

    business_context: 'Current risk tracking is embedded in venture records with no traceability. Competitive intelligence is manual. No workflow exists to convert market threats into backlog items.',

    technical_context: '4-layer architecture: Ventures → Research Agent → Governance → Chairman. RAID table with FK to sd_backlog_map. Chairman dashboard extension.',

    functional_requirements: JSON.stringify([
      'BR-001: Track portfolio risks with severity scoring',
      'BR-002: Link risks to mitigation backlog items',
      'BR-003: Support 4 RAID types (Risk, Action, Issue, Decision)',
      'BR-008: Chairman Top 10 Risks view',
      'BR-009: Risk severity color coding'
    ]),

    acceptance_criteria: JSON.stringify([
      'AC-001: RAID table implemented with FK to backlog_items',
      'AC-002: Research Agent outputs structured RAID data (Phase 2)',
      'AC-006: Chairman dashboard shows Top 10 active risks with linked mitigation paths'
    ]),

    test_scenarios: JSON.stringify({
      unit_tests: ['UT-001: RAID table schema validation', 'UT-002: RAID key generation', 'UT-003: Severity color coding'],
      integration_tests: ['IT-001: Chairman dashboard RAID query', 'IT-002: RAID entry creation flow'],
      e2e_tests: ['E2E-001: Complete RAID workflow', 'E2E-002: Mobile responsiveness']
    }),

    system_architecture: 'RAID log table + PortfolioRisksCard component + RAIDEntryForm component. Research Agent sub-agent registered in leo_sub_agents.',

    data_model: 'raid_log table with severity_index GENERATED column, FK to sd_backlog_map',

    dependencies: JSON.stringify({
      internal: ['sd_backlog_map (exists)', 'ventures (exists)', 'Shadcn UI (exists)'],
      external: ['Backlog UI (unknown)', 'Competitor APIs (Phase 2)']
    }),

    risks: JSON.stringify([
      'Risk 1: Backlog UI may not exist for mitigation links',
      'Risk 2: Research Agent automation complexity (Phase 2)',
      'Risk 3: Performance degradation with large RAID table'
    ]),

    metadata: {
      prd_length_chars: prdContent.length,
      sub_agents_consulted: ['Principal Database Architect', 'Senior Design Sub-Agent'],
      phase_2_deferred: ['Research Agent automation', 'Stage workflow hooks', 'EVA auto-updates']
    },

    phase: 'PLAN',
    created_by: 'PLAN Agent'
  };

  try {
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .insert(prdData)
      .select();

    if (error) {
      console.error('❌ Error storing PRD:', error);
      process.exit(1);
    }

    console.log('✅ PRD stored successfully in database!\n');
    console.log('📋 PRD Details:');
    console.log('   ID:', data[0].id);
    console.log('   SD ID:', data[0].sd_id);
    console.log('   Version:', data[0].version);
    console.log('   Status:', data[0].status);
    console.log('   Content Length:', prdContent.length, 'characters');
    console.log('   Components:', data[0].content_json.technical_components.length);
    console.log('   Test Plans:', data[0].content_json.test_plans.unit_tests + data[0].content_json.test_plans.integration_tests + data[0].content_json.test_plans.e2e_tests, 'tests');
    console.log('\n📊 Next Step: Create PLAN→EXEC handoff');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

storePRD();
