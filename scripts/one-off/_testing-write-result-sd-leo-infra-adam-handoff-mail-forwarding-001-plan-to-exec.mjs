#!/usr/bin/env node
/**
 * One-off: TESTING sub-agent PLAN-TO-EXEC verdict (test STRATEGY / plan review) for
 * SD-LEO-INFRA-ADAM-HANDOFF-MAIL-FORWARDING-001.
 *
 * Canonical evidence path per CLAUDE.md prologue rule 11:
 * resolveSubAgentRepo + applySubAgentRepoVerdict (metadata.repo_path / executed_from_cwd),
 * then storeSubAgentResults. No hand-rolled INSERT, no top-level repo_path column.
 *
 * Run FROM the worktree so executed_from_cwd stamps the worktree.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'ae41dc6c-42fe-4d63-b9c5-c6b40c7f91f8';
const SD_KEY = 'SD-LEO-INFRA-ADAM-HANDOFF-MAIL-FORWARDING-001';

const findings = [
  {
    id: 'T-1-PRD-misattributes-makeSb-there-are-SIX-filter-blind-doubles-not-one',
    severity: 'HIGH',
    summary: 'INDEPENDENTLY VERIFIED BY FULL SOURCE READ, NOT BY TRUSTING THE PRD. The PRD FR-6 says "The shared `makeSb` test helper (tests/unit/coordination/adam-singleton.test.js)". BOTH the location and the word "shared" are WRONG. makeSb is defined at tests/unit/coordinator/adam-reply-target-integrity.test.js:17-50. tests/unit/coordination/adam-singleton.test.js contains NO makeSb; it defines two DIFFERENT inline helpers, `stub` (:40-56) and `regStub` (:153-205), plus a third anonymous inline `sb` literal inside the drainAdamOutbound describe (:298-303). There is NO shared helper anywhere — every double is inline and per-file. The PRD SUBSTANTIVE claim is nonetheless CONFIRMED for all of them: .eq()/.is()/.gte()/.filter()/.in() are pure `return chain` passthroughs that record nothing and filter nothing; the canned fixture array is resolved regardless of any predicate. COMPLETE INVENTORY of filter-blind doubles this SD must touch (SIX across FIVE files, not one): (1) makeSb — tests/unit/coordinator/adam-reply-target-integrity.test.js:17; (2) stub — tests/unit/coordination/adam-singleton.test.js:40; (3) regStub — tests/unit/coordination/adam-singleton.test.js:153; (4) inline sb — tests/unit/coordination/adam-singleton.test.js:298; (5) stub — scripts/adam-register.test.js:41; (6) fakeSupabase — tests/unit/adam/inbound-backlog-watchdog.test.js:61. EXEC MUST NOT go looking for makeSb in adam-singleton.test.js and conclude the PRD premise is false; it is true, just misfiled.'
  },
  {
    id: 'T-2-baseline-established-163-of-163-green',
    severity: 'INFO',
    summary: 'PRE-CHANGE BASELINE CAPTURED IN THE WORKTREE (branch feat/SD-LEO-INFRA-ADAM-HANDOFF-MAIL-FORWARDING-001, HEAD 6e8bdb01bf50c9ce16382dad031b9dfdb8218908). The three files named in the task: `npx vitest run tests/unit/coordination/adam-singleton.test.js tests/unit/coordinator/adam-reply-target-integrity.test.js tests/unit/coordinator-ack-adam-reply-ordering.test.js` => 3 files / 48 tests / 48 passed / 0 failed (adam-singleton 29, adam-reply-target-integrity 10, coordinator-ack-adam-reply-ordering 9). THE TASK COMMAND UNDER-COVERS THE BLAST RADIUS. A grep for the symbols this SD changes (drainAdamOutbound|retargetStaleAdamInbound|resolveAdamSessionIds|registerAdam|inbound-backlog-watchdog|ADAM_EXCLUDED_KINDS) returns TWELVE test files. Extended baseline over all twelve: 12 files / 163 tests / 163 passed / 0 failed. The twelve are: scripts/adam-register.test.js, tests/static-guards/drain-set-registry-readers.test.js, tests/unit/adam-inbox-surface-not-stamp.test.js, tests/unit/adam/inbound-backlog-watchdog.test.js, tests/unit/adam/inbound-backlog.test.js, tests/unit/coordination/adam-singleton.test.js, tests/unit/coordination/adam-solomon-lane-probe.test.js, tests/unit/coordinator-ack-adam-reply-ordering.test.js, tests/unit/coordinator/adam-reply-target-integrity.test.js, tests/unit/escalation/aggregate.test.js, tests/unit/fleet/drain-sets-adam-excluded-kinds.test.js, tests/unit/sourcing-engine/adam-direct-registry.test.js. EXEC SHOULD RUN THE TWELVE-FILE SET, not the three-file set, as its regression gate.'
  },
  {
    id: 'T-3-worktree-vitest-was-UNRUNNABLE-truncated-rolldown-binding-repaired',
    severity: 'HIGH',
    summary: 'ENVIRONMENT DEFECT FOUND AND FIXED BEFORE THE BASELINE COULD BE TAKEN — EXEC MUST KNOW THIS. The first baseline attempt failed at vitest STARTUP, not at any test: "Cannot find native binding ... rolldown-binding.win32-x64-msvc.node is not a valid Win32 application" (ERR_DLOPEN_FAILED). Root cause measured: the worktree node_modules carried a TRUNCATED native binding — 6,616,064 bytes at .worktrees/SD-LEO-INFRA-ADAM-HANDOFF-MAIL-FORWARDING-001/node_modules/@rolldown/binding-win32-x64-msvc/rolldown-binding.win32-x64-msvc.node versus 24,350,208 bytes for the same file in the main repo (a partial/interrupted npm install in the worktree, dated Aug 15 20:24). REPAIRED by copying the intact 24,350,208-byte binding from the main repo into the worktree; vitest then started and ran clean. THIS IS A WORKTREE-LOCAL INSTALL DEFECT, NOT A CODE DEFECT — nothing in the SD caused it. Recorded because (a) a fresh worktree for this SD may reproduce it and EXEC would otherwise read "0 tests ran" as a code problem, and (b) a startup error yields NO test output at all, which is indistinguishable from a suite that does not exist. If EXEC sees it again: copy the binding from the main repo rather than a full reinstall.'
  },
  {
    id: 'T-4-CRITICAL-FR-2-does-not-remove-the-if-retired-length-guard-so-it-achieves-nothing',
    severity: 'CRITICAL',
    summary: 'THE ONE FINDING THAT DECIDES WHETHER FR-2 WORKS AT ALL. scripts/adam-register.cjs gates the entire drain on `if (retired.length) { const d = await drainAdamOutbound(...); drained = (d && d.moved) || 0; }` (the block immediately after the retire loop, around :220-224). FR-2 changes WHAT is passed as oldSessionIds (full resolved retired-seat list instead of the local retired[] array) but says NOTHING about the enclosing guard. WITH THE GUARD LEFT IN PLACE, FR-2 IS A NO-OP IN THE COMMON CASE: the overwhelmingly normal register path has no stale prior to retire, so decision.retire is empty, retired[] stays empty, the guard is false, and drainAdamOutbound is NEVER CALLED — no matter how many retired seats resolveRetiredAdamSeats would have found. FR-2 stated purpose is verbatim "a seat leftover backlog is now retried on EVERY FUTURE REGISTER, not abandoned after one narrow attempt"; that purpose is defeated by the guard, because the only registers that would drain are exactly the ones that already drained under the old behaviour. Resolving the full population is useless if the call site is still conditioned on this call having retired someone. REQUIRED PRD AMENDMENT: FR-2 must explicitly state the `if (retired.length)` guard is REPLACED by a guard on the RESOLVED list being non-empty (drain whenever resolveRetiredAdamSeats returns seats, regardless of whether this invocation retired anyone). COMPOUNDING: NO test scenario covers this. TS-2 asserts inheritance across all retired seats at the drainAdamOutbound unit level, and TS-7 exercises the register JSON over a multi-seat fixture — but neither pins the ZERO-LOCAL-RETIREMENTS case, which is the only shape that catches the guard. See T-11(a) for the exact test to add.'
  },
  {
    id: 'T-5-nine-existing-tests-WILL-break-by-design-enumerated-so-EXEC-does-not-mistake-them-for-regressions',
    severity: 'HIGH',
    summary: 'EXACT PRE-COMPUTED BREAKAGE LIST, DERIVED BY READING EACH DOUBLE METHOD SURFACE AGAINST THE NEW PREDICATE CHAINS. These are LEGITIMATE breakages (the tests pin the OLD predicate/update shape) and MUST be rewritten against the fixture-filtering double — they must NOT be "fixed" by loosening assertions or by adding no-op methods to the old stubs, which would silently restore filter-blindness. (A) tests/unit/coordination/adam-singleton.test.js :294-315, describe "drainAdamOutbound (FR-4 idempotent re-target)", 2 tests. Its inline sb.select() RESOLVES A PROMISE DIRECTLY, so FR-3 select-first chain .from().select(...).in(...) calls .in() on a Promise => TypeError. Additionally `expect(captured.patch).toEqual({target_session:"new"})` pins the single-bulk-update shape FR-3 replaces with select-then-per-row-update, and `toEqual({moved:0})` on the short-circuit paths breaks if the early return gains byKind (see T-10 note on return shape). (B) tests/unit/coordination/adam-singleton.test.js :232-260, 2 registerAdam tests asserting `drained: 2` / `drained: 1` and `calls.drainSelect === 1`. regStub TOP-LEVEL chain (:158-192) has NO .in() method (only the update sub-chain has one), so the FR-3 select-first drain TypeErrors. (C) tests/unit/coordinator/adam-reply-target-integrity.test.js :79-108, describe "FR-2 retargetStaleAdamInbound", 4 tests. makeSb builder method surface is exactly {select,gte,filter,eq,is,order,range,update,maybeSingle,then} — THERE IS NO .or(). FR-4 adds .or() => "builder.or is not a function". Independently, FR-4 retired-seat gate will resolve "stale" as NOT retired (freshAdams fixture carries role:"adam"), so the count assertions (retargeted 2, and the error-surfacing test) fail on the verdict too. (D) scripts/adam-register.test.js :41-77, `stub` chain is {select,eq,filter,order,range,maybeSingle,update,insert} — no .in(), no .is(), no .gte(), no .or(); it breaks as soon as the register path calls resolveRetiredAdamSeats and/or the select-first drain. EXPECTED TOTAL: ~8-9 of the 163 baseline tests. EVERYTHING ELSE (~154) MUST STAY GREEN. DELIBERATE KEEPER: the pin at adam-reply-target-integrity.test.js:102-107 `expect(patch).toEqual({target_session:"live"})` SURVIVES under the PRD as written (FR-4 adds no payload stamping) — but see T-9, which recommends a change that would deliberately break it. NOT AFFECTED: tests/unit/adam/inbound-backlog-watchdog.test.js fakeSupabase already has no-op .in()/.or(), so FR-7 will not crash it — which is precisely the problem, see T-8.'
  },
  {
    id: 'T-6-ANSWER-yes-.or-is-mandatory-and-the-PRD-method-list-is-materially-incomplete',
    severity: 'CRITICAL',
    summary: 'DIRECT ANSWER TO THE FR-6 DESIGN QUESTION: YES, .or() IS MANDATORY, AND THE PRD FIVE-METHOD LIST (.eq/.is/.in/.gte/.or) IS NOT SUFFICIENT TO RUN THE TESTS IT SPECIFIES. Both FR-3 and FR-4 add .or("payload->>kind.is.null,payload->>kind.not.in.(...)") modelled on scripts/coordinator-hourly-review.cjs:622 (confirmed verbatim at source). Without a REAL .or(), TS-3 ("never moves any of the 5 ADAM_EXCLUDED_KINDS") is UNPROVABLE — it would pass identically whether or not EXEC wrote the exclusion filter, reproducing the exact blindness FR-6 exists to cure, one layer up. MEASURED FULL REQUIREMENT, beyond the PRD five: (1) .order() + .range(from,to) WITH SHORT-PAGE-EXIT SEMANTICS — non-optional, because FR-1 resolveRetiredAdamSeats is specified as a PAGINATED select (lib/db/fetch-all-paginated.mjs ends every page .order(...).range(from,to)); without range the resolver test cannot execute at all. (2) POSTGREST JSON-PATH COLUMN ACCESSORS — `metadata->>role` for the resolver and `payload->>kind` for both movers. A plain row[col] lookup RESOLVES NEITHER; the double needs a getCol() that splits on "->>" and walks the nested object (and String-coerces, since ->> yields text). (3) .or() must parse the PostgREST FILTER-STRING GRAMMAR, not just accept the string: comma-separated col.op.val clauses, the `is.null` form, and the `not.in.(a,b,c)` parenthesised-list form. (4) THE UPDATE PATH must support .update(patch).eq(...).is(...).select("id") and return ONLY GENUINELY-AFFECTED ROWS — this is the sole way TR-5 (re-assert the safety predicate at write time) becomes testable; if the double returns the patch unconditionally, TR-5 is unobservable and EXEC could ship .eq("id", row.id) alone with every test green. (5) `payload: null` must not throw in the accessor (see T-11c). STRONG DESIGN DIRECTIVE: THE DOUBLE MUST THROW ON ANY FILTER EXPRESSION IT DOES NOT UNDERSTAND, never silently pass rows through. A permissive fallback re-creates filter-blindness inside the fixture built to cure it — the obvious fix for a blind guard is usually blind too. IN-REPO PRECEDENT TO COPY: tests/unit/qf-claim-cas.test.js makeFakeSupabase THROWS on any unrecognised .or() shape as an explicit anti-drift measure. That is the pattern.'
  },
  {
    id: 'T-7-reuse-survey-NO-reusable-filtering-double-exists-three-patterns-to-lift-build-it-ONCE',
    severity: 'HIGH',
    summary: 'ANSWER TO "DOES SUCH A DOUBLE ALREADY EXIST": NO. Searched tests/, lib/, scripts/, __tests__, tests/helpers, tests/fixtures, tests/factories, tests/support for real row-filtering query builders (grep over rows.filter(, applyFilter, fakeSupabase, makeSupabase, createFakeSb, fixtureDb, memoryDb, queryBuilder, _rows, and stubs defining .or(). THE REPO BLESSED SHARED HELPER IS NOT REUSABLE: tests/helpers/supabase-chain-mock.js createSupabaseChainMock() is a pure vi.fn(() => chain) passthrough with ZERO filtering — it is the same defect class, already centralised. Same for tests/factories/validator-context-factory.js createMockSupabase(), tests/fixtures/stage-worker-io-recorder.js makeRecordingSupabase(), tests/unit/foresight/workflow/test-helpers.js. Roughly sixty INLINE doubles do partial real filtering, but not one covers the required matrix (eq/is/in/gte + ->> JSON path + .or() filter-string + .order().range() + affected-rows update). THREE PATTERNS TO LIFT FROM, and what to take from each: (1) tests/unit/worker-checkin-ranked-window.test.js makeStub (:25) — BEST FILTER ENGINE: real eq/neq/is(null-aware)/in/gte/lte/gt/lt via a preds[] array applied at read time, AND real "->>" handling in getCol() with quote-stripping and String coercion. Take the preds[] engine and getCol(). Its .or() is a DELIBERATE NO-OP at :97 and .range() is a no-op — do not inherit those. (2) tests/unit/chairman/sms-outbound-reconcile.test.js parseOrFilter/matchesOrClause/applyFilters (:39-120) — THE ONLY GENUINE POSTGREST .or() STRING PARSER APPLIED TO ROWS IN THIS REPO, plus real not(col,"in","(a,b)") literal-list parsing, applied to BOTH select and update paths. Take the or-parser. It has no ->> and no range. (3) tests/unit/roadmap/plan-check-uncapped-pagination.test.js makeRangeAwareSupabase — BEST .order().range(f,t) semantics including a honorRange:false mode modelling the PostgREST 1000-row cap. Take range. ALSO RELEVANT: tests/unit/adam/adam-coordinator-health.test.js makeFakeSupabase (:48) already combines ->> jsonbPath eq + not(col,op,val) + cap modelling and is in the SAME adam test directory; scripts/three-way-comms-drill.mjs makeMemoryDb (:88) is the only EXPORTED double combining ->> with .order().range(), but is hard-wired to session_coordination + claude_sessions and does eq only. NOTE lib/db/fetch-all-paginated.mjs own test (tests/unit/db/fetch-all-paginated.test.js makeRelation) models pagination with NO filter methods at all, by design. PROCESS RECOMMENDATION, AND IT IS THE SINGLE-REPRESENTATION CALL: this SD touches SIX filter-blind doubles across FIVE files (T-1). BUILD THE FILTERING DOUBLE ONCE AS AN EXPORTED HELPER (e.g. tests/helpers/filtering-supabase-mock.js) rather than authoring a sixth inline copy. The repo already demonstrates the cost of not doing this — worker-checkin-ranked-window / -newest-window / -fleet-critical-window each carry a near-identical COPY-PASTED engine that must now be maintained in triplicate. Cheap now, expensive later. This modestly increases the test LOC beyond TR-3 250-350 estimate; PLAN should accept that rather than trim the double.'
  },
  {
    id: 'T-8-TS-8-and-AC-13-are-FALSE-GREEN-as-specified-the-SD-commits-its-own-defect-class',
    severity: 'CRITICAL',
    summary: 'TS-8 AND AC-13 CANNOT OBSERVE THEIR SUBJECT AND WOULD PASS EVEN IF FR-7 WERE NEVER IMPLEMENTED. Read at source: tests/unit/adam/inbound-backlog-watchdog.test.js fakeSupabase (:61-92) implements select/eq/in/is/or/order as `return builder` NO-OPS, and BOTH its resolution paths — range(from,to) at :76-79 and then() at :85-89 — return the injected adamIds array VERBATIM, with no reference to any role filter. So TS-8 ("fixture with both role=adam and role=adam_retired rows => both are returned") is satisfied by the FIXTURE, not by the code: seed adamIds with two ids and it passes whether FR-7 changed .eq("metadata->>role","adam") to .in("metadata->>role",[LIVE,RETIRED]) or left it untouched. Worse, the fixture as currently shaped does not even CARRY roles — it maps ids to {session_id} objects with no metadata at all, so a role-bearing fixture cannot be expressed without changing the fake. AND FR-6 DOES NOT SCOPE THIS FILE: FR-6 enumerates exactly four new/updated test groups (resolveRetiredAdamSeats, drainAdamOutbound, retargetStaleAdamInbound, adam-register JSON) — the watchdog is not among them. As written the SD therefore ships AC-13 behind a test that runs but cannot see what it asserts, which is the SAME DEFECT CLASS THE SD EXISTS TO CLOSE, committed by the SD itself. REQUIRED FIX, either: (a) add tests/unit/adam/inbound-backlog-watchdog.test.js to FR-6 scope and seed fakeSupabase with role-bearing claude_sessions rows filtered for real, or (b) reuse the new shared filtering double (T-7) there. Option (b) is strictly better and is a further argument for building the double once.'
  },
  {
    id: 'T-9-FR-4-carries-the-only-HIGH-risk-and-is-the-ONLY-mover-with-no-forensic-breadcrumb',
    severity: 'HIGH',
    summary: 'THE PROVENANCE ASYMMETRY IS BACKWARDS. FR-3/AC-5 stamps payload.retargeted_from + payload.retargeted_at on every row drainAdamOutbound moves, and FR-3 rollback plan explicitly DEPENDS on it: "every row it moved is identifiable afterward via payload.retargeted_from/retargeted_at for manual remediation". FR-4 stamps NOTHING — yet FR-4 carries the PRD ONLY severity:high risk (the sender_type widening / inbox-hijack blast radius, inherited from VALIDATION V-6), and its rollback plan offers NO means of identifying what it moved: "revert this one commit" restores the filter but leaves already-moved rows unattributable. So the SAFE mover is forensically traceable and the DANGEROUS one is not. RECOMMENDATION: FR-4 should stamp the same retargeted_from/retargeted_at provenance. HONEST COST, so PLAN can decide with it in view: (1) it converts retargetStaleAdamInbound from a single bulk .update() into the same select-then-per-row-update shape as FR-3, because jsonb cannot be partially merged in a chained update — the PRD already establishes exactly this constraint for FR-3, so the machinery is being built anyway and reuse is cheap; (2) it DELIBERATELY BREAKS the regression pin at tests/unit/coordinator/adam-reply-target-integrity.test.js:102-107, `expect(patch).toEqual({target_session:"live"})`, placed by SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001 FR-3. That pin INTENT was "never widen the patch to sender_session/created_at" — adding retargeted_from/at is consistent with the intent but violates the literal assertion, so it must be updated DELIBERATELY with a comment naming this SD, never silently relaxed. This is a PLAN decision, not an EXEC one. Flagged as a strong recommendation, NOT a go/no-go blocker.'
  },
  {
    id: 'T-10-PRD-internally-contradicts-itself-on-exporting-ACK_TTL_DAYS',
    severity: 'MEDIUM',
    summary: 'CONTRADICTION EXEC WILL HIT ON STEP 1. FR-3 says verbatim "DO NOT export ACK_TTL_DAYS from lib/retention/session-coordination-ack-convergence.js" and TR-4 is titled "ACK_TTL_DAYS stays local to each module (no cross CJS/ESM export)" — both directing a locally-duplicated ADAM_MAIL_TTL_DAYS with a comment cross-reference. BUT implementation_approach.steps[0] says "Add ADAM_RETIRED_ROLE to lib/fleet/worker-status.cjs; EXPORT ACK_TTL_DAYS from lib/retention/session-coordination-ack-convergence.js", and risks[3] is entirely premised on that export existing ("FR-3 requires exporting ACK_TTL_DAYS ... crossing a module boundary that previously kept this constant local/unexported"). RESOLUTION FOR EXEC: follow FR-3 + TR-4 (the normative requirement sections); treat implementation_approach.steps[0] and risks[3] as STALE drafting residue from an earlier design. VERIFIED AT SOURCE: lib/retention/session-coordination-ack-convergence.js:21 is `const ACK_TTL_DAYS = 14;` with NO export keyword, in an ESM module whose two would-be consumers (scripts/adam-advisory.cjs, lib/coordinator/adam-identity.cjs) are both CJS — TR-4 reasoning is correct on the merits. CONSEQUENCE FOR AC-14: because the constant is not exported, the consistency test CANNOT import it; it must read the FILE TEXT and regex the literal. GUIDANCE: anchor on /const\\s+ACK_TTL_DAYS\\s*=\\s*(\\d+)/ and assert the PARSED NUMBER equals the parsed ADAM_MAIL_TTL_DAYS literal from each CJS mover — never a fixed character slice, because a positional source slice is a guard whose subject moves the first time a line is added above it. SECOND-ORDER: also assert the regex MATCHED at all (a non-matching regex yields null and a null===null comparison passes vacuously), and fail loudly if either file stops containing the constant.'
  },
  {
    id: 'T-11-eight-test-scenario-gaps-four-of-them-leave-a-named-requirement-with-zero-coverage',
    severity: 'HIGH',
    summary: 'TS-1..TS-8 GAP ANALYSIS. (a) MISSING, AND IT IS THE ONE THAT CATCHES T-4: register invoked with ZERO local retirements while retired seats EXIST in the fixture => drainAdamOutbound must STILL run and still move rows. No current scenario has this shape (TS-2 is unit-level on the mover; TS-7 exercises the register JSON but over a fixture that presumably retires). Without it the `if (retired.length)` guard survives untested and FR-2 ships as a no-op. (b) MISSING — MULTIPLE RETIRED SEATS IN ONE REGISTER CALL (explicitly asked): TS-2 says "ALL retired seats" and TS-7 says "multi-seat" but nothing pins that oldSessionIds actually CONTAINS more than one id and that rows at EACH seat move. Add: 3 retired seats, rows at each, all move, byKind aggregates ACROSS seats (not per-seat). (c) MISSING — A ROW WITH payload.kind ABSENT ENTIRELY (explicitly asked), and this is the HIGHEST-VALUE missing case. The .or() is specifically NULL-TOLERANT (payload->>kind.is.null) precisely because, in the words of the comment above the reference implementation at scripts/coordinator-hourly-review.cjs:620, "a bare NOT IN would silently drop kind-less rows". TS-3 only covers the 5 named excluded kinds, so a bare .not.in() regression would pass every scenario. Add TWO rows: payload:{} (kind key absent) and payload:null (payload column null) — BOTH MUST MOVE. The payload:null case additionally proves the double accessor does not throw. (d) MISSING — TR-5 CONCURRENT-UPDATE RACE (explicitly asked): TR-5 is a NAMED TECHNICAL REQUIREMENT WITH NO TEST SCENARIO AT ALL. Add: the double returns a row in the initial select, but by update time that row acknowledged_at is non-null (and a second variant where target_session has changed) => the per-row update affects ZERO rows => the row is NOT counted in moved and NOT counted in byKind. This is the only way to prove the re-assert actually re-asserts; without it EXEC can write .eq("id", row.id) alone and every other test stays green. (e) UNDER-SPECIFIED — TS-6: it names the unverified originator as "live role=adam or unrelated session" but OMITS THE REALISTIC MIDDLE CASE — a genuinely stale Adam that has NOT YET been marked adam_retired (went stale by heartbeat; no register has run to retire it). Under FR-4 fail-closed gate this now recovers ZERO rows where TODAY it recovers them. That is a REAL FUNCTIONAL NARROWING of the recovery path — deliberate and defensible, but currently undocumented and untested. Add a scenario pinning it so the tradeoff is visible in CI rather than discovered in production. (f) UNDER-SPECIFIED — TS-4 IDEMPOTENCY IS VACUOUS UNLESS THE DOUBLE IS STATEFUL: "a second run moves 0" passes trivially if the double never applied the FIRST run target_session mutation to its in-memory rows. The double MUST persist writes so the second run .in("target_session", olds) genuinely no longer matches. State this explicitly in the scenario or the test proves nothing. (g) MISSING — FAIL-OPEN / FAIL-CLOSED ERROR PATHS: both movers are contractually fail-open ({moved:0,error} / {retargeted:0,error}) and resolveRetiredAdamSeats is brand new, yet NO scenario covers "resolver returns an error". This is safety-relevant and asymmetric: a resolver ERROR must NOT be read as "no retired seats, proceed" and must NOT be read as "everything is retired" — both movers must FAIL CLOSED (move 0) and surface the error. Add it. (h) MISSING — AC-10 HAS NO TEST: AC-10 is phrased as "grep shows ... no independent hand-rolled lists", i.e. a manual check, not an executable assertion. Recommend a static-guard test asserting neither mover file contains a hand-rolled kind-array literal and both reference the shared constant. There is already an established home for exactly this pattern: tests/static-guards/drain-set-registry-readers.test.js (in the baseline set and currently green).'
  },
  {
    id: 'T-12-drainAdamOutbound-short-circuit-return-shape-is-under-specified',
    severity: 'LOW',
    summary: 'MINOR BUT WILL CAUSE AN AVOIDABLE TEST CHURN. AC-6 requires drainAdamOutbound to return byKind alongside moved/error, and FR-3 states "moved/error keep their existing shape so scripts/adam-register.cjs (d && d.moved) || 0 keeps working unchanged". Neither says whether the EARLY-RETURN paths carry byKind. Today those paths return the bare object {moved: 0} (verified at scripts/adam-advisory.cjs, the three guards: no supabase / no newSessionId / non-array oldSessionIds, and the empty-olds guard), and the existing test asserts toEqual({moved:0}) EXACTLY. GUIDANCE: return {moved: 0, byKind: {}} CONSISTENTLY from every path including the short-circuits, and update the assertion deliberately. A byKind that is sometimes undefined forces every consumer — including FR-5 adam-register `inherited` field — to defend against it, which is how an optional field becomes a permanent conditional.'
  }
];

const warnings = [
  'The task-supplied baseline command covers 3 files / 48 tests. The measured blast radius is 12 files / 163 tests. Using the 3-file command as the regression gate would leave scripts/adam-register.test.js (which WILL break under FR-2/FR-3, see T-5D) and tests/unit/adam/inbound-backlog-watchdog.test.js (FR-7 target, see T-8) entirely outside the gate.',
  'vitest could not START in this worktree before intervention (truncated rolldown native binding, 6.6MB vs 24.3MB). It was repaired by copying the intact binary from the main repo. A startup error produces no test output at all, which is indistinguishable from an empty suite — if EXEC sees zero results, check the binding before suspecting the code.',
  'The PRD asserts makeSb lives in tests/unit/coordination/adam-singleton.test.js. It does not; it is in tests/unit/coordinator/adam-reply-target-integrity.test.js. The filter-blindness claim itself is CONFIRMED, but EXEC following the PRD path will not find the helper and may wrongly conclude the premise is false.',
  'FR-6 scopes four test groups and omits the watchdog, yet TS-8/AC-13 target the watchdog. As specified, AC-13 would be satisfied by a test that cannot observe whether FR-7 was implemented.',
  'PRD implementation_approach.steps[0] and risks[3] both assume ACK_TTL_DAYS is exported; FR-3 and TR-4 both forbid exporting it. EXEC must follow FR-3/TR-4 and ignore the stale approach/risk text.',
  'TR-3 estimates 250-350 LOC. Building the filtering double ONCE as a shared exported helper (recommended, T-7) plus the eight added scenarios in T-11 will push the test portion higher. The test portion is the part that must not be trimmed — it is the entire mechanism by which this SD can demonstrate its own fix.'
];

const recommendations = [
  'GO — EXEC may proceed. The baseline is green and reproducible (12 files / 163 tests), the PRD test strategy is directionally sound, and no finding blocks starting implementation.',
  'RESOLVE BEFORE EXEC WRITES TESTS (T-4): amend FR-2 to state that the `if (retired.length)` guard at the adam-register.cjs drain call site is REPLACED by a guard on the RESOLVED retired-seat list. Without this one-line scope clarification FR-2 is a no-op on every register that does not itself retire a prior — which is the common case, and precisely the "orphan forever" gap FR-2 claims to close.',
  'RESOLVE BEFORE EXEC WRITES TESTS (T-8): add tests/unit/adam/inbound-backlog-watchdog.test.js to FR-6 scope, or reuse the new shared double there. As specified, TS-8/AC-13 pass whether or not FR-7 is implemented.',
  'BUILD THE FILTERING DOUBLE ONCE, AS AN EXPORTED HELPER (T-7), not as a sixth inline copy. Lift the preds[] engine + getCol() "->>" handling from tests/unit/worker-checkin-ranked-window.test.js:25, the PostgREST or-string parser from tests/unit/chairman/sms-outbound-reconcile.test.js:39-120, and .order().range() from tests/unit/roadmap/plan-check-uncapped-pagination.test.js. No reusable filtering double exists today; the repo blessed helper (tests/helpers/supabase-chain-mock.js) is itself a no-op passthrough.',
  'THE DOUBLE MUST THROW ON ANY UNRECOGNISED FILTER EXPRESSION rather than passing rows through (T-6). Copy the anti-drift stance of tests/unit/qf-claim-cas.test.js makeFakeSupabase. A permissive fallback rebuilds filter-blindness inside the fixture built to cure it.',
  'THE DOUBLE MUST SUPPORT MORE THAN THE FIVE METHODS THE PRD LISTS (T-6): add .order()+.range() with short-page-exit (FR-1 resolver is paginated and cannot otherwise run), PostgREST "->>" JSON-path accessors for metadata->>role and payload->>kind, a real .or() grammar parser (is.null and not.in.(a,b,c) forms), and an update path returning only genuinely-affected rows (the only way TR-5 becomes observable).',
  'ADD THE EIGHT MISSING/UNDER-SPECIFIED SCENARIOS IN T-11. Four of them leave a named requirement with zero coverage: (a) zero-local-retirements register [catches T-4], (c) payload.kind absent / payload null [the null-tolerance the .or() exists for], (d) TR-5 concurrent-update race [TR-5 currently has NO scenario at all], (g) resolver-error fail-closed.',
  'STRONGLY CONSIDER stamping retargeted_from/retargeted_at in FR-4 as well (T-9). Today the SAFE mover is forensically traceable and the one carrying the only HIGH risk is not. Accept that this converts FR-4 to select-then-per-row-update and deliberately breaks the pin at adam-reply-target-integrity.test.js:102-107 — update that pin with a comment naming this SD, never silently.',
  'EXEC REGRESSION GATE: run the 12-file set, not the 3-file set. Expect ~8-9 deliberate breakages (enumerated in T-5) and ~154 tests that MUST stay green. Do NOT repair a T-5 breakage by adding a no-op method to the old stub — that restores the exact blindness this SD exists to remove.',
  'Follow FR-3/TR-4 (no ACK_TTL_DAYS export) and implement AC-14 as a source-text regex pin anchored on /const\\s+ACK_TTL_DAYS\\s*=\\s*(\\d+)/, asserting the regex MATCHED before comparing (T-10).'
];

const summary = 'PLAN-TO-EXEC TESTING (test-strategy / plan review, pre-implementation): GO / CONDITIONAL_PASS (confidence 90) for SD-LEO-INFRA-ADAM-HANDOFF-MAIL-FORWARDING-001. BASELINE ESTABLISHED AND GREEN: the three files named in the task run 48/48 pass, but the measured blast radius is TWELVE files / 163 tests (163/163 pass) — EXEC should gate on the twelve. Taking the baseline first required repairing a truncated rolldown native binding in the worktree node_modules (6.6MB vs 24.3MB; vitest could not start at all — an environment defect, not a code one, recorded because a startup error is indistinguishable from an empty suite). PRD PREMISE INDEPENDENTLY VERIFIED, WITH A CORRECTION: the filter-blindness claim is TRUE — .eq()/.is()/.gte()/.in() are pure `return chain` passthroughs that record nothing and filter nothing — but makeSb is NOT in tests/unit/coordination/adam-singleton.test.js as FR-6 states; it is at tests/unit/coordinator/adam-reply-target-integrity.test.js:17. adam-singleton.test.js has two DIFFERENT helpers (stub :40, regStub :153) plus a third inline literal (:298). Nothing is shared. There are SIX filter-blind doubles across FIVE files, not one, and FR-6 scopes only some of them. TWO ITEMS SHOULD BE RESOLVED BEFORE EXEC WRITES TESTS. (1) CRITICAL — FR-2 IS A NO-OP AS WRITTEN: adam-register.cjs gates the drain on `if (retired.length)`, and FR-2 changes only what is PASSED, never the guard. The common register path retires nobody, so the drain is never called no matter how many seats resolveRetiredAdamSeats finds — which defeats FR-2 own stated purpose ("retried on every future register, not abandoned after one narrow attempt") exactly. No scenario covers the zero-local-retirements shape, so this would ship untested. (2) CRITICAL — TS-8/AC-13 ARE FALSE-GREEN: the watchdog fake (tests/unit/adam/inbound-backlog-watchdog.test.js:61) implements .eq/.in/.or as no-ops and returns its adamIds fixture verbatim from both resolution paths, so TS-8 passes whether or not FR-7 is implemented; FR-6 does not scope that file. The SD would commit the defect class it exists to close. ANSWER TO THE FR-6 DESIGN QUESTION: YES, .or() IS MANDATORY — both movers add .or("payload->>kind.is.null,payload->>kind.not.in.(...)") modelled on coordinator-hourly-review.cjs:622, and without a real .or() parser TS-3 (excluded kinds never move) is unprovable. The PRD five-method list (.eq/.is/.in/.gte/.or) is MATERIALLY INCOMPLETE: also required are .order()+.range() with short-page-exit (FR-1 resolver is paginated and cannot otherwise execute), PostgREST "->>" JSON-path accessors for metadata->>role and payload->>kind (a plain row[col] resolves neither), a real filter-string grammar parser for the is.null and not.in.(a,b,c) forms, and an update path returning only genuinely-affected rows — the last being the ONLY way TR-5 (re-assert at write time) becomes observable at all. THE DOUBLE MUST THROW ON UNRECOGNISED FILTERS, never pass through; precedent at tests/unit/qf-claim-cas.test.js. REUSE SURVEY: NO reusable filtering double exists — the repo blessed shared helper tests/helpers/supabase-chain-mock.js is itself a no-op passthrough, and ~60 inline doubles each cover a fragment. Lift the preds[]+getCol("->>") engine from tests/unit/worker-checkin-ranked-window.test.js:25, the only real PostgREST or-string parser from tests/unit/chairman/sms-outbound-reconcile.test.js:39-120, and range semantics from tests/unit/roadmap/plan-check-uncapped-pagination.test.js — and BUILD IT ONCE AS AN EXPORTED HELPER, since this SD touches six doubles and the repo already maintains one such engine in copy-pasted triplicate. EIGHT TS GAPS, four leaving a named requirement at zero coverage: zero-local-retirements register (catches gap 1); payload.kind absent AND payload null (the exact null-tolerance the .or() exists for — a bare NOT IN silently drops kind-less rows, per the reference implementation own comment); TR-5 concurrent-update race (a named TR with NO scenario whatsoever); resolver-error fail-closed. Also: multiple retired seats in one call, TS-6 missing the realistic "stale but not yet retired" middle case (FR-4 fail-closed gate genuinely NARROWS recovery there — deliberate but untested), TS-4 idempotency vacuous unless the double persists writes, and AC-10 phrased as a grep rather than an executable static guard (home already exists at tests/static-guards/drain-set-registry-readers.test.js). FURTHER: FR-4 carries the PRD only HIGH-severity risk yet is the ONLY mover with no retargeted_from/retargeted_at breadcrumb, so the safe mover is forensically traceable and the dangerous one is not — recommend stamping it, accepting that this converts FR-4 to select-then-per-row-update and deliberately breaks the pin at adam-reply-target-integrity.test.js:102-107. Finally, the PRD contradicts itself on ACK_TTL_DAYS (FR-3/TR-4 forbid the export; implementation_approach.steps[0] and risks[3] assume it) — follow FR-3/TR-4 and implement AC-14 as a regex source-pin that asserts it MATCHED before comparing. EXPECT ~8-9 DELIBERATE TEST BREAKAGES (enumerated with the exact method-surface cause for each) and ~154 that must stay green; a T-5 breakage must never be repaired by adding a no-op method to the old stub.';

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
    confidence_score: 90,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      review_type: 'PLAN_TO_EXEC_TEST_STRATEGY_REVIEW',
      mode: 'pre-implementation (EXEC has not written code yet)',
      branch: 'feat/SD-LEO-INFRA-ADAM-HANDOFF-MAIL-FORWARDING-001',
      worktree_head: '6e8bdb01bf50c9ce16382dad031b9dfdb8218908',
      baseline: {
        task_named_3_files: {
          command: 'npx vitest run tests/unit/coordination/adam-singleton.test.js tests/unit/coordinator/adam-reply-target-integrity.test.js tests/unit/coordinator-ack-adam-reply-ordering.test.js',
          test_files: 3,
          tests_total: 48,
          passed: 48,
          failed: 0,
          per_file: {
            'tests/unit/coordination/adam-singleton.test.js': 29,
            'tests/unit/coordinator/adam-reply-target-integrity.test.js': 10,
            'tests/unit/coordinator-ack-adam-reply-ordering.test.js': 9
          }
        },
        measured_blast_radius_12_files: {
          derivation: 'grep -rln for drainAdamOutbound|retargetStaleAdamInbound|resolveAdamSessionIds|registerAdam|inbound-backlog-watchdog|ADAM_EXCLUDED_KINDS across tests/ and scripts/*.test.js',
          test_files: 12,
          tests_total: 163,
          passed: 163,
          failed: 0,
          files: [
            'scripts/adam-register.test.js',
            'tests/static-guards/drain-set-registry-readers.test.js',
            'tests/unit/adam-inbox-surface-not-stamp.test.js',
            'tests/unit/adam/inbound-backlog-watchdog.test.js',
            'tests/unit/adam/inbound-backlog.test.js',
            'tests/unit/coordination/adam-singleton.test.js',
            'tests/unit/coordination/adam-solomon-lane-probe.test.js',
            'tests/unit/coordinator-ack-adam-reply-ordering.test.js',
            'tests/unit/coordinator/adam-reply-target-integrity.test.js',
            'tests/unit/escalation/aggregate.test.js',
            'tests/unit/fleet/drain-sets-adam-excluded-kinds.test.js',
            'tests/unit/sourcing-engine/adam-direct-registry.test.js'
          ]
        },
        environment_repair_required_before_baseline: 'worktree node_modules/@rolldown/binding-win32-x64-msvc/rolldown-binding.win32-x64-msvc.node was TRUNCATED (6,616,064 bytes vs 24,350,208 in the main repo); vitest failed at startup with ERR_DLOPEN_FAILED "not a valid Win32 application". Repaired by copying the intact binary from the main repo. Worktree-local install defect, not a code defect.'
      },
      filter_blind_double_inventory: {
        'tests/unit/coordinator/adam-reply-target-integrity.test.js:17': 'makeSb — methods {select,gte,filter,eq,is,order,range,update,maybeSingle,then}; NO .or(); all filters no-op; only .update(patch) is recorded',
        'tests/unit/coordination/adam-singleton.test.js:40': 'stub — {select,gte,filter,order,range}; all no-op',
        'tests/unit/coordination/adam-singleton.test.js:153': 'regStub — top-level {select,eq,gte,filter,order,range,maybeSingle,insert,update}; NO .in() at top level (only on the update sub-chain); all filters no-op',
        'tests/unit/coordination/adam-singleton.test.js:298': 'inline sb for the drainAdamOutbound describe — {update,in,is,gte,select}; select() resolves a Promise DIRECTLY so a select-first chain TypeErrors',
        'scripts/adam-register.test.js:41': 'stub — {select,eq,filter,order,range,maybeSingle,update,insert}; NO .in()/.is()/.gte()/.or()',
        'tests/unit/adam/inbound-backlog-watchdog.test.js:61': 'fakeSupabase — HAS .eq/.in/.is/.or but ALL are no-ops; range() and then() both return the adamIds fixture verbatim regardless of any role filter'
      },
      predicted_deliberate_breakages: {
        count_estimate: '8-9 of 163',
        must_stay_green: '~154',
        detail: [
          'adam-singleton.test.js:294-315 drainAdamOutbound describe (2 tests) — select-first chain TypeErrors on the inline sb; also pins the single-bulk-update patch shape FR-3 replaces',
          'adam-singleton.test.js:232-260 registerAdam drained/drainSelect assertions (2 tests) — regStub top-level chain has no .in()',
          'adam-reply-target-integrity.test.js:79-108 FR-2 retargetStaleAdamInbound describe (4 tests) — makeSb has no .or(); plus the retired-seat gate returns 0 for the "stale" fixture',
          'scripts/adam-register.test.js stub (:41) — no .in()/.is()/.gte()/.or() once the register path calls resolveRetiredAdamSeats + the select-first drain'
        ],
        deliberate_keeper: 'adam-reply-target-integrity.test.js:102-107 (patch is ONLY {target_session}) SURVIVES under the PRD as written; it would break only if the T-9 provenance recommendation is adopted, in which case it must be updated deliberately with a comment.',
        anti_pattern_warning: 'NEVER repair one of these by adding a no-op method to the old stub — that restores the exact filter-blindness this SD exists to remove.'
      },
      test_double_required_capability_matrix: {
        filters: ['eq', 'is (null-aware)', 'in', 'gte', 'or (PostgREST filter-string grammar)'],
        also_required_but_absent_from_PRD: ['select(columns)', 'order()', 'range(from,to) with short-page-exit', 'JSON-path accessors metadata->>role and payload->>kind', 'update(patch).eq().is().select("id") returning ONLY genuinely-affected rows', 'stateful writes so idempotency (TS-4) is not vacuous', 'tolerate payload === null without throwing'],
        or_grammar_forms_needed: ['payload->>kind.is.null', 'payload->>kind.not.in.(canary_request,comms_check,ack,coordinator_ack,cross_party_ping)'],
        fail_mode_directive: 'THROW on any unrecognised filter expression; never pass rows through. Precedent: tests/unit/qf-claim-cas.test.js makeFakeSupabase.'
      },
      reuse_survey: {
        reusable_filtering_double_exists: false,
        blessed_shared_helper_is_a_noop: 'tests/helpers/supabase-chain-mock.js createSupabaseChainMock() — every method vi.fn(() => chain), thenable resolves a fixed {data,error}; ZERO filtering',
        other_noop_shared_helpers: ['tests/factories/validator-context-factory.js createMockSupabase()', 'tests/fixtures/stage-worker-io-recorder.js makeRecordingSupabase()', 'tests/unit/foresight/workflow/test-helpers.js createMockSupabase()'],
        lift_from: {
          'tests/unit/worker-checkin-ranked-window.test.js:25 (makeStub)': 'BEST filter engine — real eq/neq/is/in/gte/lte/gt/lt via preds[] applied at read time, AND real "->>" handling in getCol(). Its .or() (:97) and .range() are deliberate no-ops — do not inherit those.',
          'tests/unit/chairman/sms-outbound-reconcile.test.js:39-120': 'ONLY genuine PostgREST .or() string parser applied to rows in this repo, plus real not(col,"in","(a,b)") list parsing, on both select and update paths. No "->>", no range.',
          'tests/unit/roadmap/plan-check-uncapped-pagination.test.js (makeRangeAwareSupabase)': 'BEST .order().range(f,t) semantics incl. a honorRange:false PostgREST 1000-row cap mode.',
          'tests/unit/adam/adam-coordinator-health.test.js:48 (makeFakeSupabase)': 'Already combines "->>" jsonbPath eq + not(col,op,val) + cap modelling, and lives in the SAME adam test directory.',
          'scripts/three-way-comms-drill.mjs:88 (makeMemoryDb)': 'Only EXPORTED double combining "->>" with .order().range(), but hard-wired to session_coordination + claude_sessions and eq-only.'
        },
        note_on_fetch_all_paginated: 'tests/unit/db/fetch-all-paginated.test.js makeRelation implements ONLY .range(from,to) with no filter methods, by design (fetchAllPaginated takes an already-filtered relation factory). Pagination is exercised there; filtering is not.',
        single_representation_recommendation: 'Build ONCE as an exported helper (e.g. tests/helpers/filtering-supabase-mock.js). This SD touches SIX doubles across FIVE files, and the repo already maintains a near-identical engine in copy-pasted triplicate across worker-checkin-ranked/newest/fleet-critical-window.'
      },
      test_scenario_gaps: {
        'missing_zero_local_retirements_register': 'catches T-4 (the if (retired.length) guard). NOT covered by TS-2 or TS-7.',
        'missing_multiple_retired_seats_one_call': 'TS-2/TS-7 imply it but nothing pins oldSessionIds.length > 1 or byKind aggregating ACROSS seats.',
        'missing_payload_kind_absent_and_payload_null': 'HIGHEST-VALUE gap. The .or() is null-tolerant precisely because a bare NOT IN silently drops kind-less rows (per the comment at coordinator-hourly-review.cjs:620). TS-3 covers only the 5 named kinds, so a bare .not.in() regression passes everything.',
        'missing_TR5_concurrent_update_race': 'TR-5 is a NAMED technical requirement with ZERO scenarios. Without it, .eq("id",row.id) alone passes every test.',
        'missing_resolver_error_fail_closed': 'resolveRetiredAdamSeats erroring must not read as "no retired seats, proceed" NOR as "everything is retired". Both movers must move 0 and surface the error.',
        'underspecified_TS6_stale_but_not_yet_retired': 'FR-4 fail-closed gate genuinely NARROWS recovery for an Adam that went stale by heartbeat but has not been retired. Deliberate, defensible, currently untested and undocumented.',
        'underspecified_TS4_idempotency_vacuous': 'Passes trivially unless the double persists the first run target_session mutation.',
        'missing_AC10_static_guard': 'AC-10 is phrased as a grep, not an executable assertion. Home already exists: tests/static-guards/drain-set-registry-readers.test.js.'
      },
      prd_defects_found: [
        'FR-6 misattributes makeSb to tests/unit/coordination/adam-singleton.test.js (actual: tests/unit/coordinator/adam-reply-target-integrity.test.js:17) and calls it "shared" (it is inline and per-file). Substantive filter-blindness claim CONFIRMED.',
        'FR-2 omits the if (retired.length) guard removal, making FR-2 a no-op on the common register path.',
        'FR-6 scope omits tests/unit/adam/inbound-backlog-watchdog.test.js, leaving TS-8/AC-13 false-green.',
        'implementation_approach.steps[0] and risks[3] assume ACK_TTL_DAYS is exported; FR-3 and TR-4 explicitly forbid it. FR-3/TR-4 are normative.',
        'FR-3 leaves the short-circuit return shape ({moved:0} vs {moved:0,byKind:{}}) unspecified.',
        'AC-5/FR-3 stamp provenance only on the SAFE mover; FR-4 carries the only HIGH-severity risk with no breadcrumb.'
      ],
      source_verification: {
        'scripts/adam-advisory.cjs drainAdamOutbound': 'confirmed verbatim: .update({target_session:newSessionId}).in("target_session",olds).is("read_at",null).gte("created_at", now-24h).select("id") — single bulk update',
        'scripts/adam-register.cjs drain call site': 'confirmed: `if (retired.length) { const d = await drainAdamOutbound(supabase,{newSessionId:sessionId, oldSessionIds:retired}); drained = (d && d.moved) || 0; }` — the guard FR-2 does not address',
        'lib/coordinator/adam-identity.cjs retargetStaleAdamInbound': 'confirmed verbatim: .update({target_session:liveAdam}).eq("target_session",staleOriginator).eq("sender_type","coordinator").is("acknowledged_at",null).select("id")',
        'lib/fleet/worker-status.cjs ADAM_EXCLUDED_KINDS': "confirmed Object.freeze(['canary_request','comms_check','ack','coordinator_ack','cross_party_ping']) — 5 entries",
        'scripts/coordinator-hourly-review.cjs:622': "confirmed the reference .or('payload->>kind.is.null,payload->>kind.not.in.(' + ADAM_EXCLUDED_KINDS.join(',') + ')') with the comment above it warning a bare NOT IN would silently drop kind-less rows",
        'lib/retention/session-coordination-ack-convergence.js:21': 'confirmed `const ACK_TTL_DAYS = 14;` — NOT exported, ESM module',
        'lib/adam/inbound-backlog-watchdog.js resolveAdamSessionIds': 'confirmed .eq("metadata->>role","adam") inside fetchAllPaginated, docstring promises "EVERY historical role=adam session id"'
      }
    },
    phase: 'PLAN-TO-EXEC',
    validation_mode: 'prospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { name: 'Enhanced QA Engineering Director (testing-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN-TO-EXEC' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  created_at:', stored.created_at);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
