#!/usr/bin/env node
/**
 * Query Venture Wizard UX Completion SDs
 * Retrieves detailed information about the 4 draft VWC SDs
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

async function queryVWCSDs() {
  console.log('\n🔍 Querying Venture Wizard UX Completion SDs...\n');

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  const sdIds = [
    'SD-VWC-PARENT-001',
    'SD-VWC-PHASE2-001',
    'SD-VWC-PHASE3-001',
    'SD-VWC-PHASE4-001'
  ];

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select(`
      sd_id,
      title,
      description,
      objective,
      category,
      status,
      progress_percentage,
      parent_sd_id,
      created_at,
      metadata
    `)
    .in('sd_id', sdIds)
    .order('sd_id');

  if (error) {
    console.error('❌ Query error:', error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('⚠️  No SDs found');
    process.exit(0);
  }

  // Display results
  console.log(`Found ${data.length} SDs:\n`);
  console.log('='.repeat(80));

  data.forEach((sd, index) => {
    console.log(`\n${index + 1}. ${sd.sd_id}`);
    console.log(`   Title: ${sd.title}`);
    console.log(`   Category: ${sd.category}`);
    console.log(`   Status: ${sd.status}`);
    console.log(`   Progress: ${sd.progress_percentage}%`);
    console.log(`   Parent SD: ${sd.parent_sd_id || 'None'}`);
    console.log(`   Created: ${sd.created_at}`);
    console.log('\n   Description:');
    console.log(`   ${sd.description}`);

    if (sd.objective) {
      console.log('\n   Objective:');
      console.log(`   ${sd.objective}`);
    }

    if (sd.metadata) {
      console.log('\n   Metadata:');
      console.log(`   ${JSON.stringify(sd.metadata, null, 2)}`);
    }

    console.log('\n' + '-'.repeat(80));
  });

  console.log('\n✅ Query complete\n');
}

queryVWCSDs().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
