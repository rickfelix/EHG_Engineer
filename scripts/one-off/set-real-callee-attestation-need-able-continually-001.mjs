// REAL_CALLEE_ATTESTATION for SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001 (gate is presence-only,
// non-blocking this increment -- see
// scripts/modules/handoff/executors/exec-to-plan/gates/real-callee-attestation.js).
// Names, for each cross-module/DB call this SD's implementation introduced, the test that
// exercises the REAL (unmocked) callee -- honestly disclosing which paths are code-review/
// mocked-test-only vs actually run against a live database.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001';

const real_callee_attestation = {
  "venture-activation-gate.js:resolveCpaRung() -- supabase.from('daily_rollups').select('spend_cents, conversions').eq('venture_id', ...).gte('rollup_date', ...)":
    "tests/unit/marketing/venture-activation-gate.test.js's FR-2/TR-3/TR-4 describe block exercises resolveCpaRung() against a hand-rolled fakeSupabase() mock (dailyRollupsBuilder), NOT a live Supabase client -- the unit suite alone does not prove PostgREST accepts this exact select/eq/gte combination. Partially live-verified during PLAN's FR-4 substrate check: `supabase.from('daily_rollups').select('*').limit(1)` against production returned {success:true, data:[], status:200}, confirming the table and its spend_cents/conversions columns resolve against the real schema (0 rows returned, since daily_rollups is empty fleet-wide as of this SD). The additional venture_id/rollup_date .eq()/.gte() filters were not independently re-run against production with the exact resolveCpaRung() call shape -- only the mocked unit tests cover that combination.",
  "scripts/cpa-gauge-cli.mjs:queryCpaGaugeForChannel() -- same daily_rollups query, plus a platform .eq() filter":
    'tests/unit/query-cpa-gauge.test.js exercises this against the same style of hand-rolled fakeSupabase() mock, not a live client. Never run against production with real argv (no synthetic daily_rollups test data has been seeded live, per FR-4/FR-3\'s documented finding that daily_rollups is empty fleet-wide) -- this is a code-review + mocked-unit-test-only verification, not a live-run one.',
  'lib/telemetry/cpa-gauge.mjs:computeCpaGaugeState() -- pure function, no external callee':
    'tests/unit/telemetry/cpa-gauge.test.js (8 tests, including TS-7\'s genuine multi-row-SUM proof and a deliberate mutation-test spot-check performed during EXEC that confirmed the SUM test fails when the aggregation logic is reverted to a last-row-only implementation) directly and completely exercises this function -- no mock needed since it takes no I/O.',
};

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: current, error: fetchErr } = await supabase.from('strategic_directives_v2')
    .select('metadata').eq('sd_key', SD_KEY).maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!current) throw new Error(`No SD found for sd_key=${SD_KEY}`);

  const metadata = { ...(current.metadata || {}), real_callee_attestation };

  const { data: updated, error: updateErr } = await supabase.from('strategic_directives_v2')
    .update({ metadata })
    .eq('sd_key', SD_KEY)
    .select('sd_key, metadata').maybeSingle();
  if (updateErr) throw updateErr;
  console.log('real_callee_attestation set, keys:', Object.keys(updated.metadata.real_callee_attestation));
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
