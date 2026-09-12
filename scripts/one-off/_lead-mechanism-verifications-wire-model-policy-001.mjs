#!/usr/bin/env node
/**
 * LEAD-phase mechanism-claim verification + smoke-test/success-criteria correction for
 * SD-LEO-INFRA-WIRE-MODEL-POLICY-001, ahead of the LEAD-TO-PLAN gate
 * (GATE_MECHANISM_CLAIM_VERIFIER + SMOKE_TEST_SPECIFICATION).
 *
 * Every file+function claim made in the SD's description/PRD was read and line-cited directly by
 * this worker (see scripts/one-off/wire-model-policy-001-lead-explore-evidence.mjs for the Explore
 * evidence row covering the same reads).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-WIRE-MODEL-POLICY-001';
const VERIFIED_BY = 'Alpha-2 (worker, direct file read)';
const VERIFIED_AT_TS = new Date().toISOString();

const mechanism_verifications = [
  { claim: 'lib/fleet/role-status-identity.cjs exports verdictFromMetadata(metadata) -> role/worker/unknown', verified_by: VERIFIED_BY, verified_at: 'lib/fleet/role-status-identity.cjs:91' },
  { claim: 'lib/fleet/role-status-identity.cjs exports async roleVerdictFor({sessionId, supabase})', verified_by: VERIFIED_BY, verified_at: 'lib/fleet/role-status-identity.cjs:169' },
  { claim: 'lib/governance/emit-feedback.js exports async emitFeedback({...}) with day-salted dedup', verified_by: VERIFIED_BY, verified_at: 'lib/governance/emit-feedback.js:171' },
  { claim: 'lib/fleet/model-policy.cjs exports coarseModelAlias(raw)', verified_by: VERIFIED_BY, verified_at: 'lib/fleet/model-policy.cjs:25' },
  { claim: 'lib/fleet/model-policy.cjs exports seatClassFor({role})', verified_by: VERIFIED_BY, verified_at: 'lib/fleet/model-policy.cjs:38' },
  { claim: 'lib/fleet/model-policy.cjs exports policyModelFor(seatClass)', verified_by: VERIFIED_BY, verified_at: 'lib/fleet/model-policy.cjs:44' },
  { claim: 'scripts/hooks/capture-session-id.cjs fetches existingMetadata BEFORE its upsert, passed into buildSessionMetadata(existingMetadata, ...)', verified_by: VERIFIED_BY, verified_at: 'scripts/hooks/capture-session-id.cjs:430-448' },
  { claim: 'scripts/hooks/capture-session-id.cjs calls upsertSessionRow(sessionId, ccPid, data.source, data.model) inside main()', verified_by: VERIFIED_BY, verified_at: 'scripts/hooks/capture-session-id.cjs:757' },
  { claim: 'scripts/hooks/capture-session-id.cjs\'s final resolve() after the tick-spawn try/catch block (the FR-1 insertion point)', verified_by: VERIFIED_BY, verified_at: 'scripts/hooks/capture-session-id.cjs:838' },
  { claim: 'scripts/fleet-dashboard.cjs already selects session metadata in its query (no new query needed for FR-2)', verified_by: VERIFIED_BY, verified_at: 'scripts/fleet-dashboard.cjs:339' },
  { claim: 'scripts/fleet-dashboard.cjs already projects metadata.model/metadata.effort per session (the projection FR-2 extends)', verified_by: VERIFIED_BY, verified_at: 'scripts/fleet-dashboard.cjs:362-363' },
];

const success_criteria = [
  { criterion: 'A worker seat with no pre-existing role/is_coordinator/non_fleet metadata, observed running any Fable-family model, produces exactly one feedback row per day via emitFeedback (verified by a unit test asserting a second identical SessionStart the same day inserts zero additional rows).', measure: 'Unit test in a new *.test.js file, confirmed collected by `npx vitest list`, passes.' },
  { criterion: 'A session whose pre-write existingMetadata carries is_coordinator:true (no role string) is classified as a role seat and never signals a mismatch when observed running claude-fable-5-1 -- the exact false positive measured live against the naive approach is eliminated.', measure: 'Unit test constructing that exact fixture asserts zero calls to the injected emit function.' },
  { criterion: 'Forcing the injected emit/supabase call inside signalModelPolicyMismatch to throw does not prevent scripts/hooks/capture-session-id.cjs\'s main() from completing and calling resolve() -- existing SessionStart registration is provably unaffected by a bug in the new code.', measure: 'Unit test asserting resolve()/callback completion despite a thrown error inside the new function.' },
  { criterion: 'scripts/fleet-dashboard.cjs reports an off-policy seat count against a fixture set (coordinator-shaped row + worker-on-Fable row + role-on-policy row) that exactly matches the hand-computed expected value of 1, using no additional Supabase query beyond what the dashboard already issues.', measure: 'Unit test comparing the computed count to the hand-computed value; query-count assertion (no new .from()/.select() call added).' },
];

const smoke_test_steps = [
  { step_number: 1, instruction: 'Run the new FR-1 unit test suite directly: `npx vitest run tests/unit/hooks/<new-file>.test.js`.', expected_outcome: 'All new tests pass, including the coordinator-false-positive and fail-open-on-throw cases.' },
  { step_number: 2, instruction: 'Run `npx vitest list` and grep for the new test file path.', expected_outcome: 'The new file appears in the list -- confirms it is NOT a dark *.test.cjs file that CI would silently skip.' },
  { step_number: 3, instruction: 'Run `npm run fleet:dashboard` (or the FR-2 unit test fixture equivalent) against a small fixture including a coordinator-shaped row, a worker-on-Fable row, and a role-on-policy row.', expected_outcome: 'The off-policy count line reads exactly 1, not 0 and not abstained.' },
];

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: existing, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const mergedMetadata = { ...(existing.metadata || {}), mechanism_verifications, mechanism_verifications_at: VERIFIED_AT_TS };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({ success_criteria, smoke_test_steps, metadata: mergedMetadata })
    .eq('sd_key', SD_KEY)
    .select('id, sd_key');
  if (error) throw new Error(`update failed: ${error.message}`);
  if (!data || data.length === 0) throw new Error(`no row matched sd_key=${SD_KEY}`);
  console.log(`Updated ${data[0].sd_key} (${data[0].id}) with ${mechanism_verifications.length} mechanism verifications, ${success_criteria.length} success_criteria, ${smoke_test_steps.length} smoke_test_steps.`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
