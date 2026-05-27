#!/usr/bin/env node
/**
 * SD-LEO-INFRA-UNIFY-VENTURE-NON-001 / Child B.1
 *
 * Archive existing stub venture L2 docs in eva_vision_documents from
 * status='draft'|'active' to status='draft_seed'.
 *
 * Stub = venture_id IS NOT NULL AND level='L2' AND status IN ('draft','active')
 *        AND (extracted_dimensions IS NULL OR char_length(content) < 500).
 *
 * Preserves the rows for future /brainstorm --seed-from=draft_seed pre-loading
 * (SD scope Child D). Does NOT delete data.
 *
 * Idempotent: re-running selects no candidates because IN ('draft','active')
 * excludes already-archived (draft_seed) rows. Update is guarded by an
 * .eq('status', prevStatus) compare-and-set so a concurrent state change
 * doesn't blow up; that row is just skipped on this run.
 *
 * Usage:
 *   node scripts/one-off/_archive-stub-venture-l2-docs.mjs
 */

import { createSupabaseServiceClient } from '../lib/supabase-connection.js';

async function main() {
  const supabase = await createSupabaseServiceClient('engineer');

  console.log('[B.1] Querying stub venture L2 candidates…');
  // Supabase JS doesn't let us do char_length(content) < 500 server-side
  // cleanly, so fetch the candidate set (small — expect ≤10) and filter
  // in JS. Use IN ('draft','active') + extracted_dimensions IS NULL OR
  // (length(content) < 500) at the cost of fetching `content`.
  const { data: candidates, error: qErr } = await supabase
    .from('eva_vision_documents')
    .select('id, vision_key, venture_id, level, status, extracted_dimensions, content')
    .not('venture_id', 'is', null)
    .eq('level', 'L2')
    .in('status', ['draft', 'active']);

  if (qErr) {
    console.error('[B.1] Query failed:', qErr);
    process.exit(1);
  }

  const stubs = (candidates || []).filter(
    (r) => r.extracted_dimensions == null || (r.content || '').length < 500
  );

  console.log(`[B.1] Candidate rows fetched: ${candidates?.length ?? 0}`);
  console.log(`[B.1] Stub rows (matching archive predicate): ${stubs.length}`);
  if (stubs.length === 0) {
    console.log('[B.1] Nothing to archive. Idempotent no-op.');
    await runConfirmation(supabase);
    return;
  }

  console.log('[B.1] vision_keys to archive:');
  for (const r of stubs) {
    console.log(`   - ${r.vision_key} (prev status=${r.status})`);
  }

  let updated = 0;
  let skipped = 0;
  for (const row of stubs) {
    const prev = row.status;
    const { data, error: uErr } = await supabase
      .from('eva_vision_documents')
      .update({ status: 'draft_seed', updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', prev) // compare-and-set guard
      .select('id, vision_key, status');

    if (uErr) {
      console.error(`[B.1] UPDATE failed for ${row.vision_key}:`, uErr);
      process.exit(2);
    }
    if (!data || data.length === 0) {
      console.warn(`[B.1] SKIP ${row.vision_key} — status changed under us (was ${prev})`);
      skipped += 1;
      continue;
    }
    console.log(`[B.1] OK ${row.vision_key}: ${prev} → draft_seed`);
    updated += 1;
  }

  console.log(`[B.1] Archive done. updated=${updated}, skipped=${skipped}`);
  await runConfirmation(supabase);
}

async function runConfirmation(supabase) {
  const { data, error } = await supabase
    .from('eva_vision_documents')
    .select('id, vision_key, status, extracted_dimensions, content')
    .not('venture_id', 'is', null)
    .eq('level', 'L2')
    .in('status', ['draft', 'active']);

  if (error) {
    console.error('[B.1] Confirmation query failed:', error);
    process.exit(3);
  }

  const remainingStubs = (data || []).filter(
    (r) => r.extracted_dimensions == null || (r.content || '').length < 500
  );
  console.log(`[B.1] Confirmation: remaining venture L2 stub-candidates at draft|active = ${remainingStubs.length} (expect 0)`);
  if (remainingStubs.length !== 0) {
    console.error('[B.1] FAIL — expected 0 remaining stubs, got', remainingStubs.length);
    process.exit(4);
  }
}

main().catch((e) => {
  console.error('[B.1] Unexpected error:', e);
  process.exit(99);
});
