// REAL_CALLEE_ATTESTATION for SD-LEO-INFRA-ARM-BINDING-EXIT-001 (gate is presence-only,
// non-blocking this increment -- see
// scripts/modules/handoff/executors/exec-to-plan/gates/real-callee-attestation.js).
// Names, for each cross-module/DB call this SD's implementation introduced, the test that
// exercises the REAL (unmocked) callee -- verified by reading the actual test files and by
// running the CLI live against production during EXEC, not asserted from memory.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-ARM-BINDING-EXIT-001';

const { data: current, error: fetchErr } = await supabase.from('strategic_directives_v2')
  .select('metadata').eq('sd_key', SD_KEY).maybeSingle();
if (fetchErr) throw fetchErr;
if (!current) throw new Error(`No SD found for sd_key=${SD_KEY}`);

const real_callee_attestation = {
  'crack-gate-criterion.js:evaluateCrackGateCriterion / computeSourceBreakdown':
    'none -- pure functions with zero external callee (no DB, no RPC). Fully covered by tests/unit/eva/lifecycle/crack-gate-criterion.test.js against synthetic in-memory data; there is no real callee to attest.',
  'crack-gate-criterion.js:fetchAllCrackGateObserveRows -> supabase.from(system_events).select().eq().range() (via fetchAllPaginated)':
    'tests/unit/eva/lifecycle/crack-gate-criterion.test.js (TS-8) mocks the supabase client -- not a real Postgres round-trip. The REAL callee was verified live during EXEC by running `node scripts/eva/check-gate-attestation-status.mjs --fleet-summary --json` against production twice (2026-08-18 ~20:32Z): total_observations_all_time=16 matched an independent direct COUNT query taken moments earlier. Session-run verification, not a repeatable CI-gated regression test -- system_events has no dedicated DDL test in tests/ddl/ for this event_type.',
  'crack-gate-criterion.js:fetchCrackGateSubstrateSignals -> supabase.from(venture_gate_attestations).select(*,{count:exact,head:true})':
    'tests/unit/eva/lifecycle/crack-gate-criterion.test.js (TS-8) mocks the supabase client. REAL callee verified live during EXEC: the same live CLI run read attestationRowCount matching an independent direct count-query (=1) taken moments earlier. venture_gate_attestations has tests/ddl/venture-gate-attestations-ddl.db.test.js (real Postgres container in CI, from the sibling SD-MAN-INFRA-VENTURE-CRACK-GATE-001) but that suite does not exercise THIS SD\'s new count-query code path specifically -- it proves the table/constraints, not this call site.',
  'crack-gate-criterion.js:fetchCrackGateSubstrateSignals -> supabase.from(venture_nursery).select(pbn_verdict).limit(1)':
    'tests/unit/eva/lifecycle/crack-gate-criterion.test.js (TS-8) mocks the supabase client, including the exact "Could not find the \'pbn_verdict\' column" error-message-detection path (mirrors lib/eva/stage-zero/venture-nursery.js\'s own production error handling for the same migration). REAL callee verified live during EXEC: the same live CLI run resolved pbnAvailable=true (column readable, zero rows returned, no error) against production. Session-run verification, not a repeatable CI-gated regression test.',
  'check-gate-attestation-status.mjs:reportFleetSummary -> the three crack-gate-criterion.js exports above (additive fields)':
    'tests/e2e/crack-gate-status-cli.test.js (TS-2/TS-6/TS-8 cases, run via `npm run test:e2e:vitest`) mocks the supabase client end-to-end through main(). REAL end-to-end callee verified live during EXEC: `node scripts/eva/check-gate-attestation-status.mjs --fleet-summary --json` (now also `npm run eva:crack-gate-status -- --fleet-summary`) executed against production and returned the expected shape/values with observations_in_window/promotion_ready UNCHANGED from pre-SD behavior (exit code 1, matching the existing 5-would-block-row window state).',
};

const metadata = { ...(current.metadata || {}), real_callee_attestation };

const { data: updated, error: updateErr } = await supabase.from('strategic_directives_v2')
  .update({ metadata })
  .eq('sd_key', SD_KEY)
  .select('sd_key, metadata').maybeSingle();
if (updateErr) throw updateErr;
console.log('real_callee_attestation set, keys:', Object.keys(updated.metadata.real_callee_attestation));
