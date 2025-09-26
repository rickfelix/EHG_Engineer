#!/usr/bin/env node

/**
 * apply-sd-classification.js
 *
 * Apply target_application classifications to strategic directives in the database
 *
 * Rule: LEO Protocol development features = EHG_ENGINEER, everything else = EHG
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Specific SDs that are for EHG_Engineer (LEO Protocol development platform)
const EHG_ENGINEER_SDS = [
  'SD-002',                        // AI Navigation for EHG_Engineer interface
  'SD-043',                        // Development Workflow
  'SD-2025-0903-SDIP',            // Strategic Directive Initiation Protocol
  'SD-2025-09-EMB',               // Message Bus for Agent Handoffs
  'SD-GOVERNANCE-UI-001',         // Governance UI for SD/PRD management
  'SD-MONITORING-001',            // Observability Framework
  'SD-VISION-ALIGN-001',          // Vision Alignment System for EHG_Engineering
  'SD-DASHBOARD-AUDIT-2025-08-31-A' // LEO Protocol Dashboard Audit
];

async function applyClassifications() {
  try {
    console.log('🚀 Applying Strategic Directive Classifications...\n');

    // First, check if the column exists
    const { error: checkError } = await supabase
      .from('strategic_directives_v2')
      .select('target_application')
      .limit(1);

    if (checkError && checkError.message.includes('column')) {
      console.error('❌ The target_application column does not exist yet.');
      console.error('Please run the migration first:');
      console.error('  Execute database/migrations/2025-09-23-add-target-application.sql in Supabase');
      process.exit(1);
    }

    // Set all SDs to EHG by default
    console.log('Setting all SDs to EHG (business application) by default...');
    const { error: defaultError } = await supabase
      .from('strategic_directives_v2')
      .update({ target_application: 'EHG' })
      .is('target_application', null);

    if (defaultError) {
      console.error('Error setting defaults:', defaultError);
    }

    // Update specific EHG_Engineer SDs
    console.log('\nUpdating EHG_Engineer SDs (LEO Protocol development platform)...');

    for (const sdKey of EHG_ENGINEER_SDS) {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update({ target_application: 'EHG_ENGINEER' })
        .or(`key.eq.${sdKey},id.eq.${sdKey}`)
        .select();

      if (error) {
        console.error(`  ❌ Error updating ${sdKey}:`, error.message);
      } else if (data && data.length > 0) {
        console.log(`  ✅ Updated ${sdKey}: ${data[0].title || 'Untitled'}`);
      } else {
        console.log(`  ⚠️  ${sdKey} not found in database`);
      }
    }

    // Also update any with LEO Protocol in the title
    console.log('\nUpdating SDs with LEO Protocol in title...');
    const { data: leoSds, error: leoError } = await supabase
      .from('strategic_directives_v2')
      .update({ target_application: 'EHG_ENGINEER' })
      .ilike('title', '%LEO Protocol%')
      .select();

    if (leoError) {
      console.error('Error updating LEO Protocol SDs:', leoError);
    } else if (leoSds && leoSds.length > 0) {
      console.log(`  ✅ Updated ${leoSds.length} SDs with LEO Protocol in title`);
    }

    // Get final counts
    console.log('\n📊 Verifying classifications...');

    const { data: ehgCount, error: ehgCountError } = await supabase
      .from('strategic_directives_v2')
      .select('id', { count: 'exact' })
      .eq('target_application', 'EHG');

    const { data: engCount, error: engCountError } = await supabase
      .from('strategic_directives_v2')
      .select('id', { count: 'exact' })
      .eq('target_application', 'EHG_ENGINEER');

    const { data: nullCount, error: nullCountError } = await supabase
      .from('strategic_directives_v2')
      .select('id', { count: 'exact' })
      .is('target_application', null);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                    CLASSIFICATION COMPLETE                      ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('Final counts:');
    console.log(`  🚀 EHG (Business Application): ${ehgCount?.length || 0}`);
    console.log(`  🛠️  EHG_ENGINEER (Dev Platform): ${engCount?.length || 0}`);
    console.log(`  ❓ Unclassified: ${nullCount?.length || 0}`);

    console.log('\n✅ Classification applied successfully!');
    console.log('\nThe UI will now show target application badges:');
    console.log('  🛠️ EHG_Engineer - LEO Protocol development platform');
    console.log('  🚀 EHG - Business application features');

  } catch (error) {
    console.error('❌ Error applying classifications:', error);
    process.exit(1);
  }
}

// Run the classification
applyClassifications();