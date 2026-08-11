// SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001 — TESTING sub-agent evidence writer (PLAN-TO-EXEC phase).
// Prospective test-plan validation (FR-1..FR-4 / TS-1..TS-6) BEFORE EXEC writes code.
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001';
const PHASE = 'PLAN-TO-EXEC';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary:
    'Prospective validation of the FR-1..FR-4 / TS-1..TS-6 test plan against measured repo state. The CORE DESIGN IS ' +
    'SOUND and its central premise is CONFIRMED: the prefix-collision harm FR-1 exists to prevent is real and live — ' +
    'SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001 (the parent the PRD names) has ZERO end-anchored merge subjects but FIVE ' +
    'merge subjects containing its key as a substring, so today\'s unanchored fallback.js shape would report the parent ' +
    'landed off its children. The ratified 98.3% is also reproducible: 118/120 naive and 117/120 end-anchored over the ' +
    '120 most-recent completed SDs with a completion_date, with exactly the 2/120 false-negative tail the PRD names. ' +
    'SIX BLOCKING GAPS were found. (1) POPULATION MISMATCH, most serious: the 98.3% was measured over completed SDs in ' +
    'strategic_directives_v2 (P1), but FR-2 wires the leg to computePlanCheckStatus done[] (P2). Measured overlap of P1 ' +
    'and P2 is ZERO of 20 keys — fully disjoint populations. Landed rate on the population actually wired is 70.0% ' +
    '(14/20 at a 30-day window), not 98.3%, and the LIVE 48h default window returns done.length===0, so leg1 ships ' +
    'unavailable and measures nothing on day one. (2) TS-3 is UNDER-SPECIFIED: the stated acceptance criterion names ' +
    'only the hyphen case (-001 vs -001-B), but 103 real key pairs collide with NO hyphen (SD-...-001 vs SD-...-001A) ' +
    'and 6 collide on a dot (SD-UNIFIED-PATH-1.1 vs 1.1.1); an anchor guarding only the hyphen admits all 109. ' +
    '(3) TS-4 as written is a RITUAL, NOT A TEST — "proven RED-then-fixed during authoring" leaves no executable ' +
    'artifact, so the population regression it is meant to prevent would not be caught by CI. (4) TS-5 omits the ' +
    'formula\'s edge cases: denominator===0 is the LIVE case today, done[] contains duplicate sd_keys (measured: 21 rows ' +
    'to 20 unique keys), sd_key is nullable, and a fractional points.value reaches the chairman SMS unrounded and ' +
    'un-formatted as "Drive 1.3333333333333333/6" into an APPEND-ONLY jsonb column that cannot be corrected by UPDATE. ' +
    '(5) NO TEST BINDS THE FIXTURE FIELD NAME TO THE REAL PRODUCER: done[] rows expose sd_key (not ' +
    'promoted_to_sd_key); a hand-written fixture agreeing with a mis-coded accessor is two green endpoints proving ' +
    'nothing, and the failure mode is a silent MEASURED FALSE ZERO — the exact harm LEG1-001 was built to prevent. ' +
    '(6) TR-3 IS STALE: the LEG2-001 sibling is no longer "uncommitted, not pushed" — PR #6953 is OPEN and pushed, and ' +
    'it makes buildGather() THROW without new required readLeg2Cohort/nowMs injections, a semantic break that survives ' +
    'a clean textual merge.',
  issues: [
    {
      severity: 'critical',
      title: 'FR-2 population mismatch: the ratified 98.3% describes a population disjoint from the one being wired',
      detail:
        'The chairman ratified on "118/120 = 98.3% earnable". That was measured over P1 = the 120 most-recent completed ' +
        'SDs in strategic_directives_v2 (reproduced exactly: naive 118/120, end-anchored 117/120, 2/120 tail). FR-2 wires ' +
        'leg1 to P2 = computePlanCheckStatus done[], which is roadmap_wave_items with a non-null promoted_to_sd_key whose ' +
        'linked SD is completed within windowHours. Measured overlap |P1 intersect P2| = 0 of 20. End-anchored landed rate ' +
        'on P2 = 14/20 = 70.0% at a 30-day window. At the LIVE default 48h window done.length === 0, so the leg is ' +
        'unavailable and measures nothing at ship. The earnability justification does not describe the shipped leg.',
    },
    {
      severity: 'high',
      title: 'TS-3 anchor spec admits 109 measured real collisions it does not name',
      detail:
        'FR-1 AC names only the hyphen shape. Measured over 5608 unique sd_key values: 1583 pairs collide via hyphen ' +
        '(-001 vs -001-B), 103 collide with NO separator (SD-LEO-INFRA-CONTEXT-AWARE-LLM-001 vs -001A, ' +
        'SD-HARDENING-V2-001 vs -001A), 244 collide letter-then-digit (-001-A vs -001-A1), 6 collide on a dot ' +
        '(SD-UNIFIED-PATH-1.1 vs 1.1.1), 1 collides digit-then-digit (stage-arch-remediation-001-p1 vs -p10). Measured ' +
        'sd_key charset is exactly [-.0123456789@A-Z_a-z]. An anchor that only rejects a following hyphen admits the ' +
        'other 109. The prompt hypothesis SD-X-001 vs SD-X-0012 is REFUTED for SD-prefixed keys (zero such pairs) but ' +
        'CONFIRMED in the general key population (1 pair) and costs nothing to guard.',
    },
    {
      severity: 'high',
      title: 'TS-4 population regression guard is an authoring ritual, not a durable executable test',
      detail:
        'FR-3 AC-2 requires the guard be "proven RED-then-fixed during authoring, not merely asserted". A transient ' +
        'authoring step leaves no artifact in CI, so the regression it exists to prevent (swapping back to ' +
        'open_items_all, the definitionally-not-landed set) would ship silently. The guard must be a DISCRIMINATING ' +
        'FIXTURE whose two candidate populations yield DIFFERENT scores, so the assertion can only pass under the ' +
        'correct one — the same discipline the existing gitDouble already uses by modelling the forbidden primitive.',
    },
    {
      severity: 'high',
      title: 'No test binds the fixture field name to the real producer — silent false-zero path',
      detail:
        'lib/roadmap/plan-check-status.js:231-237 builds done[] rows as { item_id, title, wave, sd_key, completed_at }, ' +
        'where sd_key carries item.promoted_to_sd_key\'s VALUE. Reading d.promoted_to_sd_key off a done[] row returns ' +
        'undefined. If EXEC codes the wrong accessor, every key is undefined, the predicate returns false for all, ' +
        'landedCount === 0, and leg1 emits a MEASURED FALSE ZERO. Hand-written fixtures cannot catch this: the fixture ' +
        'author writes whatever field the code reads, and both are wrong together. That file\'s own header documents this ' +
        'exact rename as the bug that "silently broke all three consumers".',
    },
    {
      severity: 'high',
      title: 'Fractional points.value reaches the chairman unrounded and is permanently un-correctable',
      detail:
        'Nothing in the chain rounds or formats. scripts/drive-report-sms.mjs:129 interpolates `Drive ${score}/${possible}` ' +
        'and scripts/hooks/session-role-orient.cjs:151 injects the same string into Adam\'s seat context. A 2/3 landed rate ' +
        'renders as "Drive 1.3333333333333333/6", 42 chars, under the 320-char cap, so no guard trips. ' +
        'database/migrations/20260803_drive_reports.sql:207-209 makes drive_score APPEND-ONLY (UPDATE raises, DELETE ' +
        'guarded), so a bad first day stays in the trend forever. Zero existing tests exercise a non-integer score.',
    },
    {
      severity: 'high',
      title: 'TR-3 is stale — the LEG2-001 collision is now a pushed PR with a semantic break',
      detail:
        'TR-3 says LEG2-001 has "uncommitted (not yet pushed)" edits. Measured: commit e8274169506 is pushed and PR #6953 ' +
        'is OPEN against main, touching both scripts/cron/drive-report-sweep.mjs and tests/unit/cron/drive-report-sweep.test.js. ' +
        'It adds a mandatory-injection throw to buildGather() requiring readLeg2Cohort (function) and nowMs (finite ' +
        'number). Any LEG1 test built against today\'s 4-arg buildGather shape will THROW at construction once #6953 ' +
        'lands — a break that survives a clean textual merge and is invisible to LEG1 today. LEG2 also duplicates the ' +
        'leg-set identity pin in a new describe block LEG1 cannot currently see.',
    },
    {
      severity: 'medium',
      title: 'TS-5 formula edge cases unspecified: denominator 0, duplicates, null keys, landedCount>denominator',
      detail:
        'denominator===0 is the LIVE case (done.length===0 at the 48h default) and must route to unavailable, never to ' +
        '0/0=NaN. done[] contains DUPLICATE sd_keys — measured 21 rows to 20 unique keys at a 30-day window ' +
        '(SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-B twice) — so counting landed over unique keys while taking the ' +
        'denominator over rows silently understates the score. sd_key is nullable and null rows must be excluded from ' +
        'the denominator (mirroring the old leg\'s no-branch exclusion) rather than counted as failures.',
    },
    {
      severity: 'medium',
      title: 'FR-4 amends the module header but leaves the contradicting doctrine in the OLD test file',
      detail:
        'FR-4 requires leg1-landed.test.js stay byte-unchanged. Line 75 of that file asserts with the message "partial ' +
        'landing is not landing — the leg is all-or-nothing" — the exact doctrine the live leg now reverses. The sharper ' +
        'stale-narration risk is the test\'s assertion message, not the module header FR-4 does cover. Also ' +
        'aggregate.js:71-75 bakes "at 2 points each" into the PERSISTED predicate string, which stops being true of leg1.',
    },
    {
      severity: 'low',
      title: 'Dormant c4-rederivation rule structurally forbids a proportional cite carrying row_ids',
      detail:
        'tests/unit/drive-loop/c4-rederivation.test.js:299-309 asserts any numeric cited value published alongside ' +
        'row_ids must equal row_ids.length. A proportional leg1 points cite with row_ids would violate it (1.333 !== 2). ' +
        'Dormant today (the walker is section-scoped, never runs over drive_score), and leg2-uptake.js:115-126 already ' +
        'sets the same precedent — but it is the one existing rule in the repo that forbids this shape.',
    },
  ],
  recommendations: [
    'FR-1 anchor: define KEY_CHAR = [A-Za-z0-9._@-] from the MEASURED sd_key charset and require a non-KEY_CHAR (or ' +
      'line boundary) on BOTH sides. Export the pattern builder as a named export and pin it double-free, exactly as ' +
      'ancestryArgs() is pinned at leg1-landed.test.js:103-105. Escape the key before interpolation (keys contain dots).',
    'FR-2: re-measure the landed rate on the population actually wired (computePlanCheckStatus done[]) and correct the ' +
      'PRD executive summary; surface the 70%-vs-98.3% delta and the empty live window to the chairman before ship.',
    'FR-3 TS-4: replace the authoring ritual with a discriminating fixture where done[] and open_items_all yield ' +
      'different scores, plus a named exported population selector so the choice is inspectable.',
    'Add a CONTRACT test binding the fixture shape to the real producer: import computePlanCheckStatus\'s done[] row ' +
      'builder (or assert Object.keys of a real row) so a field rename reds the suite.',
    'Round/format the score at the render seam (drive-report-sms.mjs formatBody) and add a fractional-score fixture; ' +
      'bump compose-report.js SCHEMA_VERSION since the leg1 points semantics change.',
    'Rebase onto origin/main AFTER PR #6953 merges before touching the legs array or the test fixtures.',
  ],
  metadata: {
    validation_mode: 'prospective_pre_implementation',
    prd_path: '.prd-payloads/PRD-SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001.json',
    merge_corpus_size: 3776,
    unique_sd_keys_measured: 5608,
    sd_key_charset: '-.0123456789@A-Z_a-z',
    collision_hyphen_pairs: 1583,
    collision_no_separator_pairs: 103,
    collision_letter_digit_pairs: 244,
    collision_dot_pairs: 6,
    collision_digit_digit_pairs: 1,
    named_case_verified: 'SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001: 0 end-anchored merges, 5 substring merges',
    ratified_claim_p1_naive: '118/120 (98.3%)',
    ratified_claim_p1_end_anchored: '117/120 (97.5%)',
    wired_population_p2_end_anchored: '14/20 (70.0%) @720h',
    wired_population_p2_live_48h: 'done.length === 0',
    population_overlap_p1_p2: 0,
    done_rows_vs_unique_keys: '21 rows / 20 unique keys',
    done_field_name: 'sd_key (NOT promoted_to_sd_key)',
    leg2_sibling_status: 'PR #6953 OPEN and pushed (TR-3 says uncommitted — stale)',
    leg2_semantic_break: 'buildGather() throws without readLeg2Cohort + nowMs',
    ts_coverage: { 'TS-1': 'specified', 'TS-2': 'specified', 'TS-3': 'under-specified', 'TS-4': 'not-durable', 'TS-5': 'incomplete', 'TS-6': 'specified' },
  },
  execution_time_ms: 1320000,
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
console.log('STORED_PHASE=' + (stored?.phase || PHASE));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
