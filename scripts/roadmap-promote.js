#!/usr/bin/env node
/**
 * roadmap-promote.js — Promote wave items to Strategic Directives (stub)
 * SD: SD-LEO-FEAT-STRATEGIC-ROADMAP-ARTIFACT-001-C
 *
 * Stub implementation for child -D (Wave-to-SD Promotion and Baseline Integration).
 * Validates arguments and shows what would be promoted without creating SDs.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  const args = process.argv.slice(2);
  const waveIdFlag = args.indexOf('--wave-id');
  const waveId = waveIdFlag >= 0 ? args[waveIdFlag + 1] : null;

  if (!waveId) {
    console.log('Usage: node scripts/roadmap-promote.js --wave-id <uuid>');
    console.log('\nPromotes all unassigned items in a wave to Strategic Directives.');
    console.log('Note: Full implementation in child SD -D.');
    process.exit(0);
  }

  // Fetch wave and its items
  const { data: wave, error: wErr } = await supabase
    .from('roadmap_waves')
    .select('id, title, status')
    .eq('id', waveId)
    .single();

  if (wErr || !wave) {
    console.error(`Wave not found: ${waveId}`);
    process.exit(1);
  }

  const { data: items, error: iErr } = await supabase
    .from('roadmap_wave_items')
    .select('id, title, source_type, promoted_to_sd_key')
    .eq('wave_id', waveId)
    .order('priority_rank', { ascending: true });

  if (iErr) { console.error('Error:', iErr.message); process.exit(1); }

  const unpromoted = (items || []).filter(i => !i.promoted_to_sd_key);
  const promoted = (items || []).filter(i => i.promoted_to_sd_key);

  console.log(`Wave: ${wave.title} [${wave.status}]`);
  console.log('═'.repeat(50));
  console.log(`  Total items: ${(items || []).length}`);
  console.log(`  Already promoted: ${promoted.length}`);
  console.log(`  Ready to promote: ${unpromoted.length}`);

  if (unpromoted.length > 0) {
    console.log('\n  Items ready for promotion:');
    unpromoted.forEach((item, i) => {
      console.log(`    ${i + 1}. ${item.title || '(untitled)'} [${item.source_type}]`);
    });
  }

  console.log('\n  [STUB] Full promotion logic will be implemented in child SD -D.');
  console.log('  This will create SDs via leo-create-sd.js and update promoted_to_sd_key.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
