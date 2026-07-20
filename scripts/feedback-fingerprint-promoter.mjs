#!/usr/bin/env node
/**
 * SD-LEO-INFRA-HARNESS-BACKLOG-DRAIN-POLICY-001 / FR-5
 *
 * Scheduled promoter: groups feedback rows (category='harness_backlog',
 * archived_at IS NULL, created within a rolling 14-day window) by content
 * fingerprint (title+description, via lib/shared/content-fingerprint.cjs — the
 * same primitive lib/coordinator/signal-router.cjs uses for worker-signal
 * aggregation, FR-4). Any fingerprint with 3+ distinct occurrences is promoted to
 * exactly one QF-candidate via the existing QF-creation path
 * (scripts/create-quick-fix.js), citing the fingerprint, occurrence count, and
 * source feedback row ids.
 *
 * Idempotent: a fingerprint already promoted has metadata.promoted_to_qf stamped
 * on every contributing row; if ANY row in the current window's group already
 * carries that marker, the group is skipped (a later occurrence of an
 * already-promoted fingerprint does not create a duplicate QF, TS-3).
 *
 * QF creation is delegated to the CLI (not reimplemented) so dedup gates,
 * STALE_PREMISE liveness re-check, and per-feedback-row pre-claim all apply
 * exactly as they do for a human-filed QF.
 *
 * Usage:
 *   node scripts/feedback-fingerprint-promoter.mjs           # dry run (default)
 *   node scripts/feedback-fingerprint-promoter.mjs --apply    # actually create QFs
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { groupByFingerprint, shouldPromote } from '../lib/shared/content-fingerprint.cjs';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const apply = process.argv.includes('--apply');
const WINDOW_DAYS = 14;
const THRESHOLD = 3;
const FINGERPRINT_TYPE = 'harness_backlog_feedback';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString();

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: feedback is an unbounded growing
// table; a heavy campaign week can file well over 1000 harness_backlog rows in the 14-day
// window, and every row here is grouped/promoted below — paginate to completion.
let rows;
try {
  rows = await fetchAllPaginated(() => supabase
    .from('feedback')
    .select('id, title, description, severity, created_at, metadata')
    .eq('category', 'harness_backlog')
    .is('archived_at', null)
    .gte('created_at', cutoff)
    .order('id', { ascending: true })); // unique tiebreaker (FR-6)
} catch (e) {
  console.error('ERROR (select):', JSON.stringify({ message: e.message }));
  process.exitCode = 1;
  process.exit();
}

const groups = groupByFingerprint(rows, (r) => ({
  type: FINGERPRINT_TYPE,
  body: `${r.title || ''}\n${r.description || ''}`,
  groupKey: r.id,
  severity: r.severity,
  timestamp: r.created_at
}));

let promoted = 0;
let skippedAlreadyPromoted = 0;
let skippedBelowThreshold = 0;

for (const group of groups.values()) {
  if (!shouldPromote(group, THRESHOLD)) {
    skippedBelowThreshold++;
    continue;
  }

  const alreadyPromoted = group.rows.some(r => r.metadata?.promoted_to_qf);
  if (alreadyPromoted) {
    skippedAlreadyPromoted++;
    continue;
  }

  const sourceIds = group.rows.map(r => r.id);
  console.log(`\n[PROMOTABLE] fingerprint=${group.fingerprint.slice(0, 12)} occurrences=${sourceIds.length} severity=${group.max_severity}`);
  console.log(`  source rows: ${sourceIds.join(', ')}`);
  console.log(`  sample: ${group.sample_body.slice(0, 120)}`);

  if (!apply) {
    console.log('  [DRY RUN] would create QF-candidate here.');
    continue;
  }

  const title = `[Fingerprint x${sourceIds.length}] ${(group.sample_body.split('\n')[0] || group.fingerprint).slice(0, 100)}`;
  const description = `Auto-promoted from ${sourceIds.length} harness_backlog occurrences sharing fingerprint ${group.fingerprint} within a ${WINDOW_DAYS}-day window. Source feedback row ids: ${sourceIds.join(', ')}.`;

  try {
    execFileSync('node', [
      'scripts/create-quick-fix.js',
      '--title', title,
      '--type', 'bug',
      '--severity', group.max_severity,
      '--description', description,
      '--feedback-id', sourceIds.join(','),
    ], { stdio: 'inherit' });

    const stampedAt = new Date().toISOString();
    for (const id of sourceIds) {
      const row = group.rows.find(r => r.id === id);
      await supabase
        .from('feedback')
        .update({ metadata: { ...(row?.metadata || {}), promoted_to_qf: true, promoted_at: stampedAt, promoted_fingerprint: group.fingerprint } })
        .eq('id', id);
    }
    promoted++;
  } catch (e) {
    console.error(`  [PROMOTE_FAILED] create-quick-fix.js exited non-zero for fingerprint ${group.fingerprint.slice(0, 12)}: ${e.message}`);
  }
}

console.log(`\nSummary: ${promoted} promoted, ${skippedAlreadyPromoted} already-promoted, ${skippedBelowThreshold} below threshold.`);
