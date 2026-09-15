// EXEC-TO-PLAN TESTING sub-agent review for SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001.
// Independent, adversarial post-implementation review (implementation already complete at
// commit 8dcf22aeed8 / PR #9013 when this review started).
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';

const SD_ID = '0667ff2f-c224-4359-92a7-d156a0a414b1';
const SD_KEY = 'SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001';

const detailedAnalysis = `Independent, adversarial EXEC-TO-PLAN TESTING review of the implementation on branch
feat/SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001 (PR #9013, commit 8dcf22aeed8, at review time).
Read lib/agents/venture-ceo-factory.js in full (VentureNotFoundError class, defaultVentureExists(),
the modified instantiateVenture() guard) and tests/unit/venture-ceo-factory.test.js in full. Ran the
test/lint suites myself rather than trusting the implementer's reported counts.

MEASURED INDEPENDENTLY:
- npx vitest run tests/unit/venture-ceo-factory.test.js: 22/22 passed (1 test file).
- npx vitest run tests/unit/agents/: 195/195 passed (10 test files) -- zero collateral regression
  across the agents test tree, including tests/unit/agents/eva-coo-integration-onboard-email.test.js
  (also run standalone: 4/4 passed) which fully mocks VentureFactory and is therefore unaffected by
  the new guard by construction.
- npx eslint lib/agents/venture-ceo-factory.js tests/unit/venture-ceo-factory.test.js: zero
  warnings/errors.

ADVERSARIAL CHECKS (own investigation, not a rubber stamp of the implementer's summary):

a. Repo-wide grep for every instantiateVenture( / new VentureFactory( call site (not scoped to
   lib/scripts): found the 2 documented real call sites (lib/agents/eva-coo-integration.js:356
   inside onboardVenture(), itself independently confirmed dead code by this SD's own LEAD-phase
   evidence -- zero live production callers -- and scripts/harness/spine-verify-first-run.mjs:128),
   PLUS two REAL (non-mocked) Playwright e2e call sites the implementer's summary did not name
   individually: tests/e2e/agents/venture-ceo-verify-first.spec.ts (lines 73, 141) and
   tests/e2e/agents/shared-operators-arming.spec.ts (line 125). Read both files directly: every one
   of these calls first inserts a REAL row into the live "ventures" table via insertGuarded(...)
   .select('id, name').single() and only then passes that just-inserted venture!.id into
   instantiateVenture({ ventureId: venture!.id, ... }) with NO deps argument -- so defaultVentureExists
   runs for real against Supabase and finds the row it just inserted. Postgres inserts are
   read-committed-visible to the same client immediately; no race. Confirmed NOT broken by the guard.
   All 4 real/e2e call sites pass exactly one positional argument.

b. Re-derived defaultVentureExists's behavior for '' and '   ' against the actual guard code
   ('!ventureId || !(await ventureExistsFn(...))'): '' is falsy in JS, so the caller-side
   short-circuit catches it before ventureExistsFn is ever invoked (matches existing TS
   'a missing/undefined ventureId ... without calling ventureExistsFn' -- same falsy branch, verified
   by reading the guard, not just the one existing test's literal input). '   ' (whitespace) is
   truthy, so it reaches defaultVentureExists(supabase, '   '), which runs
   .from('ventures').select('id').eq('id','   ').maybeSingle(). ventures.id is a uuid-typed column
   (confirmed via schema/migration search); PostgREST/Postgres reject '   ' at the uuid cast with
   22P02 invalid_text_representation, which the existing 22P02 branch already converts to false
   (dedicated test TS-3 exercises this exact branch, just with a different non-UUID literal). Verified
   this is the same code path, not a new gap -- no fix needed.

c. Ran a REAL mutation not covered by the 2 EXEC-phase mutations already logged: edited
   instantiateVenture() in place to change 'if (!ventureId || !(await ventureExistsFn(this.supabase,
   ventureId)))' to 'if (!(await ventureExistsFn(this.supabase, ventureId)))' (removing the falsy
   ventureId pre-check short-circuit), then ran
   'npx vitest run tests/unit/venture-ceo-factory.test.js -t "missing/undefined ventureId"'.
   Result: FAILED as expected -- with the mutated guard, a stubbed ventureExistsFn resolving true
   (per that test's own stub) let the undefined-ventureId call proceed to full 28-agent instantiation
   instead of throwing VentureNotFoundError, and the assertion '.rejects.toBeInstanceOf(VentureNotFoundError)'
   correctly caught the mutant. Restored the original line and confirmed via 'git diff --quiet' that
   the file is byte-identical to HEAD; re-ran the full test file afterward (22/22 passed again).

d. Re-grepped every instantiateVenture( call site and counted positional arguments at each:
   eva-coo-integration.js:356 (1 arg), spine-verify-first-run.mjs:128 (1 arg), both e2e specs (1 arg
   each), and every test-file call site in tests/unit/venture-ceo-factory.test.js (1 or 2 args, the
   2-arg calls being this SD's own new deps-injection tests). No caller anywhere in the repo passes a
   second positional argument that predates this SD and could collide with the new deps={} parameter
   -- the addition is confirmed backward-compatible in practice, not just in theory.

e. No other real, concrete gap found. The archive/scripts/user-story-generators/
   add-user-stories-sd-vision-v2-005.js reference to a free function instantiateVenture(...) is
   unrelated historical spec text for a different (never-built) function signature, lives under
   archive/, and is not a live call site.

VERDICT: Implementation is correct, complete, and independently reproducible. No fix was required --
all adversarial checks either confirmed existing correct behavior or found genuinely no issue. Nothing
was changed in the working tree as a result of this review (the mutation-test edit was reverted before
this evidence was recorded, confirmed byte-identical via git diff --quiet).`;

