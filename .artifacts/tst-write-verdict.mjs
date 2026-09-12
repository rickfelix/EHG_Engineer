import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';

const SD_ID = 'dfdad20c-bf37-47ef-8588-0ebd82cfb874';
const SD_KEY = 'SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E';

const findings = [
  {
    id: 'G1-fr2-fifth-param-collides-with-mergeMetadataKeysFn',
    severity: 'CRITICAL',
    summary: 'BLOCKING PRD SELF-CONTRADICTION. FR-2 says verbatim "Add a 5th optional parameter (e.g. {kind: qf|sd} ...)". Position 5 is ALREADY TAKEN: lib/fleet/claim-stamp.cjs:53 is `async function stampClaim(supabase, sdRef, sessionId, identitySource, mergeMetadataKeysFn = null)`. Eight live call sites pass the merge fn as arg 5: tests/unit/claim-identity.test.js:100,102; tests/unit/same-turn-next-claim.test.js:107,122,132,150; tests/unit/fleet/claim-stamp-concurrent-metadata-race.test.js:77,105. Inserting `kind` at position 5 makes every one of those pass a FUNCTION where a kind string/object is expected AND drops the merge injection, so the real mergeMetadataKeys (raw pg via lib/coordinator/safe-metadata-merge.mjs, hard-wired to strategic_directives_v2) would be reached from the unit tier -- which has DATABASE_URL/SUPABASE_POOLER_URL/SUPABASE_DB_PASSWORD/EHG_DB_PASSWORD all stubbed to empty strings by vitest.config.js, so it returns {merged:false} and stampClaim returns null. Result: FR-1 AC-3 and TS-6 ("all existing suites pass unmodified") are violated BY FR-2 as written. The 4 PRODUCTION call sites are safe -- lib/claim-guard.mjs:832, lib/session-conflict-checker.mjs:334, scripts/sd-start.js:1637, scripts/worker-checkin.cjs:394 all pass EXACTLY 4 positional args and none passes a 5th -- so a trailing param is safe only at position 6+. REMEDY (pick one): (a) auto-detect via /^QF-/.test(sdRef) with NO signature change at all -- strongest option, the repo already does this at lib/checkin/steps/directed-assignment.cjs:212, lib/coordinator/dispatch.cjs:348,468, lib/fleet/release-work-item.mjs:133, and NO existing test passes a QF- sdRef so behavior is provably unchanged; or (b) an options object at position 6, e.g. stampClaim(supabase, sdRef, sessionId, identitySource, mergeMetadataKeysFn, opts).',
  },
  {
    id: 'G2-ts1-not-testable-comparator-has-no-injection-seam',
    severity: 'CRITICAL',
    summary: 'BLOCKING TESTABILITY GAP. TS-1 requires "lib/priority/comparator.cjs is present and returns a numeric score" and asserts pick_reason.score is a NUMBER matching COMPARATOR_VERSION. That branch CANNOT BE TESTED as FR-1 specifies it. Measured on this branch: lib/priority/ does not exist (ls -> No such file or directory). I ran three empirical probes in the real unit project (vitest 4.1.4, pool:forks): (A) vi.mock of lib/coordinator/safe-metadata-merge.mjs DID intercept the dynamic import() inside claim-stamp.cjs -- so ESM-style seams in that file ARE mockable; (B) `await import("../../../lib/priority/comparator.cjs")` from a test file threw "Cannot find module" at RESOLUTION -- vitest cannot register a mock alias for a path that does not resolve, so vi.mock CANNOT synthesize a present comparator; (C) a bare require("../priority/comparator.cjs") from claim-stamp.cjs own resolution base threw code=MODULE_NOT_FOUND, which correctly confirms FR-1 ABSENT-module fallback trigger but leaves the PRESENT branch unreachable. Net: with a plain try/catch require() as FR-1 literally prescribes, TS-1 is unwritable and the numeric-score path (FR-1 AC-1) ships with ZERO coverage; only the UNSCORED path (TS-2/AC-2) is testable. REMEDY: add an explicit injection seam mirroring the resolveMergeFn pattern already in the file (claim-stamp.cjs:41-44) -- e.g. resolvePickReasonFn(computePriorityScoreFn) with the optional-require as the default. That makes BOTH branches testable with no live module, and is the same seam shape the 3 existing suites already rely on.',
  },
  {
    id: 'G3-ac6-already-satisfied-3-qf-lanes-funnel-through-ONE-stampClaim',
    severity: 'HIGH',
    summary: 'PRD OVERSTATES THE WORK, AND ITS NATURAL TEST IS QUARANTINED. All 3 QF-id no-op sites the PRD names are REAL and CURRENT (verified file:line): scripts/worker-checkin.cjs:765 `const claimed = await tryClaim(sb, qf.id, sessionId);` inside selfClaimQuickFix (PRD said ~765 -- EXACT); lib/checkin/steps/critical-qf-jump.cjs:113 `const claimed = await tryClaim(sb, qf.id, sessionId);` (PRD said ~113 -- EXACT); lib/checkin/steps/directed-assignment.cjs:270 `const claimed = await tryClaim(sb, sdKey, sessionId);` where sdKey can be a QF- key (its own QF branch is at :212, and :175-178 documents "a directed QF key always misses here ... and falls straight to tryClaim"). CRITICALLY: none of the three calls stampClaim itself. All three funnel into ONE function -- tryClaim at scripts/worker-checkin.cjs:379 -- whose single `await stampClaim(sb, sdKey, sessionId, "env")` at :394 is the only stamp. The no-op mechanism is confirmed by reading claim-stamp.cjs:24-38 + :56-57: bySdRef sends a non-UUID QF- id to .eq(sd_key, ...) on strategic_directives_v2, readSd misses, returns null, stampClaim returns null. CONSEQUENCE: AC-6 ("both route through the same QF-aware stampClaim path, not a separate implementation") is ALREADY structurally true and requires ZERO edits to critical-qf-jump.cjs or directed-assignment.cjs -- the whole fix is one change inside tryClaim or inside stampClaim. AC-6 should be re-worded as a funnel assertion (pin that neither file gains its own stampClaim import) rather than implying per-file wiring. SEPARATE HAZARD: tests/unit/worker-checkin-critical-qf-priority-jump.test.js -- the natural suite for the critical-qf-jump lane -- is QUARANTINED in tests/quarantine-manifest.json (rotting hardcoded fixture date NOW=2026-07-05 vs STALE_QF_DAYS), so it is EXCLUDED from the unit project and will NOT run. Any AC-6 evidence placed there is invisible to CI.',
  },
  {
    id: 'G4-missing-ts-qf-cas-loss-branch',
    severity: 'HIGH',
    summary: 'MISSING TEST SCENARIO. TS-4 covers only the HAPPY additive path of the QF CAS merge ("metadata contains both foo:bar and the new entry"). Nothing covers the CAS-LOSS branch: claiming_session_id changed between claim_sd and the merge, so the guarded UPDATE affects 0 rows. The PRD own risk register names "a concurrent-write test analogous to tests/unit/fleet/claim-stamp-concurrent-metadata-race.test.js" as the HIGH-impact mitigation for exactly this risk, but no TS-1..TS-9 encodes it -- the mitigation is asserted, not scheduled. Good news on feasibility: I read the live claim_sd RPC definition (pg_get_functiondef, 22039 chars) and its QF branch at lines 422-430 does `UPDATE quick_fixes SET claiming_session_id = p_session_id, status = in_progress, started_at = COALESCE(started_at, NOW()) WHERE id = p_sd_id` -- so claiming_session_id IS reliably set to the claiming session BEFORE stampClaim runs, and the proposed WHERE id=$qf AND claiming_session_id=$session guard will match on the happy path. The CAS design is sound; it is the loss branch that is unscheduled. ADD: a TS asserting a 0-row CAS result returns null (never throws, never retries, never falls back to an unguarded write).',
  },
  {
    id: 'G5-tr3-42703-discrimination-is-unobservable-through-the-outer-catch',
    severity: 'HIGH',
    summary: 'MISSING TEST SCENARIO + UNVERIFIABLE TR. TR-3 mandates that the QF write "must detect Postgres error 42703 (undefined_column) SPECIFICALLY and treat it as a fail-soft no-op, NOT a generic catch-and-swallow". But stampClaim contract (claim-stamp.cjs:54,74-76) is a blanket `try { ... } catch { return null; }` that swallows EVERYTHING and returns the same null for every failure mode. As currently shaped, a 42703 no-op and an unhandled 42P01/23505/connection-refused are BYTE-IDENTICAL to any caller and to any test -- so TR-3 is unverifiable by construction and no TS-1..TS-9 attempts it. This is the same defect class the PRD itself cites as precedent: worker-checkin.cjs:707-730 does discriminate 42703 explicitly (three-stage column-strip fallback on qfErr.code === 42703), and it is observable there because the fallback changes the SELECT. ADD: a TS that makes the discrimination observable -- e.g. a distinct return/warn on non-42703, or an injectable error sink asserted to receive the non-42703 error and NOT the 42703 one. Without it, EXEC can satisfy TR-3 letter with a broad catch and no test will notice.',
  },
  {
    id: 'G6-missing-ts-comparator-present-but-throwing-or-non-numeric',
    severity: 'MEDIUM',
    summary: 'MISSING TEST SCENARIO. FR-1 covers two comparator states -- absent (MODULE_NOT_FOUND) and "output has no numeric score" -- and TS-2 only encodes the ABSENT one. Three reachable states have no scenario: (a) the module resolves but computePriorityScore THROWS at call time; (b) it returns NaN or Infinity (typeof NaN === "number", so a naive `typeof score === "number"` check would let NaN through and JSON.stringify would serialize it as null into claim_history -- a silent shape corruption of the very provenance field this SD exists to add); (c) it returns a numeric score but no COMPARATOR_VERSION, leaving comparatorVersion undefined rather than the specified null. Given Child B is unmerged and its exact return shape cannot be pinned from this branch, these belong as explicit scenarios, not assumptions. FR-1 "never a fabricated 0" rule specifically needs the NaN case, since NaN is not 0 but arithmetic on it silently poisons any future consumer.',
  },
  {
    id: 'G7-fifo-cap-x-pick_reason-size-is-unbounded-and-untested',
    severity: 'MEDIUM',
    summary: 'MISSING TEST SCENARIO (the FIFO-interaction case). TR-5 preserves CLAIM_HISTORY_CAP=20 (claim-stamp.cjs:21) and pick_reason.components is specified with NO size bound anywhere in FR-1, TR-1..TR-5 or TS-1..TS-9. Every stampClaim call re-serializes the ENTIRE 20-entry array as one JSON parameter into mergeMetadataKeys `metadata = COALESCE(metadata,{}::jsonb) || $2::jsonb` (safe-metadata-merge.mjs:94-99), so per-claim write payload now scales as 20 x sizeof(components). I checked for an existing guard: METADATA_LIMITS (lib/agents/audit-config.cjs:92-101, maxTotalBytes 10000) is consumed ONLY by lib/agents/claim-evidence-auditor.cjs and lib/agents/metadata-enforcer.cjs -- neither is on the claim path -- so there is NO size enforcement on strategic_directives_v2.metadata.claim_history at all. Not a correctness bug and not a hard failure (jsonb TOASTs), but it is an unbounded growth vector introduced by this SD with zero test. ADD: a TS pinning a cap on components (or asserting a bounded serialized size for a full 20-entry history).',
  },
  {
    id: 'G8-ac9-live-fixtures-cannot-be-read-from-the-unit-tier',
    severity: 'MEDIUM',
    summary: 'AC WORDING vs TIER REALITY. AC-9 requires isChairmanGatedQF to be verified against "all 3 LIVE chairman-gated QF fixtures". The unit project has no DB access by construction -- vitest.config.js stubs SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (tests/setup.unit.js) and SUPABASE_POOLER_URL/DATABASE_URL/SUPABASE_DB_PASSWORD/EHG_DB_PASSWORD to empty strings -- so a live read is impossible there, and the db project self-skips on an undesignated target. AC-9 must be satisfied with STATIC fixtures. I verified the 3 rows live so EXEC can pin real shapes: QF-20260713-970 owner="CHAIRMAN" (UPPERCASE -- the case-folding at qf-gated-hold.cjs:25 is load-bearing here), release_condition="Chairman approves (verbal suffices) -> apply database/migrations/031_gdpr_compliance_tables.sql ..."; QF-20260905-631 and QF-20260905-884 both owner="chairman", release_condition="[oracle_read_pending] review_at=2026-09-06T01:27:08.595Z consult=6155ae63-... :: batch mint detected (group size 6)"; all three status="open". SEPARATELY, FR-4 is near-tautological: isChairmanGatedQF (lib/fleet/qf-gated-hold.cjs:23-29) reads ONLY qf.owner and qf.release_condition and can never be affected by an added key -- the test is cheap and harmless but proves little. It belongs as an extension of the EXISTING tests/unit/fleet/qf-gated-hold.test.js (which already covers case-insensitivity, empty/whitespace conditions, null and undefined), not a new file.',
  },
  {
    id: 'G9-ts7-ts8-have-no-behavioral-harness-source-order-pin-is-the-honest-instrument',
    severity: 'MEDIUM',
    summary: 'TEST-TYPE MISMATCH. TS-7 is typed "unit" for lib/sd-creation/source-adapters/qf.js:255 and TS-8 "integration" for scripts/qf-start.js:127, but neither has a behavioral harness. qf-start.js is a top-level ESM CLI with safeExit/process.exit and real DB side effects; the repo already concluded this and built the honest instrument -- tests/unit/claim-liveness-fence-qf-surfaces-order.test.js:27-45 pins qf-start.js ordering via indexOf comparisons and its own header states plainly why ("these are SOURCE-ORDER assertions, and they are deliberately not dressed up as equivalent"). EXEC should EXTEND that existing file for AC-8 rather than invent a new one. Both PRD premises for those sites are ACCURATE as measured: qf.js:255 passes p_sd_id: sdKey (an SD key, not a QF id -- so the plain SD-side stampClaim works with no migration dependency, exactly as FR-3 claims) and qf-start.js:127 passes p_sd_id: qfId (a genuine QF id). AC-8 gated-hold premise is also accurate: qf-start.js imports isChairmanGatedQF at :29 and refuses at :74, ahead of the liveness fence (:84), the worktree quota (:113 enforceWorktreeQuota) and claim_sd (:127) -- so "stampClaim strictly after a successful claim" is pinnable as a 5-way ordering assertion in that one existing file.',
  },
  {
    id: 'G10-no-scenario-for-mixed-legacy-claim_history-entries',
    severity: 'LOW',
    summary: 'MISSING TEST SCENARIO (backward compat over live data). TS-6 checks that existing SUITES pass, but nothing checks that a consumer reading a MIXED array -- old entries with no pick_reason alongside new ones that have it -- behaves correctly. This is the real production shape from day one: lib/coordinator/claim-burn-gauge.cjs:20 records 1254 SDs already carrying claim_history across 2109 claim events, and every one of those entries will lack pick_reason forever. I enumerated 22 non-test files referencing claim_history (the PRD/Explore evidence cites 14, so the enumeration is stale by 8). Spot-checked the highest-risk readers and all are key-addressed and defensive, consistent with TR-5: lib/adam/stall-alert.js:141 and lib/governance/work-boundary-gauges.js:40,86 both Array.isArray-guard then read only .session_id; lib/coordinator/claim-burn-gauge.cjs:80 passes the array to a pure classifier; scripts/audit-claim-attribution.mjs:52 uses ?? []; lib/drive-loop/score/leg2-uptake.js:14-29 documents the entry shape as {session_id, claimed_at} and locates entries by ARRAY INDEX -- index-based, so an added key is harmless, but it is the one reader whose header pins a shape that this SD changes, and its comment should be updated. I also confirmed the only toEqual on claim_history in the whole test estate (tests/unit/fleet/claim-stamp-concurrent-metadata-race.test.js:66) asserts a HAND-BUILT object in the BASELINE anti-pattern demo, NOT stampClaim output -- so AC-3/TS-6 is genuinely achievable, not a trap.',
  },
  {
    id: 'G11-no-scenario-for-qf-row-absent-and-ac3-miscounts-suites',
    severity: 'LOW',
    summary: 'TWO SMALL GAPS. (a) No TS covers stampClaim receiving a QF id whose quick_fixes row is missing or was re-claimed away between claim_sd and the stamp -- the QF-side analogue of the SD-side readSd-miss already covered by TS-3 in same-turn-next-claim.test.js:142-158. It must return null, never throw. (b) FR-1 AC-3 and TS-6 both say "the 4 existing unit suites" but enumerate only 3 files; the implied 4th is tests/unit/effort-experiment.test.js, which imports stampExecutionContext/buildExecutionContext (claim-stamp.cjs:12) and NOT stampClaim, so it is not actually a claim_history consumer. Harmless, but EXEC should run it anyway since it imports the same module.',
  },
  {
    id: 'G12-verified-good-no-server-side-claim_history-double-write',
    severity: 'INFO',
    summary: 'PREMISE CLEARED (a hazard that would have broken AC-1, ruled out). tests/unit/checkin/directed-assignment-marker-write.test.js:99 carries the comment "claim_sd appends claim_history server-side during the tryClaim immediately before this", which if true would mean two claim_history entries per claim and only one carrying pick_reason -- directly breaking AC-1 "the NEWEST element has a pick_reason object". I read the live function definition (SELECT pg_get_functiondef for public.claim_sd): the string claim_history does NOT appear anywhere in its 22039 characters. The comment is stale/inaccurate; claim_history is written exclusively client-side by stampClaim. No double-write hazard, and "newest element" is a safe assertion. BASELINE ESTABLISHED: I ran the 9 suites in the blast radius on this branch before any EXEC work -- tests/unit/same-turn-next-claim.test.js, tests/unit/claim-identity.test.js, tests/unit/fleet/claim-stamp-concurrent-metadata-race.test.js, tests/unit/checkin/directed-assignment-marker-write.test.js, tests/unit/effort-experiment.test.js, tests/unit/fleet/qf-gated-hold.test.js, tests/unit/claim-liveness-fence-qf-surfaces-order.test.js, tests/unit/qf-claim-routing.test.js, tests/unit/qf-escalation-continuity.test.js -- 9 files, 79 tests, ALL PASSING. Any red in these post-EXEC is caused by this SD. Also verified live: quick_fixes.metadata returns 42703 (column does not exist) and quick_fixes.claiming_session_id exists -- both FR-2/FR-5 premises accurate.',
  },
];

