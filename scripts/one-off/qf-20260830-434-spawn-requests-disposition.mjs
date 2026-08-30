// QF-20260830-434 — one-time disposition pass over the 42 historical worker_spawn_requests rows
// that never fulfilled (37 status='expired' + 5 status='pending' whose expires_at is already
// past, per the QF's own MEASURED census). Each gets a disposition stamped into its own
// payload.disposition — a row-level fact, not prose in a PR description.
//
// VERDICT (measured, not assumed): all 42 rows request one of the 8 NATO callsigns and every
// expires_at is well in the past (oldest 2026-05-28, newest 2026-08-29 — all before this script's
// run date). The fleet's actual liveness signal for these callsigns today is independent of this
// mechanism entirely (worker-checkin.cjs heartbeats), so none of the 42 represent a still-live
// revival need — every one is CLOSED (moment passed), none re-raised. If a callsign genuinely
// needs reviving today, that is a fresh coordinator-revive.cjs call, not a resurrection of a
// weeks-old row.
//
// Bounded (<=47 rows total, this table's entire population), counted before write, dry-run by
// default; --execute performs the write.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const EXECUTE = process.argv.includes('--execute');
const DISPOSITION_REASON = 'QF-20260830-434: historical spawn request expired without a live consumer; the callsign\'s current liveness (if any) is independently confirmed via worker-checkin heartbeats, not this row. Closed — moment passed, not re-raised.';

async function main() {
  const sb = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: rows, error } = await sb
    .from('worker_spawn_requests')
    .select('id, requested_callsign, status, requested_at, expires_at, payload')
    .neq('status', 'fulfilled')
    .order('requested_at', { ascending: true })
    .limit(999);
  if (error) throw error;

  const alreadyDisposed = rows.filter((r) => r.payload && r.payload.disposition);
  const pending = rows.filter((r) => !r.payload || !r.payload.disposition);
  console.log(`[qf-434-disposition] ${rows.length} non-fulfilled rows total; ${alreadyDisposed.length} already disposed; ${pending.length} to disposition.`);
  console.log('[qf-434-disposition] sample (first 5):', JSON.stringify(pending.slice(0, 5).map((r) => ({ id: r.id, cs: r.requested_callsign, status: r.status })), null, 1));

  if (!EXECUTE) {
    console.log('[qf-434-disposition] DRY RUN — pass --execute to write. No rows changed.');
    return;
  }

  let written = 0;
  const errors = [];
  for (const row of pending) {
    const patch = { payload: { ...(row.payload || {}), disposition: { verdict: 'closed_moment_passed', reason: DISPOSITION_REASON, at: new Date().toISOString() } } };
    const { error: upErr } = await sb.from('worker_spawn_requests').update(patch).eq('id', row.id);
    if (upErr) { errors.push({ id: row.id, error: upErr.message }); continue; }
    written += 1;
  }
  console.log(`[qf-434-disposition] wrote disposition on ${written}/${pending.length} rows.`);
  if (errors.length) console.error('[qf-434-disposition] errors:', JSON.stringify(errors, null, 1));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('[qf-434-disposition] FAILED:', e.message); process.exit(1); });
}
