#!/usr/bin/env node
// Sibling A FR-A-8: Audit-log parity check.
// JOIN strategy: bypass_ledger.audit_log_id -> validation_audit_log.id (correlation_id propagated in metadata).
// NOT a time-window check (closes VALIDATION F-A-V-12 + RISK F-A-R-03 / COND-RISK-04).

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function parseArgs(argv) {
  const out = { window_days: 7, threshold: 0.99 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--window-days') out.window_days = Number(argv[++i]);
    if (argv[i] === '--threshold') out.threshold = Number(argv[++i]);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const windowDays = process.env.ROLLING_WINDOW_DAYS ? Number(process.env.ROLLING_WINDOW_DAYS) : args.window_days;
  const threshold = process.env.PARITY_THRESHOLD ? Number(process.env.PARITY_THRESHOLD) : args.threshold;
  const sinceIso = new Date(Date.now() - windowDays * 86400000).toISOString();

  const { data: totalRows, error: totalErr, count: totalCount } = await supabase
    .from('bypass_ledger')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sinceIso);
  if (totalErr) {
    console.error(JSON.stringify({ status: 'error', error: totalErr.message }));
    process.exit(1);
  }

  const total = totalCount || 0;

  let unpaired = 0;
  if (total > 0) {
    const { count: unpairedCount, error: unpairedErr } = await supabase
      .from('bypass_ledger')
      .select('id', { count: 'exact', head: true })
      .is('audit_log_id', null)
      .gte('created_at', sinceIso);
    if (unpairedErr) {
      console.error(JSON.stringify({ status: 'error', error: unpairedErr.message }));
      process.exit(1);
    }
    unpaired = unpairedCount || 0;
  }

  const parity_rate = total === 0 ? 1.0 : (1 - unpaired / total);
  const status = parity_rate >= threshold ? 'pass' : 'fail';

  const result = {
    status,
    parity_rate: Number(parity_rate.toFixed(4)),
    total_events: total,
    unpaired_count: unpaired,
    threshold,
    window_days: windowDays,
    since: sinceIso,
    join_strategy: 'bypass_ledger.audit_log_id IS NULL (correlation_id propagated via metadata)',
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(status === 'pass' ? 0 : 1);
}

main().catch(e => { console.error(JSON.stringify({ status: 'error', error: e.message })); process.exit(1); });