const warnings = [
  'G1 is a literal self-contradiction inside the approved PRD: FR-2 instructs EXEC to occupy parameter position 5, which is already mergeMetadataKeysFn, and 8 call sites across the 3 test files FR-1 AC-3 promises will "pass unmodified" pass their merge double in exactly that position. Following FR-2 verbatim guarantees AC-3 and TS-6 fail. This must be resolved in the PRD (or by an explicit EXEC deviation note) before implementation, not discovered at test time.',
  'G2 means FR-1 AC-1 (numeric pick_reason.score) is not provable on this branch with the mechanism FR-1 specifies. I proved this empirically rather than by inference: vitest CAN mock the existing dynamic import() inside claim-stamp.cjs, but CANNOT alias a path that does not resolve on disk, and lib/priority/ does not exist. Without an added injection seam, TS-1 is unwritable and EXEC will either silently drop it or fabricate an on-disk comparator fixture (which pollutes the tree and races parallel vitest workers).',
  'Evidence-placement hazard: tests/unit/worker-checkin-critical-qf-priority-jump.test.js is in tests/quarantine-manifest.json and is therefore EXCLUDED from the unit project. It is the obvious home for AC-6 evidence on the critical-qf-jump lane and would read as green-because-never-collected. Put AC-6 evidence in a collected file.',
];

