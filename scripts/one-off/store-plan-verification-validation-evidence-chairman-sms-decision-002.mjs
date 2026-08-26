// SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 -- PLAN_VERIFICATION VALIDATION (Principal Systems
// Analyst) evidence. Independent PRD-fidelity review at commit 9e3e9d8955d: do the shipped code
// and tests genuinely satisfy what the PRD's 7 FRs and their acceptance criteria actually promise,
// end to end? Every claim below was independently measured by this agent (live DB queries, direct
// execution of the release path at fixed clocks, a two-sided falsification of the schema lint, a
// live CLI invocation, and a full re-run of the 10 SD-scoped test files) -- not re-read from the
// prior TESTING/SECURITY evidence rows.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002';
const PHASE = 'PLAN_VERIFICATION';
const HEAD = '9e3e9d8955d';

const results = {
  verdict: 'CONCERNS',
  confidence: 90,
  summary:
    "PRD fidelity review of all 7 FRs against the shipped code and tests at commit 9e3e9d8955d. PRODUCTION CODE IS SOUND: all 7 FRs are substantively delivered and the four-fix chain (FR-1 consult_row_id -> FR-2 clock -> FR-3 reply fields -> FR-4 skipCompose) is genuinely wired as one coherent flow, which I verified hop-by-hop rather than by composition of test names -- presend-consult-lane.cjs:105-118 requests {select:'id',single:true} and returns consultRowId; should-consult-solomon.js:379 explicitly forwards it on the isChairmanTargeted hold-and-surface arm (correctly, since the generic envelope handler at :336-340 reads only correlationId/pending); chairman-sms-gate/index.js:481 writes it to the hold row. I independently verified the PRD's own load-bearing assumption that lib/coordinator/dispatch.cjs's insertCoordinationRow already supports opts.select/opts.single and returns {data,error} -- it does (dispatch.cjs:978-1280), so FR-1's readback is real, not folklore. FR-5 verified LIVE end-to-end: `node scripts/adam-chairman-decision.mjs --dry-run ... --decision-id not-a-uuid` exits 1 with the actionable message, before the dry-run branch, with no DB write. FR-3's three columns are confirmed present in the live schema (information_schema query: reply_instruction/reply_id/no_reply_consequence, all text NULL) alongside consult_row_id -- the migration is applied, so the hold-path insert cannot PGRST204 in production. FR-6's void is honest: I re-verified all four provenance claims in the one-off script against the live DB myself -- chairman_decisions 9e5aac51 returns 0 rows, chairman_notifications for that decision returns 0 rows, session_coordination 657f01de exists with sender_type='solomon' and a body beginning 'VERDICT: SEND' carrying correlation ef7d9ce3, and correlation 20efff9b matches 0 session_coordination rows anywhere (body or payload). All four true. Both target rows are now status='abandoned' with metadata.void_reason/voided_by/voided_at set. Notably, 20efff9b having zero rows means that hold's consult insert never landed at all -- a live specimen of exactly the FR-1 defect, corroborating that this SD fixed an observed failure, not a theoretical one. Full suite re-run at HEAD: 10 files / 114 tests, all green (544ms). FOUR FINDINGS, ONE HIGH. V-1 (HIGH, demonstrated, must-fix before merge): tests/unit/adam/chairman-held-send-release-real-gate.test.js passes `context: { now: Date.now() }` into the REAL rubric, whose quiet_hours check is BLOCKING (lint.js:166, add('quiet_hours', !quiet, true, ...)). I ran that exact release path at three fixed epochs through the real gate: 10:00 ET -> action='released', sent=1; 23:00 ET -> action='dispatch_not_sent_unclaimed', sent=0, blockedReasons=['quiet_hours: within 22:00-06:00 ET quiet window']; 05:00 ET -> identical. So the file's first test ('passes the real lint with ZERO blocking findings') will FAIL on any CI run between 22:00 and 06:00 America/New_York, and its second test (the negative control) will stay GREEN in that window for the WRONG reason -- it asserts only {sent:false, held:true, reason:'blocked'} without checking blockedReasons, so during quiet hours it passes on quiet_hours and proves nothing about FR-3 at all. This is precisely the flake class FR-2's own AC-2 named and forbade ('injects a FIXED epoch (never Date.now() / a real clock, to avoid flaking inside the 22:00-06:00 ET quiet-hours window)') -- the SD committed the defect class its own PRD wrote down. Fix is ~3 lines: two fixed daytime epochs plus a blockedReasons assertion on the negative control. Both prior reviews cite running this file; both ran inside the daytime green window, which is why neither saw it. V-2 (MEDIUM): FR-1's regression guard is missing its load-bearing assertion. The test literally titled 'requests select:id/single:true on the insert' (presend-consult-lane.test.js:147) captures opts into __opts and never asserts on it, and the only other opts assertion in the file (:81) is toMatchObject({targetRoleHint:'solomon'}), a subset match. Every mock ignores opts, so dropping select/single would leave production returning {data:null} (no RETURNING clause) -> consult_row_id null on every hold forever -> FR-1 silently regressed with the whole suite green, detectable only by FR-6's 15-minute-cadence orphan line. One-line fix. V-3 (MEDIUM): FR-7 AC-3 overstates its guard. I falsified the lint two-sidedly: a bogus column injected into the sweep's .select('id, decision_id, ... consult_row_id, claimed_at') IS caught ('missing chairman_held_sends.bogus_col_probe (select)', exit 1) -- so removing the allowlist entry delivered real column-level coverage for consult_row_id -- but a bogus key injected into the hold-path .insert({...}) object literal is NOT caught (exit 0, 0 violations): the extractor does not read insert-object keys. The three FR-3 columns appear in code ONLY as insert-object keys and as heldRow.<prop> reads, and the sweep's row read is .select('*'), so NOTHING lints them. AC-3's literal claim is unmet; residual risk is low because the columns are confirmed live and the migration static test guards the SQL text. Snapshot itself is current: re-running npm run schema:snapshot:lint changed only generated_at. V-4 (LOW): FR-6's 'retried_and_still_held' (attempts > 0) now fires for rows deferred purely by the nightly quiet-hours block -- with FR-2's clock live, a verdict-carrying held row present at 22:00 ET burns ~32 failed dispatch attempts overnight (4 ticks/hr x 8h), each incrementing attempts and overwriting last_error, with the orphan line emitted every tick. Bounded and self-clearing at 06:00, but it is an alarm that fires on designed behavior. Two smaller AC-fidelity notes, neither blocking: FR-2 AC-2 is met only by composition (the fixed-epoch test at sweep level stubs releaseHeldSend so evaluate() never runs; the real-evaluate test uses a real clock), and FR-4 AC-2 ('1600-char length check verified against the non-doubled body') is weakly met -- the real length check does run against the exact asserted wire body, but at ~230 chars, where a doubled body would also pass, so no test discriminates at the boundary. VERDICT CONCERNS, not FAIL: nothing here indicates a production defect, and no scope creep was found (every changed file maps to a named FR); V-1 is a test-integrity defect that will red CI for ~8 hours of every day and should be fixed before merge.",
  findings: [
    {
      id: 'V-1-real-gate-test-real-clock-quiet-hours-flake',
      severity: 'high',
      note: "tests/unit/adam/chairman-held-send-release-real-gate.test.js:120,150 pass context:{now:Date.now()} into the REAL rubric. quiet_hours is a BLOCKING lint check (lib/comms/adam-outbound/rubric-engine/lint.js:166). MEASURED by running the same release path at fixed epochs: 10:00 ET -> released/sent=1; 23:00 ET and 05:00 ET -> dispatch_not_sent_unclaimed/sent=0/blockedReasons=['quiet_hours: within 22:00-06:00 ET quiet window']. Test 1 fails nightly 22:00-06:00 ET; test 2 (negative control) stays green in that window for the wrong reason since it never asserts blockedReasons, hollowing out the only proof the rubric still enforces the FR-3 fields. Violates FR-2 AC-2's explicit 'never Date.now() / a real clock' instruction. Fix: two fixed daytime epochs + a blockedReasons assertion (~3 lines).",
    },
    {
      id: 'V-2-fr1-select-single-opts-never-asserted',
      severity: 'medium',
      note: "tests/unit/adam/presend-consult-lane.test.js:147 is titled 'requests select:id/single:true on the insert' but captures opts into __opts and never asserts it; the file's only opts assertion (:81) is toMatchObject({targetRoleHint:'solomon'}), a subset match that ignores select/single. Dropping those opts makes production's insertCoordinationRow return {data:null} (no RETURNING), so consult_row_id would be null on every hold forever with the entire suite green. One-line fix: expect(opts).toMatchObject({ select: 'id', single: true }).",
    },
    {
      id: 'V-3-fr7-ac3-lint-does-not-cover-insert-object-keys',
      severity: 'medium',
      note: "FR-7 AC-3 claims schema:snapshot:lint 'verifies the new FR-3 columns'. Falsified two-sidedly: a bogus column in the sweep's .select(...) IS caught (exit 1, names chairman_held_sends.bogus_col_probe) -- genuine new coverage for consult_row_id -- but a bogus key in the gate's .insert({...}) object literal is NOT caught (exit 0). reply_instruction/reply_id/no_reply_consequence appear only as insert keys and heldRow.<prop> reads, and the sweep's row read is .select('*'), so no lint verifies them. Residual risk LOW (columns confirmed present in live information_schema; the migration static test guards the SQL). Claim should be narrowed or a select-side reference added.",
    },
    {
      id: 'V-4-orphan-detector-fires-on-designed-quiet-hours-deferral',
      severity: 'low',
      note: "With FR-2's clock live, a verdict-carrying held row present during 22:00-06:00 ET is rubric-blocked on quiet_hours every 15-minute tick, unclaimed back to 'held' with attempts+=1 and last_error overwritten (~32/night). FR-6's detectOrphanedHeldSends then flags 'retried_and_still_held' every tick for behaviour that is correct by design. Bounded and self-clearing at 06:00, but it is an alarm firing on the normal state of the world -- the pattern this repo's own allowlist notes warn about. Consider excluding quiet-hours-blocked last_error from the attempts>0 signal.",
    },
    {
      id: 'V-5-fr2-ac2-and-fr4-ac2-met-only-by-composition',
      severity: 'low',
      note: "FR-2 AC-2 (fixed epoch through merged releaseDeps.context confirming evaluate() reaches quiet-hours rather than throwing gate_unavailable) is satisfied by two tests neither of which does both: the fixed-epoch sweep test stubs releaseHeldSend so evaluate() never runs, and the real-evaluate test uses a real clock. FR-4 AC-2 (1600-char length check against the non-doubled body) is weakly met: the real length check does run against the exact byte-asserted wire body, but at ~230 chars, where a doubled body would also pass -- no test discriminates at the boundary. Neither blocking.",
    },
    {
      id: 'V-6-fr6-void-provenance-independently-confirmed',
      severity: 'info',
      note: "All four provenance claims in scripts/one-off/void-stranded-chairman-held-sends-decision-002.mjs re-verified by me against the live DB: chairman_decisions 9e5aac51 -> 0 rows; chairman_notifications decision_id=9e5aac51 -> 0 rows; session_coordination 657f01de -> exists, sender_type='solomon', body begins 'VERDICT: SEND', payload correlation_id=ef7d9ce3; correlation 20efff9b -> 0 rows anywhere (body or payload). Both target rows now status='abandoned' with metadata.void_reason set. 20efff9b's zero rows means that hold's consult insert never landed -- a live specimen of the FR-1 defect itself.",
    },
    {
      id: 'V-7-no-scope-creep-no-duplication',
      severity: 'info',
      note: "Every changed file maps to a named FR; no feature was delivered outside the approved 7. No duplicate implementation found -- FR-4's skipCompose is the only composition-idempotence guard in the gate, and the FR-6 detector deliberately complements (does not duplicate) v_chairman_held_sends_unreconcilable, which is blind to consult_row_id, attempts and status='releasing'. One artifact note: the FR-7 snapshot refresh also absorbed unrelated live drift (chairman_ratifications, ventures.stage_write_token, +2 tables/+1 view/+14 checks) -- expected for a snapshot regeneration, not scope creep, but it means the diff carries schema state this SD did not author.",
    },
  ],
  metadata: {
    reviewed_commit: HEAD,
    frs_reviewed: 7,
    frs_substantively_delivered: 7,
    acceptance_criteria_unmet_literally: ['FR-7 AC-3', 'FR-2 AC-2 (composition only)', 'FR-4 AC-2 (no boundary case)'],
    tests_run: { files: 10, tests: 114, passed: 114, duration_ms: 544 },
    independent_measurements: [
      'live information_schema query on chairman_held_sends (33 columns, FR-3 trio present)',
      'live row query on both void targets + full status census',
      'live provenance re-verification of all 4 void-script claims (chairman_decisions, chairman_notifications, session_coordination x2)',
      'direct execution of releaseHeldSend + real sendChairmanSMS + real rubric at 3 fixed epochs (10:00/23:00/05:00 ET)',
      'live CLI run of adam-chairman-decision.mjs with a non-UUID decision-id (exit 1 confirmed)',
      'two-sided falsification of schema:lint (bogus select column caught; bogus insert key not caught)',
      'schema:snapshot:lint re-run (only generated_at changed -> committed snapshot is current)',
      'npx vitest run over the 10 SD-scoped test files',
    ],
    must_fix_before_merge: ['V-1'],
    prior_evidence_rows_reviewed_not_repeated: 4,
  },
  execution_time_ms: 2700000,
};

const resolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'VALIDATION', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('VALIDATION', SD_ID, { name: 'Principal Systems Analyst' }, results, { phase: PHASE });
console.log('VALIDATION_PLAN_VERIFICATION_STORED_ID=' + (stored?.id || 'n/a'));
console.log('VERDICT=' + results.verdict + ' CONFIDENCE=' + results.confidence);
console.log('REPO_RESOLVED=' + JSON.stringify(results.metadata?.repo_path || resolution?.repoPath || 'n/a'));
