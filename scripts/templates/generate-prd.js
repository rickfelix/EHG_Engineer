#!/usr/bin/env node
/**
 * Unified PRD Generator - Part of SD-REFACTOR-SCRIPTS-001
 * Usage: node scripts/generate-prd.js <SD-ID> [--force] [--dry-run]
 */

import { createSupabaseServiceClient } from '../lib/supabase-connection.js';
import { generatePRD } from '../../lib/templates/prd-template.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
const sdId = args.find(a => !a.startsWith('--'));
const forceOverwrite = args.includes('--force');
const dryRun = args.includes('--dry-run');

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  PRD GENERATOR - Unified Template System');
  console.log('='.repeat(60) + '\n');

  if (!sdId) {
    console.log('Usage: node scripts/generate-prd.js <SD-ID> [--force] [--dry-run]');
    process.exit(1);
  }

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  console.log(`📋 Fetching SD: ${sdId}`);

  let { data: sd, error } = await supabase.from('strategic_directives_v2').select('*').eq('sd_key', sdId).single();
  if (error || !sd) {
    const result = await supabase.from('strategic_directives_v2').select('*').eq('id', sdId).single();
    sd = result.data;
    error = result.error;
  }
  if (error || !sd) {
    console.log(`❌ SD not found: ${sdId}`);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sd.title}`);
  console.log(`   ID: ${sd.id} | Type: ${sd.sd_type || 'not set'} | Status: ${sd.status}\n`);

  const { data: existingPrd } = await supabase.from('product_requirements_v2').select('id, status, version').eq('directive_id', sd.id).single();
  if (existingPrd && !forceOverwrite) {
    console.log(`⚠️  PRD already exists (status: ${existingPrd.status}). Use --force to overwrite`);
    process.exit(0);
  }

  let config = {};
  const sdConfigPath = path.join(projectRoot, 'config', 'sd-prd-configs', `${sd.sd_key}.json`);
  try {
    if (fs.existsSync(sdConfigPath)) {
      config = JSON.parse(fs.readFileSync(sdConfigPath, 'utf-8'));
      console.log(`📁 Loaded SD config: ${sdConfigPath}`);
    }
  } catch (_e) { /* no config */ }

  console.log('🔧 Generating PRD from template...\n');
  const prd = generatePRD(sd, config);

  console.log('📊 Generated PRD Summary:');
  console.log(`   ID: ${prd.id} | Category: ${prd.category}`);
  console.log(`   Requirements: ${prd.functional_requirements.length} | Tests: ${prd.test_scenarios.length} | Risks: ${prd.risks.length}\n`);

  if (dryRun) {
    console.log('🔍 DRY RUN - PRD not inserted\n');
    console.log(JSON.stringify(prd, null, 2).substring(0, 1500) + '...');
    process.exit(0);
  }

  if (existingPrd && forceOverwrite) {
    const { error: updateError } = await supabase.from('product_requirements_v2').update({ ...prd, version: String(parseFloat(existingPrd.version || '1.0') + 0.1), updated_at: new Date().toISOString() }).eq('directive_id', sd.id);
    if (updateError) { console.log(`❌ Update failed: ${updateError.message}`); process.exit(1); }
    console.log(`✅ PRD updated: ${prd.id}`);
  } else {
    const { error: insertError } = await supabase.from('product_requirements_v2').insert(prd);
    if (insertError) { console.log(`❌ Insert failed: ${insertError.message}`); process.exit(1); }
    console.log(`✅ PRD created: ${prd.id}`);
  }

  console.log('\nNext: node scripts/generate-user-stories.js ' + sd.sd_key);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