const results = {
  verdict: 'PASS',
  confidence: 92,
  summary: 'Independent EXEC-TO-PLAN TESTING re-review of SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001 (PR #9013, commit 8dcf22aeed8). Re-ran the full test/lint suite myself (22/22 unit tests for the changed file, 195/195 across tests/unit/agents/, 0 eslint issues) and performed 5 adversarial checks the implementer had not fully covered: found 2 additional real (non-mocked) e2e call sites (venture-ceo-verify-first.spec.ts, shared-operators-arming.spec.ts) and confirmed both are safe (they insert a real ventures row before calling instantiateVenture, so the guard never fires); confirmed whitespace-only ventureId correctly falls through to defaultVentureExists and resolves false via the existing 22P02 branch on a uuid-typed ventures.id column; ran a fresh, previously-uncovered mutation (removing the `!ventureId ||` short-circuit) and confirmed it is caught by the existing "missing/undefined ventureId" test, then restored the file byte-identical to HEAD; confirmed zero caller anywhere in the repo passes a second positional argument that could collide with the new deps={} parameter. No defects found; no fix required.',
  detailed_analysis: detailedAnalysis,
  warnings: [],
  metadata: {
    measured: true,
    test_execution: buildTestExecution({
      executed: 217,
      passed: 217,
      failed: 0,
      skipped: 0,
      runner: 'vitest@4.1.4',
      source: 'Independently re-ran: npx vitest run tests/unit/venture-ceo-factory.test.js (22/22) + npx vitest run tests/unit/agents/ (195/195, includes eva-coo-integration-onboard-email.test.js 4/4 run standalone too) + npx eslint lib/agents/venture-ceo-factory.js tests/unit/venture-ceo-factory.test.js (0 issues). Plus one additional adversarial mutation test (falsy-ventureId short-circuit removed, confirmed caught, reverted byte-identical) not counted in the 217 since it targeted a temporarily-mutated file, not the shipped code.'
    })
  }
};

async function main() {
  const resolution = await resolveSubAgentRepo({
    sdId: SD_ID,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults('TESTING', SD_ID, { code: 'TESTING', name: 'Testing' }, results, {
    sdKey: SD_KEY,
    phase: 'EXEC-TO-PLAN',
  });

  console.log('Stored TESTING sub-agent results:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict }, null, 2));
}

main().catch((err) => {
  console.error('FAILED to store TESTING results:', err);
  process.exit(1);
});
