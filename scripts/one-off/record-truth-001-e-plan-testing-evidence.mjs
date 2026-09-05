#!/usr/bin/env node
/**
 * One-off: TESTING sub-agent evidence for SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E, PLAN_TO_EXEC.
 *
 * PROSPECTIVE (pre-code) design review. No implementation exists yet, so this row carries
 * metadata.measured = false with a correctly-shaped ZERO-valued test_execution block, per the
 * same convention used by the PLAN-phase rows on sibling SD-...-SCHEMA-TRUTH-001-F (aa4b4de7 /
 * 917aa52c). The numbers in the findings below are LIVE DB MEASUREMENTS and SOURCE READS taken
 * during this review -- they are not test results, and none of them is recorded in test_execution.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const findings = [
  {
    id: 'blocker-1-fr2-is-starved-at-4-of-8-producers-including-the-sds-own-specimen-site',
    severity: 'HIGH',
    summary: 'FR-2 IS DEAD BY CONSTRUCTION AT THE EXACT CALL SITE THIS SD EXISTS TO FIX, AND EVERY ONE OF ITS ACCEPTANCE CRITERIA WOULD STILL PASS. FR-2 makes isSessionAlive() read a column it has never read before: session.status. isSessionAlive() is a PURE function over a row someone else SELECTed -- it cannot fetch what its caller did not ask for. I audited every producer that feeds it. WITHOUT status: (a) scripts/stale-session-sweep.cjs:1281, the QF stale-claim pass, selects exactly "session_id, heartbeat_at, is_alive, terminal_id, process_alive_at, expected_silence_until"; (b) scripts/hooks/coordination-inbox.cjs:927 "sd_key, heartbeat_at, expected_silence_until, is_alive, terminal_id, process_alive_at"; (c) scripts/fleet-rollcall.cjs:83; (d) lib/worktree-reaper/live-claim-guard.js:29 SESSION_FIELDS = "session_id, is_alive, heartbeat_at, heartbeat_age_seconds, terminal_id, current_branch". WITH status: lib/coordinator/presence-grounding-signals.cjs:76, scripts/hooks/session-state-sync.cjs:223, scripts/hooks/reclaim-sd-after-compaction.cjs:129 (though that one also filters .eq(status,active), so FR-2 is a permanent no-op there by construction). SITE (a) IS THE SD\'S OWN HEADLINE INCIDENT: it is the `holderRows` query whose rows feed `isSessionAlive(holder, ...)` and then `if (liveness.alive) continue` at :1324 -- the precise line that left QF-20260903-020 and -722 claimed by a dead holder for 8.6 hours. After FR-2 ships as written, `holder.status` is undefined there, ["released","stale"].includes(undefined) is false, rung 1 still returns raw_is_alive, and the sweep still skips the row. FR-1 + FR-2 + FR-3 could all merge 100% green and the SD\'s own causal chain would remain broken in production. THE ACCEPTANCE CRITERIA CANNOT DETECT THIS: all four of FR-2\'s ACs, and TS-1, TS-4 and TS-7, are hand-built fixture objects that include status: {status:"released", is_alive:true, ...}. A hand-built row always has the column. Only a PRODUCER-side assertion can catch producer-side starvation. REQUIRED PRD AMENDMENT: FR-2 must additionally require that every producer feeding isSessionAlive() selects status, with the sweep\'s :1281 query named explicitly, and must add the column to the LIVENESS_INPUT_FIELDS contract (see the next finding) so the existing parity test enforces it mechanically rather than by review.',
  },
  {
    id: 'blocker-2-liveness-input-fields-contract-and-its-enforcing-test-are-unnamed-by-the-prd',
    severity: 'HIGH',
    summary: 'THE REPO ALREADY HAS THE MECHANISM THAT PREVENTS BLOCKER-1, AND THE PRD DOES NOT MENTION IT -- SO EXEC WILL EITHER SKIP IT OR BE AMBUSHED BY IT. lib/fleet/session-liveness.cjs:198-204 exports LIVENESS_INPUT_FIELDS, the PRODUCER/CONSUMER field-set contract listing every column isSessionAlive() reads: [is_alive], [heartbeat_age_seconds|heartbeat_at|last_heartbeat], [terminal_id|session_id], [process_alive_at], [expected_silence_until]. It has NO status and NO stale_at group. It is enforced by tests/unit/fleet/liveness-input-parity.test.js, whose own docblock states the doctrine this SD needs: "The 2026-07-27 eviction was not a logic bug -- the guard was never wrong, it was STARVED... A replay test proves only the one case you thought of. A field-set contract test is route-independent." FR-2 adds a rung input and MUST add its group, or the contract silently stops describing the function. BUT ADDING IT BREAKS TWO ASSERTIONS IN THAT FILE, PREDICTABLY AND RIGHT NOW: (1) :108 `expect(unsatisfiedGroups(columnsOf(SESSION_SELECT_COLUMNS))).toEqual(["is_alive"])` becomes ["is_alive","status"]; (2) :89-92 the positive-control test asserts the pre-fix column set misses exactly 3 groups, `expect(missing).toHaveLength(3)`, which becomes 4. The two REFERENCE_SITES assertions SURVIVE -- I verified both hooks already select status. This is unplanned work in a file the PRD never names, and the dangerous "fix" is to relax assertion (1) to toEqual(["is_alive","status"]), which would permanently encode that the sweep\'s main seam is starved of status. PLAN must decide and write down which it is BEFORE EXEC.',
  },
  {
    id: 'blocker-3-fr1-lands-on-a-deliberate-documented-workaround-that-the-prd-does-not-reconcile',
    severity: 'HIGH',
    summary: 'A PRIOR SD ALREADY DIAGNOSED THIS DEFECT AND SHIPPED A DELIBERATE WORKAROUND WHOSE PREMISE FR-1 + FR-5 REMOVE. tests/unit/fleet/liveness-input-parity.test.js:94-107 documents that is_alive is WITHHELD ON PURPOSE from the sweep\'s main SESSION_SELECT_COLUMNS (scripts/stale-session-sweep.cjs:403): "is_alive IS WITHHELD ON PURPOSE -- not an oversight, and it must not be \'fixed\' by adding it. MEASURED: 6 of 6 claim-holding rows carry is_alive=true, and raw_is_alive is rung 1, which short-circuits before every other rung. Selecting it here would hold every row at every seam and turn the sweep into a silent no-op, killing genuine conflict eviction. THE FLAG IS ALSO STICKY (2075 rows true with heartbeats 3-170 days old; NOTHING CLEARS IT ON RELEASE), so it is the one liveness input that cannot expire." That comment is describing THIS SD\'s defect, and its "2075 sticky rows" is the same population FR-5 backfills (I measure 2,104 today). Once FR-1 makes release paths write is_alive=false and FR-5 clears the sticky set, the stated justification for the withholding EXPIRES -- is_alive becomes an expiring, trustworthy signal. The PRD neither cites this exemption nor says what becomes of it. Two concrete consequences PLAN must rule on: (i) leaving the withholding in place means the sweep\'s three release seams keep rung 1 permanently inert, so FR-1\'s correctness is unobservable there; (ii) removing it in the same PR is a behavior change to genuine conflict eviction across three seams and should NOT be bundled here. RECOMMEND: keep the withholding, and add one sentence to the PRD (and to that test comment) recording that FR-1/FR-5 have removed its premise and that re-including is_alive is a separately-scoped follow-up. What must NOT happen is EXEC silently deleting a guard-rail comment it does not recognize as load-bearing.',
  },
  {
    id: 'measured-fr5-sizing-is-wrong-in-the-prd-and-the-lead-correction-magnitude-is-off-by-1000x',
    severity: 'MEDIUM_HIGH',
    summary: 'FR-5 IS SIZED WRONG IN THE PRD, AND THE LEAD CORRECTION\'S HEADLINE NUMBER MISCHARACTERIZES ITS OWN POPULATION. Exact head-count queries against production, 2026-09-05 (count:"exact", head:true -- not samples): status IN (released,stale) AND is_alive=true = 2,104 [the CORRECTED FR-4/FR-5 predicate]; of which status=released = 2,104 and status=stale = 0; stale_at IS NOT NULL AND is_alive=true = 2,040; status=active AND stale_at IS NOT NULL AND is_alive=true = 2; status=idle AND stale_at IS NOT NULL AND is_alive=true = 0; status=active AND is_alive=true = 5; is_alive=true any status = 2,109; total rows = 13,182. TWO CORRECTIONS FALL OUT. (1) The LEAD-PHASE CORRECTIONS block and FR-4 both state "Measured live 2026-09-05: 2,106 CURRENTLY-HEALTHY rows already violate it". 2,104 of those ~2,106 are status=released -- not healthy, not active, and exactly the rows the SD wants set false. The genuinely currently-healthy violators number TWO. The CORRECTION\'S CONCLUSION IS STILL RIGHT -- those 2 live rows prove the mechanism, stale_at really is never cleared on return to active, so the original predicate really is unsatisfiable by construction -- but the magnitude is off by three orders of magnitude and the word "currently-healthy" is attached to the wrong population. (2) FR-5\'s scope text says the corrected predicate\'s set is "a subset of the 2,106... since it excludes currently-active rows with a stale stale_at" and instructs that it "must be re-measured at backfill time". Re-measured: the correction excludes 2 rows out of ~2,106. The backfill is ~2,104 rows, i.e. NOT materially narrower, and any EXEC reader who expects a small residual set will be surprised. FR-5\'s prose should carry the real number.',
  },
  {
    id: 'hazard-fr5-ac2-exact-count-is-unobtainable-via-select-postgrest-caps-returns-at-1000',
    severity: 'MEDIUM_HIGH',
    summary: 'FR-5 AC-2 ("the EXACT affected-row count from the real production run is recorded") HAS A CONCRETE TRAP, AND IT WILL ALSO FAKE A FAILURE OF AC-1. This PostgREST instance caps returned rows at 1000: I probed it -- .select("id").eq("is_alive",true).limit(5000) returned exactly 1000 rows against a population of 2,109. So the idiomatic backfill `.update({is_alive:false}).in("status",["released","stale"]).eq("is_alive",true).select("id")` and then `data.length` yields 1000, not 2,104. AC-2 would record a wrong number that looks plausible. Worse, whether the cap also truncates the UPDATE itself or only its RETURNING projection is version-dependent and MUST be verified at EXEC time rather than assumed: if the write truncates, run 1 changes 1000 rows and run 2 changes ~1,104 -- which reads as "the backfill is not idempotent" and would falsely fail AC-1 ("a second run affects zero rows") when the real cause is a return/affect cap. REQUIRED: take the count with a separate `{count:"exact", head:true}` query immediately before and immediately after the write, derive the affected count as the delta, never from a returned array; and loop-until-zero rather than assuming one statement drains the set. ADJACENT: FR-5\'s primary wording is "set is_alive=false BY THE CANONICAL RELEASE PATH (or a direct, narrowly-scoped UPDATE using the identical predicate)". Routing 2,104 already-released rows through releaseClaimBothSurfaces() would be 2,104 sequential round-trips AND semantically wrong -- that helper also writes claim surfaces and release reasons for rows that were released long ago. The parenthetical should become the REQUIRED path and the canonical-path phrasing dropped.',
  },
  {
    id: 'gap4-real-version-fr1-has-no-census-completeness-assertion-only-24-per-writer-assertions',
    severity: 'MEDIUM_HIGH',
    summary: 'THE STRONGEST MISSING TEST IN THE PRD -- AND IT IS THE LEGITIMATE FORM OF THE STORIES "TECHNICAL DETAIL" COMPLAINT. FR-1\'s ACs and TS-2 are entirely per-writer payload assertions: ~20+ tests each proving that writer N constructs {status: terminal, is_alive: false}. Necessary, and TR-1 is right to demand payload-level assertions. But they are collectively INSUFFICIENT in the one way that matters: 24 green payload tests plus one MISSED writer equals the defect surviving, and nothing in the PRD fails for a writer that was never enumerated. FR-4\'s scheduled check is the only backstop and it is an after-the-fact production alarm, not a pre-merge gate. The Explore evidence already warned of exactly this ("or 20 writers will ship unfixed while FR-4\'s scheduled check still asserts zero") and the PRD did not convert the warning into a requirement. WHAT IS MISSING is a route-independent census-completeness check -- a static/AST test asserting that no claude_sessions write setting a terminal status exists anywhere in the tree without is_alive in the same payload, baseline asserted, growth fails CI. The repo already contains the reference implementation of this philosophy for this very module: tests/unit/fleet/liveness-input-parity.test.js, whose docblock argues the case verbatim ("A replay test proves only the one case you thought of. A field-set contract test is route-independent: it fails again for ANY future rung whose column someone forgets"). Two design constraints that make it non-trivial and therefore worth specifying now, not discovering in EXEC: (i) scripts/session-tick.cjs:615-646 writes via a RAW REST fetch() PATCH, so any checker keyed on .from("claude_sessions") is blind to it -- the same blind spot the Explore census flagged; (ii) the 4 RPC bodies live in SQL, so they need a separate migration-text assertion. So: gap #4 as STORIES phrased it is wrong, but the concern underneath it is the single highest-value addition available to this PRD.',
  },
  {
    id: 'stories-gap1-verdict-noise-as-phrased-but-a-real-and-sharper-gap-sits-next-to-it',
    severity: 'MEDIUM',
    summary: 'STORIES GAP #1 (no error-handling spec for clearAndReopenQf if the UPDATE fails): NOT A REAL GAP AS PHRASED -- it is already implemented AND already tested, and STORIES evidently read the PRD prose without reading either. IMPLEMENTATION: lib/fleet/best-effort-release.mjs:269-270, `if (error) return { changed: false, reason: `update_failed:${error.message}` };` with the contract stated in a comment above it ("Fail-soft: a release path must not throw because the reopen half failed. The row stays stranded, which is the pre-fix behaviour -- strictly no worse, and reported rather than hidden"). TEST: tests/unit/fleet/qf-clear-and-reopen.test.js:262-273, describe "FR-1: reports failure instead of hiding it" / it "is fail-soft on a database error and says why", asserting `expect(res.reason).toMatch(/^update_failed:/)`. Adequately covered; no PRD change needed for the stated concern. THE SHARPER, GENUINELY UNSPECIFIED VERSION: FR-3 introduces a THIRD outcome, no_match_status, and a zero-row UPDATE cannot tell you WHY it matched nothing -- so distinguishing guard_refused from no_match_status requires a SECOND query after the failed write, and the PRD does not say what happens when THAT read fails. This matters more than it sounds: the entire point of the QF-20260905-544 requirement folded into FR-3 is "so the sweep does not log a real gap as the guard working as intended". If the disambiguation read fails and the function defaults to guard_refused, it silently rebuilds the exact misreporting the requirement exists to kill. FR-3 should state the fail-direction explicitly -- recommend an explicit third reason (e.g. reason_undetermined) rather than defaulting either way, plus a fixture for it, and note that the disambiguation read is a TOCTOU window: the row can change between the UPDATE and the follow-up read, so the reason is a best-effort diagnosis and should be labelled as such where the sweep logs it.',
  },
  {
    id: 'stories-gap2-verdict-partially-real-but-the-real-risk-is-count-correctness-not-throughput',
    severity: 'MEDIUM',
    summary: 'STORIES GAP #2 (FR-5 backfill "could be performance-intensive if there\'s a very large dataset", "no performance requirements specified"): DIRECTIONALLY RIGHT, WRONG MECHANISM -- and it is worth amending the PRD for the mechanism it missed. MEASURED, so the premise no longer needs guessing: the affected set is 2,104 rows out of 13,182. That is not a large dataset and needs no batching for THROUGHPUT -- a single bulk UPDATE with the predicate is one statement and will complete in well under a second. So "add pagination for performance" is the wrong prescription and the PRD does not need a performance requirement. What it DOES need is the count-correctness / cap hazard documented in the hazard-fr5-ac2 finding above (PostgREST caps returns at 1000, verified by probe), because that is a real, silent, count-corrupting failure that also fakes a non-idempotency result against AC-1. NOTE ON THE "similar backfill scripts elsewhere paginate" premise: the ~40 scripts/backfill-*.mjs in this repo do commonly paginate, but they paginate READS over large scans; that pattern is about the same 1000-row return cap, which supports the cap finding rather than a throughput one. VERDICT: fold gap #2 into the cap hazard; do not add a performance requirement.',
  },
  {
    id: 'stories-gap3-verdict-noise-authorization-is-already-a-cas-predicate-and-an-ambient-service-role',
    severity: 'LOW',
    summary: 'STORIES GAP #3 (no authorization spec for who can trigger clearAndReopenQf() or the backfill): NOISE for this SD, and I would not amend the PRD for it. clearAndReopenQf() is an internal ESM helper called from one place -- the autonomous stale-session sweep daemon -- and the backfill is a one-shot operator script. Neither has an HTTP surface, a user-facing trigger, or an RLS-exposed path; both run under the ambient service-role boundary that every fleet-infrastructure script in this repo shares. Adding an authorization requirement here would be scope invention. WORTH ONE SENTENCE THOUGH, because the concern is already satisfied by a mechanism STORIES was not looking at: the CAS `expectedHolder` predicate IS the authorization model for clearAndReopenQf -- it refuses to release a claim held by anyone other than the session the caller names (lib/fleet/best-effort-release.mjs:259-261), which is precisely "who may release this claim", and TR-3 already requires it survive FR-3 unchanged, with a dedicated test at tests/unit/fleet/qf-clear-and-reopen.test.js:163 ("REFUSES when a different session now holds it -- a live re-claim is never clobbered"). The right disposition is: no new requirement, and TR-3 already carries the protection.',
  },
  {
    id: 'stories-gap4-verdict-not-a-legitimate-criticism-as-phrased-for-this-sd-type',
    severity: 'LOW',
    summary: 'STORIES GAP #4 (FR-1\'s acceptance criterion is "a technical implementation detail rather than a user-facing outcome"): NOT a legitimate criticism as phrased, and PLAN should reject it in that form. This is an infrastructure defect-fix SD whose "user" is the fleet sweep and whose observable outcome is a database invariant; "is_alive:false is present in the update payload" is the correct granularity, and TR-1 deliberately escalates it ("must assert on the actual constructed payload object... not merely that the function runs without error") precisely because a looser, more outcome-flavoured assertion would be the weaker test here. Demanding a user-facing outcome for a claude_sessions column write would push the PRD toward vaguer criteria, not better ones. Note also that this SD DOES have an outcome-level criterion already -- FR-4\'s "zero rows WHERE status IN (released,stale) AND is_alive=true", which is exactly the system-level invariant the per-writer assertions serve. So the coverage shape (per-writer mechanism + system-level invariant) is already the right one. The genuine deficiency is neither of those two but the missing MIDDLE layer -- census completeness -- written up separately as gap4-real-version above.',
  },
  {
    id: 'structural-fr1-scope-is-testable-but-not-in-one-exec-phase-and-not-by-24-parallel-payload-tests',
    severity: 'MEDIUM_HIGH',
    summary: 'DIRECT ANSWER TO THE STRUCTURAL QUESTION: the "one test per writer, ~20+ new/extended test cases across ~15 files" approach is TESTABLE IN PRINCIPLE but MIS-SHAPED, and the mis-shaping concentrates almost entirely in one file. TEN of the ~24 writers live in scripts/stale-session-sweep.cjs, which is 4,696 LINES of CJS with module-scope side effects, and the other ~14 are spread thin (1-3 per file) across modules that mostly already have injectable clients and existing suites (best-effort-release, release-claim-both-surfaces, claim-validity-gate, spawn-control). So the sprawl risk is not "24 tests", it is "10 payload assertions reached through a 4,700-line daemon". THE RIGHT LEVER IS A CHOKEPOINT, NOT A REFACTOR: extract a single shared payload builder -- e.g. terminalSessionUpdate(status, reason) returning {status, is_alive: false, ...} -- unit-test the builder ONCE, and have each of the 10 sweep writers (and ideally all ~20 JS writers) construct their payload through it. That is strictly STRONGER than 10 independent payload tests, because it makes writer #25, written next month by someone who never read this SD, correct by default -- which per-writer tests can never do. It also collapses ~20 assertions into 1 builder test + ~20 one-line call-site assertions (or a single grep/AST assertion that no terminal-status write bypasses the builder, which is the same artifact as the census-completeness check in gap4-real-version -- one mechanism, two requirements satisfied). ON THE SIBLING PRECEDENT SPECIFICALLY: the CLAUDE.md "extract testable function + thin CLI wrapper" pattern (scripts/adam-self-adherence-review.mjs; applied to scripts/false-completion-census.mjs in sibling SCHEMA-TRUTH-001-F) is the RIGHT PRINCIPLE and the WRONG DOSE here. false-completion-census.mjs was a small, non-daemon, low-fan-in script. stale-session-sweep.cjs runs autonomously every ~5 minutes and the entire fleet depends on it; a main()/exported-function refactor of it would be a far larger blast radius than the defect being fixed, would dwarf the PR-size guidance on its own, and is exactly the kind of change that has previously released live workers. APPLY the principle via the payload-builder chokepoint; DO NOT apply the whole-script refactor to the sweep. NEW SCRIPTS ONLY: FR-4\'s scheduled check and FR-5\'s backfill are new files and SHOULD be written in the exported-function + isMainModule() CLI-wrapper shape from day one, which costs nothing and makes TS-5/TS-6 unit-testable without a live DB.',
  },
  {
    id: 'structural-pr-size-this-is-three-prs-not-one',
    severity: 'MEDIUM',
    summary: 'SCOPE/PR-SIZE: as specified this is ~24 call sites across ~15 files + a new SQL migration for 4 RPC bodies + ~20 new tests + a new scheduled-check script + a new backfill script + the LIVENESS_INPUT_FIELDS contract change + the producer-select fixes from blocker-1. That is far past the 100-LOC target and, realistically, past the 400-LOC documented maximum, in a single EXEC phase. The PRD\'s implementation_approach already sequences the work correctly in 8 steps but treats the result as one deliverable. RECOMMEND SPLITTING ALONG THE SEAMS THE PRD ITSELF DRAWS: (PR-1) FR-2 + FR-3 -- both small, isolated, independently valuable, each with dedicated fixtures, PLUS the blocker-1 producer-select fixes and the blocker-2 LIVENESS_INPUT_FIELDS group, since FR-2 is inert without them and they belong in the same review; (PR-2) FR-1 -- the payload-builder chokepoint, the ~20 JS call sites, the census-completeness assertion, and the RPC migration; (PR-3) FR-4 + FR-5 -- the scheduled check and the backfill, which per the PRD\'s own step ordering can only be asserted-at-zero AFTER PR-2 lands anyway. Note PR-1 delivers the SD\'s headline incident fix on its own and is the highest value per line in the whole SD.',
  },
  {
    id: 'spec-defect-fr2-stale_at-disjunct-is-logically-inert-and-invites-an-unnecessary-column',
    severity: 'LOW',
    summary: 'FR-2\'s condition as literally written contains a term that can never change the result, and the term is actively harmful because it will send an implementer looking for a column. The text: denied "when session.status is released or stale, OR session.stale_at is set AND session.status is released or stale". The second disjunct is a strict subset of the first: (A) OR (B AND A) === A. So stale_at is NOT read by the corrected FR-2 at all. This matters practically -- an implementer reading FR-2 literally will add stale_at to LIVENESS_INPUT_FIELDS and to the producer selects (blocker-1), widening the diff and the parity-test breakage for zero behavioral gain. RECOMMEND: delete the second disjunct from FR-2\'s description so the requirement reads as the single clean predicate it actually is (status IN (released,stale)), and state explicitly that stale_at is NOT a liveness input. This also keeps FR-2 consistent with LEAD CORRECTION #4, which describes the deny-list purely in terms of status.',
  },
  {
    id: 'spec-conflict-database-subagent-says-no-migration-needed-but-tr4-requires-one',
    severity: 'MEDIUM',
    summary: 'A DIRECT CONTRADICTION ALREADY STORED IN THIS PRD\'S OWN METADATA, WHICH WILL MISROUTE THE EXEC-PHASE GATES. metadata.database_analysis records verdict PASS at CONFIDENCE 100 with recommendations ["No database migrations needed for this SD"]. TR-4 states the opposite in terms: FR-4\'s RPC-body fixes (create_or_replace_session, release_session, cleanup_stale_sessions, report_pid_validation_failure) "require a new, additive-only migration... the standard apply-migration.js path is expected here", and FR-1 lists 4 RPC function bodies among its writers. The DATABASE sub-agent is wrong here -- CREATE OR REPLACE FUNCTION on four existing RPCs is unambiguously a migration -- but its row is what a downstream gate or a later reader will consult, and a confidence-100 "no migration needed" is exactly the kind of instrument that gets trusted. Also note the census counts differ between documents and should be reconciled while this is being fixed: the SD\'s LEAD CORRECTION #5 and the Explore evidence say FIVE RPC bodies; FR-1 and TR-4 name FOUR (the fifth, per the Explore finding, is the create_or_replace_session auto-replace branch being counted separately). RECOMMEND: re-run or manually supersede the DATABASE sub-agent row before EXEC, and make FR-1/TR-4 agree on the RPC count and name each function explicitly.',
  },
  {
    id: 'coverage-assessment-test-scenarios-are-well-formed-and-ts4-is-the-right-spine',
    severity: 'INFO',
    summary: 'WHAT THE PRD GETS RIGHT, stated so the amendments above are not misread as a rewrite. The FR set is genuinely well-grounded: I independently re-verified all three cited defects at their exact lines -- session-liveness.cjs:168 `if (session.is_alive === true) return { alive: true, reason: "raw_is_alive" };` is the unconditional first rung; best-effort-release.mjs:254 `.filter("status","eq","in_progress")` is the QF exclusion; and the sweep\'s `if (liveness.alive) continue` at :1324 is the skip. TS-1/TS-3/TS-7 map cleanly onto their FRs. TS-4 is the correct spine for the SD -- one fixture exercising FR-1 through FR-3 end to end -- and the LEAD correction #6 is right that it is now the SOLE demonstration path since both live QF specimens were cleared 2026-09-05. TS-7 (re-running the SD-LEO-INFRA-IS-ALIVE-LIVENESS-SSOT-001 false-negative fixture) is the single most important regression in the set and is correctly identified, because FR-2 reverses that SD\'s explicit one-directional design decision. TS-5/TS-6 (before/after backfill counts) are the right shape for FR-5. The corrected FR-4 predicate is sound and I confirm it is satisfiable: nothing structurally prevents status IN (released,stale) AND is_alive=true from reaching zero once the writers are fixed. BASELINE, for EXEC\'s benefit: the three existing test files this SD will modify -- liveness-input-parity.test.js, session-liveness.test.js, qf-clear-and-reopen.test.js -- are currently GREEN at 35/35 (npx vitest run --project unit, v4.1.4, 382ms). That is a PRE-EXISTING baseline of tests this SD did not write; it is deliberately NOT recorded in metadata.test_execution, which stays zeroed because no test for this SD\'s own requirements exists yet.',
  },
  {
    id: 'doc-debt-fr2-falsifies-the-one-directional-contract-stated-in-the-functions-own-docblock',
    severity: 'LOW',
    summary: 'TR-2 CONTAINS A FALSE STATEMENT THAT SHOULD BE CORRECTED BEFORE IT IS QUOTED AS AUTHORITY. TR-2 asserts FR-2 leaves "the function\'s other four rungs and its overall ONE-DIRECTIONAL OR-LADDER CONTRACT unchanged". The other four rungs, yes. The one-directional contract, no -- FR-2 breaks it, deliberately and correctly, and that is the entire point of the SD. The contract is stated three times in the source and every instance becomes false on merge: lib/fleet/session-liveness.cjs:12 ("isSessionAlive can only ever read MORE-alive than the raw flag"); :161-162 in the isSessionAlive docblock ("One-directional: a raw-alive session is always alive... NEVER returns alive=false for a session the raw flag calls alive"); and the same doctrine restated at the sweep\'s QF pass (scripts/stale-session-sweep.cjs:1310-1311, "The SSOT\'s ONE-DIRECTIONAL contract is what makes it safe here: it can only ever read MORE alive than the raw flag, never less"). That third site is a load-bearing SAFETY ARGUMENT, not a description -- the inbox/dispatch guard at scripts/hooks/coordination-inbox.cjs:984-990 explicitly relies on the asymmetry ("a false HOLD costs a little dispatch delay, while a false FREE costs a collision with a live builder"). FR-2 narrows the ladder in the direction that argument treats as the dangerous one. The narrowing is still SOUND -- the four downstream rungs still upgrade, so the regression is bounded to a row that is released/stale AND heartbeat-stale AND PID-dead AND tick-stale AND not armed-silent, which is precisely the e60956f5 shape -- but the PRD should (a) correct TR-2\'s claim, (b) require all three comment sites be updated in the same PR so the next reader is not reasoning from a contract that no longer holds, and (c) confirm the coordination-inbox guard is re-argued rather than silently invalidated. Related note already captured by the LEAD-phase validation evidence: the inverse fixture (a wrongly-released row WITH a fresh heartbeat still reads alive) should be added alongside the e60956f5 fixture; I concur, and it is currently absent from TS-1..TS-7.',
  },
];

const warnings = [
  {
    severity: 'HIGH',
    issue: 'FR-2 is starved of session.status at 4 of the ~8 producers that feed isSessionAlive(), INCLUDING scripts/stale-session-sweep.cjs:1281 -- the query behind the SD\'s own 8.6-hour QF incident. Every FR-2 acceptance criterion and every test scenario uses hand-built fixture rows that always carry status, so none of them can detect the starvation. FR-1+FR-2+FR-3 can merge fully green with the SD\'s headline defect still live in production.',
    recommendation: 'Amend FR-2 to require (a) session.status added to LIVENESS_INPUT_FIELDS in lib/fleet/session-liveness.cjs, and (b) every producer select updated -- naming scripts/stale-session-sweep.cjs:1281, scripts/hooks/coordination-inbox.cjs:927, scripts/fleet-rollcall.cjs:83 and lib/worktree-reaper/live-claim-guard.js:29 explicitly. Adding the LIVENESS_INPUT_FIELDS group makes tests/unit/fleet/liveness-input-parity.test.js enforce this mechanically; expect it to turn 2 existing assertions red (:108 and :92) and decide the correct resolution at PLAN, not in EXEC.',
  },
  {
    severity: 'HIGH',
    issue: 'FR-1 has no census-completeness assertion. ~20+ per-writer payload tests cannot fail for a writer nobody enumerated, and scripts/session-tick.cjs writes via a raw REST PATCH that any .from("claude_sessions")-keyed check is blind to. FR-4\'s scheduled check is an after-the-fact production alarm, not a pre-merge gate.',
    recommendation: 'Add a route-independent completeness check as an FR-1 acceptance criterion (static/AST assertion: no terminal-status claude_sessions write anywhere in tree lacks is_alive in the same payload; baseline asserted, growth fails CI), covering the raw-fetch shape and the SQL RPC bodies. Implement it as the same artifact as the payload-builder chokepoint so one mechanism satisfies both.',
  },
  {
    severity: 'MEDIUM_HIGH',
    issue: 'FR-5 AC-2 demands an EXACT affected-row count, but this PostgREST instance caps returned rows at 1000 (probed: limit(5000) over a 2,109-row population returned exactly 1000). A count derived from .select() after the UPDATE records 1000 instead of 2,104, and if the cap also bounds the write, a second run affects ~1,104 rows and falsely fails AC-1 idempotency.',
    recommendation: 'Require the count be taken as the delta of two {count:"exact", head:true} queries bracketing the write, never from a returned array; require the backfill loop until the predicate count reaches zero; and make FR-5\'s "narrowly-scoped direct UPDATE" the required path rather than the parenthetical alternative to "the canonical release path" (routing 2,104 already-released rows through releaseClaimBothSurfaces() is both 2,104 round-trips and semantically wrong).',
  },
  {
    severity: 'MEDIUM',
    issue: 'The PRD and the LEAD-PHASE CORRECTIONS both describe ~2,106 rows as "currently-healthy" violators and imply the corrected predicate is materially narrower. Measured: 2,104 of them are status=released; exactly 2 are currently-active. The correction\'s CONCLUSION (original predicate unsatisfiable by construction) is confirmed correct by those 2 rows, but the magnitude and the characterisation are wrong, and FR-5 is consequently sized as if it were a small residual set.',
    recommendation: 'Correct FR-4\'s and FR-5\'s prose to the measured figures (corrected-predicate set = 2,104; currently-active-with-stale-stale_at = 2; total rows = 13,182) so EXEC sizes the backfill correctly and FR-5 AC-2 has a number to check against.',
  },
  {
    severity: 'MEDIUM',
    issue: 'This PRD\'s own metadata.database_analysis records confidence-100 "No database migrations needed for this SD", directly contradicting TR-4 and FR-1, which require an additive migration for 4 (or 5 -- the documents disagree) Postgres RPC bodies.',
    recommendation: 'Supersede or re-run the DATABASE sub-agent row before EXEC, and reconcile the RPC count between FR-1, TR-4, LEAD CORRECTION #5 and the Explore evidence by naming each function explicitly.',
  },
  {
    severity: 'MEDIUM',
    issue: 'FR-1 + FR-5 remove the stated premise of a deliberate, documented workaround (is_alive withheld from scripts/stale-session-sweep.cjs SESSION_SELECT_COLUMNS because the flag is sticky and never cleared on release, tests/unit/fleet/liveness-input-parity.test.js:94-107). The PRD does not mention the exemption, so EXEC may either delete a load-bearing guard-rail comment it does not recognise, or leave rung 1 permanently inert at three sweep release seams without recording why.',
    recommendation: 'Add a PRD note: the withholding STAYS in this SD; update its comment to record that FR-1/FR-5 removed its premise; re-including is_alive at the sweep\'s three release seams is a separately-scoped follow-up with its own blast-radius review (it changes genuine conflict eviction).',
  },
  {
    severity: 'MEDIUM',
    issue: 'Scope as specified (~24 call sites / ~15 files / 1 migration / ~20 tests / 2 new scripts / contract + producer-select changes) substantially exceeds the documented PR-size maximum for a single EXEC phase.',
    recommendation: 'Split into three PRs along the PRD\'s own step ordering: PR-1 = FR-2 + FR-3 + the producer-select and LIVENESS_INPUT_FIELDS work (delivers the headline incident fix alone); PR-2 = FR-1 payload-builder chokepoint + call sites + census check + RPC migration; PR-3 = FR-4 + FR-5, which can only assert zero after PR-2 lands.',
  },
  {
    severity: 'LOW',
    issue: 'TR-2 states FR-2 leaves the one-directional OR-ladder contract unchanged. It does not -- FR-2 deliberately breaks it, and the contract is asserted in three source comments, one of which (scripts/stale-session-sweep.cjs:1310) is a load-bearing safety argument relied on by the dispatch guard at scripts/hooks/coordination-inbox.cjs:984-990.',
    recommendation: 'Correct TR-2; require all three comment sites updated in the same PR; and add the inverse fixture (a wrongly-released row WITH a fresh heartbeat still reads alive via a downstream rung) alongside the e60956f5 fixture, as the LEAD-phase validation evidence also recommended. It is absent from TS-1..TS-7.',
  },
  {
    severity: 'LOW',
    issue: 'FR-2\'s written condition contains a logically inert disjunct -- "(A) OR (stale_at set AND A)" reduces to A -- which will lead an implementer to treat stale_at as a liveness input and widen both the select changes and the parity-test breakage for zero behavioural gain.',
    recommendation: 'Delete the second disjunct from FR-2 and state explicitly that stale_at is NOT read by isSessionAlive().',
  },
];

const recommendations = [
  'CONDITIONAL PROCEED to EXEC. The SD is real, well-grounded, and its LEAD-phase corrections were the right calls -- I re-verified all three cited defects at their exact lines and confirm the corrected FR-4 predicate is satisfiable. But do NOT start EXEC before amending FR-2, because as written FR-2 is inert at the very call site the SD exists to fix and no acceptance criterion can detect that.',
  'HIGHEST-VALUE SINGLE AMENDMENT: add session.status to LIVENESS_INPUT_FIELDS and to the four starved producer selects, and let tests/unit/fleet/liveness-input-parity.test.js enforce it. This converts the SD\'s biggest silent-failure mode into a red test, and it is the same mechanism the repo already built for this exact class of starvation in 2026-07.',
  'SECOND-HIGHEST: replace "one payload test per writer" with a shared terminal-status payload builder plus a route-independent completeness assertion. Same coverage, one twentieth the test surface, and it makes the NEXT writer correct by default -- which 24 per-writer tests structurally cannot.',
  'Apply the CLAUDE.md extract-testable-function pattern to the NEW scripts only (FR-4 scheduled check, FR-5 backfill -- exported function + isMainModule CLI wrapper, so TS-5/TS-6 are unit-testable without a live DB). Do NOT apply the sibling false-completion-census.mjs whole-script refactor to scripts/stale-session-sweep.cjs: at 4,696 lines running autonomously every ~5 minutes with the whole fleet depending on it, that refactor is a larger blast radius than the defect being fixed.',
  'Split into three PRs (FR-2+FR-3 first -- it delivers the headline fix on its own; then FR-1; then FR-4+FR-5). The PRD\'s own 8-step implementation_approach already draws these seams; it just treats the result as one deliverable.',
  'Of the four STORIES-flagged gaps: #1 is already covered in code AND test (reject as phrased, but adopt the sharper adjacent gap -- FR-3\'s new guard_refused/no_match_status disambiguation needs a second query whose own failure mode is unspecified); #2 is the wrong mechanism (2,104 rows needs no batching -- the real risk is the 1000-row return cap corrupting FR-5 AC-2\'s exact count); #3 is noise (the CAS expectedHolder predicate already IS the authorization model, protected by TR-3); #4 is not legitimate as phrased for an infrastructure defect-fix SD, but its underlying concern points at the genuinely missing middle layer -- census completeness.',
];

const summary = 'PROSPECTIVE (pre-code) PLAN-phase TESTING review of PRD-SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E. VERDICT: CONDITIONAL_PASS -- the SD is real and well-grounded (I independently re-verified all three cited defects at their exact lines, and confirm the LEAD-corrected FR-4 predicate is satisfiable), but it must not enter EXEC unamended. PRIMARY BLOCKER: FR-2 makes isSessionAlive() read session.status, a column it has never read, yet isSessionAlive() is a pure function over a row its CALLER selected -- and 4 of the ~8 producers do not select status, including scripts/stale-session-sweep.cjs:1281, the exact query behind the SD\'s own 8.6-hour QF-20260903-020/-722 incident. FR-1+FR-2+FR-3 could merge 100% green with the headline defect still live, and no acceptance criterion could detect it, because every FR-2 AC and every test scenario uses hand-built fixture rows that always carry status. The repo already contains the mechanism that prevents this (LIVENESS_INPUT_FIELDS + tests/unit/fleet/liveness-input-parity.test.js, built for this exact starvation class in 2026-07); the PRD never names it, and adding the required status group will predictably turn 2 existing assertions in that file red -- a decision PLAN should make, not EXEC. SECONDARY: FR-1 has no census-completeness assertion, so ~20 per-writer payload tests cannot fail for an unenumerated writer (and session-tick.cjs\'s raw REST PATCH is invisible to any .from()-keyed check); FR-5 AC-2\'s "exact count" is unobtainable as specified because this PostgREST caps returns at 1000 (probed) against a 2,104-row target set; and the PRD/LEAD magnitude "2,106 currently-healthy rows" is wrong -- measured, 2,104 are status=released and exactly 2 are currently-active (the correction\'s CONCLUSION stands, its magnitude is off ~1000x). ON THE 4 STORIES GAPS: #1 already covered in code and test (but a sharper unspecified gap sits beside it in FR-3\'s new reason disambiguation); #2 wrong mechanism (no batching needed; the return cap is the real risk); #3 noise (CAS expectedHolder already IS the authorization model); #4 not legitimate as phrased, though its underlying concern points at the real missing middle layer. STRUCTURAL: the "one test per writer across ~15 files" shape is mis-shaped -- 10 of 24 writers sit inside a 4,696-line autonomous daemon; use a shared payload-builder chokepoint (strictly stronger, makes writer #25 correct by default) rather than 24 parallel payload tests, apply the extract-testable-function pattern to the two NEW scripts only, and split the work into three PRs. This is PROSPECTIVE evidence: metadata.measured=false and test_execution is zero-valued because no test for this SD\'s requirements exists yet.';

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
    detailed_analysis: {
      sd_key: SD_KEY,
      prd_id: 'PRD-SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E',
      phase: 'PLAN_TO_EXEC',
      mode: 'prospective',
      review_type: 'pre-implementation TESTING design review (no code exists yet)',
      live_measurements_2026_09_05: {
        note: 'Exact head-count queries against production claude_sessions (count:"exact", head:true) -- not samples. Taken during this review to test the PRD\'s own stated figures.',
        corrected_fr4_fr5_predicate_status_in_released_stale_and_is_alive_true: 2104,
        status_released_and_is_alive_true: 2104,
        status_stale_and_is_alive_true: 0,
        stale_at_not_null_and_is_alive_true: 2040,
        status_active_and_stale_at_not_null_and_is_alive_true: 2,
        status_idle_and_stale_at_not_null_and_is_alive_true: 0,
        status_active_and_is_alive_true: 5,
        is_alive_true_any_status: 2109,
        total_rows: 13182,
        postgrest_return_cap_probe: 'select(id).eq(is_alive,true).limit(5000) returned exactly 1000 rows against a 2109-row population => db-max-rows=1000 confirmed',
        implication: 'PRD/LEAD figure of "2,106 currently-healthy rows" mischaracterises the population: 2,104 are status=released, only 2 are currently-active. The unsatisfiability CONCLUSION is confirmed by those 2 rows; the magnitude is not.',
      },
      producer_select_audit_for_fr2: {
        note: 'isSessionAlive() is pure over a caller-selected row. FR-2 adds session.status as an input. Audited every producer.',
        missing_status: [
          'scripts/stale-session-sweep.cjs:1281 (QF stale-claim pass -- THE SD\'S OWN INCIDENT SITE)',
          'scripts/hooks/coordination-inbox.cjs:927',
          'scripts/fleet-rollcall.cjs:83',
          'lib/worktree-reaper/live-claim-guard.js:29 (SESSION_FIELDS)',
        ],
        has_status: [
          'lib/coordinator/presence-grounding-signals.cjs:76',
          'scripts/hooks/session-state-sync.cjs:223',
          'scripts/hooks/reclaim-sd-after-compaction.cjs:129 (but filters .eq(status,active) => FR-2 is a no-op there by construction)',
        ],
        contract_gap: 'lib/fleet/session-liveness.cjs:198-204 LIVENESS_INPUT_FIELDS has no status/stale_at group, so tests/unit/fleet/liveness-input-parity.test.js cannot enforce the new input.',
        predicted_test_breakage_if_status_group_added: [
          'tests/unit/fleet/liveness-input-parity.test.js:108 expect(unsatisfiedGroups(columnsOf(SESSION_SELECT_COLUMNS))).toEqual(["is_alive"]) -> becomes ["is_alive","status"]',
          'tests/unit/fleet/liveness-input-parity.test.js:92 expect(missing).toHaveLength(3) -> becomes 4',
          'REFERENCE_SITES assertions SURVIVE (both hooks already select status) -- verified',
        ],
      },
      stories_gap_dispositions: {
        'gap-1-clearAndReopenQf-error-handling': 'REJECT AS PHRASED -- already implemented (best-effort-release.mjs:269-270, documented fail-soft contract) and already tested (qf-clear-and-reopen.test.js:262-273, asserts /^update_failed:/). ADOPT the sharper adjacent gap: FR-3\'s new guard_refused vs no_match_status disambiguation needs a SECOND query, and the PRD does not specify what happens when THAT read fails -- defaulting to guard_refused would rebuild the exact misreporting QF-20260905-544 was raised to kill.',
        'gap-2-backfill-performance': 'REJECT THE MECHANISM, ADOPT A DIFFERENT ONE -- 2,104 rows needs no batching for throughput. The real risk is the confirmed 1000-row PostgREST return cap corrupting FR-5 AC-2\'s "exact count" and faking an AC-1 idempotency failure.',
        'gap-3-authorization': 'REJECT -- noise for an internal fleet-infrastructure script with no HTTP/RLS surface. The CAS expectedHolder predicate (best-effort-release.mjs:259-261) already IS the authorization model and TR-3 already requires it survive unchanged, with a dedicated test at qf-clear-and-reopen.test.js:163.',
        'gap-4-fr1-ac-is-a-technical-detail': 'REJECT AS PHRASED -- correct granularity for an infrastructure defect-fix SD, and TR-1 deliberately demands payload-level assertions. The SD already HAS a system-level outcome criterion in FR-4. ADOPT the underlying concern in its real form: the missing MIDDLE layer, a route-independent census-completeness assertion.',
      },
      structural_assessment: {
        fr1_testability: 'Testable but mis-shaped. 10 of ~24 writers are inside scripts/stale-session-sweep.cjs (4,696 lines, autonomous ~5min daemon). Recommend a shared terminal-status payload builder as a chokepoint (1 builder test + call-site assertions, strictly stronger than 24 parallel payload tests because it makes writer #25 correct by default) over per-writer payload tests.',
        sibling_refactor_pattern: 'Apply the CLAUDE.md extract-testable-function + thin CLI wrapper pattern to the NEW scripts only (FR-4 check, FR-5 backfill). Do NOT apply the sibling SCHEMA-TRUTH-001-F false-completion-census.mjs whole-script refactor to stale-session-sweep.cjs -- larger blast radius than the defect being fixed.',
        pr_size: 'Exceeds the documented max for one EXEC phase. Split: PR-1 FR-2+FR-3+producer-selects+contract (delivers headline fix alone); PR-2 FR-1 chokepoint+call sites+census check+RPC migration; PR-3 FR-4+FR-5.',
      },
      preexisting_baseline_context: {
        note: 'Baseline of EXISTING tests this SD will modify. NOT evidence of this SD\'s implementation and deliberately NOT recorded in metadata.test_execution, which stays zeroed.',
        command: 'npx vitest run --project unit tests/unit/fleet/liveness-input-parity.test.js tests/unit/fleet/session-liveness.test.js tests/unit/fleet/qf-clear-and-reopen.test.js',
        result: '3 test files passed, 35/35 tests passed, vitest v4.1.4, 382ms',
      },
      artifacts_read: [
        'product_requirements_v2 / PRD-SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E (functional_requirements, technical_requirements, test_scenarios, risks, implementation_approach, acceptance_criteria, performance_requirements, system_architecture, metadata)',
        'strategic_directives_v2.scope for SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E (incl. the LEAD-PHASE CORRECTIONS block)',
        'lib/fleet/session-liveness.cjs (isSessionAlive :167-175, LIVENESS_INPUT_FIELDS :198-204, one-directional contract :12 and :158-162)',
        'lib/fleet/best-effort-release.mjs (clearAndReopenQf :246-296)',
        'lib/claim/release-claim-both-surfaces.mjs',
        'lib/worktree-reaper/live-claim-guard.js (SESSION_FIELDS :29)',
        'lib/coordinator/presence-grounding-signals.cjs',
        'scripts/stale-session-sweep.cjs (SESSION_SELECT_COLUMNS :403, QF stale-claim pass :1270-1340)',
        'scripts/hooks/coordination-inbox.cjs',
        'scripts/hooks/session-state-sync.cjs',
        'scripts/hooks/reclaim-sd-after-compaction.cjs',
        'scripts/fleet-rollcall.cjs',
        'scripts/fleet-dashboard.cjs',
        'tests/unit/fleet/liveness-input-parity.test.js (full)',
        'tests/unit/fleet/qf-clear-and-reopen.test.js',
        'live production claude_sessions counts (exact head queries)',
      ],
      related_prior_evidence: [
        '6b44c537 (Explore, LEAD_TO_PLAN) -- the ~24-site census this PRD\'s FR-1 is built on',
        'e523e69f (VALIDATION, LEAD) -- the source of the 2,106 figure this review corrects, and of the FR-2 self-contradiction that LEAD CORRECTION #4 resolved',
      ],
    },
    metadata: {
      measured: false,
      test_execution: buildTestExecution({
        executed: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        runner: null,
        artifactPath: null,
        artifactSha: null,
        source: null,
      }),
      prospective: true,
      post_implementation: false,
      mode: 'prospective',
      measured_reason: 'PLAN-phase pre-implementation design review: no code and no tests for this SD\'s requirements exist yet, so there is nothing to execute. The live DB counts and source reads in the findings are measurements of the EXISTING tree and of production data, not test results, and are deliberately not represented as test counts.',
      phase: 'PLAN_TO_EXEC',
    },
    phase: 'PLAN_TO_EXEC',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_KEY,
    { name: 'QA Engineering Director' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_TO_EXEC', source: 'manual' },
  );

  console.log('PLAN TESTING EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase ?? stored.metadata?.phase);
  console.log('  measured:', stored.metadata?.measured);
  console.log('  test_execution:', JSON.stringify(stored.metadata?.test_execution));
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  console.log('  findings:', (stored.findings || []).length, ' warnings:', (stored.warnings || []).length);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
