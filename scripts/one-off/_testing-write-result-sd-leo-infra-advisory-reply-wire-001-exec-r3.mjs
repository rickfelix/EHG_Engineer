#!/usr/bin/env node
/**
 * Write TESTING (QA Engineering Director) EXEC-TO-PLAN verdict — ROUND 3 — for
 * SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001 (PR #7536, branch feat/SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001,
 * head 19a6b3d8985 = merge of origin/main into the feature branch).
 *
 * Round 1 TESTING (4101e867-2ebb-4d69-83ac-98838edfaf75) closed the cap/direction/JS-filter/by-id-kind
 * mechanisms. Round 2 SECURITY (e4068393-0933-4b30-9d9e-6a48aa8afa83) closed S3 (correlation-branch
 * kind allowlist) and S4 (CC-target validation). This round reviews the CURRENT head only and does
 * not re-litigate those; it re-verifies them as still-green and hunts what remains open.
 *
 * Method: execution-based, not reading-based. Every claim below is backed by either a run of the
 * shipped exported functions against a purpose-built double, a mutation applied to
 * scripts/solomon-advisory.cjs with the suite re-run and the source restored byte-identical, or a
 * READ-ONLY query against the live session_coordination table.
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js applySubAgentRepoVerdict)
 * + canonical storage (lib/sub-agent-executor/results-storage.js storeSubAgentResults) per CLAUDE.md
 * prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'b0d54b9f-8848-4cab-a7d8-fba9ad3e31fb';
const SD_KEY = 'SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001';

const findings = [
  {
    id: 'T1-w4-loudness-instrumentation-is-blind-to-the-dominant-failure-shape',
    severity: 'MEDIUM',
    summary:
      "NEW. The EXEC-TST-W4 remediation added a console.error inside resolveOriginatorFromCorrelation's catch (solomon-advisory.cjs:597-602) whose in-source claim is explicit: \"a QUERY-LEVEL failure here degrades to the exact pre-fix symptom (no CC) with zero operator signal. Loud, still fail-open.\" It does not deliver that for query-level failures. The function destructures `const { data } = await supabase...limit(20)` and DISCARDS `error`; the catch can therefore only observe a THROWN exception. supabase-js resolves PostgREST server-side errors as { data: null, error } and only throws on a transport/fetch fault. MEASURED, not inferred, against the REAL client on the REAL table with the EXACT builder chain the fix uses (select+eq+in+order+limit): a 42703 (bad column) returned threw=false, data=null, error={code:'42703',...}; a missing-table read returned threw=false, error.code='PGRST205'. Neither throws. EXECUTED against the shipped module: with the { data:null, error } shape, resolveOriginatorFromCorrelation returns null and emits ZERO console.error lines; with the throw shape it emits exactly 1. So the loudness fires only for the rarer half. END-TO-END this is worse than a missing log: ensureOriginatorCc under a total DB read failure returns {inserted:false, originator:null} with NO `error` key, and both call sites (:1220 dedup-heal, :1291 primary) print output only when `inserted` or `error` is truthy — so an operator sees NOTHING and cannot distinguish 'DB read failed, CC silently dropped' from 'no CC needed'. That is precisely the silent-no-CC symptom class this SD exists to eliminate, re-entering through the resolver-error door. The repo's own convention elsewhere in this same file proves the correct shape is known (insertCoordinationRow: `const { data, error } = ...; if (error) {...}`; retargetStaleSolomonInbound: `if (error) return { ..., error: error.message }`). Zero tests exercise any error path of this function.",
  },
  {
    id: 'T2-s4-guard-placement-after-the-live-role-remap-is-unpinned-and-genuinely-load-bearing',
    severity: 'MEDIUM',
    summary:
      "NEW. The S4 fix landed the guard `if (!isUsableSessionId(originator) || originator.startsWith('broadcast-')) return {inserted:false, originator:null};` at :670 — AFTER the W3/FR-5 live-role remap (:662-669). That ORDERING is the whole protection for remap-sourced values, and it is not pinned by any test. MUTATION (applied-verified; the patch asserts an exact single occurrence and the source was restored byte-identical afterward, confirmed by an empty `git diff --stat`): moving the guard to run BEFORE the remap try/catch leaves the suite 30/30 GREEN. The two EXEC-SEC-S4 tests cannot catch it because both drive sessionRole=null, so no remap occurs in either fixture — they pin the guard's EXISTENCE, never its POSITION. The exposure is real, not theoretical, and this is the part that matters: pickCanonicalAdam (lib/coordinator/adam-identity.cjs:89-97) filters candidates with `typeof r.session_id === 'string'` ONLY, with NO nil-UUID guard — while its sibling pickCanonicalSolomon (lib/coordinator/solomon-identity.cjs:64-69) DOES filter via isUsableSessionId with the comment \"QF-20260727-862: skip the nil UUID — that ghost row carried set_solomon_flag too, and '00000000-…' sorts FIRST in the session_id ASC tiebreak below, so it wins on any tie.\" So getActiveAdamId can elect the nil UUID from an unbacked ghost row, which is the exact WITNESSED incident shape of QF-20260727-862, and the Adam branch is the primary pre-existing W3 path this SD extends. EXECUTED WITNESS with the mutant applied: an adam-role originator whose election returns the nil UUID produced inserted:true with target_session='00000000-0000-0000-0000-000000000000'; the solomon-role variant did the same; an election returning 'broadcast-adam' produced target_session='broadcast-adam' — i.e. the mutant reopens the S4 hole through the remap door, including the fleet-wide-fan-out amplification. On the UNMUTATED head all three are correctly refused (inserted:false, originator:null, no insert), so the shipped code is CORRECT — it is only unprotected against a future edit.",
  },
  {
    id: 'T3-post-remap-self-and-target-skip-ordering-is-unpinned-and-fr5-makes-it-the-common-shape',
    severity: 'MEDIUM',
    summary:
      "NEW, same ordering class as T2 but a different guard and a different blast radius. `if (originator === target || originator === sessionId) return {inserted:false, originator};` (:673) must evaluate the POST-remap value; FR-5's own in-source rationale is that widening REPLY_ELIGIBLE_KINDS to adam_advisory \"makes SOLOMON'S OWN outbound advisories candidates too — every non-reply solomon-advisory send is stamped kind=adam_advisory regardless of sender\". That makes 'Solomon replies on a thread Solomon itself opened' the single most common NEWLY-ADMITTED shape: the originator resolves to Solomon's own (possibly rotated) session, the FR-5 remap points it at the LIVE Solomon — which IS the sending session — and only the post-remap self-check prevents a self-addressed CC. MUTATION (applied-verified, source restored byte-identical): moving that skip to run BEFORE the remap leaves the suite 30/30 GREEN. EXECUTED WITNESS with the mutant applied: (a) Solomon replying on its own adam_advisory thread, live-Solomon == sessionId => inserted:true, target_session='solomon-live-1' — a self-echo CC row written into Solomon's own inbox on every reply to its own thread; (b) an adam-role originator whose remap lands on the primary `--to adam` answer target => inserted:true, a straight DUPLICATE of the primary answer. On the unmutated head both are correctly skipped (inserted:false, 0 inserts). The FR-5 test (`re-resolves a dead SOLOMON originator session to the LIVE solomon session`) uses LIVE_SOLOMON='solomon-sess-9999' against sessionId='solomon-1', so its remap deliberately lands AWAY from self and can never observe this. No fixture anywhere sets a remap target equal to `sessionId` or to `target`.",
  },
  {
    id: 'T4-live-wire-verification-postgrest-in-on-a-jsonb-path-works-and-the-fix-resolves-correctly-on-real-data',
    severity: 'INFO',
    summary:
      "PASS, and the highest-value check available on this change: verify the WIRE, not the ends. The 30 unit tests drive a hand-rolled `fakeSb` that IMPLEMENTS `.in()` itself (test file :56, :61-63), so no test in this suite can reveal whether PostgREST accepts `.in('payload->>kind', [...])` on a JSONB accessor at all — and `.in()` on a jsonb path is NEW in this SD (the pre-fix code used `.eq('payload->>kind', X)`). If PostgREST rejected or mis-parsed it, the entire fix would silently degrade to 'no CC' — the exact pre-fix symptom — with the suite fully green. MEASURED READ-ONLY against the live table: the new form returned 10 rows with error=none and distinct kinds exactly [\"adam_advisory\",\"solomon_consult\"] — accepted AND filtering correctly, no leaked kinds. Then the EXACT production query shape (eq correlation_id + in kinds + order created_at ASC + limit 20) was replayed against a real multi-row correlation (e3000455-39ad-403c-8d81-50719766cb4b): 3 rows, error=none — an ask at 05:29:24Z kind=solomon_consult reply_to=(none) sender=50192c2e, and two replies at 05:30:47Z/05:30:48Z kind=adam_advisory reply_to=e3000455 sender=d8f99dba. The shipped resolution logic returns 50192c2e (the true asker, Adam); the PRE-FIX DESC .limit(1) shape would have returned d8f99dba (Solomon, the replier). This is a live end-to-end confirmation that the fix does what it claims on real data, and it also exercises a MIXED-kind correlation (solomon_consult ask + adam_advisory replies) — a real shape no unit fixture covers, in which the widening is what makes the reply rows visible at all so isReplyRow can correctly exclude them.",
  },
  {
    id: 'T5-zero-measured-regression-on-the-previously-working-solomon_consult-path',
    severity: 'INFO',
    summary:
      "PASS, measured rather than assumed. The adversarial hypothesis: the new isReplyRow exclusion could REGRESS the path that already worked. Pre-fix, `.eq(kind, solomon_consult).order(DESC).limit(1)` returned that row's sender unconditionally; post-fix, a correlation on which EVERY eligible row carries a reply_to resolves null. A CHAINED consult — an ask itself sent with --reply-to, so the ask row carries payload.reply_to — is classified as a reply row and excluded, so pre-fix would have CC'd the true asker and post-fix would CC nobody. MEASURED over the full live population with pagination (no capped fetch, per the CAP-vs-POP discipline): 526 eligible-kind rows across 378 distinct correlations. 364 correlations resolve a non-reply ask. 14 are replies-only and therefore resolve null post-fix — but of those 14, ZERO would have had a solomon_consult sender CC'd pre-fix, so there are 0 regression candidates. And across all 364 resolvable correlations there are 0 cases where the pre-fix and post-fix resolvers disagree on WHO. The change is a strict improvement on live data with no measured behavioural regression. (This also independently corroborates the round-1 EXEC-TST-C2 fixture: the replies-only shape is real at 14/378, and fail-open null is the right answer for it.)",
  },
  {
    id: 'T6-the-20-row-cap-magnitude-is-unpinned-beyond-greater-than-one',
    severity: 'LOW',
    summary:
      "NEW but low. Round 1 pinned `.limit(20) => .limit(1)` (killed by EXEC-TST-C1). The MAGNITUDE above 1 is still unpinned: mutating to `.limit(2)` and to `.limit(3)` each leaves the suite 30/30 GREEN (both applied-verified, source restored byte-identical). The cap's stated purpose in the in-source doc is headroom so the ask is still fetched when reply rows precede it; ascending order means the ask is normally row 0, so a small cap only bites when more than N reply rows are OLDER than the ask (clock skew) — the shape EXEC-TST-C1's first test constructs with exactly one such row. TS-8 goes to 4 rows but passes under .limit(2) for the same reason. Live headroom is comfortable: the largest eligible-row count on any of the 378 measured correlations is 3 against a cap of 20. Recorded so a future 'tidy up the magic number' edit is not mistaken for safe, not as a blocker.",
  },
  {
    id: 'T7-prior-rounds-re-verified-green-at-the-merged-head',
    severity: 'INFO',
    summary:
      "PASS. Re-run at the CURRENT head (19a6b3d8985, the merge of origin/main into the feature branch) rather than trusting the pre-merge result: tests/unit/solomon-consult-originator-cc.test.js is 30/30 passing; the affected-suite sweep over every test file referencing solomon-advisory (37 files) is 453/453 passing; `node scripts/lint/count-truncation-diff-lint.mjs` reports 0 new needs-review select() sites across 2 changed files. The merge introduced no conflict in either reviewed file. Scope symmetry was also checked and is CORRECT: the mirrored Adam-side CLI has no originator-CC leg to widen (scripts/adam-advisory.cjs:1309 documents this explicitly — \"Adam has no originator-CC leg to heal (grep: ensureOriginatorCc is Solomon-only)\"), so the comms-integrity fix is not half-applied.",
  },
];

const warnings = [
  'T1 is the finding to carry into PLAN, because it is a claim-versus-measurement gap rather than a missing test: the source comment at :597-601 asserts loudness for "a query-level failure", and a query-level failure is exactly the shape the catch cannot see. Verified against the real client on the real table — 42703 and PGRST205 both arrive as {data:null,error} with threw=false. The user-visible consequence is that a resolver DB failure produces no console output at all and no `error` on the returned object, so it is indistinguishable from "no CC was needed" at both call sites.',
  'T2 and T3 are the same class and should be fixed together: EVERY ordering constraint around the live-role remap inside ensureOriginatorCc is unpinned. No fixture in the suite ever has the remap return a value that then trips a downstream guard — every remap fixture returns a clean id that differs from both `target` and `sessionId`. Two mutations that reorder guards across the remap each survive 30/30 while producing, respectively, an unusable target_session (nil UUID / broadcast- sentinel) and a self-addressed CC row plus a duplicate answer.',
  'T2 rests on a REAL asymmetry worth referring out separately: lib/coordinator/adam-identity.cjs pickCanonicalAdam has NO nil-UUID filter, while lib/coordinator/solomon-identity.cjs pickCanonicalSolomon DOES (added by QF-20260727-862, whose comment notes the nil UUID sorts FIRST in the session_id ASC tiebreak and therefore wins on any tie). That is a pre-existing gap in a file this SD does not touch, so it is NOT in scope here — but it is what makes the S4 guard placement load-bearing rather than merely defensive, and it should be captured as harness backlog rather than silently absorbed into this SD.',
  'The positive results are as load-bearing as the negative ones and were both measured, not assumed: the new .in() on a jsonb path is confirmed accepted and correctly filtering by real PostgREST (T4 — something no test in this suite can show, since the double implements in() itself), and the change has 0 regression candidates and 0 pre/post resolver disagreements across the full 378-correlation live population (T5).',
  'No mutation was left in the tree. scripts/solomon-advisory.cjs was restored from a pristine copy after each of the four mutation runs and `git status --short` on both reviewed files is empty at the time of writing.',
];

const recommendations = [
  'T1 (recommended, ~3 lines + 1 test): in resolveOriginatorFromCorrelation, destructure the error and log it — `const { data, error } = await supabase...; if (error) console.error(\'[solomon-advisory] resolveOriginatorFromCorrelation query failed for correlation ' + '${correlationId}: ${error.message}' + '\');` — keeping the fail-open return. Consider also propagating a soft signal out of ensureOriginatorCc (e.g. `{ inserted:false, originator:null, error: <msg> }`) so the existing `if (cc.error)` warn at :1291 and the heal warn at :1221 actually fire; both already have the printing branch, they simply never receive a value. Pin it with a test that drives a {data:null,error} double and asserts a console.error was emitted (spy on console.error), which is the shape the current catch cannot reach.',
  'T2 (recommended, one test): add an ensureOriginatorCc fixture with sessionRole=\'adam\' whose getLiveAdamId resolves to the nil UUID (and a second with \'broadcast-adam\'), asserting inserted:false / originator:null / zero inserts. That fixture kills the guard-before-remap mutant and pins the S4 protection against remap-sourced values — the half the two existing EXEC-SEC-S4 tests structurally cannot observe because both use sessionRole=null.',
  'T3 (recommended, one test): add an ensureOriginatorCc fixture where the remap lands ON the sending session — sessionRole=\'solomon\', getLiveSolomonId resolving to the same value as `sessionId` — asserting inserted:false and zero inserts (no self-addressed CC). Optionally a second where the remap lands on `target`. This kills the self-skip-before-remap mutant and pins the guard for the shape FR-5 newly makes the most common.',
  'T6 (optional): if the 20-row cap is meant to carry real headroom, assert it — e.g. a fixture with 5+ reply rows created BEFORE the ask, asserting the ask is still resolved. Live max is 3 rows per correlation against a cap of 20, so this is documentation-of-intent rather than defect prevention.',
  'REFERRAL, not a condition on this SD: capture the pickCanonicalAdam nil-UUID asymmetry (lib/coordinator/adam-identity.cjs:89-97 lacks the isUsableSessionId filter that lib/coordinator/solomon-identity.cjs:64-69 has) as a separate harness-backlog item via scripts/log-harness-bug.js. QF-20260727-862 fixed the Solomon and coordinator elections; the Adam election appears to have been missed, and the nil UUID wins its session_id ASC tiebreak the same way.',
];

const summary =
  'CONDITIONAL_PASS for EXEC-TO-PLAN round 3. The shipped code on the current head is FUNCTIONALLY CORRECT and, for the first time in this SD, verified END-TO-END AGAINST LIVE DATA rather than only against a double. Three things were established positively and by measurement. (1) The wire works: `.in(\'payload->>kind\', [...])` on a JSONB accessor is NEW in this SD and no test in the suite can exercise it (the fakeSb implements in() itself), so it was run against real PostgREST — accepted, error=none, returning exactly the two admitted kinds with no leakage. (2) The fix resolves correctly on real data: replaying the exact production query shape (eq correlation + in kinds + ASC + limit 20) against a live 3-row correlation returns the true asker 50192c2e, where the pre-fix DESC limit(1) shape would have returned the replier d8f99dba — a mixed-kind correlation (solomon_consult ask, adam_advisory replies) that no unit fixture covers. (3) There is ZERO measured regression: across the full paginated live population of 526 eligible rows / 378 correlations, 364 resolve an ask, 14 are replies-only and resolve null, of which 0 are regression candidates, and there are 0 correlations where the pre-fix and post-fix resolvers disagree on who the originator is. Round-1 and round-2 remediations were re-verified green at the merged head (30/30 target file, 453/453 across 37 affected files, truncation lint clean). What remains open is three MEDIUM items, none of which is a defect in current behaviour and all of which are unpinned-mechanism or blind-instrument findings — the same class the two prior rounds were convened to close. T1: the EXEC-TST-W4 "loud, still fail-open" instrumentation cannot see a query-level failure, because the function discards `error` and supabase-js resolves PostgREST errors as {data:null,error} rather than throwing — measured live on this exact table (42703 and PGRST205 both threw=false) and executed against the shipped module (0 console.error lines on the {error} shape, 1 on the throw shape); end-to-end an operator sees nothing at all and cannot distinguish a dropped CC from a correct skip. T2: the S4 guard\'s placement AFTER the live-role remap is unpinned — moving it before survives 30/30 while writing the nil UUID and a broadcast- sentinel straight into target_session, and the exposure is real because pickCanonicalAdam has no nil-UUID filter (unlike its Solomon sibling), i.e. the QF-20260727-862 ghost-row shape can reach it. T3: the post-remap self/target skip is likewise unpinned — moving it before the remap survives 30/30 while producing a self-addressed CC on exactly the Solomon-replies-to-its-own-thread shape FR-5 newly admits, plus a duplicate on the --to adam path. Each is closed by one test; T1 additionally wants a ~3-line error-propagation fix.';

const justification =
  'CONDITIONAL_PASS rather than PASS because three mechanisms the change depends on survive mutation with the full suite green, and this SD has already been through two rounds whose entire yield was exactly that class — a fix can be behaviourally correct and still ship unprotected, which is how the round-1 findings (cap, direction, JS filter, by-id kind guard) came to exist in the first place. T2 and T3 are not hypothetical reorderings: each mutant was applied, the suite re-run green, and the resulting misdelivery WITNESSED by executing the shipped function (nil-UUID and broadcast- targets written; a self-addressed CC row written). T1 is stronger than a missing test because the source states a guarantee it does not provide, and the disproof came from the real client on the real table rather than from reasoning about supabase-js semantics. CONDITIONAL_PASS rather than FAIL because nothing found is a defect in the code as it stands: all three guards behave correctly on the unmutated head (verified by execution), the suite is 30/30 and the affected sweep 453/453 at the merged head, the truncation lint is clean, the new PostgREST filter form is confirmed working live, and the full-population live replay shows the change is a strict improvement with 0 regression candidates and 0 resolver disagreements across 378 correlations. The residual risk is entirely forward-looking — a future edit could silently undo the ordering guarantees — and it is bought back by three small tests. Confidence 92: every claim is backed by an executed probe, a mutation run with applied-verification and byte-identical restore, or a read-only live query; the two places where I assert absence (0 regression candidates, 0 pre/post disagreements) were measured over a paginated full population rather than a capped fetch, and the one place I could not fully close (whether a nil-UUID ghost row currently exists in claude_sessions) is stated as an unmeasured precondition of T2 rather than claimed.';

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
    confidence: 92,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [
      'T1: make the resolver\'s error path actually observable — destructure and log `error` in resolveOriginatorFromCorrelation (the catch cannot see PostgREST errors; measured live: 42703 and PGRST205 both return {data:null,error} with threw=false), and propagate a soft error out of ensureOriginatorCc so the already-present `if (cc.error)` warns at :1221/:1291 can fire. Pin with a console.error-spy test driving the {data:null,error} double.',
      'T2: add an ensureOriginatorCc fixture where the LIVE-ROLE REMAP returns an unusable id (nil UUID, and/or a broadcast- sentinel) with sessionRole=\'adam\', asserting inserted:false / originator:null / zero inserts. This pins the S4 guard\'s placement AFTER the remap — the guard-before-remap mutant currently survives 30/30 and writes those values straight into target_session.',
      'T3: add an ensureOriginatorCc fixture where the remap lands ON the sending session (sessionRole=\'solomon\', getLiveSolomonId resolving to the same value as `sessionId`), asserting inserted:false and zero inserts. This pins the post-remap self-skip for the Solomon-replies-to-its-own-thread shape FR-5 newly admits; the skip-before-remap mutant currently survives 30/30 and writes a self-addressed CC.',
    ],
    metadata: {
      review_type: 'EXEC_TO_PLAN_TESTING_REVIEW_ROUND_3',
      review_method: 'execution-based (mutation testing + live read-only probes); reading-based review explicitly not relied upon',
      pr: 7536,
      branch: 'feat/SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001',
      head_commit: '19a6b3d8985',
      prior_rounds: {
        'TESTING round 1': '4101e867-2ebb-4d69-83ac-98838edfaf75 (cap size, sort direction, JS reply-filter, by-id kind guard) — re-verified CLOSED and green at this head',
        'SECURITY round 2': 'e4068393-0933-4b30-9d9e-6a48aa8afa83 (S3 correlation-branch kind allowlist, S4 CC-target validation) — re-verified CLOSED and green at this head',
      },
      files_reviewed: [
        'scripts/solomon-advisory.cjs',
        'tests/unit/solomon-consult-originator-cc.test.js',
        'lib/coordinator/session-id-guard.cjs',
        'lib/coordinator/adam-identity.cjs',
        'lib/coordinator/solomon-identity.cjs',
        'scripts/adam-advisory.cjs',
      ],
      test_execution: {
        target_file: '30/30 passing (tests/unit/solomon-consult-originator-cc.test.js)',
        affected_suite_sweep: '37 files / 453 tests passing (every test file referencing solomon-advisory)',
        truncation_lint: 'clean — 0 new needs-review select() sites across 2 changed files',
        run_at_head: '19a6b3d8985 (post-merge of origin/main, not the pre-merge tree)',
      },
      mutation_results: {
        'M-S4-ORDER (isUsableSessionId guard moved BEFORE the live-role remap)':
          'SURVIVED 30/30 — witness: adam-role + nil-UUID election => inserted:true target_session=00000000-0000-0000-0000-000000000000; solomon-role + nil => same; adam-role + broadcast-adam => target_session=broadcast-adam. Unmutated head refuses all three.',
        'M-SELFSKIP-ORDER (self/target skip moved BEFORE the live-role remap)':
          'SURVIVED 30/30 — witness: Solomon replying on its own adam_advisory thread with live-Solomon==sessionId => inserted:true target_session=solomon-live-1 (self-echo); remap landing on the --to adam target => inserted:true (duplicate answer). Unmutated head skips both.',
        'M-CAP-2 (.limit(20) => .limit(2))': 'SURVIVED 30/30 — cap magnitude unpinned above 1 (T6, LOW)',
        'M-CAP-3 (.limit(20) => .limit(3))': 'SURVIVED 30/30 — same class',
        applied_verification:
          'each patch asserted an exact single occurrence of its target text before writing (a no-op patch cannot masquerade as a surviving mutant); scripts/solomon-advisory.cjs restored from a pristine pre-mutation copy after every run, verified by an empty `git diff --stat` on the file',
      },
      executed_probes: {
        'T1 error-shape (module)':
          "resolveOriginatorFromCorrelation with a {data:null,error} double => returns null, 0 console.error lines; with a throwing double => returns null, 1 console.error line. ensureOriginatorCc end-to-end under a total read failure => {inserted:false, originator:null} with NO error key and 0 console.error lines.",
        'T1 error-shape (live client, real table, exact builder chain)':
          "select+eq+in+order+limit with a bad column => threw=false, data=null, error={code:'42703'}; missing-table read => threw=false, error.code='PGRST205'. Confirms PostgREST errors never reach the catch.",
        'T4 .in() on a jsonb path (live, read-only)':
          "in('payload->>kind',['solomon_consult','adam_advisory']) => error=none, 10 rows, distinct kinds exactly [adam_advisory, solomon_consult] — accepted and filtering correctly; the unit suite cannot show this because fakeSb implements in() itself",
        'T4 production query replay (live, read-only)':
          'correlation e3000455-39ad-403c-8d81-50719766cb4b, 3 rows: ask 05:29:24Z kind=solomon_consult sender=50192c2e; replies 05:30:47Z + 05:30:48Z kind=adam_advisory reply_to=e3000455 sender=d8f99dba. Shipped logic resolves 50192c2e (true asker); pre-fix DESC limit(1) would resolve d8f99dba (the replier).',
        'T5 full-population regression scan (live, read-only, paginated)':
          '526 eligible-kind rows / 378 distinct correlations. 364 resolve a non-reply ask; 14 replies-only (post-fix null); 0 of the 14 would have had a solomon_consult sender CC\'d pre-fix (0 regression candidates); 0 correlations where pre-fix and post-fix disagree on the resolved originator.',
      },
      supporting_source_observations: {
        'pickCanonicalAdam nil-UUID asymmetry':
          'lib/coordinator/adam-identity.cjs:89-97 filters only on `typeof r.session_id === \'string\'`; lib/coordinator/solomon-identity.cjs:64-69 additionally applies isUsableSessionId with an explicit QF-20260727-862 comment. Pre-existing, out of scope for this SD, referred to harness backlog — it is what makes the T2 guard placement load-bearing.',
        'adam-side scope symmetry':
          'scripts/adam-advisory.cjs:1309 documents that Adam has no originator-CC leg (ensureOriginatorCc is Solomon-only), so the comms-integrity fix is not half-applied.',
        'repo error-handling convention':
          'insertCoordinationRow and retargetStaleSolomonInbound in the same file both destructure and act on `error`, establishing that the {data,error} shape is the known convention the new resolver diverges from.',
      },
      model: 'Opus 5',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001',
    },
    phase: 'EXEC_TO_PLAN',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { name: 'QA Engineering Director (testing-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN' }
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

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
