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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const APPLY = process.argv.includes('--apply');

const { data: ventures, error } = await supabase
  .from('ventures')
  .select('id, name, is_demo, created_at')
  .not('is_demo', 'is', true);

if (error) {
  console.error('Fetch failed:', error.message);
  process.exit(1);
}

const candidates = (ventures || []).filter((v) => isFixtureVenture({ ...v, is_demo: false }));

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

const { error: updErr } = await supabase
  .from('ventures')
  .update({ is_demo: true })
  .in('id', candidates.map((v) => v.id));

if (updErr) {
  console.error('Update failed:', updErr.message);
  process.exit(1);
}
console.log(`Flagged ${candidates.length} venture(s) is_demo=true.`);
// Durable audit trail: every flipped row had is_demo != true before this run, so this
// line IS the rollback recipe (adversarial-review W2 — is_demo semantics are system-wide,
// not chairman-only; a wrongly-flagged real venture must be recoverable).
console.log('ROLLBACK (if any row above is a real venture): node -e "supabase.from(\'ventures\').update({is_demo:false}).in(\'id\',[...])" with ids:');
console.log(JSON.stringify(candidates.map((v) => v.id)));
