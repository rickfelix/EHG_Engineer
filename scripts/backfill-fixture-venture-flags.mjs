#!/usr/bin/env node
/**
 * backfill-fixture-venture-flags.mjs — SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-002 (FR-3)
 *
 * Flags leaked fixture ventures (created is_demo=false by test suites/harnesses)
 * as is_demo=true so every chairman surface excludes them STRUCTURALLY instead of
 * by name-regex alone. Targets only ventures whose name matches the canonical
 * FIXTURE_NAME_PATTERNS (lib/chairman/chairman-actionable.mjs) while is_demo is
 * not already true — i.e. rows the surface predicate already treats as fixtures,
 * so flagging them changes no surface behavior, only makes it durable.
 *
 * DRY-RUN BY DEFAULT: prints the candidate list and exits. Pass --apply to write.
 * Idempotent: a second --apply run finds zero candidates.
 *
 * Run:  node scripts/backfill-fixture-venture-flags.mjs [--apply]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isFixtureVenture } from '../lib/chairman/chairman-actionable.mjs';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — ventures grows with portfolio
// size; a capped scan would silently under-count the fixture-flag candidate set. The follow-on
// update is chunked because it's built from this now-unbounded read.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const APPLY = process.argv.includes('--apply');
const UPDATE_CHUNK = 200;
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

let ventures;
try {
  ventures = await fetchAllPaginated(() => supabase
    .from('ventures')
    .select('id, name, is_demo, created_at')
    .not('is_demo', 'is', true)
    .order('id', { ascending: true }));
} catch (e) {
  console.error('Fetch failed:', e.message);
  process.exit(1);
}

const candidates = ventures.filter((v) => isFixtureVenture({ ...v, is_demo: false }));

console.log(`${candidates.length} unflagged fixture venture(s) matching canonical name patterns:`);
for (const v of candidates) console.log(`  ${v.id}  ${v.created_at}  ${v.name}`);

if (!APPLY) {
  console.log(candidates.length ? '\nDry-run only — re-run with --apply to set is_demo=true on the rows above.' : '\nNothing to do.');
  process.exit(0);
}

if (candidates.length === 0) {
  console.log('Nothing to apply.');
  process.exit(0);
}

// Chunked (FR-6 batch 9): candidates is built from the now-unbounded ventures read above, so an
// unchunked .in(ids) update could carry an arbitrarily large id list.
for (const idChunk of chunk(candidates.map((v) => v.id), UPDATE_CHUNK)) {
  const { error: updErr } = await supabase
    .from('ventures')
    .update({ is_demo: true })
    .in('id', idChunk);

  if (updErr) {
    console.error('Update failed:', updErr.message);
    process.exit(1);
  }
}
console.log(`Flagged ${candidates.length} venture(s) is_demo=true.`);
// Durable audit trail: every flipped row had is_demo != true before this run, so this
// line IS the rollback recipe (adversarial-review W2 — is_demo semantics are system-wide,
// not chairman-only; a wrongly-flagged real venture must be recoverable).
console.log('ROLLBACK (if any row above is a real venture): node -e "supabase.from(\'ventures\').update({is_demo:false}).in(\'id\',[...])" with ids:');
console.log(JSON.stringify(candidates.map((v) => v.id)));
