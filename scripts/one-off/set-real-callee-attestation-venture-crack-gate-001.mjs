// REAL_CALLEE_ATTESTATION for SD-FDBK-FIX-VENTURE-CRACK-GATE-001 (gate is presence-only,
// non-blocking this increment -- see
// scripts/modules/handoff/executors/exec-to-plan/gates/real-callee-attestation.js).
// Names, for each cross-module call this SD's implementation introduced, the test that exercises
// the REAL (unmocked) callee -- verified by reading the actual test files/CI runs, not asserted
// from memory. Deliberately honest about what is NOT real-DB-tested: two of the three new DB
// objects have no DDL test wired into CI (a pre-existing repo gap, not unique to this SD -- see
// docs/reference/venture-gate-attestations-guide.md), so this attestation says "none" for those
// rather than overclaiming unit-mock coverage as equivalent.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-FDBK-FIX-VENTURE-CRACK-GATE-001';

const { data: current, error: fetchErr } = await supabase.from('strategic_directives_v2')
  .select('metadata').eq('sd_key', SD_KEY).maybeSingle();
if (fetchErr) throw fetchErr;
if (!current) throw new Error(`No SD found for sd_key=${SD_KEY}`);

const real_callee_attestation = {
  'crack-gate-evaluator.js:evaluateCrackGateStatus -> supabase.rpc(venture_pbn_status) / .from(v_venture_gate_attestations_latest)':
    'tests/unit/marketing/crack-gate-evaluator.test.js exercises the JS orchestration against a MOCKED supabase client, not the real Postgres function/view -- the real venture_pbn_status(uuid) callee has no DDL test wired into CI (database/migrations/20260817_set_venture_pbn_verdict_stage_zero.sql and database/chairman-gated/20260817_venture_pbn_status_read.sql are both absent from .github/workflows/drive-reports-ddl.yml paths). Its own migration file DO $verify$ block does behaviorally exercise the real function, but only at apply time, not as a repeatable CI-gated regression test.',
  'crack-gate-evaluator.js:evaluateCrackGateStatus -> .from(v_venture_gate_attestations_latest) [attestations table/view half only]':
    'tests/ddl/venture-gate-attestations-ddl.db.test.js -- runs against a REAL Postgres container in CI (ddl job, verified live: PR#7219 run 32078737280, 47s), exercising the append-only triggers, TRUNCATE-block, and CHECK constraints on the actual applied schema. This is the one real-DB-tested callee in this SD.',
  'scripts/cron/venture-ops-actuals-sweep.mjs Job 4 -> crack-gate-evaluator.js:evaluateCrackGateStatus / recordCrackGateObservation':
    'tests/unit/cron/venture-ops-actuals-sweep.test.js injects evaluateCrackGateStatus/recordCrackGateObservation as mocked deps -- confirms activation/wiring/error-isolation, not the real DB round-trip (covered, or not, by the two attestations above).',
  'lib/marketing/autonomy-gate.js:checkPublishAuthorization/evaluateGraduation -> crack-gate-evaluator.js:evaluateCrackGateStatus':
    'tests/unit/marketing/crack-gate-precondition.test.js -- confirms the observe-only wiring never affects the return value (mocked evaluator), not the real DB round-trip.',
  'scripts/eva/retroactive-pbn-score.mjs:retroactivelyScoreVenture -> supabase.rpc(set_venture_pbn_verdict_stage_zero)':
    'none -- unit-tested against a mocked supabase.rpc() call only (no test file for this script beyond CLI-arg parsing). The real set_venture_pbn_verdict_stage_zero(uuid,jsonb) callee has no DDL test wired into CI; its own migration file DO $verify$ block behaviorally proves both the already-scored guard and the stage_zero-key-creation fix (added and re-verified live during PR3 review, see database/migrations/20260817_set_venture_pbn_verdict_stage_zero.sql), but only runs at apply time, not as a repeatable CI-gated regression test. This script is also explicitly documented as not run against real ventures by this SD -- a human decision, not an automatic EXEC-phase side effect.',
};

const metadata = { ...(current.metadata || {}), real_callee_attestation };

const { data: updated, error: updateErr } = await supabase.from('strategic_directives_v2')
  .update({ metadata })
  .eq('sd_key', SD_KEY)
  .select('sd_key, metadata').maybeSingle();
if (updateErr) throw updateErr;
console.log('real_callee_attestation set, keys:', Object.keys(updated.metadata.real_callee_attestation));
