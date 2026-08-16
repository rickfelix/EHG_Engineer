// Final PLAN-TO-EXEC correction round for PRD-SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001,
// incorporating TESTING sub-agent findings (evidence row 1813bb0b-5b14-43fc-a705-616eb88a969e,
// CONDITIONAL_PASS, artifact ab4549b9-c429-4c01-b43d-d67cd169a33f). Five real defects found,
// three sharing one shape: a guard that runs, reports green, and cannot observe its subject.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001';

const { data: prd, error: fetchErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, technical_requirements, test_scenarios, risks')
  .eq('id', PRD_ID)
  .maybeSingle();
if (fetchErr) throw fetchErr;

const fr = prd.functional_requirements;
const tr = prd.technical_requirements;
const ts = prd.test_scenarios;
const risks = prd.risks;

// FR-3: fix the <> NULL blindness (IS DISTINCT FROM), and note the proacl string-match trap.
const fr3 = fr.find((f) => f.id === 'FR-3');
fr3.description += ' TESTING CORRECTION: PostgreSQL\'s `<>` operator returns NULL (not TRUE) when either side is NULL, so a naive `IF baseline <> current THEN RAISE EXCEPTION` NEVER fires if either ACL read is NULL (a real state — SetDefaultACL deletes a proacl row entirely when it equals acldefault(), silently reverting to full default access). All drift comparisons in this migration MUST use `IS DISTINCT FROM`, never `<>`.';
fr3.acceptance_criteria.push('All in-transaction ACL comparisons use IS DISTINCT FROM, never the bare <> operator (verified by grep of the migration file)');

// FR-4: correct the falsified rationale, keep the empirical self-test (still valuable, just for a different reason).
const fr4 = fr.find((f) => f.id === 'FR-4');
fr4.description = 'TESTING-CORRECTED RATIONALE (the original "natural experiment" was falsified by measurement): pg_default_acl for (postgres, public, functions) already carries ZERO PUBLIC items today -- the PUBLIC-revoke half of this FR is ALREADY satisfied by existing state, confirmed by a newer function (fn_anon_ingress_prior_hour_count, created 2026-08-04) matching the ADP row byte-for-byte with no PUBLIC grant. The apparent counter-example (log_sd_mutation_audit, created 2026-08-02, carrying a PUBLIC grant) is explained by CREATION DATE, not an additive-default mechanism -- it predates the point where PUBLIC stopped being granted by default. The ONLY real state change this FR makes is REVOKE EXECUTE ON FUNCTIONS FROM anon. The empirical self-test (throwaway function + proacl inspection) remains valuable as a standing proof the assumption still holds at apply time, but must check has_function_privilege(\'public\', oid, \'EXECUTE\') and has_function_privilege(\'anon\', oid, \'EXECUTE\') directly -- NEVER proacl::text ILIKE \'%PUBLIC%\', since PUBLIC renders as the empty-grantee token =X/postgres in proacl\'s text form and that pattern matches ZERO of the 19 functions that actually carry a PUBLIC grant (verified live: 0/19 matches).';
fr4.acceptance_criteria = fr4.acceptance_criteria.filter((ac) => !ac.includes('proacl')).concat([
  'The migration header states the corrected rationale: only the anon-revoke half of the ADP statement changes live state; the PUBLIC-revoke half is already satisfied',
  'The self-test and all verify blocks use has_function_privilege(\'public\'|\'anon\', oid, \'EXECUTE\'), never a text/ILIKE match against proacl',
]);

// FR-6: fix the direct-anon-grant blind spot.
const fr6 = fr.find((f) => f.id === 'FR-6');
fr6.description += ' TESTING CORRECTION (critical): a migration can grant anon EXECUTE DIRECTLY (not via PUBLIC) -- `REVOKE ... FROM PUBLIC` cannot remove a direct role grant. The lint\'s original predicate (require PUBLIC in the REVOKE FROM list) would PASS a migration that still grants anon directly -- live counter-example: fn_anon_ingress_prior_hour_command(text) is PUBLIC-clean (no PUBLIC grant) AND anon-executable, and would pass the flawed lint despite being exposed. Two of this SD\'s own 16 targets are in that same state. The lint MUST require: PUBLIC explicitly revoked in the FROM list, AND each of {anon, authenticated} is EITHER revoked in the same FROM list OR explicitly re-granted later in the same file (the re-grant branch is required -- 20260815_venture_user_feedback_ownership_rpc.sql legitimately re-grants anon for a specific function and must not be flagged).';
fr6.acceptance_criteria.push('A seeded fixture with PUBLIC revoked but anon granted directly (no PUBLIC involvement) is caught as a violation -- not just the PUBLIC-omitted case (TS-2b)');

const { error: frErr } = await supabase.from('product_requirements_v2').update({ functional_requirements: fr }).eq('id', PRD_ID);
if (frErr) throw frErr;

// TR-6: the missing test-execution convention.
tr.push({
  id: 'TR-6',
  requirement: 'Migration and verify-block correctness is tested by APPLYING it (not just static-parsing it) against an ephemeral postgres:16 container, using this repo\'s existing vitest.ddl.config.mjs / tests/ddl/*.db.test.js convention',
  rationale: 'TESTING sub-agent found this convention already exists and is already used by 3 chairman-gated REVOKE/GRANT migrations, INCLUDING 20260815_venture_user_feedback_ownership_rpc.sql -- the exact sibling migration this PRD cites as its SQL template. The PRD had copied that precedent\'s SQL pattern but not its test pattern. Critical caveat: the ephemeral container starts with vanilla PostgreSQL defaults, not Supabase\'s actual ACL posture -- the test MUST seed the pre-migration baseline explicitly (ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, plus explicit per-function grants matching the captured live baseline) BEFORE applying the migration under test, or the self-test/verify blocks pass trivially in a world where their precondition never existed.',
});

const { error: trErr } = await supabase.from('product_requirements_v2').update({ technical_requirements: tr }).eq('id', PRD_ID);
if (trErr) throw trErr;

// Test scenarios: fix TS-1's fundamental flaw, add TS-2b, correct TS-5/6/7/8's executability.
const ts1 = ts.find((t) => t.id === 'TS-1');
ts1.scenario = 'TS-1 CORRECTED (was: a committed test asserting today\'s live state -- TESTING found this both inverts once the fix ships, PAT-TEST-PINS-FACT-NOT-BEHAVIOUR-001, and would self-skip in the DB-tier vitest project per audit-db-test-guards.mjs). Split into two: (a) a DATED, ONE-SHOT measurement artifact (not a committed regression test) proving non-vacuity at authoring time, captured before any fix is authored; (b) a fixture-driven, two-sided unit test of the CHECKING LOGIC itself (feed it synthetic before/after ACL fixtures for both an exposed and a closed function, assert it discriminates) -- this is the permanent regression test, and it tests the verifier\'s LOGIC, not today\'s ephemeral fact.';
ts1.test_type = 'unit (logic) + one-shot artifact (fact, not committed as a test)';

ts.push({
  id: 'TS-2b', scenario: 'A migration that revokes PUBLIC but leaves a DIRECT anon grant in place is still caught by the lint (the FR-6 direct-grant blind spot)', test_type: 'unit',
  given: 'A seeded fixture migration with REVOKE EXECUTE ... FROM PUBLIC but no anon/authenticated in that FROM list, and no other statement revoking or addressing anon',
  when: 'The lint runs against the fixture', then: 'It reports a violation -- PUBLIC alone being revoked is insufficient; anon/authenticated must be explicitly addressed (revoked or re-granted)',
});

for (const id of ['TS-5', 'TS-6', 'TS-7', 'TS-8']) {
  const t = ts.find((x) => x.id === id);
  if (t) t.test_type = 'integration (against the ephemeral postgres:16 container per TR-6, with an explicitly-seeded pre-migration baseline -- NOT applied to any real/production-adjacent database)';
}

const { error: tsErr } = await supabase.from('product_requirements_v2').update({ test_scenarios: ts }).eq('id', PRD_ID);
if (tsErr) throw tsErr;

// Risks: correct risk #1's framing given FR-4's rationale correction.
risks[0].risk = 'CORRECTED: the ALTER DEFAULT PRIVILEGES fix\'s PUBLIC-revoke half is already satisfied by existing state (TESTING-verified); the only real recurrence-prevention state change is REVOKE FROM anon. The remaining risk is narrower: whether the self-test correctly observes has_function_privilege(\'anon\', ...) post-ADP-change, not whether an additive-PUBLIC-default theory holds (that theory was falsified).';
risks[0].mitigation = 'Self-test uses has_function_privilege() directly (never proacl text-matching, which TESTING found matches ZERO of 19 functions that actually carry a PUBLIC grant, since PUBLIC renders as the empty-grantee token =X/postgres, not the literal string). All comparisons use IS DISTINCT FROM, never the NULL-unsafe <> operator.';

const { error: riskErr } = await supabase.from('product_requirements_v2').update({ risks }).eq('id', PRD_ID);
if (riskErr) throw riskErr;

console.log('PRD corrected: FR-3/FR-4/FR-6 descriptions+AC, TR-6 added, TS-1 corrected, TS-2b added, TS-5/6/7/8 marked as ephemeral-container integration tests, risk #1 corrected.');
