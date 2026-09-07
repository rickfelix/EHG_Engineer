#!/usr/bin/env node
/**
 * SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001: PLAN-TO-EXEC TESTING evidence
 * (2abb19c9-dcd5-4c8e-a2f5-dae0d169d8ff, CONDITIONAL_PASS @88) found a CRITICAL design defect
 * inside the PRD's own in-scope fix -- not just in the excluded throw codes. Correcting the
 * PRD's functional_requirements/test_scenarios/risks BEFORE EXEC starts.
 *
 * THE DEFECT: FR-1 specified a CODE-keyed isDeliveredDispatchError() predicate ("returns true
 * for both codes"). dispatch.cjs:1322 computes `e.landed = parkedRowId != null` -- the
 * DISPATCH_BACKPRESSURE park insert is best-effort and can fail (logs "content may be lost"),
 * yielding landed=false. A code-keyed predicate would report that GENUINELY LOST message as
 * delivered -- exit 0 at all CLI entrypoints, success at all lib/ callers. Worse than the
 * defect being fixed (today a lost message at least throws). dispatch-send-backpressure.test.js
 * :185-213 already pins the correct {code:'DISPATCH_BACKPRESSURE', landed:false,
 * parkedRowId:null} semantics and must be preserved, not weakened to fit a code-keyed design.
 *
 * ALSO FIXES (same evidence row): FR-1's self-contradictory target line (points at line ~1321,
 * inside the separately-EXPORTED assertSendBackpressure guard the same FR requires to keep
 * throwing -- only catch-and-convert at insertCoordinationRow's call site, ~line 1668, is
 * coherent), the negative-case executability gap (test_scenarios[2] existed but no AC made it
 * CI-enforced), the missing `error`-key assertion on the ordinary path, and FR-2's test-strategy
 * (11 CLI entrypoints need a static/AST guard + injected-fake hybrid, not live-lane sends).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const PRD_ID = 'PRD-SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001';

const FR1_CORRECTED = {
  id: 'FR-1',
  title: 'Value-keyed delivered-detection: additive result fields + isDeliveredDispatchError(), scoped strictly to landed===true',
  description: 'insertCoordinationRow throws two error shapes carrying a `landed` field: DISPATCH_ALREADY_DELIVERED (thrown inline at ~dispatch.cjs:1561-1568, unconditionally landed=true) and DISPATCH_BACKPRESSURE (thrown INSIDE the separately-exported assertSendBackpressure guard, called from insertCoordinationRow at ~line 1668; its landed flag is VALUE-COMPUTED at dispatch.cjs:1322 as `parkedRowId != null` -- the park insert is best-effort and can fail, yielding landed=false when the message is genuinely lost). CRITICAL: isDeliveredDispatchError(errorOrResult) MUST be VALUE-keyed on landed===true, never CODE-keyed on the error code alone -- a code-keyed predicate would misreport a failed-park (landed=false) DISPATCH_BACKPRESSURE as delivered, silently dropping content that is actually lost, which is worse than todays defect (today a lost message at least throws). SITE: assertSendBackpressure itself is OUT OF SCOPE and must keep throwing unchanged (it is separately exported with ~20 of its own tests); the additive-return conversion happens ONLY at insertCoordinationRow catching assertSendBackpressures thrown DISPATCH_BACKPRESSURE at its call site (~line 1668) and, separately, at DISPATCH_ALREADY_DELIVEREDs own inline throw site (~line 1561-1568) which converts directly since it is not behind a separately-exported guard. Both conversions add fields to the existing {data,error} return -- never restructure it; 16 durable callers depend on the current shape.',
  priority: 'critical',
  acceptance_criteria: [
    'isDeliveredDispatchError(errorOrResult) returns true if and only if landed===true on the checked object -- NEVER based on error code alone. A unit test asserts it returns FALSE for a DISPATCH_BACKPRESSURE-shaped object with landed:false (the failed-park case), even though its code matches, and TRUE for one with landed:true.',
    'tests/unit/coordinator/dispatch-send-backpressure.test.js:185-213s existing assertion ({code:\'DISPATCH_BACKPRESSURE\', landed:false, parkedRowId:null} on a failed park) is PRESERVED VERBATIM, not rewritten or weakened to fit the new design -- a failed park must still surface as a genuine, actionable failure end to end.',
    'assertSendBackpressure (the exported guard, dispatch.cjs:1205) is UNCHANGED and still throws for every case it throws today, verified by its own ~20 existing tests continuing to pass unmodified; the additive-return conversion exists only at insertCoordinationRows call site.',
    'The negative case (every OTHER throw code and fail-closed assert* guard still throws post-fix) is made CI-EXECUTABLE, not just asserted by prose or diff review: the existing guard test suites covering those ~13 other codes (identified during EXEC via the same grep census used for this SDs LEAD-phase measurement) are named as a REQUIRED regression suite that must pass in the same CI run as the FR-1 changes.',
    'A new assertion confirms the `error` key (not just `data.*`, which ~25 existing assertions already cover) is present and unchanged on insertCoordinationRows ordinary-path return -- pinning that FR-3s callers, which destructure `error`, see no shape change.',
    'A mutation test reverting dispatch.cjs:1322s value computation (e.g. hardcoding landed=true) is caught by the preserved failed-park test above; a mutation test reverting the DISPATCH_ALREADY_DELIVERED conversion is caught by its own dedicated test -- both mutants killed by a NAMED test, not incidentally by an unrelated one, so a future edit to that test cannot silently zero out the coverage margin.'
  ],
};

const FR2_CORRECTED = {
  id: 'FR-2',
  title: 'CLI exit-code mapping for CLI-entrypoint durable callers, verified via a static guard + injected-fake hybrid',
  description: 'Durable callers with a process.exit(1) path on a caught insertCoordinationRow error must exit 0 for a genuinely delivered (landed===true) outcome using FR-1s isDeliveredDispatchError() predicate -- this is the actual mechanism that produced the original incident (a shell || fallback resending on exit status). EXEC must FIRST produce a complete, exact enumeration of every durable caller with a process.exit path (re-running the same grep census this SDs LEAD phase used, scripts/ and lib/, excluding one-off/temp/tests) and partition it explicitly between this FR and FR-3 -- the PRDs prior 11+8=19-of-26 count left ~6-7 durable callers unaccounted for in either FR; that gap must close to zero before EXEC is considered complete, not remain an approximate estimate. Testing these via real process spawns is explicitly REJECTED as the primary method: these CLI entrypoints (adam-advisory.cjs, solomon-advisory.cjs, worker-signal.cjs and others) would perform REAL sends into the live coordination lane if spawned end-to-end. Use a static/AST guard (matching this repos existing precedent, e.g. tests/static-guards/session-coordination-writer-census.test.js and tests/unit/adam-advisory-target-role-order.test.js) asserting every enumerated entrypoint consults isDeliveredDispatchError() before its process.exit(1) call, plus 2-3 behavioral tests through an injected fake client (never a live Supabase/network call) for the highest-risk entrypoints.',
  priority: 'critical',
  acceptance_criteria: [
    'EXEC produces and commits an exact, exhaustive enumeration (file:line) of every durable caller with a process.exit path on a caught insertCoordinationRow error, closing the prior ~6-7-caller gap between the 19-of-26 count and the full durable-caller census.',
    'A static/AST guard test asserts every enumerated CLI entrypoint calls isDeliveredDispatchError() (or checks .landed on the returned/caught object) before its process.exit(1) call -- no entrypoint is exempted silently.',
    '2-3 behavioral tests exercise the highest-risk entrypoints (at minimum the 3 already-correct files being migrated) through an injected fake client, asserting exit 0 on a delivered/parked outcome and exit 1 on a genuine failure -- never a live Supabase call or a real coordination-lane send.',
    'The 3 existing hand-rolled if(e.landed) exit(0) implementations are refactored to call the shared isDeliveredDispatchError() predicate.'
  ],
};

const FR3_CORRECTED = {
  id: 'FR-3',
  title: 'Propagation for non-CLI durable callers, with an exact enumerated caller list',
  description: 'Propagate FR-1s additive result fields into every durable caller NOT covered by FR-2 (no process.exit path) -- the exact complement of FR-2s enumeration, closing the same coverage gap from the other side. Confirmed candidates: coordinator-capacity-forecast.mjs (catch -> return false / sets process.exitCode=1 on any throw -- note this file DOES touch process.exitCode and must be re-examined during EXECs census for whether it truly belongs here or in FR-2s CLI bucket), coordination-events.cjs (FOUR call sites -- lines ~475, ~589, ~709, ~923; the PRD previously named only emitInertWorkerAlert, the other three need the same treatment), sweep-findings-sink.cjs (collapses to {ok:false,error} on any throw), and kill-switch-writer.cjs (no catch at all, propagates uncaught today).',
  priority: 'high',
  acceptance_criteria: [
    'The FR-2/FR-3 split is verified to be a complete partition of the full durable-caller census (every durable caller appears in exactly one of the two FRs enumerations) -- no caller is silently left in neither.',
    'coordinator-capacity-forecast.mjs is correctly classified (FR-2 if it truly has a process.exit-equivalent gate, FR-3 otherwise) based on EXECs own re-examination, not carried forward from the PRDs prior guess.',
    'All FOUR of coordination-events.cjs call sites (not just emitInertWorkerAlert) correctly distinguish a delivered/parked outcome from a genuine failure using FR-1s return shape.',
    'sweep-findings-sink.cjs no longer reports {ok:false,error} for a delivered/parked outcome.',
    'kill-switch-writer.cjs adds handling so a delivered/parked outcome no longer propagates as an uncaught exception.'
  ],
};

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: prd, error: readError } = await supabase
    .from('product_requirements_v2')
    .select('id, functional_requirements, test_scenarios, risks')
    .eq('id', PRD_ID)
    .maybeSingle();
  if (readError) throw readError;
  if (!prd) throw new Error(`PRD ${PRD_ID} not found`);

  const newFRs = [FR1_CORRECTED, FR2_CORRECTED, FR3_CORRECTED];

  const newTestScenarios = [
    {
      scenario: 'DISPATCH_BACKPRESSURE where the park insert SUCCEEDS (landed=true, a real parkedRowId)',
      expected: 'insertCoordinationRow returns (does not throw) with landed=true; a CLI-entrypoint caller exits 0; a lib/ caller does not report a failure.',
    },
    {
      scenario: 'DISPATCH_BACKPRESSURE where the park insert FAILS or THROWS (landed=false, parkedRowId=null -- the message is genuinely lost)',
      expected: 'isDeliveredDispatchError() returns FALSE; the caller still treats this as a genuine failure (throws or reports failure, exit 1) -- this scenario is the entire reason the predicate must be value-keyed, not code-keyed, and dispatch-send-backpressure.test.js:185-213 already pins it.',
    },
    {
      scenario: 'A caller retries with the SAME correlation_id as an already-delivered row (DISPATCH_ALREADY_DELIVERED)',
      expected: 'insertCoordinationRow returns (does not throw) with landed=true and a parkedRowId pointing at the existing delivered row; behavior mirrors the successful-park DISPATCH_BACKPRESSURE case.',
    },
    {
      scenario: 'A caller hits any OTHER throw code (e.g. a kill-switch code, a target-validation code) or a fail-closed assert* guard',
      expected: 'insertCoordinationRow still throws, unchanged from today; a CLI-entrypoint caller still exits 1; a lib/ caller still reports the failure -- enforced by the existing guard test suites, now named as a required regression suite in the same CI run as this SDs changes.',
    },
    {
      scenario: 'The ordinary success or DB-error path (no landed=true condition)',
      expected: 'insertCoordinationRow returns the same {data,error} shape as today, byte-for-byte, for every field a caller currently reads -- including the `error` key specifically, not just `data.*`.',
    },
  ];

  const newRisks = Array.isArray(prd.risks) ? [...prd.risks] : [];
  newRisks.unshift({
    risk: 'A CODE-keyed isDeliveredDispatchError() predicate (checking error.code membership alone) would misreport a failed-park DISPATCH_BACKPRESSURE (landed=false, dispatch.cjs:1322, message genuinely lost) as delivered -- exit 0 / success across every migrated caller. This is WORSE than the defect being fixed: today a lost message at least throws loudly.',
    mitigation: 'FR-1 mandates a VALUE-keyed predicate (landed===true, never code-based), and requires dispatch-send-backpressure.test.js:185-213s existing failed-park assertion to be preserved verbatim as the enforcing test.',
  });

  const { data, error: updateError } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: newFRs, test_scenarios: newTestScenarios, risks: newRisks })
    .eq('id', PRD_ID)
    .select('id');
  if (updateError) throw updateError;

  console.log('Updated:', JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
