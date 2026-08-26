import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B';
const supabase = await getSupabaseClient();

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary:
    'EXEC-TO-PLAN code review of lib/creative/asset-view-gate.js. Ran `npx vitest run lib/creative/` independently: 6 files / 65 tests passed, no regressions. All 6 audited safety properties are CORRECTLY IMPLEMENTED in the shipped code (verified by reading source + 4 hand-run mutation tests, not by trusting green tests). CONDITIONAL because of test-coverage gaps against the PRD, not code defects: 2 of 13 promised test_scenarios (TS-9, TS-10) are absent, FR-4 has zero test coverage, and a mutation raising DEFAULT_VIEW_URL_TTL_SECONDS from 300s to 86400s SURVIVED all 12 tests.',
  findings: [
    'TEST SUITE VERIFIED INDEPENDENTLY: `npx vitest run lib/creative/` -> Test Files 6 passed (6), Tests 65 passed (65), duration 1.50s. asset-view-gate.test.js alone: 12 passed (12). No regressions in the 5 pre-existing creative test files.',
    'Q1 CONFIRMED (FR-1): checkAssetViewAuthorized short-circuits BEFORE any DB call. `if (!ventureId) return {allowed:false, reason:\'missing_venture_id\'}` is asset-view-gate.js:53-55, the literal first statement of the function; the first supabase.from() is at line 62. TS-1 also spies supabase.from and asserts not-called. MUTATION C (`if (!ventureId)` -> `if (false)`) was caught by TS-1 -> the guard is genuinely witnessed, not incidentally passing.',
    'Q2 CONFIRMED (FR-2): lines 62-71 query chairman_decisions filtered on venture_id + lifecycle_stage=PRODUCT_REVIEW_STAGE(=23, verified in lib/eva/chairman-product-review.js:18) + decision_type=\'product_review\'(:19), ordered .order(attempt_number, desc).order(created_at, desc).limit(1).maybeSingle(). Line 73 then requires status===\'approved\' on THAT SINGLE LATEST ROW (`!latestReview || latestReview.status !== \'approved\'` -> blocked). This is genuinely latest-attempt semantics, NOT \'any approved row ever\'. It is also fail-closed on reviewError and on any non-approved status string (send_back/rejected/pending all block), so it is robust to the DB\'s actual status vocabulary.',
    'Q3 CONFIRMED (FR-3) -- the safety-critical line, verified precisely. (a) `armed: true` at line 85 is a hardcoded object-literal property; lib/feature-flags/evaluator.js / isEnabled is NOT imported anywhere in the file (grep: the only `isEnabled`/`armed` matches outside line 85 are comment text at lines 13-14, 21-22, 27). Confirmed against stage-gate-predicate.js:243 `typeof armed === \'boolean\' ? armed : await isEnabled(...)` -- passing the literal short-circuits the flag lookup entirely. (b) Line 88 is `if (gateResult.verdict !== VERDICT.PASS)` -- a strict inequality against the frozen VERDICT.PASS enum, NOT shouldEnforceBlock() and NOT a truthy/falsy test on .blocked. shouldEnforceBlock is never imported (line 30 imports only checkStageGate and VERDICT); it appears in the file only in comment prose at line 23. This correctly rejects OUT_OF_SCOPE, which is the real bypass: stage-gate-predicate.js:272-274 returns {verdict:OUT_OF_SCOPE, blocked:false} for an is_demo venture EVEN WHEN armed:true is passed, so shouldEnforceBlock() would have returned false and authorized a demo venture at S7.',
    'Q3 MUTATION-VERIFIED (both legs discriminate, each by exactly ONE test): MUTATION A (`armed: true` -> `armed: false`) -> 1 failed / 11 passed; sole catcher is TS-11 (override one-shot consumption), because stage-gate-predicate.js:289 passes resolvedArmed as hasActiveOverride\'s shouldConsume. Note TS-4 and TS-5 do NOT discriminate arming (verdict is computed independently of armed at predicate line 291), so TS-11 is the ONLY witness that armed:true is passed. MUTATION B (`verdict !== VERDICT.PASS` -> `gateResult.blocked`, i.e. the naive check) -> 1 failed / 11 passed; sole catcher is TS-5 (is_demo OUT_OF_SCOPE). Both properties are witnessed, but each rests on a single test -- deleting TS-11 or TS-5 would silently un-witness a fail-open.',
    'Q4 CONFIRMED (FR-5): mintAssetViewUrl calls checkAssetViewAuthorized at line 110 and throws TaskFailedError at 112-116 when !authz.allowed; supabase.storage...createSignedUrl is not reached until line 119. Authorization strictly precedes minting. resolveTtlSeconds (lines 95-100) traced by hand: NaN -> !Number.isFinite(NaN)=true -> 300; -5 -> finite but <=0 -> 300; 0 -> <=0 -> 300; 99999 -> Math.min(99999,300)=300; undefined (omitted arg) -> not finite -> 300; Infinity -> not finite -> 300; string "100" -> Number.isFinite does not coerce -> 300. No NaN, zero or negative value can reach createSignedUrl, and the return is always a positive integer <= MAX_VIEW_URL_TTL_SECONDS(300).',
    'Q5 CONFIRMED (FR-5 AC-3): `grep -nE "\\.(insert|update|upsert)\\(" lib/creative/asset-view-gate.js` -> NONE FOUND. The module never persists the minted signedUrl. Traced the indirect writes too: checkStageGate does write (audit_log INSERT via writeAuditRow, and a chairman_decisions UPDATE consuming an override), but I read writeAuditRow\'s payload (stage-gate-predicate.js:199-208) -- metadata is {venture_id, required_stage, actual_stage, verdict, armed, reason}, containing no URL and no storage path. FR-5 AC-3 is genuinely satisfied.',
    'GAP 1 (FR-5 AC-4 under-asserted; MUTATION D SURVIVED): raising `const DEFAULT_VIEW_URL_TTL_SECONDS = 300` to 86400 (a 24-hour signed URL on a private asset bucket) leaves ALL 12 TESTS PASSING. Root cause: TS-13 asserts only Number.isFinite(...)===true and toBeGreaterThan(0), while FR-5 AC-4 explicitly promised "returns expiresInSeconds equal to DEFAULT_VIEW_URL_TTL_SECONDS". DEFAULT_VIEW_URL_TTL_SECONDS is also not exported (only MAX_VIEW_URL_TTL_SECONDS is, line 37), so the test could not assert equality without a hardcoded literal. TS-8 does discriminate the Math.min cap, so the MAX path is covered -- it is specifically the DEFAULT fallback magnitude that is unguarded. The shipped value (300s) is correct; only the regression guard is missing.',
    'GAP 2 (TS-9 / FR-4 entirely uncovered): PRD promises 13 test_scenarios; the file implements 12. TS-9 ("a chairman override keyed to a bare ventureId does not match this gate\'s namespaced lookup") is absent, leaving FR-4 (priority:high) with ZERO test coverage. The code DOES implement namespacing correctly (overrideKeyFor -> `media-asset-view:${ventureId}`, lines 41-43, passed as actorId at line 84), but nothing asserts it. Worse, TS-9 is not implementable against the current fixture: createMockSupabase\'s chairman_decisions builder records .eq() filters into state.filters but its maybeSingle() branches ONLY on state.filters.decision_type (test file lines 41-55) -- it never inspects override_key, so a bare-ventureId override and a namespaced one are indistinguishable to the mock. Closing TS-9 requires extending the fixture, not just adding an it() block.',
    'GAP 3 (TS-10 / FR-3 AC-3 absent): "A test asserts checkStageGate is called with armed:true literally, independent of isEnabled()\'s return value (mock isEnabled to return true and confirm behavior is unchanged)" is not implemented -- the suite never mocks lib/feature-flags/evaluator.js at all. Mitigating: MUTATION A proves TS-11 does discriminate the armed literal, so the property is not wholly unwitnessed; but it is witnessed indirectly (via override consumption) rather than by the direct flag-independence assertion FR-3 AC-3 specified.',
    'GAP 4 (test title over-claims vs its assertion): the test named "never writes the minted signedUrl to any table" asserts only `expect(writtenTables).not.toContain(\'creative_assets\')`. In the happy path from() is legitimately called for chairman_decisions, ventures and audit_log, so the assertion is far narrower than the title. The underlying claim is nonetheless TRUE (proven by my static grep in Q5 above), but this test would not catch a future INSERT of the URL into any table other than creative_assets. Matches the PAT-RATIONALE-WITHOUT-ASSERTION-001 family.',
    'GAP 5 (documented rationale is analytically wrong, low impact): the code comment at lines 57-61 and the PRD FR-3 description both claim the secondary `.order(\'created_at\', {ascending:false})` defends against "a future writer inserting a null attempt_number (which sorts first under a bare DESC)". A secondary sort key cannot rescue this -- in Postgres, DESC defaults to NULLS FIRST, so a null-attempt_number row sorts first on the PRIMARY key and .limit(1) takes it regardless of created_at. The stated mitigation does not achieve its stated purpose; the correct fix is `.order(\'attempt_number\', {ascending:false, nullsFirst:false})`. IMPACT TODAY IS NIL: the only live writer (lib/eva/chairman-decision-watcher.js:549) spreads `...(attemptNumber != null ? {attempt_number: attemptNumber} : {})`, omitting the key so the DB default (1) applies -- a null is not currently insertable. Flagging as a rationale-accuracy defect, not a live fail-open.',
    'FR-6 SATISFIED: all 12 asset-view-gate tests use a fully mocked supabase client (chairman_decisions, ventures, audit_log, storage) and are provably independent of live schema state -- they passed here despite creative_assets.storage_path and chairman_decisions.override_key still being pending migration apply. FR-10 is a documentation-only requirement satisfied in the PRD census; I re-verified its central claim by grep: the only lib/ code touching creative-assets-private is asset-storage.js (writer), asset-view-gate.js (this reader), and one delete-path fallback in creative-brief.js:137 -- no unsanctioned getPublicUrl/createSignedUrl reader exists.',
    'WORKING TREE INTEGRITY: all 4 mutations were applied via sed and reverted with `git checkout -- lib/creative/asset-view-gate.js`; final `git status --porcelain lib/creative/` returns 0 modified files. No mutation artifacts were left in the branch.',
  ],
  warnings: [
    'DEFAULT_VIEW_URL_TTL_SECONDS (300s) has NO regression guard -- proven by surviving mutation to 86400. This is the highest-value gap: it is a security-relevant constant on a private-asset signed URL, and PRD FR-5 AC-4 explicitly promised an equality assertion that was not delivered.',
    'The armed:true property (MUTATION A) and the verdict!==PASS property (MUTATION B) each have exactly ONE catching test (TS-11 and TS-5 respectively). Neither has redundant coverage; removing or weakening either test silently un-witnesses a fail-open path.',
    'FR-4 (override_key namespacing, priority:high) ships with zero test coverage, and the existing mock fixture cannot express TS-9 without modification.',
    'PRD promised 13 test_scenarios; 12 were delivered. TS-9 and TS-10 should be either implemented or explicitly descoped in the PLAN-phase record rather than left as a silent delta.',
  ],
  recommendations: [
    'Export DEFAULT_VIEW_URL_TTL_SECONDS and strengthen TS-13 to `expect(result.expiresInSeconds).toBe(DEFAULT_VIEW_URL_TTL_SECONDS)` for both the NaN and negative cases, satisfying FR-5 AC-4 as written and killing mutation D.',
    'Implement TS-9 by extending createMockSupabase\'s chairman_decisions branch to honor state.filters.override_key, then assert that an override row keyed to the bare VENTURE_ID does not authorize while one keyed to `media-asset-view:${VENTURE_ID}` does. This closes FR-4\'s only acceptance criterion.',
    'Implement TS-10 with vi.mock(\'../feature-flags/evaluator.js\') returning isEnabled:false and assert TS-11\'s one-shot consumption behavior is unchanged -- that directly proves flag-independence rather than inferring it.',
    'Fix the attempt_number ordering to `.order(\'attempt_number\', {ascending:false, nullsFirst:false})` and correct the now-inaccurate rationale in the module header (lines 57-61) and in PRD FR-3, which both assert a defense the secondary sort does not provide.',
    'Rename the "never writes the minted signedUrl to any table" test to match what it asserts, or strengthen it to assert no insert/update call anywhere received a payload containing the signedUrl string.',
    'PLAN should accept these as follow-on hardening within this SD rather than blocking: no shipped code path is fail-open, and every gap is an absent assertion over already-correct behavior.',
  ],
  validation_mode: 'retrospective',
  metadata: {
    recorded_by: 'testing-agent (Task tool dispatch)',
    assessment_type: 'exec_to_plan_code_review',
    test_suite_result:
      'npx vitest run lib/creative/ -> RUN v4.1.4; Test Files 6 passed (6); Tests 65 passed (65); Start at 07:01:09; Duration 1.50s (transform 1.11s, setup 258ms, import 1.51s, tests 73ms). Scoped: npx vitest run lib/creative/asset-view-gate.test.js -> Test Files 1 passed (1), Tests 12 passed (12) [TS-1..TS-8, TS-11, TS-12, TS-13 + 1 unnumbered no-persist test]. Mutation testing: A (armed:true->false) 1 failed/11 passed, caught by TS-11 only; B (verdict!==PASS -> .blocked) 1 failed/11 passed, caught by TS-5 only; C (ventureId guard -> if(false)) 1 failed/11 passed, caught by TS-1 only; D (DEFAULT_VIEW_URL_TTL_SECONDS 300->86400) 12 passed (12) -- SURVIVED, coverage gap. Working tree restored clean after all mutations.',
    prd_coverage: {
      functional_requirements_reviewed: ['FR-1', 'FR-2', 'FR-3', 'FR-4', 'FR-5', 'FR-6', 'FR-10'],
      frs_implemented_in_code: ['FR-1', 'FR-2', 'FR-3', 'FR-4', 'FR-5', 'FR-6', 'FR-10'],
      frs_lacking_test_coverage: ['FR-4'],
      test_scenarios_promised: 13,
      test_scenarios_delivered: 12,
      test_scenarios_missing: ['TS-9', 'TS-10'],
      surviving_mutations: 1,
    },
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_KEY,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
  supabase,
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('TESTING', SD_KEY, null, results, { phase: 'EXEC_TO_PLAN' });
console.log('Stored TESTING evidence id:', stored.id);
console.log('verdict:', results.verdict, '| confidence:', results.confidence);
console.log('repo_path:', results.metadata?.repo_path);
console.log('executed_from_cwd:', results.metadata?.executed_from_cwd);
