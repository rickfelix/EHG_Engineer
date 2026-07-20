#!/usr/bin/env node
/**
 * distill-backlog-dispositions — set sd_backlog_map.disposition from completion_status
 * + the conversion_ledger integrated feeder.
 * SD-LEO-INFRA-BACKLOG-DISPOSITION-COLUMN-WORKFLOW-001 (FR-2 / FR-3).
 *
 * DEFAULT = dry-run (zero writes; reports the disposition plan). --apply to write.
 * Idempotent: an item already at its target disposition is skipped.
 * FAIL-SOFT on column absence: if the disposition column isn't migrated yet, the pass
 * reports 'column not yet migrated' and exits 0 (the migration is chairman-applied).
 *
 * Usage:
 *   node scripts/distill-backlog-dispositions.mjs            # dry-run (default)
 *   node scripts/distill-backlog-dispositions.mjs --apply
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { classifyDisposition, convertedSdKeySet } from '../lib/intake/backlog-disposition.mjs';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

function db() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function main() {
  const sb = db();
  console.log(`\n=== backlog disposition distillation (${DRY_RUN ? 'DRY-RUN — zero writes' : 'APPLY'}) ===`);

  // FAIL-SOFT: probe the column first. If the additive migration isn't applied yet, no-op.
  const probe = await sb.from('sd_backlog_map').select('disposition').limit(1);
  if (probe.error && /disposition/.test(probe.error.message) && /exist|column/i.test(probe.error.message)) {
    console.log('   [SKIP] sd_backlog_map.disposition not migrated yet (chairman-gated apply) — no-op.');
    return;
  }
  if (probe.error) { console.log('   [ALERT] probe failed (fail-soft):', probe.error.message); return; }

  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: sd_backlog_map is unfiltered here
  // and every row is classified + individually updated below — paginate to completion. Error
  // policy preserved: fail-soft with the same alert message.
  let items;
  try {
    items = await fetchAllPaginated(() => sb
      .from('sd_backlog_map')
      .select('sd_id, backlog_id, completion_status, disposition')
      .order('sd_id', { ascending: true })
      .order('backlog_id', { ascending: true })); // unique tiebreaker (FR-6)
  } catch (e) { console.log('   [ALERT] load failed (fail-soft):', e.message); return; }

  // FR-3: conversion_ledger integrated feeder (empty today; dormant until populated). Paginated
  // (not proven permanently bounded once populated) — fail-soft to an empty feeder set.
  let convertedSet = new Set();
  try {
    const ledger = await fetchAllPaginated(() => sb.from('conversion_ledger')
      .select('disposition, linked_sd_key')
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
    convertedSet = convertedSdKeySet(ledger || []);
  } catch (e) { console.log('   feeder load skipped (fail-soft):', e.message); }
  console.log(`   backlog items: ${items.length} | conversion_ledger converted-SD feeders: ${convertedSet.size}`);

  let set = 0, alreadyAt = 0, leftNull = 0, failed = 0;
  const dist = {};
  for (const it of items) {
    const target = classifyDisposition(it, convertedSet);
    if (!target) { leftNull++; continue; }
    dist[target] = (dist[target] || 0) + 1;
    if (it.disposition === target) { alreadyAt++; continue; } // idempotent
    if (DRY_RUN) { set++; continue; }
    try {
      const { error: upErr } = await sb
        .from('sd_backlog_map')
        .update({ disposition: target })
        .eq('sd_id', it.sd_id)
        .eq('backlog_id', it.backlog_id);
      if (upErr) { console.error(`   ❌ ${it.sd_id}/${it.backlog_id}: ${upErr.message}`); failed++; }
      else set++;
    } catch (e) { console.error(`   ❌ ${it.sd_id}/${it.backlog_id}: ${e.message}`); failed++; }
  }

  console.log('\n--- disposition plan ---');
  console.log('   distribution         :', JSON.stringify(dist));
  console.log(`   ${DRY_RUN ? 'would set' : 'set'}             : ${set}`);
  console.log(`   already-at-target    : ${alreadyAt}  (idempotent)`);
  console.log(`   left NULL (undecided): ${leftNull}`);
  console.log(`   failed               : ${failed}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('[distill-backlog-dispositions] fatal:', e.message); process.exit(1); });
