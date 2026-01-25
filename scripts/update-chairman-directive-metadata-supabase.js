#!/usr/bin/env node

/**
 * Update Chairman Directive Metadata for D1-D6 Grandchildren SDs
 * Using Supabase client instead of pg
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SD_KEYS = [
  'vision-transition-001d1',
  'vision-transition-001d2',
  'vision-transition-001d3',
  'vision-transition-001d4',
  'vision-transition-001d5',
  'vision-transition-001d6'
];

const CHAIRMAN_DIRECTIVE = {
  issued_date: '2025-12-10',
  scope_policy: 'NO_REDUCTION',
  build_policy: 'FROM_SCRATCH',
  legacy_policy: 'LEARN_AND_DECOMMISSION',
  instructions: [
    'Build new implementations from scratch - do not simply polish existing',
    'Learn from existing 40-stage implementations but build fresh for 25-stage model',
    'Include ALL Golden Nuggets features in scope',
    'No scope reductions permitted',
    'Decommission legacy implementations after new ones are validated',
    'Complete developments to the letter - 100% implementation required'
  ]
};

const KEY_PRINCIPLES = [
  'Build from scratch for 40→25 stage transition',
  'Learn from legacy implementations, then decommission',
  'No scope reductions - 100% completion required',
  'Include all Golden Nuggets features',
  'Legacy code is reference only, not foundation'
];

async function updateChairmanDirectiveMetadata() {
  console.log('🔌 Connecting to Supabase (consolidated database)...');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  console.log(`  URL: ${supabaseUrl}`);
  console.log(`  Key: ${supabaseKey.substring(0, 20)}...`);

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('\n📋 Updating metadata for 6 grandchildren SDs...\n');

  const results = [];

  for (const sdKey of SD_KEYS) {
    console.log(`Processing ${sdKey}...`);

    // First, get current metadata and key_principles
    const { data: sd, error: selectError } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, metadata, key_principles')
      .eq('sd_key', sdKey)
      .single();

    if (selectError || !sd) {
      console.log(`  ❌ SD not found: ${sdKey}`, selectError?.message || '');
      results.push({ sd_key: sdKey, status: 'NOT_FOUND', error: selectError?.message });
      continue;
    }

    const currentMetadata = sd.metadata || {};
    const currentPrinciples = sd.key_principles || [];

    // Merge chairman_directive into metadata
    const updatedMetadata = {
      ...currentMetadata,
      chairman_directive: CHAIRMAN_DIRECTIVE
    };

    // Merge new principles with existing (deduplicate)
    const allPrinciples = [...new Set([...currentPrinciples, ...KEY_PRINCIPLES])];

    // Update the SD
    const { data: updated, error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({
        metadata: updatedMetadata,
        key_principles: allPrinciples,
        updated_by: 'database-agent:chairman-directive-update'
      })
      .eq('sd_key', sdKey)
      .select('id, title, sd_key, metadata, key_principles')
      .single();

    if (updateError || !updated) {
      console.log(`  ❌ Update failed: ${sdKey}`, updateError?.message || '');
      results.push({ sd_key: sdKey, status: 'FAILED', error: updateError?.message });
      continue;
    }

    console.log(`  ✅ Updated: ${sd.title}`);
    results.push({
      sd_key: sdKey,
      sd_id: sd.id,
      title: sd.title,
      status: 'SUCCESS',
      metadata: updatedMetadata,
      key_principles: allPrinciples
    });
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 UPDATE SUMMARY');
  console.log('='.repeat(80) + '\n');

  const successful = results.filter(r => r.status === 'SUCCESS');
  const failed = results.filter(r => r.status !== 'SUCCESS');

  console.log(`✅ Successful: ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}`);

  if (successful.length > 0) {
    console.log('\n✅ Successfully updated SDs:');
    successful.forEach(r => {
      console.log(`  - ${r.sd_key} (${r.sd_id}): ${r.title}`);
      console.log(`    - Chairman Directive: ${Object.keys(r.metadata.chairman_directive).length} fields`);
      console.log(`    - Key Principles: ${r.key_principles.length} items`);
    });
  }

  if (failed.length > 0) {
    console.log('\n❌ Failed updates:');
    failed.forEach(r => {
      console.log(`  - ${r.sd_key}: ${r.status} - ${r.error || 'Unknown error'}`);
    });
  }

  // Verification
  console.log('\n' + '='.repeat(80));
  console.log('🔍 VERIFICATION');
  console.log('='.repeat(80) + '\n');

  const { data: verification, error: verifyError } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, id, title, metadata, key_principles')
    .in('sd_key', SD_KEYS)
    .order('sd_key');

  if (verifyError) {
    console.error('❌ Verification failed:', verifyError.message);
  } else {
    console.log('Verification Results:');
    verification.forEach(row => {
      const hasDirective = row.metadata?.chairman_directive !== undefined;
      const status = hasDirective ? '✅' : '❌';
      console.log(`  ${status} ${row.sd_key}: ${row.title}`);
      console.log(`     Chairman Directive: ${hasDirective ? 'Present' : 'Missing'}`);
      console.log(`     Key Principles: ${row.key_principles?.length || 0} items`);

      if (hasDirective) {
        const directive = row.metadata.chairman_directive;
        console.log(`     - Scope Policy: ${directive.scope_policy}`);
        console.log(`     - Build Policy: ${directive.build_policy}`);
        console.log(`     - Legacy Policy: ${directive.legacy_policy}`);
        console.log(`     - Instructions: ${directive.instructions?.length || 0} items`);
      }
      console.log('');
    });
  }

  return results;
}

// Execute
updateChairmanDirectiveMetadata()
  .then(() => {
    console.log('✅ Update complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Update failed:', error);
    process.exit(1);
  });
