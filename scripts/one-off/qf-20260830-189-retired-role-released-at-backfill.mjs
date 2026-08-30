// QF-20260830-189 — one-time backfill: any claude_sessions row already role-retired
// (metadata.role LIKE '%_retired') with released_at IS NULL never went through the fixed retire
// path (this backfill covers rows written before that fix, e.g. f27a883d). Stamps released_at +
// status='released' -- the same pair every OTHER retired seat's own natural exit already carries,
// which is what excludes it from the stuck-seat scan's population (status IN ('active','idle')).
// Bounded (role-retired rows are a small, closed set), counted before write, dry-run by default.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const EXECUTE = process.argv.includes('--execute');

async function main() {
  const sb = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: rows, error } = await sb
    .from('claude_sessions')
    .select('session_id, status, released_at, metadata')
    .ilike('metadata->>role', '%_retired')
    .is('released_at', null)
    .limit(999);
  if (error) throw error;

  console.log(`[qf-189-backfill] ${rows.length} role-retired row(s) with released_at IS NULL.`);
  console.log('[qf-189-backfill] sample:', JSON.stringify(rows.slice(0, 5).map((r) => ({ session_id: r.session_id, status: r.status, role: r.metadata?.role })), null, 1));

  if (!EXECUTE) {
    console.log('[qf-189-backfill] DRY RUN — pass --execute to write. No rows changed.');
    return;
  }

  let written = 0;
  const errors = [];
  const now = new Date().toISOString();
  for (const row of rows) {
    const { error: upErr } = await sb.from('claude_sessions').update({ released_at: now, status: 'released' }).eq('session_id', row.session_id);
    if (upErr) { errors.push({ session_id: row.session_id, error: upErr.message }); continue; }
    written += 1;
  }
  console.log(`[qf-189-backfill] wrote released_at/status on ${written}/${rows.length} rows.`);
  if (errors.length) console.error('[qf-189-backfill] errors:', JSON.stringify(errors, null, 1));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('[qf-189-backfill] FAILED:', e.message); process.exit(1); });
}
