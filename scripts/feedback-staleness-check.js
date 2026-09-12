#!/usr/bin/env node

/**
 * Feedback Staleness Check
 * SD-LEO-INFRA-WIRE-FEEDBACK-QUALITY-001
 * SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A: converted to insert-correction (public.feedback is
 * append-only; UPDATE is rejected unconditionally). ALSO: 'stale' is not a member of the live
 * feedback_status_check CHECK constraint (allowed: new, triaged, in_progress, resolved,
 * wont_fix, duplicate, invalid, backlog, shipped) -- the original status='stale' write would
 * have failed on that constraint independent of the append-only trigger. Staleness is now
 * recorded via metadata.marked_stale_at + resolution_notes, leaving `status` unchanged.
 *
 * Marks feedback items older than N days (default: 90) as stale via a correction row.
 * Only affects items in 'new' or 'triaged' status that have not already been marked stale
 * (or otherwise corrected) by a prior run.
 *
 * Usage:
 *   node scripts/feedback-staleness-check.js            # Mark stale (90 days)
 *   node scripts/feedback-staleness-check.js --days 60  # Custom threshold
 *   node scripts/feedback-staleness-check.js --dry-run  # Preview only
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';
import { fetchLatestFeedback, buildFeedbackCorrection } from '../lib/governance/feedback-correction.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

dotenv.config();

/**
 * Exported so tests can call it directly with explicit options -- reading argv at module-load
 * time made this script's behavior depend on the shared process.argv global, which races
 * against any other bare-main script imported in the same vitest worker (SD-LEO-INFRA-AUDIT-
 * FIX-FEEDBACK-001-A). Mirrors the scripts/one-off/backfill-stranded-escalated-qfs.mjs pattern.
 */
export async function main({ dryRun = false, days = 90, supabase: injectedSupabase = null } = {}) {
  let supabase = injectedSupabase;
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      process.exit(1);
    }

    supabase = createClient(supabaseUrl, supabaseKey);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = cutoff.toISOString();

  console.log('\n📋 Feedback Staleness Check');
  console.log(`   Threshold: ${days} days (before ${cutoffISO.split('T')[0]})`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}\n`);

  // Find stale ROOT candidates. Root-scoped (metadata->>corrects_feedback_id IS NULL) so a
  // correction row inserted by a PRIOR run is never re-selected as a fresh candidate.
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: feedback is an unbounded
  // growing table and the lower bound is open-ended — paginate to completion.
  let staleCandidates;
  try {
    staleCandidates = await fetchAllPaginated(() => supabase
      .from('feedback')
      .select('*')
      .in('status', ['new', 'triaged'])
      .lt('created_at', cutoffISO)
      .is('metadata->>corrects_feedback_id', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
  } catch (e) {
    console.error(`❌ Query error: ${e.message}`);
    process.exit(1);
  }

  if (!staleCandidates || staleCandidates.length === 0) {
    console.log('✅ No stale feedback items found.');
    return;
  }

  console.log(`Found ${staleCandidates.length} candidate(s):\n`);

  for (const item of staleCandidates) {
    const age = Math.floor((Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24));
    console.log(`   ${item.id.substring(0, 8)}... | ${age}d old | ${item.status} | ${item.title?.substring(0, 60) || '(no title)'}`);
  }

  if (dryRun) {
    console.log(`\n⏭️  DRY RUN: Would evaluate ${staleCandidates.length} item(s) for staleness. Run without --dry-run to apply.`);
    return;
  }

  let marked = 0;
  let skippedAlreadyMarked = 0;
  for (const candidate of staleCandidates) {
    // Resolve to the LATEST row in this candidate's correction chain -- a prior run (or any
    // other write site) may have already superseded this root. A resolution error is
    // fail-closed: skip this candidate rather than risk writing against a stale/unknown state.
    const latestResult = await fetchLatestFeedback(supabase, candidate.id);
    if (latestResult.error) {
      console.error(`   ⚠️  ${candidate.id.substring(0, 8)}...: could not resolve latest state (${latestResult.error}) — skipping`);
      continue;
    }
    const latest = latestResult.row;
    if (latest.metadata?.marked_stale_at || !['new', 'triaged'].includes(latest.status)) {
      skippedAlreadyMarked++;
      continue;
    }

    const payload = buildFeedbackCorrection(latest, {
      resolution_notes: `Auto-marked stale after ${days} days without action.`,
      metadata: { marked_stale_at: new Date().toISOString() },
    });
    const { error: insertError } = await supabase.from('feedback').insert(payload);
    if (insertError) {
      console.error(`\n❌ Insert error for ${candidate.id.substring(0, 8)}...: ${insertError.message}`);
      process.exit(1);
    }
    marked++;
  }

  console.log(`\n✅ Marked ${marked} item(s) as stale (${skippedAlreadyMarked} already handled by a prior run/write).`);
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const daysIdx = args.indexOf('--days');
  const days = daysIdx !== -1 && args[daysIdx + 1] ? parseInt(args[daysIdx + 1], 10) : 90;

  main({ dryRun, days }).catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