const recommendations = [
  'Resolve G1 before EXEC starts. Strongly prefer auto-detect on /^QF-/.test(sdRef) with NO signature change: the repo already uses that exact discriminator at lib/checkin/steps/directed-assignment.cjs:212, lib/coordinator/dispatch.cjs:348 and :468, and lib/fleet/release-work-item.mjs:133, and I verified NO existing test passes a QF- prefixed sdRef to stampClaim (they use SD-TEST-KEY-001, SD-X, SD-X-001, SD-RACE-001 and a bare UUID), so behavior for every current caller is provably byte-identical. If an explicit kind is still wanted, it must land at position 6+ as an options object.',
  'Resolve G2 by adding a comparator injection seam that mirrors resolveMergeFn (claim-stamp.cjs:41-44) -- e.g. resolvePickReasonFn(computePriorityScoreFn) defaulting to the optional require. That is the ONLY approach that makes both the scored and UNSCORED branches testable while lib/priority/comparator.cjs is unmerged, and it reuses a seam pattern all 3 existing suites already understand.',
  'Re-word AC-6 as a funnel assertion. The correct pin is: critical-qf-jump.cjs and directed-assignment.cjs contain ZERO stampClaim imports/calls, and tryClaim (worker-checkin.cjs:379) is the single stamp site all three QF lanes reach. That is what "not a separate implementation" actually means here, and unlike per-file wiring it is a real invariant that a future drift would break.',
  'Add 5 scenarios: TS-10 QF CAS-loss (0 rows affected -> null, no throw, no unguarded fallback); TS-11 non-42703 error is observably distinguished from 42703 (otherwise TR-3 is unverifiable through the blanket catch at claim-stamp.cjs:74); TS-12 comparator present-but-throwing and present-but-NaN both yield UNSCORED (NaN is typeof number, so a naive numeric check admits it and JSON.stringify silently writes null); TS-13 a bounded serialized size for a full 20-entry claim_history carrying pick_reason (no size guard exists on this path -- METADATA_LIMITS is not wired to it); TS-14 a mixed legacy/new claim_history array reads correctly in at least one live consumer.',
  'Place AC-8 evidence by extending tests/unit/claim-liveness-fence-qf-surfaces-order.test.js (already the repo sanctioned source-order instrument for qf-start.js, with a header that honestly states its limits) and AC-9/AC-10 evidence by extending tests/unit/fleet/qf-gated-hold.test.js with static fixtures pinned to the 3 live row shapes recorded in finding G8. Do NOT attempt a live DB read from the unit tier -- it is credential-stubbed by design.',
  'Correct two PRD bookkeeping errors: AC-3/TS-6 say "4 existing unit suites" but list 3 (the 4th, effort-experiment.test.js, imports stampExecutionContext not stampClaim); and the cited claim_history consumer count of 14 is now 22 non-test files.',
];

