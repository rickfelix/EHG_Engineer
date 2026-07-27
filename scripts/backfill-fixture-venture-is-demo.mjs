#!/usr/bin/env node
/**
 * Backfill ventures.is_demo=true for fixture ventures — QF-20260726-908.
 *
 * WHY THIS IS THE FIX RATHER THAN A NEW FILTER. The chairman's queue
 * (chairman_pending_decisions -> chairman_unified_decisions) ALREADY excludes
 * `COALESCE(is_demo,false)=true OR name ~ '^(__e2e_|__citest_|canonical-source-test-|Test Venture for)'`.
 * Both legs currently miss the offending rows:
 *   - the name regex is ANCHORED and the fixture family was renamed (HCGate-RealDB-*,
 *     StageArtifactGate-RealDB-*), matching none of it — exactly the "a name-regex stopgap stops
 *     working the first time a fixture is named something else" failure the QF predicted;
 *   - the is_demo leg is barely populated: measured 74 fixture-named ventures, only 11 flagged.
 * So the robust leg is inert. Populating it makes the EXISTING filter work with NO schema change —
 * verified live by flagging one venture (its queue row vanished) and reverting.
 *
 * SAFETY. Identification is delegated to isFixtureVenture, the CANONICAL predicate already used by
 * the chairman surfaces. A fourth private regex is how this class of bug happens, so there isn't
 * one here. The write is POSITIVE-IDENTIFICATION ONLY: a venture is touched solely when the shared
 * predicate says fixture. Never clears the flag — a false positive would be far worse than a miss,
 * so this only ever sets true, and is a no-op on rows already flagged (idempotent, re-runnable).
 *
 * DRY RUN BY DEFAULT. Pass --apply to write. Prints the exact rows either way so the change is
 * reviewable before it touches a governance-visible surface.
 *
 *   node scripts/backfill-fixture-venture-is-demo.mjs            # preview
 *   node scripts/backfill-fixture-venture-is-demo.mjs --apply    # write
 */
import { createClient } from '@supabase/supabase-js';
import { isFixtureVenture } from '../lib/chairman/chairman-actionable.mjs';

const APPLY = process.argv.includes('--apply');
const LIMIT = 2000;

function makeClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  return createClient(url, key);
}

export async function findUnflaggedFixtures(supabase) {
  const { data, error } = await supabase
    .from('ventures')
    .select('id, name, is_demo')
    .limit(LIMIT);
  if (error) throw new Error(`ventures read failed: ${error.message}`);
  // Positive identification only, and skip anything already flagged (idempotent).
  return (data || []).filter((v) => v.is_demo !== true && isFixtureVenture(v));
}

async function main() {
  const supabase = makeClient();
  const targets = await findUnflaggedFixtures(supabase);

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${targets.length} unflagged fixture venture(s) identified by isFixtureVenture()`);
  for (const v of targets.slice(0, 40)) console.log(`  ${v.id}  ${v.name}`);
  if (targets.length > 40) console.log(`  ... and ${targets.length - 40} more`);

  if (!APPLY) {
    console.log('\nNo writes performed. Re-run with --apply to set is_demo=true on the rows above.');
    return;
  }
  if (targets.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  let updated = 0;
  for (const v of targets) {
    // Guard the write itself on is_demo IS NOT true, so a concurrent flagger cannot be clobbered
    // and a re-run cannot double-count.
    const { data, error } = await supabase
      .from('ventures')
      .update({ is_demo: true })
      .eq('id', v.id)
      .not('is_demo', 'is', true)
      .select('id');
    if (error) {
      console.error(`  FAILED ${v.name}: ${error.message}`);
      continue;
    }
    if (data?.length) updated += 1;
  }
  console.log(`\nFlagged ${updated} venture(s).`);

  // Report the consumer-visible effect, not just the write count — the point of the change is
  // what the chairman sees, and a write that did not move that number would be a false success.
  const { count } = await supabase
    .from('chairman_pending_decisions')
    .select('*', { count: 'exact', head: true });
  console.log(`chairman_pending_decisions now holds ${count} row(s).`);
}

// Only run when invoked directly, so the pure finder above stays importable by tests.
if (process.argv[1] && process.argv[1].endsWith('backfill-fixture-venture-is-demo.mjs')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
