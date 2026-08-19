// SD-FDBK-ENH-ROUTING-RECOMMENDATION-SURFACES-001 — TESTING evidence writer (EXEC-TO-PLAN).
//
// Counterpart to _testing-plan-to-exec-fdbk-routing-001.mjs. That entry answered "is this PRD
// ready for EXEC"; this one answers "did EXEC actually deliver it, and is the delivery pinned".
//
// METHOD: the suite passing is NOT the evidence here — a green suite is exactly what both
// surviving defects below look like. Every FR's fix was independently MUTATION-TESTED: the
// production change was reverted on disk, the corresponding test re-run, and the file restored
// (disk content re-verified byte-identical to origin/main via git hash-object before and after).
// 8 of 10 mutations were caught; the 2 survivors are the findings.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-FDBK-ENH-ROUTING-RECOMMENDATION-SURFACES-001';
const PHASE = 'EXEC-TO-PLAN';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  summary:
    'Implementation is genuinely complete: all 6 PRD FRs have real, merged code (or doc) changes and the requested ' +
    '11-file suite passes 64/64, with a wider regression sweep of tests/unit/sd-next/ + tests/unit/claim/ green at ' +
    '30 files / 297 tests. Verified against origin/main content, not git log: disk bytes for all 6 changed production ' +
    'files were confirmed identical to origin/main objects via git hash-object (the primary repo checkout is 5 commits ' +
    'behind origin/main, so a naive `git log` read there would have measured the wrong tree). CONDITIONAL, not PASS, ' +
    'because MUTATION TESTING found 2 of 10 reverts that the suite does NOT catch. (1) HIGH -- FR-4 tracks.js: ' +
    'tests/unit/sd-next/tracks-claim-fail-closed.test.js names its fixtures SD-CLAIMED-001/-002, and those sd_keys are ' +
    'echoed into the rendered line the test greps, so `expect(output).toMatch(/CLAIMED/)` is satisfied by the fixture ' +
    'name itself. Reverting tracks.js to the old fail-OPEN chain leaves all 4 tests green. Proven by construction: ' +
    'renaming the fixtures to SD-HELD-001/-002 keeps 4/4 green on real code but makes the mutation FAIL. The two ' +
    'positive assertions -- the only ones that pin the fail-closed direction this FR exists for -- are currently ' +
    'unfalsifiable; the 2 negative controls are load-bearing. Notably this is the exact substring-collision trap the ' +
    'FR-3 test author explicitly defended against in a code comment ("Deliberately does NOT spell CONTINUE in the ' +
    'sd_key"), applied to a sibling file. (2) MEDIUM -- FR-3 fallback-queue.js: deleting claiming_session_id from the ' +
    'SELECT column list leaves all 4 tests green, because the test stub ignores the select() string and hands back ' +
    'hand-built row objects. That revert is a total silent fail-open of FR-3 (undefined column -> isClaimedByOther ' +
    'always false). The FR-5 test in this same SD already demonstrates the cure (a column-PROJECTING stub); it just ' +
    'was not applied to FR-3. Separately, FR-1 -- the only FR that performs a DB write -- has NO behavioral test at ' +
    'all: its coverage in guard-order-and-mismatch-fr7-fr8.test.js is 3 regexes against a source-text slice of ' +
    'resume.cjs, which cannot observe argument order, ctx.helpers wiring, or the swallow-all catch at resume.cjs:94. ' +
    'None of these are correctness defects in shipped behavior -- the code is right -- they are gaps in what the ' +
    'suite would notice if it stopped being right.',
  findings: [
    { id: 'fr4-tracks-assertions-vacuous', severity: 'high', note: 'tests/unit/sd-next/tracks-claim-fail-closed.test.js:39,57 use sd_key fixtures SD-CLAIMED-001 / SD-CLAIMED-002. displaySDItem echoes the sd_key into the rendered line, so the assertions expect(output).toMatch(/CLAIMED/) at :44 and :66 match the fixture NAME, not the CLAIMED badge. Mutation (revert tracks.js:101 to `claimedBySession && currentSession && claimedBySession !== currentSession.session_id`) SURVIVES: 4/4 still pass. Captured rendered output under mutation is "[1]   SD-CLAIMED-001 - Some SD... DRAFT" -- badge gone, regex still matches. Renaming the 2 fixtures to SD-HELD-001/-002 keeps 4/4 green on real code and makes the mutation fail 1/4. Fix is 2 string literals in the test file; no production change needed.' },
    { id: 'fr3-select-column-unpinned', severity: 'medium', note: 'Mutation removing `claiming_session_id, ` from fallback-queue.js:98 SELECT SURVIVES -- 4/4 tests still pass. makeSupabase() in fallback-queue-claim-exclusion.test.js:18-41 has select: () => chain, discarding the column list, and returns fully-populated baseSD objects. A future "drop the unused column" cleanup would silently disable FR-3 entirely (s.claiming_session_id undefined -> isClaimedByOther always false -> fail open) with a green suite. tests/unit/fleet/foreign-session-liveness-columns.test.js:24-40 in this same SD implements the exact remedy (a stub that projects the returned row down to the requested columns).' },
    { id: 'fr1-source-regex-only-no-behavioral-test', severity: 'medium', note: 'FR-1 (resume.cjs:86-90 self-heals claim_mirror_mismatch) is covered only by 3 regexes against `elseBranch`, a raw source-text slice of resume.cjs (guard-order-and-mismatch-fr7-fr8.test.js:22 reads the file with fs.readFileSync). The mismatch path is never executed. This is the one FR that performs a DB write (selfHealStaleClaim) and mutates control flow (ctx.mySd = null). A source-pin cannot detect wrong argument order, selfHealStaleClaim missing from ctx.helpers, or the bare `catch {}` at resume.cjs:94 swallowing the whole block. Recommend one behavioral test driving resume.cjs with a stub sb + ctx.helpers and asserting ctx.mySd === null and ctx.base.self_healed_claim_mismatch set.' },
    { id: 'fr4-pagination-single-page-only', severity: 'low', note: 'Follow-up commit 564a415d256 added fetchAllPaginated to the FR-4 claim query specifically to survive the PostgREST 1000-row cap. selector-claimed-sds-authoritative.test.js:23 stubs .range() to return the same rows for every offset, so only the single-page path is exercised; a >1000-row claimed set is not. Low risk (fetchAllPaginated is shared and separately tested) but the cap-truncation scenario the commit names is not itself pinned. Note the stub DOES incidentally pin that .range() is called at all -- removing pagination breaks the chain and the try/catch swallows it, failing 2/3.' },
    { id: 'fr1-never-throw-coupling-undocumented-at-callsite', severity: 'low', note: 'resume.cjs:87 awaits selfHealStaleClaim INSIDE the bare `catch {}` at :94, and sets ctx.mySd = null AFTER the await. This is safe only because selfHealStaleClaim (worker-checkin.cjs:1482) wraps every DB call in its own try/catch and is documented "Never throws (fail-open)" -- verified. If that contract ever changes, resume.cjs silently resumes a FOREIGN claim, the exact harm FR-1 exists to prevent. Consider nulling ctx.mySd BEFORE the await so the fall-through is independent of the callee contract. Also inherited (not introduced): ctx.base.self_healed_claim_mismatch is set unconditionally even though selfHealStaleClaim fail-opens silently on both writes, so the flag asserts a heal that may not have persisted -- same shape as the pre-existing line 153.' },
    { id: 'verified-good-8-of-10-mutations-caught', severity: 'info', note: 'CAUGHT: FR-2 disable own-claim-first branch (1/4 fail); FR-2 spotlight length>0 -> ===1 (1/4 fail); FR-3 drop both !isClaimedByOther(s) filters (3/4 fail); FR-4 selector drop authoritative set (2/3 fail); FR-4 selector re-add old session.sd_id source (1/3 fail); FR-5 drop the 2 liveness columns (2/3 fail). The FR-5 projecting stub and the FR-2/FR-4-selector tests all drive real production functions (isForeignSessionLive, getWorkingOnSD, SDNextSelector.prototype.loadActiveSessions.call) with genuine negative controls -- these are high-quality, load-bearing tests. FR-6 is a doc FR: docs/protocol/claim-ownership-vs-liveness.md gained 51 lines disclosing 4 deferred items, each with a named Owner and a concrete Next step; substantive, no test applicable.' },
    { id: 'no-regressions', severity: 'info', note: 'Requested 11-file suite: 11 files / 64 tests pass. Wider sweep tests/unit/sd-next/ + tests/unit/claim/: 30 files / 297 tests pass. FR-4 changed the claimedSDs key source from session.sd_id to strategic_directives_v2.sd_key -- both are SD keys, so the Map key space is unchanged and tracks.js:88 lookup (item.sd_key || item.sd_id) stays consistent. No collateral damage found.' },
  ],
  conditions: [
    { action: 'Rename the SD-CLAIMED-001/-002 fixtures in tests/unit/sd-next/tracks-claim-fail-closed.test.js to a collision-free key (e.g. SD-HELD-001/-002) so the two positive /CLAIMED/ assertions stop matching the fixture name and actually pin the FR-4 fail-closed direction. Verified fix: with the rename, real code stays 4/4 green and the fail-open mutation fails.', priority: 'high', blocking: false },
    { action: 'Make the fallback-queue test stub project the returned rows down to the requested SELECT columns (reuse the makeProjectingSupabase pattern from tests/unit/fleet/foreign-session-liveness-columns.test.js) so removing claiming_session_id from the fallback-queue.js SELECT is caught instead of surviving.', priority: 'medium', blocking: false },
    { action: 'Add one behavioral test for FR-1 that actually executes lib/checkin/steps/resume.cjs on the mismatch path (stub sb + ctx.helpers.selfHealStaleClaim spy) and asserts ctx.mySd === null and ctx.base.self_healed_claim_mismatch, replacing reliance on source-text regexes for the only FR that performs a DB write.', priority: 'medium', blocking: false },
  ],
  justification:
    'CONDITIONAL_PASS rather than PASS: all 6 FRs are genuinely implemented and merged, the requested suite is 64/64 ' +
    'green and a 297-test regression sweep is clean, so nothing here blocks the EXEC-TO-PLAN handoff. But mutation ' +
    'testing found 2 of 10 production reverts that the suite fails to catch -- most importantly the FR-4 tracks.js ' +
    'fail-closed fix, whose two positive assertions are satisfied by the test fixture name (SD-CLAIMED-001) rather ' +
    'than by the CLAIMED badge, making them unfalsifiable. Plus FR-1, the only FR that writes to the DB, has no ' +
    'behavioral test at all (source-text regexes only). The shipped behavior is correct; the conditions are about ' +
    'what the suite would notice if it stopped being correct. All three conditions are test-only changes.',
  metadata: {
    method: 'mutation testing (revert-on-disk, re-run, restore) + full-read of all 5 new test files + PRD FR reconciliation',
    mutations_attempted: 10,
    mutations_caught: 8,
    mutations_survived: 2,
    survived: ['FR-3 SELECT claiming_session_id removal', 'FR-4 tracks.js revert to fail-open chain'],
    suites_run: {
      requested_11_file_set: '11 files / 64 tests PASS',
      regression_sweep: 'tests/unit/sd-next/ + tests/unit/claim/ = 30 files / 297 tests PASS',
    },
    content_provenance: 'disk bytes verified identical to origin/main via git hash-object for all 6 changed production files (primary repo checkout was 5 commits behind origin/main; tests executed from the SD worktree at branch tip 564a415d256, which git diff confirms is content-identical to origin/main for every SD-touched path)',
    fr_coverage: {
      'FR-1': 'code YES (resume.cjs:86-90) / test SOURCE-REGEX ONLY / mutation N/A',
      'FR-2': 'code YES / test 4 behavioral / mutation CAUGHT x2',
      'FR-3': 'code YES (select + 2 filters) / test 4 behavioral / mutation PARTIAL (filters caught, SELECT survived)',
      'FR-4-tracks': 'code YES (tracks.js:98-101) / test 4 present but 2 positives VACUOUS / mutation SURVIVED',
      'FR-4-selector': 'code YES / test 3 behavioral / mutation CAUGHT x2',
      'FR-5': 'code YES / test 2 behavioral (projecting stub) + 1 end-anchored source pin / mutation CAUGHT',
      'FR-6': 'doc YES (+51 lines, 4 deferred items w/ owner + next step) / no test applicable',
    },
    no_fr_silently_unimplemented: true,
  },
  execution_time_ms: 1500000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'TESTING',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('TESTING', SD_ID, { name: 'QA Engineering Director' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_REPO=' + (results.metadata?.repo_path || 'n/a'));
