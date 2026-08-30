import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const PRD_ID = 'PRD-e6db824d-e5e2-4f77-9e22-052f64f98db2';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: prd, error: readErr } = await supabase.from('product_requirements_v2').select('*').eq('id', PRD_ID).single();
  if (readErr) throw readErr;

  const frs = prd.functional_requirements;
  const byId = Object.fromEntries(frs.map((f, i) => [f.id, i]));

  // FR-3: correct the rawUnclaimed field mislabel (TESTING finding F4) — rawUnclaimed is SD count, not QF count.
  frs[byId['FR-3']] = {
    ...frs[byId['FR-3']],
    description: frs[byId['FR-3']].description.replace(
      "predicate: (a) no live worker seat is idle (workers-from-gatherCapacityInputs all claimed), AND (b) direct OPEN_UNCLAIMED count = 0 (quick_fixes.status='open' AND claiming_session_id IS NULL, plus claimable SD drafts — distinct from gatherCapacityInputs()'s dispatchable-leaf claimableCount, per the coordinator's own 14d1b4c6 finding that claimableWithVerify alone missed QF-20260830-283), AND (c) claimableWithVerifyQfCount = 0",
      "predicate: (a) idleNow === 0 (no live worker seat idle), AND (b) rawUnclaimed === 0 AND openQfCount === 0 (rawUnclaimed is the raw-unclaimed STRATEGIC DIRECTIVE count per scripts/lib/capacity-inputs.mjs:~338, openQfCount is the quick_fixes count per :~308 — TESTING sub-agent finding F4 corrected an earlier draft that mislabeled rawUnclaimed as a QF count, which would have silently dropped the QF dimension of predicate (b) and re-created the exact QF-20260830-283 miss the predicate exists to prevent), AND (c) claimableWithVerifyQfCount = 0"
    ),
    acceptance_criteria: [
      ...frs[byId['FR-3']].acceptance_criteria.filter((ac) => !ac.startsWith('predicate (b) counts BOTH')),
      "predicate (b) uses rawUnclaimed===0 AND openQfCount===0 (NOT claimableCount, and NOT treating rawUnclaimed as a QF field) — corrected per TESTING finding F4",
    ],
  };

  // FR-4: fix TS-2/AC-1 tautology (TESTING finding F1) — the predicate itself needs a unit-test seam.
  frs[byId['FR-4']] = {
    ...frs[byId['FR-4']],
    requirement:
      frs[byId['FR-4']].requirement +
      ' Requires extracting the loaded-and-quiet predicate as a standalone pure function (see FR-7) so it has its own unit-test seam — testing decideCadence() alone with a pre-computed boolean only re-tests the existing else-branch, not the predicate (TESTING finding F1).',
    acceptance_criteria: [
      ...frs[byId['FR-4']].acceptance_criteria,
      'The loaded-and-quiet predicate (FR-7) has direct unit tests independent of decideCadence(), covering each of the four input dimensions individually forcing the predicate false',
      "A golden-baseline regression: a fixed matrix of decideCadence(s) inputs (quiescent × hasUnactionedDirective × hasUndeliveredChairmanEscalation × partyOffsetS × desiredQuiescentParkS × desiredActiveS) is hashed before and after the change; the hash is unchanged when loadedAndQuiet is omitted (TESTING finding F5 — 'byte-identical' claims are not enforceable by range-based assertions alone)",
      'The existing never-300 sweep (tests/unit/coordinator/quiet-tick.test.js lines ~45-55) is EXTENDED to cover the new loaded-and-quiet arm rather than adding a parallel TS-1-only check, and explicitly asserts band separation (band min 540 > ACTIVE_MAX_S 270)',
    ],
  };

  // FR-6: correct per TESTING findings F2/F3 — the originally-proposed fixture is a no-op, and the live measurement must name its delivery channel and pre-register the predicted outcome.
  frs[byId['FR-6']] = {
    ...frs[byId['FR-6']],
    description:
      frs[byId['FR-6']].description +
      ' TESTING sub-agent (PLAN phase, evidence d5e8a6ac) found the mechanism: a parked worker seat runs no tools while parked, so no PostToolUse hook fires (.claude/settings.json:110 registers scripts/hooks/coordination-inbox.cjs there), so a session_coordination directive INSERT is never observed until the seat\'s own park interval naturally expires. Grepping scripts/ and lib/ found NO preemption path for an armed ScheduleWakeup anywhere. This makes the amendment_2 exposure STRUCTURAL, not probabilistic: the loaded-and-quiet band genuinely does expose up to the full band length (660s) of undelivered-directive latency via the session_coordination lane the band is priced on. A decideCadence-level fixture (asserting hasUnactionedDirective=true still yields the 15-45s hard-wake value) is BYTE-EQUIVALENT to an existing test (quiet-tick.test.js:123-128) and demonstrates nothing new about delivery — it must not be presented as satisfying this FR.',
    acceptance_criteria: [
      'The live measurement explicitly uses the session_coordination directive lane (the lane the band is priced on) — a SendMessage/task-notification-channel measurement is a DIFFERENT lane and must not be substituted or reported as satisfying this FR',
      'Given the structural finding (no preemption path exists for an armed ScheduleWakeup), the live measurement is PREDICTED to show the directive does NOT reach the parked seat within the hard-wake window; this predicted-FAIL outcome is pre-registered in the PR before the measurement runs, so the measurement cannot be laundered into an unexpected PASS',
      'Per the predicted outcome: this SD ships FR-1 (registry durability fix) ALONE in this PR, documents the FR-6 finding with the live measurement evidence, and reopens the band decision with the coordinator per amendment_2\'s own gate ("must not ship... or must ship with the exposure restated honestly") — FR-2/FR-3/FR-4/FR-5 (the band-widening change itself) are DEFERRED to a follow-up SD/QF pending either a parked-seat preemption mechanism or an explicit chairman/coordinator acceptance of the full-band exposure',
    ],
  };

  // FR-7 (NEW): extract the predicate as a pure, independently-testable function (TESTING finding F1).
  frs.push({
    id: 'FR-7',
    requirement:
      'Extract the loaded-and-quiet predicate as a standalone pure exported function computeLoadedAndQuiet({idleNow, rawUnclaimed, openQfCount, claimableWithVerifyQfCount, unactionedDirective, undeliveredEscalation}) -> boolean, called from coordinator-quiet-tick.mjs main() and unit-tested independently of decideCadence().',
    description:
      'TESTING sub-agent finding F1: without this extraction, FR-4\'s regression fixtures (an open unclaimed row forces the ACTIVE band, etc.) are unmeasurable — passing a pre-computed boolean into decideCadence() and asserting the ACTIVE band only re-tests the pre-existing else-branch, never the predicate logic itself, which lives inline in coordinator-quiet-tick.mjs main() with no unit-test seam. This is an architecture correction surfaced during PLAN, not an EXEC-time nice-to-have.',
    priority: 'CRITICAL',
    acceptance_criteria: [
      'computeLoadedAndQuiet is a pure, independently-importable/exported function with no DB/IO side effects',
      'Forcing each of the four input dimensions false individually (idleNow>0, rawUnclaimed>0, openQfCount>0, claimableWithVerifyQfCount>0, unactionedDirective=true, undeliveredEscalation=true) is asserted to force the overall predicate false, each as its own test case',
      'coordinator-quiet-tick.mjs main() calls computeLoadedAndQuiet() immediately before decideCadence() (satisfying FR-3\'s ARM-time-freshness requirement) and passes its result as the loadedAndQuiet input',
    ],
  });

  // Test scenarios: correct TS-2 (tautology) and TS-6 (no-op fixture / wrong-lane risk).
  const ts = prd.test_scenarios;
  const tsById = Object.fromEntries(ts.map((t, i) => [t.id, i]));
  ts[tsById['TS-2']] = {
    ...ts[tsById['TS-2']],
    scenario: 'computeLoadedAndQuiet (FR-7) returns false when direct OPEN_UNCLAIMED count is nonzero, even when every other loaded-and-quiet condition is met',
    given: 'idleNow=0, unactionedDirective=false, undeliveredEscalation=false, claimableWithVerifyQfCount=0, but rawUnclaimed>0 OR openQfCount>0',
    then: 'computeLoadedAndQuiet returns false — tests the PREDICATE directly (TESTING finding F1 correction), not decideCadence with a pre-computed boolean',
  };
  ts[tsById['TS-6']] = {
    ...ts[tsById['TS-6']],
    scenario:
      'A coordinator directive sent via the session_coordination lane to a currently-parked worker seat is measured for delivery latency (amendment_2 live measurement, TESTING findings F2/F3)',
    given:
      'a worker session is parked with a long wake delay already armed; the directive is sent specifically via session_coordination (the lane the loaded-and-quiet band is priced on), NOT via SendMessage/task-notification',
    when: 'the directive INSERT is made and wall-clock time is measured until the session next checks in',
    then:
      'per the structural finding (no PostToolUse-hook-driven preemption path exists for an armed ScheduleWakeup), the predicted and pre-registered outcome is that the session does NOT check in within the 15-45s hard-wake window — the measurement documents this, and the band-widening change (FR-2/FR-3/FR-4/FR-5) is deferred per FR-6 AC-3, shipping FR-1 alone in this PR',
  };

  const { error: updErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: frs, test_scenarios: ts })
    .eq('id', PRD_ID);
  if (updErr) throw updErr;
  console.log(`Patched PRD ${PRD_ID}: FR-3/FR-4/FR-6 corrected, FR-7 added (${frs.length} FRs total), TS-2/TS-6 corrected.`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
