#!/usr/bin/env node
/**
 * QF-20260903-040 correction: QF-20260812-717 and QF-20260815-128 were closed by
 * coordinator-stale-qf-disposition-sweep with disposition='premise_unverified_stale',
 * disposition_reason_code='no_deterministic_signal' -- but each ticket's own text names the
 * exact deterministic check (a branch-protection API read; a headRefOid diff on PR 7060) that
 * the closure claims was unavailable. Independently re-verified live 2026-09-08: branch
 * protection on main still requires exactly one status context (Run Unit Tier
 * (quarantine-aware)), strict=false, required_approving_review_count=0 -- the premise both
 * tickets rest on is unchanged three weeks later. Reopens both via the single canonical status
 * writer (lib/quick-fix/status-writer.cjs) rather than a hand-rolled update. Idempotent: only
 * acts on rows still in the exact mis-dispositioned shape this fix targets.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { setQuickFixStatus } from '../../lib/quick-fix/status-writer.cjs';

const TARGET_IDS = ['QF-20260812-717', 'QF-20260815-128'];

function buildSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

async function main() {
  const supabase = buildSupabase();
  const { data: rows, error } = await supabase
    .from('quick_fixes')
    .select('id, status, disposition, disposition_reason_code')
    .in('id', TARGET_IDS);
  if (error) throw new Error(`fetch failed: ${error.message}`);

  for (const row of rows || []) {
    if (row.status !== 'closed' || row.disposition !== 'premise_unverified_stale' || row.disposition_reason_code !== 'no_deterministic_signal') {
      console.log(`SKIP ${row.id}: no longer in the mis-dispositioned shape (status=${row.status}, disposition=${row.disposition}, reason=${row.disposition_reason_code})`);
      continue;
    }
    await setQuickFixStatus(supabase, row.id, {
      status: 'open',
      disposition: null,
      disposition_reason_code: null,
      disposed_at: null,
      disposed_by: null,
    });
    console.log(`REOPENED ${row.id}: premise re-verified live 2026-09-08, disposition was false (a deterministic signal was named, not absent)`);
  }
}

main().catch((e) => { console.error('FATAL:', e && e.message); process.exitCode = 1; });
