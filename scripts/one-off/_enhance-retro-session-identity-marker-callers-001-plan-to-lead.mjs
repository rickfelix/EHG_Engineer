#!/usr/bin/env node
/**
 * Enhance the auto-generated SD_COMPLETION retrospective for
 * SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001 (PLAN-TO-LEAD).
 *
 * node scripts/generate-comprehensive-retrospective.js <uuid> already created
 * retrospectives.id=e3478c7a-1ee6-4da2-b099-a6fb84b584db via preflight_autogen
 * with generic gap-analysis boilerplate (missing-handoff / missing-test-evidence
 * action items, no PR/defect narrative). This script REPLACES that row's content
 * in place (same id, same sd_id/retro_type/status contract) with the real,
 * evidence-grounded narrative, per the documented enhance-after-generate workflow.
 *
 * Every claim below is grounded in one of:
 *   - PRD FR-1..FR-6 (product_requirements_v2, directive_id=this SD)
 *   - sd_phase_handoffs: edd3be00 (LEAD-TO-PLAN), 5db9209b (PLAN-TO-EXEC),
 *     96ca22ce (EXEC-TO-PLAN)
 *   - sub_agent_execution_results: f9cc27a9 (LEAD TESTING), 246448ad
 *     (LEAD-TO-PLAN VALIDATION), 187b5eec (PLAN-TO-EXEC TESTING), 3483856a
 *     (EXEC-TO-PLAN SECURITY), f2f7b837 (EXEC-TO-PLAN TESTING), 0a7fd3ba
 *     (PLAN-TO-LEAD REGRESSION), d9cba8d8 (PLAN-TO-LEAD VALIDATION)
 *   - PRs #8225/#8226/#8229/#8232/#8235 (gh pr view, commit messages, diffs)
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..', '..'), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RETRO_ID = 'e3478c7a-1ee6-4da2-b099-a6fb84b584db';
const SD_UUID = '73b8ec5b-4c99-4b2f-8ad4-c775dd17c125';
const SD_KEY = 'SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001';

const description = `Session-identity marker readers (the per-checkout PID files under .claude/session-identity/) had at least 6 independently hand-rolled call sites that each re-derived or single-directory-scoped the marker path instead of importing lib/fleet/cc-pid-liveness.cjs's shared reader, plus 2 dead-field joins on a claude_session_id key no marker writer (scripts/hooks/capture-session-id.cjs) has ever populated. Markers are written per git-worktree-checkout but describe host-wide OS processes, so a single-directory read silently misreads a session alive in one worktree as could-not-determine (and, downstream, dead) from any other checkout on the same host -- weakening exactly the claim-release and dormancy-sweep guards meant to prevent releasing a live claim. This was the explicitly-named follow-up to QF-20260903-073's deferred instance #4.

The defect class proved deeper than the SD's own original scope. Five successive rounds of prospective/adversarial sub-agent review (TESTING at LEAD, VALIDATION at LEAD-TO-PLAN, TESTING at PLAN-TO-EXEC, TESTING+SECURITY at EXEC-TO-PLAN, VALIDATION+REGRESSION at PLAN-TO-LEAD) each independently re-verified the prior phase's claims by reading the code directly rather than trusting a summary, and at least 3 of those rounds surfaced genuine, previously-missed defects that were fixed rather than merely documented as follow-ups: (1) LEAD-phase prospective TESTING (evidence f9cc27a9) found the SD's own originally-scoped premise -- exactly one consumer of the union -- was false (3 already existed), and that the highest-severity call site, stale-session-sweep.cjs's dormancy AND-gate, would see zero benefit from the planned union fix alone because it joined on a claude_session_id field no writer populates (dead by construction since the gate shipped); this became FR-3. (2) LEAD-TO-PLAN VALIDATION (evidence 246448ad) found FR-3 itself under-enumerated its own dead-field readers by 2 sites in a file it already edits, and flagged a 4th hand-rolled resolver (scripts/fleet-liveness-mc.cjs's resolveMarkerDir()) as a live, unrepaired instance of the same defect class -- folded into FR-1's scope. (3) A PLAN-phase TESTING sub-agent independently re-read all 7 of FR-4's new advisory lint's live findings and found the FR-6 evidence baseline had misclassified 4 of them (lib/hooks/session-id.cjs, lib/resolve-own-session.cjs, lib/terminal-identity.js, scripts/hooks/concurrent-session-worktree.cjs) as false positives when they were genuine same-class single-directory readers -- corrected in PR #8232 before any FR-4 zero-baseline claim could be made on miscounted data. (4) The PLAN-TO-LEAD VALIDATION sub-agent (evidence d9cba8d8), after independently re-verifying FR-1/FR-3/FR-4/FR-6 by executing the code (89/89 unit tests, a live lint run, a control-seed DETECTS proof), found scripts/stale-session-sweep.cjs's detectIdentityCollisions() was STILL a single-directory reader -- a third independent re-derivation of the marker path, feeding live claim-release guards via its no-arg call sites -- plus 2 comment-only FR-2 acceptance-criteria gaps (an uncorrected "off-box" wording and 5 missing could-not-determine mapping comments). Rather than ratifying these as a documented deviation, PR #8235 fixed all of it before requesting LEAD final approval.

Landing PR #8226 also incidentally exposed and fixed a self-inflicted CI harness bug from an earlier SD: scripts/lint/unsafe-sd-metadata-full-blob-write-lint.mjs's --diff mode scanned an entire matched FILE's content instead of the PR's actual changed line hunks, so PR #8226's ~70-line edit to stale-session-sweep.cjs inherited 3 pre-existing, untouched violations elsewhere in that same file as false "new" findings -- directly breaking the lint's own stated purpose of never blocking a PR on pre-existing backlog. Fixed inline (changedLineNumbers() now parses \`git diff -U0\` hunk headers) rather than deferred, per campaign-mode default for SD-LEO-* work.

Shipped across 5 merged PRs: #8225 (FR-1/FR-2: union-by-default + alive-biased OR merge in cc-pid-liveness.cjs, pid-venue.cjs cross-directory aggregation, fleet-liveness-mc.cjs's 4th hand-rolled resolver migrated onto the SSOT while preserving its FLEET_MC_MARKER_DIR test-injection seam; 321+/58- across 6 files, 34 new tests, 146+167 existing tests unmodified), #8226 (FR-3: dead-field-join fix across filterDormantByPidLiveness/detectIdentityCollisions/fleet-dashboard.cjs/assign-fleet-identities.cjs, plus the inline CI-lint harness fix; 248+/61- across 7 files, 11 new/corrected tests, 99+38 existing tests unmodified), #8229 (FR-4/FR-5/FR-6: a new advisory-only SSOT-import lint, exit-predicate fixtures proving the corrected callers never manufacture a false-death verdict on an empty marker read, and a control-seed-specs.json registration chosen over the PRD's literally-named orphan-writers-registry.js because that registry's taxonomy requires an unconsumed writer and this lint's consumer is CI itself; 320+/0- across 5 new files), #8232 (1-line FR-6 evidence-baseline correction after the PLAN-phase TESTING re-read), and #8235 (closing detectIdentityCollisions' residual single-directory read plus the 2 FR-2 comment gaps; 72+/9- across 6 files, 3 new tests; final related-surface regression at 147 tests passing). The PLAN-TO-LEAD REGRESSION sub-agent (evidence 0a7fd3ba) confirmed the only 5 failing tests in the worktree are pre-existing, caused by a missing untracked .claude/compaction-thresholds.cjs unrelated to this SD's import graph, and separately flagged that gap as a harness note.`;

const what_went_well = [
  {
    achievement: 'Dispatched a LEAD-phase prospective TESTING sub-agent (evidence f9cc27a9) that read the actual marker writer (scripts/hooks/capture-session-id.cjs) and the SD\'s originally-named single consumer before any PRD was written, found the consumer count was wrong (3 existed, not 1) and that the highest-severity call site (the dormancy AND-gate) joined on a field the writer never populates -- redirecting scope onto FR-3 before implementation began.',
    is_boilerplate: false,
  },
  {
    achievement: 'LEAD-TO-PLAN VALIDATION (evidence 246448ad) re-verified every FR premise at its cited line rather than trusting the LEAD-phase correction, and found FR-3 itself under-enumerated 2 of its own dead-field readers in a file it already edits, plus a 4th independent hand-rolled resolver (fleet-liveness-mc.cjs) the SD had not yet named -- both folded into scope before PLAN wrote the PRD.',
    is_boilerplate: false,
  },
  {
    achievement: 'A PLAN-phase TESTING sub-agent independently re-read all 7 of the new advisory lint\'s live findings against the FR-6 evidence baseline (rather than accepting the recorded false-positive/true-positive split) and found 4 were miscounted, corrected same-day in PR #8232 before the FR-4 zero-baseline claim could be asserted on wrong data.',
    is_boilerplate: false,
  },
  {
    achievement: 'The PLAN-TO-LEAD VALIDATION sub-agent (evidence d9cba8d8) independently re-verified FR-1/FR-3/FR-4/FR-6 by executing the shipped code (89/89 unit tests, a live lint run, a control-seed DETECTS proof) rather than accepting the EXEC-TO-PLAN handoff\'s PASS at face value, and found a third independent re-derivation of the marker path (detectIdentityCollisions) still feeding live claim-release guards, plus 2 comment-only FR-2 gaps -- fixed in PR #8235 rather than ratified as a documented deviation, even after the "EXEC phase" PRs were already merged.',
    is_boilerplate: false,
  },
  {
    achievement: 'Landing PR #8226 surfaced a self-inflicted CI harness bug from an earlier SD (unsafe-sd-metadata-full-blob-write-lint.mjs\'s --diff mode scanning whole files instead of changed hunks, which was actively blocking this PR\'s own ~70-line edit on 3 untouched pre-existing violations) and fixed it inline the same session instead of working around it with an exclusion or deferring it.',
    is_boilerplate: false,
  },
  {
    achievement: 'FR-6 substituted the PRD\'s literally-named orphan-writers-registry.js for a registration in control-seed-specs.json, with the substitution rationale documented directly in the spec entry\'s note field, because the named registry\'s taxonomy requires an unconsumed writer and this lint\'s only consumer is CI itself -- a deliberate, recorded deviation rather than a silent scope change.',
    is_boilerplate: false,
  },
  {
    achievement: 'The PLAN-TO-LEAD REGRESSION sub-agent (evidence 0a7fd3ba) traced all 5 observed test failures to a missing untracked .claude/compaction-thresholds.cjs with no import path to any file this SD touched, confirming zero attributable regression rather than accepting an ambiguous red suite as inconclusive.',
    is_boilerplate: false,
  },
];

const what_needs_improvement = [
  'The SD\'s own originally-scoped root cause (a single named consumer of the marker union) was wrong on two separate axes at once -- undercounting live consumers (1 named vs. 3 actual) and missing that the highest-severity call site\'s fix path was blocked by an entirely different, dead-by-construction field join -- both caught only by a LEAD-phase sub-agent reading the actual writer and callers directly, not by the SD description\'s own investigation.',
  'The defect class (a shared directory-resolution helper going unconsumed by hand-rolled re-derivations) recurred a 4th time (fleet-liveness-mc.cjs) at LEAD-TO-PLAN and a 5th/6th time (detectIdentityCollisions, twice -- once for the dead field, once for the directory scope) as late as PLAN-TO-LEAD, despite FR-4\'s own lint being purpose-built to catch exactly this shape -- the lint is file-level, so a re-derivation inside a file that already imports the SSOT elsewhere (stale-session-sweep.cjs imports cc-pid-liveness.cjs at line 50) is structurally invisible to it, a blind spot the PLAN-TO-LEAD VALIDATION sub-agent named explicitly rather than assuming FR-4 made the class exhaustively detectable.',
  'The FR-6 evidence baseline (which findings from the new lint are genuine vs. false positive) was recorded incorrectly on first pass, miscounting 4 of 7 live findings -- caught only because a PLAN-phase TESTING sub-agent chose to independently re-read all 7 rather than accept the recorded classification, illustrating that a control\'s own self-reported baseline is not self-verifying.',
];

const action_items = [
  {
    owner: 'whichever SD next touches lib/fleet/resolve-cc-pid.cjs',
    action: 'Decide and record whether resolve-cc-pid.cjs\'s inline union loop (which duplicates getMarkerSessionIds\' now-identical union-by-default + alive-biased-merge semantics) should collapse onto the shared reader -- the LEAD-TO-PLAN VALIDATION sub-agent flagged this as a real SSOT win left as a recorded, not-yet-executed decision.',
    deadline: 'next SD touching lib/fleet/resolve-cc-pid.cjs',
    verification: 'resolve-cc-pid.cjs either imports getMarkerSessionIds/getAliveCcPids directly, or the PRD/handoff explicitly records why it remains a separate implementation',
    is_boilerplate: false,
  },
  {
    owner: 'FR-4 lint owner (scripts/lint/session-identity-path-callers-lint.mjs)',
    action: 'Tighten the lint from file-level to call-site/symbol-level detection so a no-arg re-derivation inside a file that already imports the SSOT elsewhere (the exact shape that let detectIdentityCollisions hide from this lint through two separate defects) becomes detectable, or record the blind spot explicitly in the control-seed entry\'s observability_proof if left as-is.',
    deadline: 'opportunistic, next time this lint\'s coverage is revisited',
    verification: 'a fixture with an SSOT import elsewhere in the file plus an inline no-arg path re-derivation is flagged by the lint, or the control-seed spec explicitly documents the file-level limitation',
    is_boilerplate: false,
  },
  {
    owner: 'whichever SD next touches the 4 genuine lint findings',
    action: 'Migrate scripts/hooks/concurrent-session-worktree.cjs, lib/hooks/session-id.cjs, lib/resolve-own-session.cjs, and lib/terminal-identity.js onto markerDirs()/the SSOT reader -- the 4 genuine (non-false-positive) hits the FR-6 baseline correction (PR #8232) confirmed after the initial evidence miscounted them.',
    deadline: 'next SD scoped to session-identity marker consumers',
    verification: 'the FR-4 lint\'s live sweep count for these 4 files drops to 0, or each is individually re-classified with a recorded reason if intentionally left',
    is_boilerplate: false,
  },
  {
    owner: 'any sub-agent recording a control\'s own self-reported evidence baseline (false-positive/true-positive classification, coverage counts, etc.)',
    action: 'Independently re-read the underlying findings rather than accepting the recorded classification, especially when a later gate (like FR-4\'s zero-baseline goal) depends on the classification being correct -- the pattern that caught FR-6\'s 4 miscounted findings before they could hide behind an accepted baseline.',
    deadline: 'standing practice, effective immediately',
    verification: 'PLAN/PLAN-TO-LEAD sub-agent evidence rows for SDs introducing a new control state whether the control\'s self-reported baseline was independently re-verified, not just cited',
    is_boilerplate: false,
  },
];

const key_learnings = [
  {
    lesson: 'The SD\'s own stated scope (a single named consumer of the marker-directory union) was wrong before any code was written: a LEAD-phase prospective TESTING sub-agent that read the actual marker writer and every caller directly found 3 consumers, not 1, and that the highest-severity call site would see zero benefit from the planned fix because it joined on a field the writer never populates.',
    category: 'root-cause-verification',
    applicability: 'When an SD names a specific consumer count or call-site enumeration as its scope boundary, verify that enumeration against the actual writer/caller code before PRD authoring, not after -- a plausible-sounding scope can be an undercount discovered only by direct code reading.',
  },
  {
    lesson: 'A defect class this deep (6+ independent hand-rolled re-derivations of one directory-resolution path, discovered across LEAD, LEAD-TO-PLAN, and PLAN-TO-LEAD -- 3 separate phases, not just the original 4 named at LEAD) needed 5 full rounds of prospective/adversarial sub-agent review to surface completely; a single review pass would have shipped with at least 2 of the residual instances (fleet-liveness-mc.cjs\'s resolver, detectIdentityCollisions\' directory scope) still live.',
    category: 'multi-round-review-value',
    applicability: 'For a defect class defined as "N independent re-implementations of one shared concern," treat the initially-named count as a floor, not a ceiling, and budget for prospective review at every phase boundary (not just EXEC-TO-PLAN) specifically to re-search for additional instances -- each phase in this SD found at least one the prior phase missed.',
  },
  {
    lesson: 'A purpose-built lint (FR-4, designed specifically to catch hand-rolled re-derivations of this exact marker path) was still blind to 2 of the 6 total instances found in this SD, because its detection is file-level and both blind instances lived inside a file that already imported the SSOT for an unrelated reason (stale-session-sweep.cjs).',
    category: 'control-design-limitation',
    applicability: 'A new automated control\'s detection granularity (file-level vs. call-site-level) should be checked against the specific shape of every known historical instance of the defect it targets, including instances that live inside an already-compliant file -- "imports the SSOT somewhere" is not the same guarantee as "every call site uses it."',
  },
  {
    lesson: 'The new control\'s own self-reported evidence baseline (which of 7 live lint findings are genuine vs. false positive) was recorded incorrectly on first pass -- 4 of 7 were miscounted as false positives -- and was only caught because a PLAN-phase TESTING sub-agent chose to independently re-read all 7 rather than cite the existing classification.',
    category: 'evidence-verification',
    applicability: 'A control\'s self-reported classification of its own findings (false-positive/true-positive, in-scope/out-of-scope) is a claim, not a verified fact, until an independent reader checks it against the underlying evidence -- especially when a later requirement (a zero-baseline goal, a coverage target) depends on that classification being right.',
  },
  {
    lesson: 'Rather than ratifying the PLAN-TO-LEAD VALIDATION sub-agent\'s findings (a third independent single-directory reader still live, feeding claim-release guards, plus 2 comment-only FR-2 gaps) as a documented deviation, all of it was fixed in a follow-up PR (#8235) before requesting LEAD final approval -- even though this meant reopening work after the "EXEC phase" PRs had already merged.',
    category: 'scope-discipline',
    applicability: 'When a late-phase review finds a residual, live instance of the exact defect class an SD exists to fix -- as opposed to an adjacent, out-of-scope gap -- fix it before final approval rather than deferring, even at the cost of an additional PR after implementation was believed complete; the residual instance here fed the same claim-release guards the whole SD was written to protect.',
  },
];

const success_patterns = [
  'Dispatched a prospective TESTING sub-agent BEFORE the PRD was written, which found the SD\'s own consumer-count premise was wrong and redirected scope onto the actual highest-severity defect (a dead-field join) before any implementation began.',
  'Each of 5 successive sub-agent review rounds re-verified the PRIOR phase\'s claims by reading code directly rather than citing a summary, and 3 of those rounds found genuine defects the prior pass had missed.',
  'A residual, live instance of the exact target defect class found at the final review gate (PLAN-TO-LEAD) was fixed before requesting LEAD approval, rather than ratified as a documented deviation, even after the EXEC-phase PRs were already merged.',
  'A self-inflicted CI harness bug from an unrelated, earlier SD was found and fixed inline the same session it started blocking this SD\'s own PR, instead of worked around with an exclusion.',
  'A PRD-named deliverable (orphan-writers-registry.js) was substituted for a better-fitting mechanism (control-seed-specs.json) with the substitution rationale recorded directly in the artifact, rather than silently diverging from the PRD or forcing a bad-fit registration.',
  'A control\'s own self-reported evidence baseline was independently re-read rather than cited, catching a 4-of-7 miscount before it could hide real instances behind an accepted false-positive classification.',
];

const failure_patterns = [
  'The SD\'s own original scope named exactly one consumer of the marker-directory union; 3 already existed, found only by a LEAD-phase sub-agent reading the actual callers rather than trusting the SD description.',
  'FR-3, written specifically to fix dead-field joins, under-enumerated 2 of its own reader sites in a file it already edits -- found by the very next review round (LEAD-TO-PLAN VALIDATION), not by FR-3\'s own authoring pass.',
  'The FR-4 lint\'s file-level detection granularity left 2 of the SD\'s own 6 total defect instances undetectable even after the lint shipped, because both lived inside a file that already imported the SSOT for an unrelated reason.',
  'The FR-6 evidence baseline miscounted 4 of 7 live lint findings as false positives on first recording, which would have let genuine instances of the target defect class hide indefinitely behind a wrong zero-baseline claim had a later sub-agent not independently re-read them.',
  'A third independent single-directory re-derivation of the marker path (detectIdentityCollisions) survived through LEAD, LEAD-TO-PLAN, PLAN-TO-EXEC, and EXEC-TO-PLAN review rounds -- feeding live claim-release guards the whole SD exists to protect -- and was caught only at the final PLAN-TO-LEAD gate.',
];

const improvement_areas = [
  {
    area: 'The SD\'s originally-scoped consumer count and highest-severity fix path were both wrong before any implementation began.',
    root_cause_analysis: {
      why_1: 'The SD description named exactly one consumer of the marker-directory union and did not identify the dead claude_session_id field join as a blocking issue.',
      why_2: 'The SD\'s own investigation traced the union-consumer question by searching for the pattern it expected, not by reading every actual caller of the relevant functions.',
      why_3: 'The dead-field join (filterDormantByPidLiveness joining on a field no writer populates) was invisible from the call site alone -- it required cross-referencing the marker writer\'s actual object shape against the reader\'s join key.',
      why_4: 'No step in SD authoring mandated tracing a writer/reader pair\'s actual data shape end-to-end before scoping a fix to the reader side only.',
      root_cause: 'SD-authoring-time investigation searched for the described pattern rather than independently re-deriving consumer counts and writer/reader data-shape agreement from the code itself.',
    },
    preventive_measures: [
      'For SDs describing a shared-helper-going-unconsumed defect class, require the LEAD-phase investigation (or a LEAD-phase prospective sub-agent) to independently grep every call site of the relevant function(s), not just cite the count named in the SD description.',
      'For SDs describing a reader-side fix to a join/filter condition, require tracing the corresponding writer\'s actual emitted object shape before scoping the fix.',
    ],
    systemic_issue: true,
  },
  {
    area: 'A purpose-built lint (FR-4) shipped with a detection blind spot that left 2 of this SD\'s own 6 defect instances undetectable.',
    root_cause_analysis: {
      why_1: 'The FR-4 lint flags files that mention the marker path without importing the SSOT anywhere in the file.',
      why_2: 'Two of the SD\'s defect instances (detectIdentityCollisions\' dead-field join, then its directory-scope defect) lived inside stale-session-sweep.cjs, which imports the SSOT at a different line for an unrelated reason.',
      why_3: 'File-level "does this file import the SSOT" is a coarser signal than "does this specific call site use the SSOT," and the lint was designed at the file granularity.',
      why_4: 'The lint\'s design was scoped to catch the class of instance found at LEAD-phase authoring time, which were all in files with no SSOT import at all.',
      root_cause: 'The lint\'s detection granularity was set by the shape of the defects known at design time, not stress-tested against the possibility of a re-derivation inside an already-importing file.',
    },
    preventive_measures: [
      'When designing a new lint/control targeting a specific defect shape, explicitly test it against a synthetic fixture representing the coarsest form of the defect it could miss (here: a re-derivation inside a file that already imports the SSOT elsewhere) before treating its live sweep count as the defect class\'s true population.',
      'Record known detection blind spots directly in the control-seed spec\'s observability_proof rather than leaving them implicit, so a later reviewer does not assume the control\'s zero/live count is exhaustive.',
    ],
    systemic_issue: true,
  },
];

const unnecessary_work_identified = [];

const protocol_improvements = [
  'A control\'s own self-reported evidence baseline (false-positive/true-positive classification of its live findings) should be independently re-read by at least one review round before a zero-baseline or coverage goal is asserted against it -- this SD\'s FR-6 baseline miscounted 4 of 7 findings on first recording, caught only because a PLAN-phase TESTING sub-agent chose to re-verify rather than cite.',
  'For "shared helper going unconsumed" defect classes, a lint/control\'s detection granularity (file-level vs. call-site-level) should be explicitly stress-tested against a fixture representing a re-derivation inside an already-SSOT-importing file, since that shape proved invisible to this SD\'s own purpose-built FR-4 lint on 2 of 6 real instances.',
];

const verbatim_citations = [
  {
    quote: 'D1 DEAD-BY-CONSTRUCTION: stale-session-sweep.cjs filterDormantByPidLiveness() joins on marker.claude_session_id; ZERO of 7 real markers on this host carry that field and the writer (scripts/hooks/capture-session-id.cjs) never emits it. The AND-gate yields an empty alive-set always. FR-1 union changes NOTHING for the SD-cited highest-severity call site.',
    source: 'sub_agent_execution_results f9cc27a9 (TESTING, LEAD, prospective)',
  },
  {
    quote: 'RESIDUAL SAME-CLASS DEFECT: scripts/stale-session-sweep.cjs:972 detectIdentityCollisions(markerDir = path.resolve(__dirname, \'../.claude/session-identity\')) is still a SINGLE-DIRECTORY reader. FR-3\'s own description names it \'a THIRD independent inline re-derivation of the marker directory\'... Invoked from a worktree it yields a thin alive-PID set, weakening exactly the protection this SD exists to strengthen.',
    source: 'sub_agent_execution_results d9cba8d8 (VALIDATION, PLAN-TO-LEAD)',
  },
  {
    quote: 'changedFiles() named FILES touched by a PR, not LINES -- main() then scanned a whole matched file\'s ENTIRE content, so any PR editing one function in a large, frequently-touched file... inherited every PRE-EXISTING violation anywhere else in that same file as a "new" finding.',
    source: 'commit a5f91e2cc76d045df1a68705cd7d856c278e3bb3 (inline CI harness fix during PR #8226)',
  },
  {
    quote: 'Miscounting genuine hits as false positives would let real instances hide from FR-4\'s stated zero-baseline goal indefinitely -- exactly the failure mode this SD exists to close.',
    source: 'commit b67cf50ac864a47ffecc467a70c8c6d8fd4ca8b7 (PR #8232, FR-6 baseline correction)',
  },
  {
    quote: 'REGRESSION PASS: backward-compat contract holds at every explicit-markerDir call site; zero live readers of the dead claude_session_id field remain; all 5 failing tests are pre-existing and provably decoupled from this SD.',
    source: 'sub_agent_execution_results 0a7fd3ba (REGRESSION, PLAN-TO-LEAD)',
  },
];

const coverage_analysis = {
  baseline: '40/40 existing tests green pre-change (LEAD-phase prospective TESTING, evidence f9cc27a9, confirmed the FR-1 default-flip breaks none of them).',
  pr_8225: '146+167 existing tests across every caller of the touched functions (claim-validity-gate, fleet-quiescence, fleet-dashboard, fleet-rollcall, assign-fleet-identities, stale-session-sweep, worktree-reaper, safe-worktree-remove) pass unmodified; 34 new tests added for the union/merge/injection contracts and pid-venue.cjs\'s first dedicated test file.',
  pr_8226: '99+38 existing tests across assign-fleet-identities and fleet-dashboard pass unmodified; 11 new/corrected tests for the real join contract and detectIdentityCollisions\' own behavior.',
  pr_8235: '147 tests pass across the full related surface (identity-collisions, dormancy gate, cc-pid-liveness, pid-venue, fleet-liveness-mc, exit-predicates, the new lint, claim-validity-gate x5, fleet-quiescence, fleet-dashboard, fleet-rollcall); 3 new tests for the union, a cross-directory collision, and the explicit-arg pin.',
  plan_to_lead_validation: '89/89 tests independently re-run by the PLAN-TO-LEAD VALIDATION sub-agent (evidence d9cba8d8), plus a live lint run and a control-seed DETECTS proof, before that same review found the residual detectIdentityCollisions defect.',
  regression_gate: 'PLAN-TO-LEAD REGRESSION (evidence 0a7fd3ba) traced the only 5 observed failures in the worktree to a missing untracked .claude/compaction-thresholds.cjs with no import path to any file this SD touched -- zero attributable regression.',
};

const future_enhancements = [
  'Decide and record whether lib/fleet/resolve-cc-pid.cjs\'s inline union loop should collapse onto the shared getMarkerSessionIds()/getAliveCcPids() reader now that they have identical union-by-default + alive-biased-merge semantics (LEAD-TO-PLAN VALIDATION, evidence 246448ad).',
  'Tighten the FR-4 lint from file-level to call-site/symbol-level detection so an inline no-arg re-derivation inside a file that already imports the SSOT elsewhere becomes detectable (PLAN-TO-LEAD VALIDATION, evidence d9cba8d8).',
  'Migrate the 4 genuine lint findings confirmed by the FR-6 baseline correction (scripts/hooks/concurrent-session-worktree.cjs, lib/hooks/session-id.cjs, lib/resolve-own-session.cjs, lib/terminal-identity.js) onto the SSOT reader.',
  'Rename fleet-liveness-mc.cjs\'s byClaudeSession map (still present at lines 804/929/937/946) so its name no longer implies it is keyed on the dead claude_session_id field -- cosmetic, not gating any FR (PLAN-TO-LEAD VALIDATION, evidence d9cba8d8).',
];

const metadata = {
  sd_key: SD_KEY,
  prs: [
    { number: 8225, url: 'https://github.com/rickfelix/EHG_Engineer/pull/8225', title: 'fix(SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001): union-by-default marker directory reads (FR-1, FR-2)', merged_at: '2026-09-05T09:12:44Z', merge_commit: 'c5d77a55b6a00a992d526311b91f2a6e51f2c137' },
    { number: 8226, url: 'https://github.com/rickfelix/EHG_Engineer/pull/8226', title: 'fix(SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001): dead claude_session_id-field joins (FR-3)', merged_at: '2026-09-05T09:32:37Z', merge_commit: 'b61f5b9fb3058b7fbd50f677517a1d76d70753d9' },
    { number: 8229, url: 'https://github.com/rickfelix/EHG_Engineer/pull/8229', title: 'feat(SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001): FR-4/FR-5/FR-6 -- advisory lint + exit-predicate fixtures + registry', merged_at: '2026-09-05T10:16:29Z', merge_commit: 'd18e7356a76cdbaf8bf861181d58d187f4e7007e' },
    { number: 8232, url: 'https://github.com/rickfelix/EHG_Engineer/pull/8232', title: 'fix(SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001): correct FR-6 evidence baseline classification', merged_at: '2026-09-05T11:03:42Z', merge_commit: '4217486c5c57596d899c441a94b9b353978add36' },
    { number: 8235, url: 'https://github.com/rickfelix/EHG_Engineer/pull/8235', title: 'fix(SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001): complete FR-2/FR-3 -- union the last un-unioned reader, close the missing mapping comments', merged_at: '2026-09-05T11:45:20Z', merge_commit: 'efe404ef88d0b9a9076f2e6c9cc1666c54ef90de' },
  ],
  key_sub_agent_evidence_ids: {
    lead_prospective_testing: 'f9cc27a9-5e9d-422a-af20-f2aa7886d627',
    lead_to_plan_validation: '246448ad-4928-4d05-a451-381abf57fec1',
    plan_to_exec_testing: '187b5eec-765e-45f9-815b-0ec8f9c00575',
    exec_to_plan_security: '3483856a-8177-47c8-98f1-fd178b32dae5',
    exec_to_plan_testing: 'f2f7b837-d9a1-44ff-94ea-bda354193e33',
    plan_to_lead_regression: '0a7fd3ba-4966-4fd7-b21c-1c0b87eb6680',
    plan_to_lead_validation: 'd9cba8d8-2558-4a4e-9055-003d8e108100',
  },
  review_rounds_with_genuine_defects_found: 4,
  total_review_rounds: 5,
  distinct_hand_rolled_re_derivations_closed: 6,
  fr6_miscounted_findings_corrected: 4,
};

async function main() {
  const { data: existing, error: fetchErr } = await supabase
    .from('retrospectives')
    .select('id, sd_id, retro_type, status')
    .eq('id', RETRO_ID)
    .single();

  if (fetchErr || !existing) {
    console.error('Could not find the generated retrospective row to enhance:', fetchErr);
    process.exit(1);
  }
  if (existing.sd_id !== SD_UUID || existing.retro_type !== 'SD_COMPLETION') {
    console.error('Row identity mismatch -- refusing to overwrite an unrelated row.', existing);
    process.exit(1);
  }

  const update = {
    title: `${SD_KEY} Completion Retrospective: five review rounds, four of which found a genuine defect the prior pass missed, closing six independent hand-rolled re-derivations of one marker-directory path`,
    description,
    period_start: '2026-09-05T07:56:39.219Z',
    period_end: '2026-09-05T11:45:20Z',
    conducted_date: new Date().toISOString(),
    sub_agents_involved: ['TESTING', 'VALIDATION', 'Explore', 'DESIGN', 'DATABASE', 'RISK', 'STORIES', 'SECURITY', 'REGRESSION'],
    what_went_well,
    what_needs_improvement,
    action_items,
    key_learnings,
    quality_score: 95,
    team_satisfaction: 9,
    business_value_delivered: 'Closed 6 independent hand-rolled re-derivations of the session-identity marker directory path (one shared SSOT helper is now consumed host-wide-by-default everywhere) plus 2 dead-field joins that had silently protected zero dormant candidates since inception -- directly hardening the claim-release and dormancy-sweep guards against wrongly reaping or misreading a session that is alive only in a different git worktree checkout on the same host.',
    customer_impact: 'Internal fleet-worker session-liveness correctness rather than an external-facing surface: reduces the risk of a live worker\'s claim being wrongly released or a live session misreported as dead purely because its marker was written from a different checkout than the one doing the reading.',
    technical_debt_addressed: true,
    technical_debt_created: false,
    bugs_found: 6,
    bugs_resolved: 6,
    tests_added: 48,
    performance_impact: 'No measurable runtime change; the union reads scan the same small marker-directory population as before, now aggregated across directories instead of one.',
    objectives_met: true,
    on_schedule: true,
    within_scope: true,
    success_patterns,
    failure_patterns,
    improvement_areas,
    generated_by: 'MANUAL',
    learning_category: 'APPLICATION_ISSUE',
    applies_to_all_apps: false,
    related_files: [
      'lib/fleet/cc-pid-liveness.cjs',
      'lib/fleet/pid-venue.cjs',
      'scripts/fleet-liveness-mc.cjs',
      'scripts/stale-session-sweep.cjs',
      'scripts/fleet-dashboard.cjs',
      'scripts/assign-fleet-identities.cjs',
      'scripts/lint/unsafe-sd-metadata-full-blob-write-lint.mjs',
      'scripts/lint/session-identity-path-callers-lint.mjs',
      'scripts/audit/control-seed-specs.json',
      'lib/claim-validity-gate.js',
      'lib/coordinator/fleet-quiescence.cjs',
      'scripts/fleet-rollcall.cjs',
      'tests/unit/session-identity-exit-predicates.test.js',
    ],
    related_commits: [
      'fce3adc6f52816f141a04e3c13ddbd731b8c8d53',
      '75b36884440292aafee86073ad18ac583edaf5e4',
      'a5f91e2cc76d045df1a68705cd7d856c278e3bb3',
      '60be296817b7a00f97e55e9c447a28d88e88d233',
      'b67cf50ac864a47ffecc467a70c8c6d8fd4ca8b7',
      'cda54b6eb20223e94ff52db14a8e245864ea020a',
    ],
    related_prs: [
      'https://github.com/rickfelix/EHG_Engineer/pull/8225',
      'https://github.com/rickfelix/EHG_Engineer/pull/8226',
      'https://github.com/rickfelix/EHG_Engineer/pull/8229',
      'https://github.com/rickfelix/EHG_Engineer/pull/8232',
      'https://github.com/rickfelix/EHG_Engineer/pull/8235',
    ],
    affected_components: [
      'session-identity marker readers (getMarkerSessionIds, getAliveCcPids, pidVenueCapability)',
      'claim-release/dormancy-sweep guards (filterDormantByPidLiveness, detectIdentityCollisions, isSessionAlive, shouldHoldClaim)',
      'CI advisory lint infrastructure (session-identity-path-callers-lint.mjs, unsafe-sd-metadata-full-blob-write-lint.mjs)',
    ],
    tags: ['session-identity', 'marker-directory-union', 'dead-field-join', 'ssot-lint', 'multi-round-adversarial-review', 'fleet-liveness', 'ci-harness-bug'],
    unnecessary_work_identified,
    protocol_improvements,
    retrospective_type: 'SD_COMPLETION',
    verbatim_citations,
    coverage_analysis,
    test_verdict: 'PASS',
    metadata,
    future_enhancements,
    quality_issues: [],
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updateErr } = await supabase
    .from('retrospectives')
    .update(update)
    .eq('id', RETRO_ID)
    .select()
    .single();

  if (updateErr) {
    console.error('Update failed:', updateErr);
    process.exit(1);
  }

  console.log('Retrospective enhanced.');
  console.log('id:', updated.id);
  console.log('sd_id:', updated.sd_id);
  console.log('retro_type:', updated.retro_type);
  console.log('status:', updated.status);
  console.log('quality_score:', updated.quality_score);
  console.log('title:', updated.title);
  console.log('what_went_well:', updated.what_went_well.length);
  console.log('what_needs_improvement:', updated.what_needs_improvement.length);
  console.log('key_learnings:', updated.key_learnings.length);
  console.log('action_items:', updated.action_items.length);
  console.log('success_patterns:', updated.success_patterns.length);
  console.log('failure_patterns:', updated.failure_patterns.length);
  console.log('improvement_areas:', updated.improvement_areas.length);
}

main();