const summary = 'CONDITIONAL_PASS. The PRD is unusually well-grounded -- I re-verified every premise against current code and the live DB and found the load-bearing ones ACCURATE: the 3 QF-id no-op sites are real at worker-checkin.cjs:765, critical-qf-jump.cjs:113 and directed-assignment.cjs:270; the silent-no-op mechanism is confirmed (claim-stamp.cjs:24-38 sends a QF- id to .eq(sd_key) on strategic_directives_v2 and misses); quick_fixes.metadata really does return 42703 while claiming_session_id exists; lib/priority/ really is absent; qf.js:255 really passes an SD key and qf-start.js:127 a QF id; qf-start.js really gates on isChairmanGatedQF at :74 ahead of fence/quota/claim; and the 3 named chairman-gated fixtures are live with the shapes recorded. I also cleared one hazard that would have broken AC-1 -- the live claim_sd function contains no reference to claim_history in 22039 chars, so there is no server-side double-write and "newest element" is safe to assert. Baseline is green: 9 blast-radius suites, 79 tests, all passing before EXEC. TWO GAPS ARE BLOCKING. (1) FR-2 instructs EXEC to add a "5th optional parameter", but position 5 is already mergeMetadataKeysFn and 8 call sites in the very 3 test files AC-3 promises will pass unmodified use it -- FR-2 as written guarantees AC-3/TS-6 fail; the 4 production call sites all pass exactly 4 args, so a trailing param is only safe at position 6+, and /^QF-/ auto-detect (already the repo idiom in 4 places) needs no signature change at all. (2) TS-1 numeric-score branch is untestable as specified: I empirically confirmed in the real unit project that vitest CAN mock the existing dynamic import() inside claim-stamp.cjs but CANNOT alias lib/priority/comparator.cjs because it does not resolve on disk, and a bare require() of it throws MODULE_NOT_FOUND -- so with FR-1 literal try/catch require, only the UNSCORED path is coverable and FR-1 AC-1 ships unproven. Both are fixable with small, well-precedented changes before EXEC writes code. Beyond those, 5 real scenarios are missing (QF CAS-loss, 42703-vs-other error discrimination which makes TR-3 unverifiable through the blanket catch, comparator-throws/NaN, the FIFO-cap x pick_reason size interaction which has no guard anywhere on this path, and mixed legacy/new claim_history), AC-6 is already structurally satisfied so its per-file wording overstates the work, AC-9 asks for live fixtures the credential-stubbed unit tier cannot read, and the natural home for critical-qf-jump evidence is quarantined and would never be collected.';

