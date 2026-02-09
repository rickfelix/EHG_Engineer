#!/usr/bin/env node

/**
 * Feedback Staleness Check
 * SD-LEO-INFRA-WIRE-FEEDBACK-QUALITY-001
 *
 * Marks feedback items older than N days (default: 90) as 'stale'.
 * Only affects items in 'new' or 'triaged' status.
 *
 * Usage:
 *   node scripts/feedback-staleness-check.js            # Mark stale (90 days)
 *   node scripts/feedback-staleness-check.js --days 60  # Custom threshold
 *   node scripts/feedback-staleness-check.js --dry-run  # Preview only
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const daysIdx = args.indexOf('--days');
const days = daysIdx !== -1 && args[daysIdx + 1] ? parseInt(args[daysIdx + 1], 10) : 90;

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = cutoff.toISOString();

  console.log('\n📋 Feedback Staleness Check');
  console.log(`   Threshold: ${days} days (before ${cutoffISO.split('T')[0]})`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}\n`);

  // Find stale items
  const { data: staleItems, error: queryError } = await supabase
    .from('feedback')
    .select('id, title, status, created_at')
    .in('status', ['new', 'triaged'])
    .lt('created_at', cutoffISO)
    .order('created_at', { ascending: true });

  if (queryError) {
    console.error(`❌ Query error: ${queryError.message}`);
    process.exit(1);
  }

  if (!staleItems || staleItems.length === 0) {
    console.log('✅ No stale feedback items found.');
    return;
  }

  console.log(`Found ${staleItems.length} stale item(s):\n`);

  for (const item of staleItems) {
    const age = Math.floor((Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24));
    console.log(`   ${item.id.substring(0, 8)}... | ${age}d old | ${item.status} | ${item.title?.substring(0, 60) || '(no title)'}`);
  }

  if (dryRun) {
    console.log(`\n⏭️  DRY RUN: Would mark ${staleItems.length} item(s) as stale. Run without --dry-run to apply.`);
    return;
  }

  // Mark as stale
  const ids = staleItems.map(i => i.id);
  const { error: updateError } = await supabase
    .from('feedback')
    .update({
      status: 'stale',
      resolution_notes: `Auto-marked stale after ${days} days without action.`,
      updated_at: new Date().toISOString()
    })
    .in('id', ids);

  if (updateError) {
    console.error(`\n❌ Update error: ${updateError.message}`);
    process.exit(1);
  }

  console.log(`\n✅ Marked ${ids.length} item(s) as stale.`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
