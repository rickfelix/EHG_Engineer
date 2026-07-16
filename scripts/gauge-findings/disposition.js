#!/usr/bin/env node
/**
 * Coordinator-facing accepted-known-state disposition CLI — SD-LEO-INFRA-GAUGE-FINDING-KNOWN-STATE-ACK-001.
 *
 * Lets the coordinator mark a gauge/governance finding (identified by a stable fingerprint, e.g.
 * 'WAVE_LINKAGE_STARVATION') as accepted-known-state pending a future decision, so the sourcing/refill
 * engine (scripts/sourcing-engine/refill-cron.mjs) stops re-promoting it until re_review_at. Upserts on
 * the fingerprint UNIQUE constraint — re-dispositioning refreshes re_review_at/reason rather than
 * creating a duplicate row.
 *
 * Usage:
 *   node scripts/gauge-findings/disposition.js accept <fingerprint> --re-review <ISO-date> --reason "<text>" --by <who>
 *   node scripts/gauge-findings/disposition.js status <fingerprint>
 *   node scripts/gauge-findings/disposition.js list
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createSupabaseServiceClient } from '../lib/supabase-connection.js';

function parseFlag(args, name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

/**
 * Upsert an accepted-known-state disposition for a fingerprint. Pure I/O wrapper — validates required
 * fields, then upserts on the fingerprint UNIQUE constraint (onConflict: 'fingerprint').
 * @param {object} supabase
 * @param {{fingerprint:string, reReviewAt:string, reason:string, dispositionedBy:string}} args
 */
export async function acceptDisposition(supabase, { fingerprint, reReviewAt, reason, dispositionedBy }) {
  if (!fingerprint) throw new Error('acceptDisposition: fingerprint is required');
  if (!reReviewAt) throw new Error('acceptDisposition: reReviewAt is required');
  if (!reason) throw new Error('acceptDisposition: reason is required');
  if (!dispositionedBy) throw new Error('acceptDisposition: dispositionedBy is required');
  const reReviewDate = new Date(reReviewAt);
  if (Number.isNaN(reReviewDate.getTime())) throw new Error(`acceptDisposition: invalid re_review_at "${reReviewAt}"`);

  const { data, error } = await supabase
    .from('gauge_finding_dispositions')
    .upsert(
      {
        fingerprint,
        disposition: 'accepted_known_state',
        re_review_at: reReviewDate.toISOString(),
        reason,
        dispositioned_by: dispositionedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'fingerprint' },
    )
    .select()
    .single();
  if (error) throw new Error(`acceptDisposition: upsert failed: ${error.message}`);
  return data;
}

/** Fetch the current disposition row for a fingerprint, or null if none exists. */
export async function getDisposition(supabase, fingerprint) {
  const { data, error } = await supabase
    .from('gauge_finding_dispositions')
    .select('*')
    .eq('fingerprint', fingerprint)
    .maybeSingle();
  if (error) throw new Error(`getDisposition: query failed: ${error.message}`);
  return data || null;
}

/** List all disposition rows, most recently updated first (bounded). */
export async function listDispositions(supabase, { limit = 200 } = {}) {
  const { data, error } = await supabase
    .from('gauge_finding_dispositions')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listDispositions: query failed: ${error.message}`);
  return data || [];
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  if (command === 'accept') {
    const fingerprint = args[1];
    const reReviewAt = parseFlag(args, 're-review');
    const reason = parseFlag(args, 'reason');
    const dispositionedBy = parseFlag(args, 'by') || 'coordinator';
    const row = await acceptDisposition(supabase, { fingerprint, reReviewAt, reason, dispositionedBy });
    console.log(`Disposition recorded: ${row.fingerprint} -> accepted_known_state (re-review ${row.re_review_at})`);
    process.exit(0);
  }

  if (command === 'status') {
    const fingerprint = args[1];
    const row = await getDisposition(supabase, fingerprint);
    if (!row) { console.log(`No disposition found for fingerprint "${fingerprint}".`); process.exit(0); }
    console.log(JSON.stringify(row, null, 2));
    process.exit(0);
  }

  if (command === 'list') {
    const rows = await listDispositions(supabase);
    console.log(`${rows.length} disposition(s):`);
    for (const r of rows) {
      const live = new Date(r.re_review_at).getTime() > Date.now();
      console.log(`  [${live ? 'LIVE' : 'EXPIRED'}] ${r.fingerprint} re_review_at=${r.re_review_at} by=${r.dispositioned_by} reason="${r.reason}"`);
    }
    process.exit(0);
  }

  console.log('Usage:');
  console.log('  node scripts/gauge-findings/disposition.js accept <fingerprint> --re-review <ISO-date> --reason "<text>" --by <who>');
  console.log('  node scripts/gauge-findings/disposition.js status <fingerprint>');
  console.log('  node scripts/gauge-findings/disposition.js list');
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
