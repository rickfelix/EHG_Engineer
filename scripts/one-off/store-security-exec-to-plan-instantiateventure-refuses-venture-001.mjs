#!/usr/bin/env node
/**
 * One-off: SECURITY sub-agent evidence for SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001,
 * EXEC-TO-PLAN phase.
 *
 * Adversarial review of the shipped diff at commit 8dcf22aeed8 (PR #9013, branch
 * feat/SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001): VentureNotFoundError +
 * defaultVentureExists() + the instantiateVenture() guard in lib/agents/venture-ceo-factory.js.
 *
 * READ-ONLY except for this evidence row and the tests run (`npx vitest run
 * tests/unit/venture-ceo-factory.test.js`, 22/22 pass, no state mutation).
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001';
const SD_UUID = '0667ff2f-c224-4359-92a7-d156a0a414b1';
const PHASE = 'EXEC-TO-PLAN';
const COMMIT = '8dcf22aeed8';

const findings = [
  {
    id: 'injectable-deps-trust-boundary-not-reachable-today',
    severity: 'INFO',
    summary:
      'instantiateVenture(options, deps={}) accepts deps.ventureExistsFn, which if supplied OVERRIDES the real DB existence check. Repo-wide grep for every `.instantiateVenture(` call site (excluding archive/ and this SD\'s own scripts/tests) found exactly 4 real call sites: lib/agents/eva-coo-integration.js:356 (inside onboardVenture(), itself confirmed dead code per scripts/audits/venture-ceo-factory-reachability.mjs -- zero live callers), scripts/harness/spine-verify-first-run.mjs:128 (manually-invoked verification harness, no npm-script/cron/CI wiring), and tests/e2e/agents/{shared-operators-arming,venture-ceo-verify-first}.spec.ts:73/125/141. Read all four call sites directly: every one calls instantiateVenture() with a SINGLE argument (the options object) -- none passes a second `deps` argument, so ventureExistsFn is never attacker- or even caller-influenced in any currently reachable path; the fallback `deps.ventureExistsFn || defaultVentureExists` always resolves to the real DB check. This exactly mirrors an already-shipped precedent (lib/creative/creative-brief.js\'s identical deps.ventureExistsFn seam on requestCreativeAsset()), the established convention in this codebase for making a DB round-trip trip unit-testable. NOT a real issue given today\'s reachable callers -- hardening it now (e.g. restricting deps to test environments) would be over-fixing a risk with zero current callers, consistent with this session\'s established discipline against speculative hardening. No fix applied.',
  },
  {
    id: 'error-message-ventureid-interpolation-not-exploitable-today',
    severity: 'INFO',
    summary:
      'VentureNotFoundError embeds the raw ventureId value in its message (`Venture ${ventureId} does not exist...`). Traced every path that can reach this constructor: (1) the falsy-ventureId branch (missing/undefined/null) never embeds attacker content; (2) the ventureExistsFn=false branch is reached only after `options.ventureId` is threaded through unchanged -- read every real call site\'s origin: eva-coo-integration.js:356 passes `venture.id` from an already-fetched-or-created venture row (never raw external input threaded directly), spine-verify-first-run.mjs:128 passes an id from a freshly-INSERTed real ventures row, and both e2e specs pass `venture!.id` from a real row created earlier in the same test. onboardVenture() (the only site with a non-test caller shape) has zero live callers today per the confirmed reachability audit, and even if it were live, the error propagates uncaught to that caller\'s own try/catch or logging -- it never reaches an HTTP response body or a browser in the current codebase (no route/controller layer wraps instantiateVenture() anywhere in this diff or its callers). The message shape is also an exact mirror of creative-brief.js\'s already-shipped VentureNotFoundError, which carries the same ventureId-interpolation and has not been flagged as a disclosure issue in this codebase\'s established pattern. NOT exploitable today. No fix applied.',
  },
  {
    id: 'sql-injection-surface-clean',
    severity: 'INFO',
    summary:
      'defaultVentureExists() issues exactly one query: `supabase.from(\'ventures\').select(\'id\').eq(\'id\', ventureId).maybeSingle()`. Read the call directly (not assumed): `.eq()` is a PostgREST filter-builder method that parameterizes its value -- ventureId is never string-interpolated into a raw SQL string, template literal passed to .rpc(), or any other dynamic-SQL sink anywhere in this diff. Grepped the full diff for string interpolation of `ventureId` outside the two intentional message-construction sites (VentureNotFoundError\'s constructor and the debug .toHaveBeenCalledWith assertions in tests) -- none found. CLEAN.',
  },
  {
    id: 'fail-closed-confirmed-on-query-error-not-fail-open',
    severity: 'INFO',
    summary:
      'On a genuine (non-22P02) Supabase error, defaultVentureExists() re-throws the original error object (`if (error.code === \'22P02\') return false; throw error;`). Because the guard is `if (!ventureId || !(await ventureExistsFn(...))) { throw new VentureNotFoundError(ventureId); }`, a thrown error inside the `await` propagates OUT of instantiateVenture() directly, before the `!` negation or the VentureNotFoundError wrap ever run -- instantiateVenture() itself rejects with the REAL underlying error (e.g. a connection-failure object carrying its own .code), not a misleading "venture not found" message and not a silent true/false. This is the safe fail-closed outcome for a security-relevant existence check: a connectivity problem neither creates agent rows (silently-true) nor gets mischaracterized as "no such venture" (silently-false-with-wrong-reason). Independently confirmed via test TS-4 (`defaultVentureExists propagates a non-22P02 database error`, asserts `.rejects.toMatchObject({code: \'08006\'})`) plus a direct code trace. CLEAN -- this is the class of gap ("fail-closed but misleading error message") found on the immediately preceding SD, and it does NOT recur here: the propagated error is the real one, unwrapped.',
  },
  {
    id: 'test-coverage-comprehensive-no-weakened-assertions',
    severity: 'INFO',
    summary:
      'Read tests/unit/venture-ceo-factory.test.js in full (22 tests, all passing after `npx vitest run tests/unit/venture-ceo-factory.test.js` in this review). The 2 pre-existing tests (lines 180-204) were updated only to pass a `ventureExists` deps stub -- their original assertions (6 VP agents incl. VP_CUSTOMER; 28 total agents) are untouched and still make the same claims with the same strength; the guard\'s presence did not require weakening anything pre-existing. The 8 new tests (lines 207-326) cover: guard fires + zero insert/upsert calls on a nonexistent id (TS-1); legitimate path unaffected (TS-2); 22P02 malformed-id treated as not-found (TS-3); non-22P02 error propagates, not silently swallowed (TS-4); a real matching row resolves true (TS-4b); a falsy ventureId short-circuits BEFORE calling ventureExistsFn at all -- confirmed via `expect(ventureExistsFn).not.toHaveBeenCalled()` -- so a missing id never even reaches the DB (matches the FR-2 AC-4 no-side-effect-before-refusal requirement); and two calling-convention mirrors matching the two real production call sites (eva-coo-integration.js\'s already-fetched venture.id, spine-verify-first-run.mjs\'s freshly-created venture id). No negative/guard path is left untested for any calling convention that currently matters.',
  },
];

const warnings = [
  'onboardVenture() (the one call site whose error-propagation path was not fully traceable to a terminal sink) has zero live callers today per the existing reachability audit; if a future SD wires a live caller onto it (e.g. an HTTP-facing venture-onboarding endpoint), that caller should be reviewed for whether VentureNotFoundError.message (which echoes the caller-supplied ventureId) is safe to surface verbatim in that new context -- not a defect of this diff, a forward note for whoever adds that caller.',
];

const recommendations = [
  'No code changes recommended for this diff. The injectable-deps seam and the error-message shape are both direct, faithful mirrors of the already-shipped creative-brief.js precedent, and neither surface has a currently-reachable caller that changes the codebase\'s existing risk posture. Revisit reachability findings 1 and 2 if/when a new caller is wired onto instantiateVenture() or onboardVenture() -- particularly one that is less trusted than an internal service (an API endpoint, webhook handler, or anything sourcing ventureId or deps from external input).',
];

const summary =
  'EXEC-TO-PLAN SECURITY review of the ACTUAL shipped diff at commit 8dcf22aeed8 (PR #9013): VentureNotFoundError + defaultVentureExists() + the instantiateVenture() existence guard in lib/agents/venture-ceo-factory.js. VERDICT: PASS. Adversarial pass targeted the exact gap classes this session has repeatedly found on preceding SDs -- confirmed clean on all of them. (1) Injectable-dependency trust boundary: deps.ventureExistsFn CAN override the real DB check, but repo-wide grep + direct read of all 4 real call sites (eva-coo-integration.js:356, spine-verify-first-run.mjs:128, 2 e2e specs) confirms NONE passes a deps argument today -- the override path is unreachable in production, exactly mirroring the already-shipped creative-brief.js seam. Not fixed; fixing an unreachable risk would be over-hardening. (2) Error-message disclosure: ventureId is embedded in VentureNotFoundError.message, but every real call site threads it from an already-fetched-or-created real ventures.id (never raw external input), and the one call site with a plausible external-input path (onboardVenture) has zero live callers. Not exploitable today. (3) SQL injection: defaultVentureExists()\'s `.eq(\'id\', ventureId)` is genuinely PostgREST-parameterized, confirmed by direct read; no string interpolation into any query anywhere in the diff. (4) Fail-open/closed on query error: confirmed via code trace AND test TS-4 that a non-22P02 Supabase error propagates unwrapped out of instantiateVenture() (real rejection, not silent true/false, not a misleading VentureNotFoundError) -- the correct fail-closed behavior, and the "fail-closed-but-misleading-message" class from the preceding SD does NOT recur here. (5) Test coverage: 22/22 tests pass (re-run in this review), 2 pre-existing tests updated without weakening their original assertions, 8 new tests cover the guard-fires, legitimate-path, malformed-id, propagated-error, real-row, no-side-effect-on-falsy-id, and both real-caller-pattern cases. No fix was required; nothing was applied.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 92,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      sd_id: SD_UUID,
      phase: PHASE,
      commit_reviewed: COMMIT,
      pr: 'https://github.com/rickfelix/EHG_Engineer/pull/9013',
      branch: 'feat/SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001',
      review_basis:
        'Read lib/agents/venture-ceo-factory.js in full (VentureNotFoundError, defaultVentureExists, the full instantiateVenture() method) and tests/unit/venture-ceo-factory.test.js in full. Cross-checked against the already-shipped precedent lib/creative/creative-brief.js. Repo-wide grep for every `.instantiateVenture(` call site, each traced to its origin.',
      read_only_attestation:
        'No UPDATE/INSERT/DELETE was issued against any table during this review other than this evidence row. `npx vitest run tests/unit/venture-ceo-factory.test.js` was executed (22/22 pass) -- no state mutation, in-memory mocked Supabase only.',
      owasp_adjacent_sweep: {
        injection:
          "CLEAN. defaultVentureExists()'s only query is .from('ventures').select('id').eq('id', ventureId).maybeSingle() -- PostgREST-parameterized .eq(), no string interpolation into any SQL/filter/RPC name anywhere in the diff.",
        authn_authz:
          'N/A / unchanged. No RLS, GRANT/REVOKE, role, or auth.uid()/auth.jwt() logic in the diff. The guard is a pure existence check gating a side-effect-heavy method; it adds a REFUSAL path, strictly narrowing what instantiateVenture() will act on, not widening any authorization surface.',
        secrets: 'CLEAN. No credential, token, or secret-shaped literal anywhere in the diff.',
        attack_surface:
          'CLEAN. No new route, endpoint, handler, or external network call. The only new call is an additional read against the existing ventures table using the caller-supplied Supabase client.',
        data_exposure:
          "LOW/accepted, not exploitable today. VentureNotFoundError.message echoes the caller-supplied ventureId verbatim. Every currently-reachable caller sources ventureId from a real, already-fetched-or-created ventures.id (never raw external input), and the one call site (onboardVenture) with a plausible future external-input shape has zero live callers per the existing reachability audit. Flagged as a forward note, not a fix.",
      },
      injectable_dependency_trust_boundary: {
        question: 'Can deps.ventureExistsFn be attacker-controlled to force the guard to always pass?',
        answer:
          'Not today. Grepped every `.instantiateVenture(` call site repo-wide (excluding archive/ and this SD\'s own scripts/tests): lib/agents/eva-coo-integration.js:356, scripts/harness/spine-verify-first-run.mjs:128, tests/e2e/agents/shared-operators-arming.spec.ts:125, tests/e2e/agents/venture-ceo-verify-first.spec.ts:73/141. Read each call site directly -- all 4 call instantiateVenture() with a single (options) argument; none passes a deps argument. The override path is real in the code but unreachable from any currently-wired caller. Decision: not a reachable risk, not fixed -- matches the already-shipped creative-brief.js precedent for the identical seam.',
      },
      fail_closed_trace: {
        question: 'On a defaultVentureExists() query error (not 22P02), does instantiateVenture() reject, return false, or return true?',
        answer:
          "Rejects with the ORIGINAL error object, unwrapped. defaultVentureExists() re-throws any non-22P02 error; because it's awaited inside the guard's `if` condition, the throw propagates out of instantiateVenture() before the VentureNotFoundError wrap or the `!` negation ever execute. Confirmed by direct code trace and by test TS-4 (tests/unit/venture-ceo-factory.test.js:259-269), which asserts `.rejects.toMatchObject({code: '08006'})` on a simulated connection-failure error.",
      },
      local_checks_run: [
        'Read lib/agents/venture-ceo-factory.js:1-60, 245-437 (module header, VentureNotFoundError, defaultVentureExists, full instantiateVenture() through the CEO/VP creation steps) and the export block at 770-776',
        'Read tests/unit/venture-ceo-factory.test.js:140-327 in full (all 22 tests across the 3 describe blocks touching instantiateVenture())',
        'Read lib/creative/creative-brief.js:1-100 as the direct precedent comparison (identical VentureNotFoundError shape, identical defaultVentureExists 22P02 handling, identical deps.ventureExistsFn seam)',
        "grep -rn 'instantiateVenture(' across lib/, scripts/, tests/ (excluding archive/ and this SD's own one-off scripts) -- 4 real call sites, all traced",
        'Read lib/agents/eva-coo-integration.js:317-369 (onboardVenture(), the ventureId origin for the eva-coo-integration.js call site, and confirmed no local catch around the instantiateVenture() call -- errors propagate uncaught to onboardVenture()\'s own caller)',
        'npx vitest run tests/unit/venture-ceo-factory.test.js -> 22/22 PASS (re-run in this review, not accepted on trust)',
      ],
      artifacts_read: [
        'lib/agents/venture-ceo-factory.js (full VentureNotFoundError/defaultVentureExists/instantiateVenture diff region)',
        'tests/unit/venture-ceo-factory.test.js (full)',
        'lib/creative/creative-brief.js:1-100 (precedent)',
        'lib/agents/eva-coo-integration.js:290-369 (onboardVenture() and its call site)',
      ],
      brief_claim_verdicts: {
        '1_injectable_deps_trust_boundary': 'CONFIRMED not reachable today -- all 4 real call sites pass zero deps argument. Not fixed; would be over-hardening an unreachable risk.',
        '2_error_message_info_disclosure': 'CONFIRMED not exploitable today -- every real caller sources ventureId from an already-real ventures row; the one weaker-shaped caller (onboardVenture) has zero live callers. Not fixed.',
        '3_sql_injection_surface': 'CONFIRMED clean -- .eq() is genuinely parameterized, verified by direct read, not assumed.',
        '4_fail_open_vs_fail_closed': 'CONFIRMED fail-closed -- a query error propagates the real error unwrapped out of instantiateVenture(), neither silently-true nor silently-false nor mischaracterized as VentureNotFoundError.',
        '5_test_coverage': 'CONFIRMED comprehensive -- 22/22 pass, no pre-existing assertion weakened, all relevant negative/guard paths covered including the two real calling-convention mirrors.',
      },
      residual_risk:
        'None identified that requires a code change. The one forward-looking note (onboardVenture is currently dead code; a future live caller on it should be re-reviewed for whether ventureId/error-message exposure is still safe in that new context) is recorded as a warning, not a finding requiring remediation now.',
    },
    phase: PHASE,
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_UUID,
    { code: 'SECURITY', name: 'Security' },
    results,
    { sdKey: SD_KEY, phase: PHASE, source: 'manual' },
  );

  console.log('SECURITY EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