const justification = [
  'CONDITIONAL_PASS -- SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E, PLAN-TO-EXEC prospective test verification.',
  '',
  'Q1 -- ARE THE PRD PREMISES ACCURATE AGAINST CURRENT CODE? Overwhelmingly yes; this is a well-measured PRD. Verified accurate: stampClaim is the single shared post-claim stamp (claim-stamp.cjs:53); the QF silent-no-op mechanism (bySdRef at :24-26 -> readSd at :29-38 -> .eq(sd_key) miss -> null at :57); quick_fixes.metadata absent (live probe: 42703) and claiming_session_id present; lib/priority/ absent; mergeMetadataKeys is hard-wired to strategic_directives_v2 with no quick_fixes sibling (safe-metadata-merge.mjs:94-99), so FR-2 is right that a hand-rolled QF merge is unavoidable; the CAS column is populated by claim_sd itself (RPC lines 422-430) so the guard will match; qf.js:255 passes an SD key and qf-start.js:127 a QF id; qf-start.js gate ordering is :74 gated-hold -> :84 liveness -> :113 quota -> :127 claim. Two premises are STALE and one comment is WRONG: the claim_history consumer count is 22 non-test files, not 14; AC-3/TS-6 say "4 suites" but list 3; and directed-assignment-marker-write.test.js:99 asserts claim_sd writes claim_history server-side, which the live function definition disproves (zero occurrences in 22039 chars) -- worth knowing, because if it HAD been true, AC-1 "newest element" assertion would have been unsound.',
  '',
  'Q2 -- CALL-SITE SIGNATURE RISK. This is the SD biggest risk and it is a PRD-internal contradiction, not an EXEC hazard. Current signature: stampClaim(supabase, sdRef, sessionId, identitySource, mergeMetadataKeysFn = null) at claim-stamp.cjs:53. PRODUCTION callers -- all 4, all exactly 4 positional args, none passing a 5th: lib/claim-guard.mjs:832, lib/session-conflict-checker.mjs:334, scripts/sd-start.js:1637, scripts/worker-checkin.cjs:394. So an additive TRAILING param cannot silently break production. But the TEST estate does pass arg 5, at 8 sites: claim-identity.test.js:100,102; same-turn-next-claim.test.js:107,122,132,150; claim-stamp-concurrent-metadata-race.test.js:77,105. FR-2 literal "add a 5th optional parameter" therefore collides head-on with FR-1 AC-3 and TS-6. Worse than a type confusion: losing the merge injection would let the unit tier reach the real mergeMetadataKeys, whose pg credentials vitest.config.js deliberately stubs to empty strings -- it would return {merged:false} and stampClaim would return null, so the failure would present as a confusing "stamp returned null" rather than an obvious arity error. Position 6+, or /^QF-/ auto-detect with no signature change at all.',
  '',
  'Q3 -- MOCK/INJECTION SEAM FOR THE QF CAS MERGE. Yes, resolveMergeFn pattern (claim-stamp.cjs:41-44) can and SHOULD be mirrored, and it is in fact the only workable option. Two independent reasons the QF path MUST have its own injectable merge rather than reusing mergeMetadataKeysFn: (i) mergeMetadataKeys(sdKey, patch) is hard-wired to UPDATE strategic_directives_v2 ... WHERE sd_key = $1 and has no id/CAS parameter, so it cannot express the required WHERE id=$qf AND claiming_session_id=$session guard -- note the repo already hit this exact wall and solved it with a sibling primitive, removeMetadataKeyIfClaimedBy (safe-metadata-merge.mjs:180-206), which is the precedent to copy; (ii) that module reaches the DB through raw pg via createDatabaseClient, which a supabase-js mock can never intercept, so without function injection the QF path is untestable in the unit tier at all. I empirically confirmed the seam works: vi.mock of safe-metadata-merge.mjs DID intercept the dynamic import() inside claim-stamp.cjs and my double was called with the exact claim_history patch. One caveat EXEC must handle: readSd is SD-only, so the QF path needs its own quick_fixes read, and the existing mocks are effectively table-blind (same-turn-next-claim.test.js:27-42 ignores the table argument and returns the same row for any from()), so new QF tests need a table-aware double rather than a copy of the old one.',
  '',
  'Q4 -- THE 3 QF-ID NO-OP SITES, CONFIRMED WITH FILE:LINE. scripts/worker-checkin.cjs:765 (selfClaimQuickFix, tryClaim(sb, qf.id, sessionId)) -- PRD said ~765, exact. lib/checkin/steps/critical-qf-jump.cjs:113 (tryClaim(sb, qf.id, sessionId)) -- PRD said ~113, exact. lib/checkin/steps/directed-assignment.cjs:270 (tryClaim(sb, sdKey, sessionId), QF- keys reach it via the branch at :212 and the explanation at :175-178) -- PRD gave no line; :270 is it. All three are real and current. The finding the PRD does not state: none of them calls stampClaim directly. All three funnel through tryClaim (worker-checkin.cjs:379) whose single stampClaim at :394 is the only stamp, so the entire fix is ONE edit and AC-6 is already structurally satisfied. I also checked the other tryClaim callers to be sure the PRD enumeration is complete -- worker-checkin.cjs:1048/:1122/:1463 and merged-pool-self-claim.cjs:390 all pass SD keys from draft/ranked/orphan pools -- so 3 is the correct and complete count of QF-capable lanes.',
  '',
  'Q5 -- MISSING SCENARIOS AND GAPS. Five substantive omissions, detailed in G4-G7 and G10-G11: the QF CAS-LOSS branch (the PRD names a concurrency test as its HIGH-impact mitigation but no TS schedules it); the 42703-vs-other error-shape case, which matters more than it looks because stampClaim blanket catch at :74-76 makes every failure return an identical null, rendering TR-3 unverifiable and satisfiable in letter by the very broad catch it forbids; comparator present-but-throwing and present-but-NaN (NaN is typeof number, so a naive numeric guard admits it and JSON.stringify writes null into the provenance field this SD exists to create); the FIFO-cap interaction, where components is unbounded, every claim re-serializes all 20 entries into one jsonb || parameter, and I confirmed no size guard exists on this path (METADATA_LIMITS at audit-config.cjs:92 is consumed only by claim-evidence-auditor.cjs and metadata-enforcer.cjs); and mixed legacy/new claim_history, which is the day-one production shape across the 1254 SDs already carrying history per claim-burn-gauge.cjs:20. Plus the QF-row-absent case, the AC-9 live-fixture/credential-stub mismatch, and the quarantined-evidence-home hazard.',
  '',
  'WHY CONDITIONAL_PASS RATHER THAN PASS OR FAIL. Not FAIL: the design is sound, the premises are measured rather than assumed, the fail-soft posture is right, the CAS target column is genuinely populated before the stamp, the additive-only constraint is genuinely safe (the single toEqual on claim_history in the whole estate is on a hand-built baseline object, not stampClaim output), and the baseline is green. Not PASS: two of the PRD own requirements cannot both be satisfied as written -- FR-2 parameter position defeats FR-1 AC-3, and FR-1 require-based comparator lookup makes TS-1 unwritable -- and both would be discovered late, at test-authoring time, after EXEC had already committed to a signature. Both have small, well-precedented fixes available now. Resolve G1 and G2 in the PRD (or as a recorded EXEC deviation), add the five scenarios, and this is a clean PASS.',
].join('\n');

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 90,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [
      'G1: FR-2 specifies parameter position 5, which is already occupied by mergeMetadataKeysFn and used by 8 call sites in the 3 test suites FR-1 AC-3 promises will pass unmodified. Following FR-2 literally guarantees AC-3 and TS-6 fail.',
      'G2: TS-1 (numeric pick_reason.score) is unwritable as specified -- lib/priority/comparator.cjs does not resolve on disk and vitest cannot alias an unresolvable path (empirically verified), so FR-1 AC-1 would ship with zero coverage without an added injection seam.',
    ],
    conditions: [
      'Resolve the FR-2 parameter-position collision before EXEC writes code: use /^QF-/ auto-detect (no signature change; the repo idiom at directed-assignment.cjs:212, dispatch.cjs:348/:468, release-work-item.mjs:133) or place an options object at position 6+.',
      'Add a comparator injection seam mirroring resolveMergeFn (claim-stamp.cjs:41-44) so both the scored and UNSCORED branches of FR-1 are testable while lib/priority/comparator.cjs remains unmerged.',
      'Add the 5 missing scenarios: QF CAS-loss (0-row guarded update), non-42703 error discrimination made observable through the blanket catch, comparator throws/NaN, bounded serialized size for a full 20-entry pick_reason-bearing claim_history, and a mixed legacy/new claim_history read.',
      'Place AC-6 evidence in a COLLECTED file -- tests/unit/worker-checkin-critical-qf-priority-jump.test.js is quarantined and excluded from the unit project.',
      'Satisfy AC-9 with static fixtures pinned to the 3 verified live row shapes (recorded in finding G8); the unit tier is credential-stubbed and cannot read them live.',
    ],
    metadata: {
      review_type: 'PLAN_TO_EXEC_PROSPECTIVE_TEST_VERIFICATION',
      verification_detail: {
        baseline_established: true,
        baseline_note: 'Pre-EXEC baseline on branch feat/SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E at 9126e8903f2. Any red in these suites after EXEC is caused by this SD.',
        baseline_files: 9,
        baseline_tests: 79,
        baseline_passed: 79,
        baseline_failed: 0,
        baseline_suites: [
          'tests/unit/same-turn-next-claim.test.js',
          'tests/unit/claim-identity.test.js',
          'tests/unit/fleet/claim-stamp-concurrent-metadata-race.test.js',
          'tests/unit/checkin/directed-assignment-marker-write.test.js',
          'tests/unit/effort-experiment.test.js',
          'tests/unit/fleet/qf-gated-hold.test.js',
          'tests/unit/claim-liveness-fence-qf-surfaces-order.test.js',
          'tests/unit/qf-claim-routing.test.js',
          'tests/unit/qf-escalation-continuity.test.js',
        ],
        live_schema_probes: {
          'quick_fixes.metadata': 'ABSENT -- 42703 column quick_fixes.metadata does not exist (FR-2/FR-5 premise CONFIRMED)',
          'quick_fixes.claiming_session_id': 'PRESENT (FR-2 CAS-guard column CONFIRMED)',
          'lib/priority/comparator.cjs': 'ABSENT -- lib/priority/ directory does not exist (TR-2 premise CONFIRMED)',
          'claim_sd RPC claim_history writes': 'NONE -- string absent from all 22039 chars of pg_get_functiondef (no server-side double-write; AC-1 newest-element is safe)',
          'claim_sd QF branch': 'UPDATE quick_fixes SET claiming_session_id=p_session_id, status=in_progress, started_at=COALESCE(started_at,NOW()) WHERE id=p_sd_id (RPC lines 422-430)',
        },
        mock_seam_probes: {
          'vi.mock of dynamic import() inside claim-stamp.cjs': 'WORKS -- double received patch {claim_history:[{session_id,claimed_at,identity_source}]}',
          'import of unresolvable lib/priority/comparator.cjs from a test': 'THROWS at resolution -- vitest cannot alias a non-existent path, so TS-1 needs an injection seam',
          'require() of ../priority/comparator.cjs from claim-stamp.cjs base': 'THROWS code=MODULE_NOT_FOUND -- FR-1 absent-module fallback trigger CONFIRMED',
        },
        stampClaim_call_site_audit: {
          production_sites_all_4_args: [
            'lib/claim-guard.mjs:832',
            'lib/session-conflict-checker.mjs:334',
            'scripts/sd-start.js:1637',
            'scripts/worker-checkin.cjs:394',
          ],
          test_sites_passing_arg5_mergeFn: [
            'tests/unit/claim-identity.test.js:100', 'tests/unit/claim-identity.test.js:102',
            'tests/unit/same-turn-next-claim.test.js:107', 'tests/unit/same-turn-next-claim.test.js:122',
            'tests/unit/same-turn-next-claim.test.js:132', 'tests/unit/same-turn-next-claim.test.js:150',
            'tests/unit/fleet/claim-stamp-concurrent-metadata-race.test.js:77',
            'tests/unit/fleet/claim-stamp-concurrent-metadata-race.test.js:105',
          ],
          verdict: 'A trailing additive param is SAFE for production (all 4 pass exactly 4 args) but UNSAFE at position 5 (8 test sites occupy it).',
        },
        qf_noop_call_sites_confirmed: [
          'scripts/worker-checkin.cjs:765 -- selfClaimQuickFix, tryClaim(sb, qf.id, sessionId)',
          'lib/checkin/steps/critical-qf-jump.cjs:113 -- tryClaim(sb, qf.id, sessionId)',
          'lib/checkin/steps/directed-assignment.cjs:270 -- tryClaim(sb, sdKey, sessionId), QF- keys reach it via the branch at :212',
        ],
        qf_noop_funnel: 'All 3 reach the SINGLE stampClaim at scripts/worker-checkin.cjs:394 inside tryClaim (:379). One edit fixes all three; AC-6 is already structurally satisfied.',
        quarantined_evidence_hazard: 'tests/unit/worker-checkin-critical-qf-priority-jump.test.js is in tests/quarantine-manifest.json and excluded from the unit project.',
      },
      measured: true,
      test_execution: buildTestExecution({
        executed: 79,
        passed: 79,
        failed: 0,
        skipped: 0,
        artifactSha: 'ec32d6adb39a1c827d6e59bb9107d527c8f602e0d5b9409f455c885f4a83b651',
        runner: 'vitest 4.1.4 --project unit --reporter=json',
        artifactPath: '.artifacts/tst-baseline-results.json',
        source: 'fresh',
      }),
      test_execution_note: 'PRE-EXEC BASELINE, not a verification of this SD implementation (validation_mode=prospective; no code written yet). The 9 suites are the measured blast radius of the planned change: every file that imports lib/fleet/claim-stamp.cjs or exercises the QF claim/gated-hold paths. All 79 green at HEAD 9126e8903f2, so any red after EXEC is attributable to this SD. Artifact is runner-written by vitest --reporter=json; sha256 above is over that exact file.',
      prd_id: 'PRD-SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E',
      validation_mode: 'prospective',
      branch: 'feat/SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E',
      head_commit: '9126e8903f2',
      files_reviewed: [
        'lib/fleet/claim-stamp.cjs',
        'lib/coordinator/safe-metadata-merge.mjs',
        'scripts/worker-checkin.cjs',
        'lib/checkin/steps/critical-qf-jump.cjs',
        'lib/checkin/steps/directed-assignment.cjs',
        'lib/sd-creation/source-adapters/qf.js',
        'scripts/qf-start.js',
        'lib/fleet/qf-gated-hold.cjs',
        'lib/claim-guard.mjs',
        'lib/session-conflict-checker.mjs',
        'scripts/sd-start.js',
        'tests/unit/claim-identity.test.js',
        'tests/unit/same-turn-next-claim.test.js',
        'tests/unit/fleet/claim-stamp-concurrent-metadata-race.test.js',
        'tests/unit/checkin/directed-assignment-marker-write.test.js',
        'tests/unit/fleet/qf-gated-hold.test.js',
        'tests/unit/claim-liveness-fence-qf-surfaces-order.test.js',
        'vitest.config.js',
        'tests/quarantine-manifest.json',
        'lib/agents/audit-config.cjs',
        'database/migrations/20260728_add_quick_fix_runtime_observation.sql',
      ],
      gap_count_by_severity: { CRITICAL: 2, HIGH: 3, MEDIUM: 4, LOW: 2, INFO: 1 },
      blocking_gaps: ['G1-fr2-fifth-param-collides-with-mergeMetadataKeysFn', 'G2-ts1-not-testable-comparator-has-no-injection-seam'],
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E',
    },
    phase: 'PLAN',
    validation_mode: 'prospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { name: 'Enhanced QA Engineering Director (testing-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
