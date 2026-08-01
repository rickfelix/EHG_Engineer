require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_UUID = '2ab54391-695f-4eaf-9b9a-514a2435d059';
const SD_KEY = 'SD-FDBK-INFRA-SOLOMON-SCORECARD-MEASURES-001';

(async () => {
  const row = {
    sd_id: SD_UUID,
    target_application: 'EHG_Engineer',
    learning_category: 'APPLICATION_ISSUE',
    retro_type: 'SD_COMPLETION',
    title: 'SD-FDBK-INFRA-SOLOMON-SCORECARD-MEASURES-001 — the one dimension Solomon\'s scorecard never measured was the one that breached, and the brief that ordered the fix was wrong about two of its three named causes',
    description: 'Solomon\'s self-scorecard recorded D3 (silence/cost-discipline) as unmeasured — "no quota_breach_count signal" — and D3 was the ONLY unmeasured dimension AND the only one that actually breached: 193 sends against an assumed cap of 150 on 2026-07-29, self-caught by Solomon, chairman-accepted by SMS same day (decision row fd4f657e). The chairman-accepted brief named three fixes; live verification at LEAD found it wrong about two of them. FIX 1 was framed as "a live send-path gate needing its return shape changed" — checkConsultQuota (scripts/solomon-advisory.cjs) actually had ZERO PRODUCTION CALL SITES: written, exported, unit-tested, never invoked. The 193-send breach happened because nobody asked the gate, not because it answered wrongly. I made this exact misdiagnosis myself on first pass (inferred "live" from the export without tracing callers) and corrected it on the record after VALIDATION (1012d2d0) and Explore both independently traced the real call graph. FIX 2 (the "dishonest headline") was ALREADY SHIPPED — commit 27f9938e5ee7 landed the coverage-honest headline on 2026-07-28, three days before this SD was created; the brief quoted the shipped fix\'s own output string as the defect. Only a coverage FLOOR was genuinely missing. FIX 3 (category drift: contract mandates solomon_adherence_drift, loop wrote solomon_self_adherence) stood as described. The coordinator ruled five open questions before PLAN wrote FRs: measurement-only, never a clamp (the code default SOLOMON_PER_DAY_MAX=20 vs real traffic 193 vs the narrative\'s assumed 150 is a ~10x unratified spread — a capacity decision for Adam/chairman, not this SD); FIX 2 narrowed to the floor; the floor is a SOFT-FLAG (a gate that can break the tick manufactures pressure to bypass it, and a bypassed gate still looks enforcing); the 16 (later found to be 17) pre-existing rows are backfilled but stamped legibly, never rewritten silently; relay-class sends are counted but not clamped. Seven FRs shipped across 8 commits same calendar day (2026-07-31): FR-1 wired checkConsultQuota into the shared send/request path in measurement-only mode, and added an `available` flag after TESTING found both fail-open branches returned a bare {allowed:true} byte-identical to a genuine quiet day, making FR-2\'s three-state contract literally unsatisfiable as originally scoped. FR-2 gave D3 a real number; the first live run reported quota_breach_count=26. FR-3 added the coverage floor as a soft-flag without touching the already-shipped, already-pinned headline. FR-4 renamed the loop\'s category to match the contract and backfilled 17 rows (population moved between planning and execution) with legible rename markers. FR-5 built net-new contract-parity category checking. FR-6 removed a startup prompt telling Solomon its quota was "enforced" when it was not. FR-7 escaped a literal NUL byte in scripts/solomon-advisory.cjs with digest-proven-unchanged hashes. EXEC-TO-PLAN review (TESTING, CONDITIONAL_PASS 74%) found and the same-day follow-up commit (860fb9a0f97) fixed two real defects: FR-3\'s shared role-self-score.cjs change broke tests/unit/adam/self-assessment.test.js\'s golden snapshot outside the suites I had chosen to run, and FR-5\'s categoryParityMismatches silently discarded its own `ambiguous` claims array, printing a green line while a second real contract mandate went unverified. 133 tests green across twelve suites at final state; the full unit project (`--project unit`) showed 15 failures across 7 files at EXEC-TO-PLAN time, all confirmed pre-existing on main via a clean pre-SD worktree comparison — re-running the identical command during this retrospective (hours later) shows 16 failures across 8 files, a plausible drift from other sessions committing to main in between, illustrating that a "pre-existing, unrelated" baseline needs a pinned commit reference to stay checkable. Handoff quality scores: LEAD-TO-PLAN 94, PLAN-TO-EXEC 94, EXEC-TO-PLAN 90. SECURITY PASS (92% confidence). Currently in PLAN_VERIFICATION (80% progress), preparing PLAN-TO-LEAD.',
    affected_components: [
      'scripts/solomon-advisory.cjs',
      'scripts/solomon-self-assessment-writer.cjs',
      'lib/governance/role-self-score.cjs',
      'scripts/solomon-self-adherence-review.mjs',
      'scripts/solomon-startup-check.mjs',
      'scripts/one-off/backfill-solomon-adherence-category.mjs'
    ],
    related_files: [
      'scripts/solomon-advisory.cjs',
      'scripts/solomon-self-assessment-writer.cjs',
      'lib/governance/role-self-score.cjs',
      'scripts/solomon-self-adherence-review.mjs',
      'scripts/solomon-startup-check.mjs',
      'scripts/one-off/backfill-solomon-adherence-category.mjs',
      'tests/unit/adam/self-assessment.test.js',
      'tests/unit/solomon-adherence-category-alignment.test.js',
      'tests/unit/solomon-advisory-no-literal-nul.test.js',
      'tests/unit/solomon-category-parity.test.js',
      'tests/unit/solomon-coverage-floor.test.js',
      'tests/unit/solomon-d3-three-state.test.js',
      'tests/unit/solomon-prompt-no-false-assurance.test.js',
      'tests/unit/solomon-quota-measurement.test.js',
      'tests/unit/solomon-self-adherence-review.test.js'
    ],
    related_commits: [
      '54a70cb0a78', '1a62ac54ee1', 'd527aad7e7a', 'c0d35ea1e36',
      '373727d35ae', '51af01c314d', '61aabdc92d0', '860fb9a0f97'
    ],
    related_prs: [],
    agents_involved: ['LEAD', 'PLAN', 'EXEC'],
    sub_agents_involved: ['VALIDATION', 'Explore', 'DESIGN', 'RISK', 'DATABASE', 'STORIES', 'TESTING', 'SECURITY', 'VISION_FIDELITY'],
    human_participants: ['Chairman'],
    what_went_well: [
      'LEAD\'s first-pass verification repeated the sourcing brief\'s core error — inferring checkConsultQuota was a live gate needing a signature change, from seeing it exported, without tracing callers — and then CORRECTED ITSELF ON THE RECORD after VALIDATION (1012d2d0) and Explore both independently traced the real call graph and found zero production call sites. The correction is written into the SD\'s own mechanism_verifications, not silently absorbed into a clean-looking final PRD.',
      'FR-1\'s coordinator ruling kept the fix measurement-only rather than letting a scorecard SD quietly ratify an unvalidated ~10x spread (code default SOLOMON_PER_DAY_MAX=20 vs real 2026-07-29 traffic of 193 vs the breach narrative\'s assumed ceiling of 150) — routing the ceiling decision to Adam/chairman as a separate capacity call, with FR-1\'s own refusal counts supplied as the evidence packet that decision was missing.',
      'FR-2\'s anti-fail-open proof was built by injecting a Supabase client whose .limit() genuinely throws and driving the REAL gatherSignals end-to-end, not by mocking the D3 scorer — proving the writer PRODUCES null on a real signal failure, which a scorer-only mock could never show, and directly closing the same fail-open blindness (checkConsultQuota\'s two byte-identical {allowed:true} branches) that let the original breach go unnoticed for a full day.',
      'FR-3 was deliberately narrowed mid-flight after discovering the "defect" the chairman-accepted brief quoted verbatim was the ALREADY-SHIPPED fix (commit 27f9938e5ee7, landed 2026-07-28, three days before this SD existed) — resisting the pull to rebuild working, tested, pinned code just because the sourcing narrative assumed it still needed building.',
      'FR-4\'s backfill script counted its population AT EXECUTION TIME (17 rows) instead of trusting the PRD\'s planning-time count (16 — the periodic loop wrote another row in between), runs dry-run-by-default and idempotent, and stamps every migrated row with a legible category_rename marker instead of rewriting history invisibly.',
      'The EXEC-TO-PLAN TESTING sub-agent reproduced FR-3\'s regression against a real throwaway pre-SD worktree (not by reasoning about the diff) before certifying it SD-caused, and separately broke FR-5\'s checker three more ways using adversarial synthetic inputs against the real exported function — exactly the ground-truth verification standard this SD\'s own root defect (an unwired, never-asked gate) exists to demand of everything else.',
      'Both EXEC-TO-PLAN findings (the fleet-wide golden-snapshot break, and categoryParityMismatches silently discarding its own ambiguous claims) were fixed in a single same-day follow-up commit before requesting the next handoff, with the golden snapshot UPDATED rather than loosened — preserving the exact guarantee its own comment promised ("so a future field cannot slip in unnoticed").'
    ],
    what_needs_improvement: [
      'The chairman-accepted sourcing brief was wrong about two of its three named fixes: FR-1 was framed as a live gate needing a return-shape change (it had zero call sites — the real defect was that nobody asked the gate at all), and FR-2 quoted an already-shipped headline as the defect. A scorecard SD built to fix Solomon\'s own accountability blind spots inherited its origin from Solomon\'s own self-report without an independent code trace happening before the brief was written.',
      'My own LEAD-phase verification repeated exactly the sourcing brief\'s error before VALIDATION/Explore caught it — "the function is exported" is not evidence anything calls it. This is the mechanism-present/terminal-consumer-absent trap, and it produced BOTH the original 193-send breach AND my first mischaracterization of how to fix it.',
      'FR-5\'s contract-parity checker was wrong twice, and only live falsification — reverting the real constant and watching the real renderer — caught either failure; unit tests were green for all three implementations, because attempt 1 (substring containment) and attempt 2 (case-insensitive CATEGORY= match) both matched my own explanatory comment on a genuinely drifted file. The written tests inherited the same blind spot as the code they were meant to test.',
      'FR-3 changed a fleet-wide shared module (lib/governance/role-self-score.cjs, used by every role\'s scorecard, not just Solomon\'s) and was verified against a self-selected sample ("92 tests across eight suites, 0 regressions") that could not, by construction, contain a failure living outside that sample — tests/unit/adam/self-assessment.test.js\'s golden snapshot broke, and only the TESTING sub-agent running the full unit project found it.',
      'The first attempt at FR-7\'s NUL-byte fix was a silent no-op: shell escaping inside a `node -e` invocation collapsed the backslash and replaced the NUL byte with itself. It read as a completed edit; only comparing the file\'s byte count before and after caught that nothing had actually changed.',
      'FR-5 ships with a known, disclosed limitation: syntactic declaration matching with zero dataflow tracing. TESTING demonstrated three adversarial bypasses against the real exported function (a decoy unused constant, a second live declaration wired to the wrong write target, a correct-then-conditionally-reassigned value) that all still false-PASS. Closing that class needs real dataflow analysis, judged out of proportion to this SD\'s scope, so it is recorded as residual risk rather than silently left implicit.',
      'TESTING also found FR-5\'s categoryParityMismatches silently drops its own `ambiguous` claims array — the live CLAUDE_SOLOMON.md today has a second genuine category mandate the checker never surfaces as either checked or unverified, undercutting FR-5\'s own stated goal ("a check nobody runs is not a guard") recursively. Fixed same day, but the fact it shipped once at all is the lesson worth keeping.'
    ],
    action_items: [
      { text: 'Route the unresolved ~10x spread between checkConsultQuota\'s code default (SOLOMON_PER_DAY_MAX=20), real 2026-07-29 traffic (193 sends), and the breach narrative\'s assumed ceiling (150) to Adam/chairman as an explicit capacity decision — FR-1\'s measurement output (real refusal counts at the live default) is the evidence packet this decision has been missing.', category: 'follow_up_decision' },
      { text: 'Once the ceiling in the item above is ratified, re-verify D3 scores against whatever SOLOMON_PER_DAY_MAX ends up being — D3 already reads the same source of truth the send path enforces against, but that source is still the unresolved code default, not a ratified policy value.', category: 'verification' },
      { text: 'File a follow-up SD/QF to harden FR-5\'s categoryParityMismatches against the three demonstrated adversarial bypasses (decoy constant, wrong-one-wired duplicate, conditional reassignment) — TESTING\'s recommended shallow proximity check (require the matched CATEGORY variable to appear as an argument inside the nearby .insert()/category: call) would close the specific patterns without needing full dataflow analysis.', category: 'technical_debt' },
      { text: 'Add a house-pattern reminder: any change to a role-generic/shared module (the role-self-score.cjs class) requires running the FULL `npm run test:unit` project before claiming "N tests, 0 regressions" — a suite chosen by the change\'s own author cannot, by construction, catch a regression it excludes.', category: 'process_improvement' },
      { text: 'When a chairman-accepted SD brief quotes a specific code string as "the defect", diff that string against the current file BEFORE writing FRs at PLAN, not during EXEC — FR-3\'s brief quoted a fix that had already shipped three days earlier, verbatim, as the problem.', category: 'process_improvement' },
      { text: 'Add a minimal regression-guard test for scripts/one-off/backfill-solomon-adherence-category.mjs\'s dry-run/idempotency logic — TESTING flagged zero direct unit coverage; the specific 2026-07-31 run was independently verified correct at ground truth (0 old-category rows, 20 new, legible rename markers), but a future edit of the script has no automated guard.', category: 'technical_debt' },
      { text: 'Confirm at LEAD-FINAL that FR-1\'s added DB round-trip (checkConsultQuota, now called on every send/request) has not introduced observable latency on Solomon\'s live send path — TESTING flagged the never-resolving-query/hang case as untested (low-likelihood, shared by every DB-backed call in the codebase, but unverified).', category: 'verification' }
    ],
    key_learnings: [
      'mechanism-present/terminal-consumer-absent: a function that is written, exported, and unit-tested can have zero production callers. "It\'s live" must be verified by tracing callers, never inferred from an export statement — this exact trap produced both the 2026-07-29 breach itself (checkConsultQuota existed and nobody asked it) and my own first-pass mischaracterization of how FR-1 needed to be fixed.',
      'Grepping source text for a config value counts the file\'s own documentation as evidence for itself. FR-5\'s checker matched its own explanatory comment on a genuinely drifted file, twice, at two different tightening levels (substring containment, then a case-insensitive assignment-shaped match) — only parsing a real, comment-stripped declaration closed it.',
      'A self-selected test sample cannot contain a failure that lives outside itself, no matter how large it is. "92 tests across eight suites, 0 regressions" was true and irrelevant — the population that mattered was the full unit project, and only running it (not reasoning about blast radius after the fact) surfaced the real regression in a shared module.',
      'Fail-open branches that return output byte-identical to the genuine success path make a gate\'s silence indistinguishable from its health. checkConsultQuota\'s bare {allowed:true} on both a quiet day and a DB error is the SAME defect class this SD exists to fix — FR-2\'s D3 scoring could have silently reintroduced it one layer up (a DB outage reading as perfect cost-discipline) had the three-state contract not been made structurally required before D3 could be built at all.',
      'An honestly-displayed number and an enforced number are different claims that must be verified separately. FR-3\'s coverage headline was already truthful (shipped 2026-07-28) while nothing anywhere consumed the number it displayed — "coverage is shown" and "coverage gates anything" do not imply each other.',
      'A fix that LOOKS correct on re-read is not proof it happened. The first NUL-byte escape attempt was a silent no-op from shell-escaping collapse inside `node -e`; only a before/after byte-count comparison — not re-reading the diff — caught that the byte was never actually changed.',
      'A "pre-existing, unrelated failures" baseline on a shared, fast-moving main branch is a moving target, not a fixed number. The EXEC-TO-PLAN claim ("15 failures across 7 files, all pre-existing") was independently verified via a clean pre-SD worktree at the time it was made; re-running the identical `--project unit` suite during this retrospective, roughly four hours later, returned 16 failures across 8 files — plausible drift from other sessions committing to main in between, not a contradiction. "Zero new regressions" claims need a pinned commit reference to stay checkable later.'
    ],
    quality_score: 88,
    team_satisfaction: 8,
    business_value_delivered: 'Closes the specific blind spot that let a real cost-discipline breach (193 sends against an assumed 150 cap, 2026-07-29) go unmeasured by Solomon\'s own accountability scorecard: D3 now reports a live, three-state, fail-open-safe number (quota_breach_count=26 on the first live run after FR-2 landed) instead of silence. Also removes a materially worse defect than the unwired gate itself — a startup prompt that told Solomon its quota WAS enforced, a plausible contributor to why 193 sends went unnoticed in the first place. Produces the actual refusal-count evidence (measurement-only, no clamp) that Adam/chairman need to rule on Solomon\'s real per-day ceiling, a decision this SD deliberately declined to make unilaterally given the ~10x spread between the code default, real traffic, and the breach narrative.',
    customer_impact: 'Internal fleet-governance/self-monitoring only — no end-user-facing surface. The "customer" is Adam/chairman\'s ability to trust Solomon\'s self-reported scorecard and to make the per-day ceiling decision from real measured data instead of a ~10x-uncertain spread.',
    technical_debt_addressed: true,
    technical_debt_created: true,
    bugs_found: 5,
    bugs_resolved: 5,
    tests_added: 81,
    performance_impact: 'One additional DB round-trip (checkConsultQuota, already try/catch fail-open-wrapped) added to the shared send/request path before every Solomon send/request. TESTING flagged the never-resolving-query/hang case as untested (low-likelihood, shared by every DB-backed call in this codebase); no other latency concerns raised.',
    objectives_met: true,
    on_schedule: true,
    within_scope: true,
    success_patterns: [
      'Live falsification over reasoning-from-diff — D3 fail-open, FR-4 row counts, FR-5 adversarial bypasses, and contract mention counts were all independently re-verified against real DB/code state, not inferred',
      'Self-correction on the record — LEAD\'s own checkConsultQuota misread was corrected before PLAN; both EXEC-TO-PLAN findings were closed same day',
      'Coordinator-ruled scope narrowing over brief-literal scope — FR-2 absorbed once found already-shipped; the per-day ceiling decision was deliberately NOT made unilaterally'
    ],
    failure_patterns: [
      'Mechanism-present/terminal-consumer-absent misread repeated by the fix\'s own author before being independently caught',
      'Checker/test logic inheriting the same blind spot as the code it verifies (FR-5, twice)',
      'A self-selected test sample used to claim "no regressions" on a change to a shared, fleet-wide module',
      'A syntactically-plausible edit (the first NUL-byte fix) that was actually a silent no-op'
    ],
    improvement_areas: [
      'Verify sourcing-brief claims against live code before scoping FRs, not during EXEC',
      'Always run the full unit project (not a chosen subset) after touching a shared/role-generic module',
      'Prove file edits via byte/hash diff, not by re-reading the diff'
    ],
    generated_by: 'MANUAL',
    trigger_event: 'PLAN_TO_LEAD_RETROSPECTIVE_QUALITY_GATE',
    status: 'PUBLISHED',
    tags: ['SD-FDBK-INFRA-SOLOMON-SCORECARD-MEASURES-001', 'solomon', 'scorecard', 'quota', 'fail-open', 'contract-parity', 'self-correction'],
    metadata: {
      sd_key: SD_KEY,
      sd_type: 'infrastructure',
      branch: 'feat/SD-FDBK-INFRA-SOLOMON-SCORECARD-MEASURES-001',
      worktree: 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\.worktrees\\SD-FDBK-INFRA-SOLOMON-SCORECARD-MEASURES-001',
      diff_stats: {
        files_changed: 15,
        new_files: 8,
        modified_files: 7,
        insertions: 1010,
        deletions: 17
      },
      test_results: {
        sd_new_and_touched_suites: { files: 9, tests: 81 },
        full_sd_related_suite_at_final_commit: { files: 12, tests: 133, source: 'commit 860fb9a0f97 message, independently reproduced at retro-authoring time' },
        full_unit_project_at_exec_to_plan: { failures: 15, failing_files: 7, all_pre_existing_on_main: true, verified_via: 'clean pre-SD throwaway worktree diff', source: 'TESTING sub-agent c696d951-794a-4c0e-8589-2955f467726e' },
        full_unit_project_reproduced_at_retro_time: { failures: 16, failing_files: 8, note: 'drifted from the 15/7 EXEC-TO-PLAN figure — expected on a shared, fast-moving main branch; not a contradiction' }
      },
      handoff_quality_scores: {
        'LEAD-TO-PLAN': 94,
        'PLAN-TO-EXEC': 94,
        'EXEC-TO-PLAN': 90
      },
      sub_agent_verdicts: [
        { agent: 'VALIDATION', phase: 'LEAD-TO-PLAN', verdict: 'CONDITIONAL_PASS', confidence: 85 },
        { agent: 'Explore', phase: 'LEAD-TO-PLAN', verdict: 'WARNING', confidence: 95 },
        { agent: 'DESIGN', phase: 'PLAN_PRD', verdict: 'CONDITIONAL_PASS', confidence: 60 },
        { agent: 'RISK', phase: 'PLAN_PRD', verdict: 'PASS', confidence: 85 },
        { agent: 'DATABASE', phase: 'orchestrated', verdict: 'PASS', confidence: 100 },
        { agent: 'STORIES', phase: 'orchestrated', verdict: 'PASS', confidence: 95 },
        { agent: 'TESTING', phase: 'PLAN-TO-EXEC', verdict: 'CONDITIONAL_PASS', confidence: 72 },
        { agent: 'TESTING', phase: 'EXEC-TO-PLAN', verdict: 'CONDITIONAL_PASS', confidence: 74 },
        { agent: 'SECURITY', phase: 'EXEC-TO-PLAN', verdict: 'PASS', confidence: 92 },
        { agent: 'VISION_FIDELITY', phase: 'PLAN_VERIFICATION', verdict: 'PASS', confidence: 100 }
      ],
      origin: {
        breach_date: '2026-07-29',
        breach_sends: 193,
        assumed_cap_in_narrative: 150,
        code_default_cap: 20,
        self_caught_by: 'Solomon',
        chairman_decision_row: 'fd4f657e',
        chairman_approval_channel: 'SMS ("A is the best choice"), ~2026-07-31T13:58Z'
      },
      brief_accuracy_finding: {
        fix_1_as_briefed: 'checkConsultQuota is a live send-path gate needing its return shape changed',
        fix_1_verified: 'checkConsultQuota has ZERO production call sites; the fix is a wiring job, not a signature change',
        fix_2_as_briefed: 'the writer emits a dishonest headline that needs coverage added',
        fix_2_verified: 'ALREADY SHIPPED in commit 27f9938e5ee7 on 2026-07-28, three days before this SD was created; only a coverage floor was genuinely missing',
        fix_3_as_briefed: 'contract mandates solomon_adherence_drift, loop writes solomon_self_adherence',
        fix_3_verified: 'confirmed as briefed, direction settled (loop moves to match the contract)'
      },
      defects_found_and_fixed_during_exec: [
        'FR-5 checker attempt 1 (substring containment) false-passed on its own explanatory comment',
        'FR-5 checker attempt 2 (case-insensitive CATEGORY= match) false-passed on the same comment',
        'FR-3 broke tests/unit/adam/self-assessment.test.js golden snapshot outside the self-selected verification suite',
        'categoryParityMismatches silently discarded its own `ambiguous` claims array, masking an unverified real contract mandate',
        'first FR-7 NUL-byte fix attempt was a silent no-op from shell-escaping collapse inside node -e'
      ],
      fr5_known_limitation: {
        description: 'syntactic declaration matching with no dataflow tracing to the actual .insert()/write call',
        demonstrated_bypasses: [
          'decoy/unused CATEGORY-named constant matching the contract value while a different variable is actually wired',
          'two live CATEGORY-named declarations, only the wrong one wired to the real write',
          'correct value assigned then conditionally reassigned before use'
        ],
        disposition: 'recorded as residual risk (advisory dashboard line, not a runtime gate) rather than hidden; closing it needs real dataflow analysis judged out of proportion to this SD scope'
      }
    }
  };

  const { data, error } = await supabase
    .from('retrospectives')
    .insert(row)
    .select('id, sd_id, retro_type, retrospective_type, quality_score, status, created_at')
    .single();
  if (error) { console.error('INS_ERR:', error); process.exit(1); }
  console.log('INSERTED retro:', JSON.stringify(data, null, 2));
})();
