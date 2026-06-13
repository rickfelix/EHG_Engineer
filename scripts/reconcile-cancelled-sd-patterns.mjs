#!/usr/bin/env node
/**
 * reconcile-cancelled-sd-patterns — one-time / re-runnable reconciler that resets
 * the existing backlog of issue_patterns dangling on CANCELLED SDs back to active,
 * so they re-enter the learning queue.
 *
 * SD-LEO-INFRA-CLOSE-ISSUE-PATTERN-001 (FR-3, audit finding #3 closure-loop gap).
 *
 * Backstop for the trg_reset_patterns_on_sd_cancel trigger: the trigger prevents
 * NEW danglers on every cancel path; this clears the pre-existing ones.
 *
 * Invariants (testing-agent CONDITIONAL_PASS cases C4/C5 + idempotency):
 *   - Query-driven: the dangler set is computed live (NEVER a hardcoded count).
 *   - Idempotent: only rows still status='assigned' are reset; a second run is a no-op.
 *   - Resolves assigned_sd_id by BOTH uuid (id) and sd_key form.
 *   - Ghost-refs (assigned_sd_id -> no existing SD) resolve to no cancelled SD and
 *     are skipped, never crashing the run.
 *   - Per-row continue-on-error with a {scanned, reset, skipped, failed} tally.
 *   - Dry-run by default; --execute required to mutate. Mirrors the SQL reset:
 *     status='active', assigned_sd_id=NULL, assignment_date=NULL, + breadcrumb.
 *
 * Usage:
 *   node scripts/reconcile-cancelled-sd-patterns.mjs            # dry-run (count only)
 *   node scripts/reconcile-cancelled-sd-patterns.mjs --execute  # apply the reset
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const EXECUTE = process.argv.includes('--execute');

function loadEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env');
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m || process.env[m[1]] !== undefined) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  } catch { /* ignore */ }
}
loadEnv();

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function loadCancelledSdKeysAndIds() {
  // Paginate cancelled SDs; build a set of BOTH their id (uuid) and sd_key so we
  // can match assigned_sd_id stored in either form.
  const set = new Set();
  // SD-FDBK-FIX-PATTERN-ALERT-CREATOR-001 (b): evidence map — cancelled SDs with a
  // recorded cancellation_reason are evidence-cancels; their patterns get RESOLVED
  // (suppressed) instead of reset to active (the reset re-armed the alert creator).
  const evidence = new Map();
  const pageSize = 1000;
  for (let start = 0; start < 50000; start += pageSize) {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, cancellation_reason')
      .eq('status', 'cancelled')
      .range(start, start + pageSize - 1);
    if (error) throw new Error(`cancelled SD query failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const hasReason = !!(r.cancellation_reason && String(r.cancellation_reason).trim().length > 0);
      if (r.id) { set.add(r.id); evidence.set(r.id, hasReason); }
      if (r.sd_key) { set.add(r.sd_key); evidence.set(r.sd_key, hasReason); }
    }
    if (data.length < pageSize) break;
  }
  return { set, evidence };
}

async function loadAssignedPatterns() {
  const rows = [];
  const pageSize = 1000;
  for (let start = 0; start < 50000; start += pageSize) {
    const { data, error } = await supabase
      .from('issue_patterns')
      .select('id, pattern_id, assigned_sd_id, assignment_date, metadata, status')
      .eq('status', 'assigned')
      .range(start, start + pageSize - 1);
    if (error) throw new Error(`assigned pattern query failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

async function main() {
  console.log(`mode=${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}`);
  const { set: cancelled, evidence } = await loadCancelledSdKeysAndIds();
  const assigned = await loadAssignedPatterns();
  console.log(`cancelled SDs (id+sd_key tokens): ${cancelled.size} | status='assigned' patterns: ${assigned.length}`);

  const danglers = assigned.filter(p => p.assigned_sd_id && cancelled.has(p.assigned_sd_id));
  const ghostOrOther = assigned.length - danglers.length;
  console.log(`cancelled-SD danglers (to reset): ${danglers.length} | other assigned (live/completed/ghost-ref, untouched): ${ghostOrOther}`);

  const tally = { scanned: danglers.length, reset: 0, skipped: 0, failed: 0 };

  if (!EXECUTE) {
    console.log('\n(DRY-RUN) predicate: issue_patterns.status=\'assigned\' AND assigned_sd_id IN (<cancelled SD id|sd_key set>)');
    console.log(`(DRY-RUN) would reset ${danglers.length} pattern(s) -> status='active', assigned_sd_id=NULL, assignment_date=NULL, +breadcrumb`);
    const sample = danglers.slice(0, 10).map(p => `${p.pattern_id || p.id} <- ${p.assigned_sd_id}`);
    console.log('(DRY-RUN) sample:\n  ' + sample.join('\n  '));
    console.log(`\nSUMMARY ${JSON.stringify(tally)} (no changes made; pass --execute to apply)`);
    return;
  }

  for (const p of danglers) {
    // SD-FDBK-FIX-PATTERN-ALERT-CREATOR-001 (b): resolve-or-suppress vs requeue.
    // Evidence-cancel (SD has a recorded cancellation_reason) -> status='resolved'
    // with disposition so the alert creator never re-files. Plain cancel -> legacy
    // reset to active (legitimate requeue).
    const isEvidence = evidence.get(p.assigned_sd_id) === true;
    const prior = { sd_key: p.assigned_sd_id, prior_assignment_date: p.assignment_date || null, reset_at: new Date().toISOString() };
    const metadata = isEvidence
      ? { ...(p.metadata || {}), last_cancelled_assignment: prior, disposition: { kind: 'evidence_cancelled_suppressed', cancelled_sd: p.assigned_sd_id, stamped_at: prior.reset_at, stamped_by: 'reconcile-cancelled-sd-patterns.mjs' } }
      : { ...(p.metadata || {}), last_cancelled_assignment: prior };
    const patch = isEvidence
      ? { status: 'resolved', metadata }
      : { status: 'active', assigned_sd_id: null, assignment_date: null, metadata };
    try {
      const { error } = await supabase
        .from('issue_patterns')
        .update(patch)
        .eq('id', p.id)
        .eq('status', 'assigned'); // idempotency guard: only flip rows still assigned
      if (error) { console.log(`  ✗ ${p.pattern_id || p.id}: ${error.message}`); tally.failed++; continue; }
      tally.reset++;
      if (isEvidence) console.log(`  ✓ ${p.pattern_id || p.id}: resolved (evidence-cancelled, suppressed)`);
    } catch (e) {
      console.log(`  ✗ ${p.pattern_id || p.id}: ${e?.message || e}`);
      tally.failed++;
    }
  }

  console.log(`\nSUMMARY ${JSON.stringify(tally)}`);
  process.exit(tally.failed > 0 ? 4 : 0);
}

main().catch(e => { console.error('FATAL:', e?.message || e); process.exit(1); });
