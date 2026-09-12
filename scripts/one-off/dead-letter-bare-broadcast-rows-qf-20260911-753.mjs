#!/usr/bin/env node
/**
 * QF-20260911-753 — enumerate and disposition pre-existing session_coordination rows
 * targeting the now-retired bare 'broadcast' sentinel (removed from dispatch.cjs's
 * SENTINEL_TARGETS: 0 of these rows were EVER acknowledged, across all history).
 *
 * These rows predate the fix and cannot be re-targeted to a specific recipient -- the
 * historical writers (npm-install-lock.cjs's node_modules_lock notices, chairman-directive
 * issuance, etc.) legitimately meant "everyone," a semantics no other sentinel replaces.
 * Rather than fabricate a false acknowledgment or silently leave them, this merge-patches
 * payload with a disposition marker documenting they are retired dead letters -- never
 * deletes a row, never sets acknowledged_at (that would misrepresent them as consumed).
 *
 * Usage: node scripts/one-off/dead-letter-bare-broadcast-rows-qf-20260911-753.mjs [--execute]
 * (dry-run by default; --execute performs the writes)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EXECUTE = process.argv.includes('--execute');

const { data: rows, error } = await supabase
  .from('session_coordination')
  .select('id, subject, payload, created_at, acknowledged_at')
  .eq('target_session', 'broadcast');
if (error) { console.error('FAILED (row lookup):', error.message); process.exit(1); }

const nullKind = rows.filter((r) => r.payload?.kind === undefined || r.payload?.kind === null);
const alreadyDispositioned = rows.filter((r) => r.payload?.dead_lettered_by);
const toDispose = rows.filter((r) => !r.payload?.dead_lettered_by);

console.log(`Found ${rows.length} row(s) targeting the retired bare 'broadcast' sentinel.`);
console.log(`  ${nullKind.length} with no payload.kind, ${rows.length - nullKind.length} with a kind.`);
console.log(`  ${alreadyDispositioned.length} already dead-lettered, ${toDispose.length} to disposition now.`);
console.log(`  Ever acknowledged: ${rows.filter((r) => r.acknowledged_at).length}/${rows.length} (expect 0).`);
for (const r of toDispose.slice(0, 20)) {
  console.log(`  - ${r.id}  ${r.created_at}  subject="${r.subject || '(none)'}"  kind=${r.payload?.kind ?? '(null)'}`);
}
if (toDispose.length > 20) console.log(`  ... and ${toDispose.length - 20} more`);

if (toDispose.length === 0) {
  console.log('Nothing to disposition.');
  process.exit(0);
}

if (!EXECUTE) {
  console.log('\nDRY RUN — no writes made. Re-run with --execute to apply.');
  process.exit(0);
}

let updated = 0;
for (const r of toDispose) {
  const { error: updErr } = await supabase
    .from('session_coordination')
    .update({
      payload: {
        ...(r.payload || {}),
        dead_lettered_by: 'QF-20260911-753',
        dead_lettered_at: new Date().toISOString(),
        dead_lettered_reason: "bare 'broadcast' sentinel retired -- no reader ever acknowledged it (0/91 all-time)",
      },
    })
    .eq('id', r.id);
  if (updErr) { console.error(`  FAILED on ${r.id}:`, updErr.message); continue; }
  updated++;
}
console.log(`\n✅ Dispositioned ${updated}/${toDispose.length} row(s).`);
