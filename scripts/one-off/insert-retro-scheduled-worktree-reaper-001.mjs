/**
 * SD-COMPLETION retrospective writer for SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001.
 *
 * Uses the CANONICAL writer (lib/sub-agents/retro/db-operations.js storeRetrospective)
 * plus the canonical schema validator and learning-category normalizer. No hand-rolled
 * INSERT.
 *
 * Fresh insert (not enhanceRetrospective on the pre-existing HANDOFF retro) is REQUIRED:
 * the only other retrospectives row for this SD was created 2026-08-08T08:32:08.325Z,
 * ~0.5s BEFORE the LEAD-TO-PLAN acceptance timestamp (08:32:08.833). getFilteredRetrospective
 * (scripts/modules/handoff/retro-filters.js) requires created_at > leadToPlanAcceptedAt, so an
 * in-place enhancement of that row would be invisible to RETROSPECTIVE_QUALITY_GATE.
 */
import { createSupabaseServiceClient } from '../lib/supabase-connection.js';
import { storeRetrospective } from '../../lib/sub-agents/retro/db-operations.js';
import { normalizeLearningCategory } from '../../lib/retro/learning-category.js';

const SD_UUID = '23c2a2d4-89af-4885-b87b-7a5b3c4ded1d';
const SD_KEY = 'SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001';

const retrospective = {
  sd_id: SD_UUID,
  project_name: SD_KEY,
  target_application: 'EHG_Engineer',
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  title: `${SD_KEY} Retrospective — the SD committed its own defect class nineteen times`,
  description:
    'This SD exists because a scheduled worktree reaper stopped silently. The headline of this '
    + 'retrospective is that the WORK ON IT re-created that same condition nineteen times: fixes that '
    + 'shipped silent-stop paths, guards nothing could falsify, and hardening whose own success was the '
    + 'hazard trigger. '
    + 'ROOT CAUSE CORRECTION (recorded because the first two diagnoses were wrong and were refuted by '
    + 'measurement, not by argument): the defect was NOT "the scheduled tick never reaps". It was (1) the '
    + 'reaper executed from a tree that could be stale, and (2) its refusal counter was published but never '
    + 'consumed at the call site — a published gauge no reader reads is indistinguishable from no gauge. '
    + 'DELIVERED: a dedicated self-refreshing source tree with ONE definition shared by spawn and reaper; a '
    + '5-layer guard on that tree (identity, integrity, content, currency, self-protection); 4 distinct '
    + 'operator alarms (refusal streak, never-invoked, scanned-nothing, rebuild churn); reap-protection on '
    + 'both stage-2 routes. '
    + 'PROCESS (MEASURED from sub_agent_execution_results): 8 consecutive EXEC SECURITY FAIL verdicts '
    + '(confidence 82, 90, 92, 93, 95, 94, 96, 96) before a PASS at 95 with open_blocking []. Every refusal '
    + 'was correct. The EXEC session counted nine refusal rounds and the branch carries ten SECURITY '
    + 'evidence-writer artifacts, so review rounds and persisted verdict rows are NOT 1:1 — that gap is '
    + 'itself recorded below. ~30 defects were caught by reviewers explicitly instructed to REFUTE rather '
    + 'than confirm; roughly 3 were self-caught by running the reviewers own checks against my work first. '
    + 'QUALITY SCORE RATIONALE: 92 = strong evidence density (27 sub-agent executions, 3 accepted handoffs '
    + 'at 94/95/87, PRD present, 12 new test files / 91 new test cases including a 17-case real-git suite), '
    + 'discounted for a live-repo escape during testing and for the nineteen self-committed instances of the '
    + 'defect class under review.',
  conducted_date: new Date().toISOString().split('T')[0],
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['SECURITY', 'TESTING', 'DESIGN', 'RISK', 'DATABASE', 'STORIES', 'VALIDATION', 'Explore'],
  human_participants: ['Chairman'],
  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  learning_category: normalizeLearningCategory('PROCESS_IMPROVEMENT'),
  auto_generated: false,
  trigger_event: 'EXEC_TO_PLAN_ACCEPTED',

  what_went_well: [
    'The real root cause was reached by REFUTATION, not confirmation: "the scheduled tick never reaps" was asserted twice and measured false twice. The surviving diagnosis (stale execution tree + a refusal counter published but never consumed at the call site) is the one no measurement could kill.',
    'Reviewers were explicitly instructed to REFUTE rather than confirm, and that instruction did the work: ~30 distinct defects surfaced across the review rounds, several of them classes rather than instances.',
    '8 consecutive EXEC SECURITY FAIL verdicts (82/90/92/93/95/94/96/96) were EVERY ONE CORRECT before the PASS at 95 with open_blocking []. A refusal streak that is all true positives is the cheapest possible outcome for a guard-heavy SD.',
    'Self-review by running the reviewers own checks against my own work BEFORE handing it over caught roughly 3 defects that would otherwise have cost a full round-trip.',
    'ONE definition of the self-refreshing source tree, shared by spawn and reaper, instead of two agreeing implementations — the single-representation invariant held under 4 separate refactors.',
    'Guards whose subject is git were finally tested against REAL GIT: a 17-case real-git suite (tests/unit/fleet/source-tree-identity-realgit.test.js) found violations every fixture had encoded away.',
    'The live-repo escape was contained the same session: cleaned by hand, verified back to 33 worktrees / 0 prunable, root cause fixed with an explicit -C, and the CLASS closed by binding the test runner so no future test can reach the real repository.',
    'Committing within minutes of each edit is what saved the work when a peer sessions mutate/restore window silently reverted an uncommitted edit and left git status reading CLEAN.',
    'Mutation-proving was applied to the DISCRIMINATOR, not just the check: the suite was shown able to tell the CORRECT fix from the BLIND one, which is what a mutation run is actually for.',
    '4 distinct operator alarms shipped (refusal streak consumed at the call site, never-invoked, scanned-nothing-is-not-success, rebuild churn) — the failure that started this SD now has four independent ways to become visible.',
    '12 new test files / 91 new test cases, including anti-gaming pins on the gauge route and a wire test that fails if the scrub is unwired at either production call site.',
  ],

  what_needs_improvement: [
    'NINETEEN times this SD committed the very defect class it exists to fix: silent-stop paths and guards nothing could falsify. The most expensive instance: the fix handed the newly-working reaper its own execution source as a deletion target — the hazard trigger was THE FIX SUCCEEDING.',
    'Two new guards shipped with NO test that would notice them being DISARMED. A guard with no disarm test is a comment.',
    'The identity guard was defeated by a bare mkdir: git rev-parse walks UP, and the source tree sits inside repoRoot, so an empty directory inherited the repos identity.',
    'The next identity guard was defeated by a ~50-byte .git FILE plant that satisfied BOTH checks simultaneously — the two checks were not independent.',
    'The identity guard checked OWNERSHIP but never INTEGRITY: a genuine worktree one commit ahead passed every check.',
    'The integrity guard checked METADATA but never CONTENT: one uncommitted file write, HEAD still equal to origin/main, every check green.',
    'MY OWN HARDENING WOULD HAVE CAUSED THE OUTAGE THIS SD PREVENTS: disabling system/global git config to block core.hooksPath also disabled the credential helper, which kills fetch, which makes the tree stale, which makes the reaper refuse — the exact starvation being fixed.',
    'MY OWN CONTENT CHECK RE-OPENED THE STARVATION: refusing on any stray gitignored artifact (*.log, .env, .worktree.json are all in the real .gitignore) fell back to repoRoot, where the currency check then refused the behind shared root.',
    'I "improved" a brittle-but-effective test into a VACUOUS one and only caught it by re-running the mutation AFTERWARDS. A test refactor is a change to the detector, not to the code under test.',
    'A defence was pinned as a FUNCTION but never as a WIRE: the env scrub could be unwired at BOTH production call sites with 4227 tests green.',
    'SIX reviewer verdicts were carried against a STALE HEAD, because a thorough review takes long enough for HEAD to move underneath it.',
    'A LIVE-REPO ESCAPE: an unbound test runner plus argv carrying no -C ran worktree add / prune against the REAL repository, leaving a stale entry and 2 stray branches.',
    'THREE separate times a fixture could not resolve what production always has — no origin/main, no credential auth, a .gitignore containing only node_modules/ — and each time the fixture passed while production would have failed.',
    'Pre-existing policy was tightened from inside an error handler, so the tightening only ever executed on the failure path where it could not be observed.',
    'A denylist was written over a vendor-extended namespace, which cannot stay complete by construction.',
    'Persisted evidence rows do not match review rounds: 9 SECURITY verdict rows (8 FAIL + 1 PASS) against 10 SECURITY evidence-writer artifacts on the branch. A review round whose verdict never persists is invisible to every gate that reads sub_agent_execution_results.',
    'Found while WRITING this retrospective: two readers of one question. checkExistingRetrospective (lib/sub-agents/retro/db-operations.js) and getFilteredRetrospective (scripts/modules/handoff/retro-filters.js) disagree about which retrospective counts. This SDs pre-existing HANDOFF retro predates LEAD-TO-PLAN acceptance by ~0.5s, so the RETRO sub-agents enhance path would have produced a PUBLISHED SD_COMPLETION row that RETROSPECTIVE_QUALITY_GATE cannot see.',
  ],

  key_learnings: [
    'When a guards SUBJECT is git or the filesystem, TEST AGAINST REAL GIT. A fixture can encode the exact assumption the real system violates, and it will stay green while production fails.',
    'A FIXTURE THAT CANNOT RESOLVE WHAT PRODUCTION ALWAYS HAS IS NOT MODELLING PRODUCTION. This cost three separate rounds: no origin/main, no credential auth, and a .gitignore containing only node_modules/.',
    'RE-RUN THE MUTATION AFTER REFACTORING A TEST. Refactoring a test changes the detector; a green suite afterwards proves nothing about what it can still detect.',
    'MUTATION-PROVE THE DISCRIMINATOR, NOT JUST THE CHECK: show the suite can tell the CORRECT fix from the BLIND one. A mutation that only proves "something fails" does not prove the right thing fails.',
    'NEVER LET PRODUCTION DATA DECIDE HOW MANY TEST CASES OR ASSERTIONS RUN. A loop over a production list is a zero-iteration (and therefore green) test the day that list is empty.',
    'EXPORT THE PREDICATE, NOT THE LIST. Exporting a list invites two divergent predicates over it; exporting the predicate makes divergence impossible.',
    'UNIFYING A PREDICATE IS NOT UNIFYING ITS INPUT. Agreement by caller CONVENTION is not agreement by CONSTRUCTION — one caller passing a different argument re-splits the behaviour.',
    'IDENTITY IS NOT INTEGRITY, AND METADATA IS NOT CONTENT. Ownership checks pass for a tampered-but-genuine tree; HEAD checks pass for a tree with uncommitted content.',
    'EVERY HARDENING IS ALSO A DEPENDENCY REMOVAL. Before disabling a mechanism, ask what legitimately depended on it — disabling git config to block core.hooksPath also disables the credential helper.',
    'A DESTRUCTIVE CREATE OR REMOVE MUST NEVER DEPEND ON AMBIENT CWD. Pass -C explicitly; an unbound runner plus a missing -C is how a test reaches the live repository.',
    'HARDENING THE CHECK WHILE LEAVING THE EXECUTOR OPEN IS THE WRONG HALF. Scrubbing the environment at the decision site does nothing if the executor still inherits it.',
    'DO NOT TIGHTEN PRE-EXISTING POLICY FROM INSIDE AN ERROR HANDLER. Code on the failure branch only runs when things are already broken, which is exactly when you cannot observe it.',
    'A CORRECTION IS ITSELF A CLAIM and needs the same evidence as the thing it corrects. Two of this SDs root-cause corrections were themselves wrong.',
    'ASSERT THE PROPERTY, NOT THE MECHANISM. An assertion on how something is implemented survives a refactor that destroys the property.',
    'A DENYLIST OVER A VENDOR-EXTENDED NAMESPACE CANNOT STAY COMPLETE. Use an allowlist, or accept that the guard decays with every upstream release.',
    'A CHECK WHOSE PASS CONDITION IS IDENTICAL FOR SUCCESS AND FOR THE FAILURE IT SHOULD CATCH IS NOT A CHECK. A restore verified against HEAD reads OK whether it restored correctly or reverted someone elses uncommitted work. (From a peer reviewer, sharper than the finding it arrived with.)',
    'ENUMERATE THE CALLERS OF THE THING BEING PROTECTED, NOT THE CALLERS OF THE PROTECTION. This is why a scrub gap survived a two-sided mutation matrix run independently by two reviewers. (From a peer reviewer.)',
    'A DEFENCE PINNED AS A FUNCTION IS NOT PINNED AS A WIRE. Two green endpoints do not prove they are connected — assert that the protection is invoked at every production call site.',
    'A HAZARD WHOSE TRIGGER IS THE FIX SUCCEEDING is the signature failure mode of self-referential infrastructure. Ask what the newly-working mechanism can now reach that it could not reach while broken.',
    'RECORD THE MODULE BLOB REVIEWED, NOT A BRANCH NAME. Six verdicts in this SD were carried against a stale HEAD because a thorough review takes longer than the branch stays still.',
    'A PUBLISHED COUNTER WITH NO READER AT THE CALL SITE IS NOT AN ALARM. The original defect was exactly this, and the fix is consumption, not publication.',
    'A REVIEW ROUND WHOSE VERDICT NEVER PERSISTS IS INVISIBLE TO EVERY GATE. 10 evidence-writer artifacts produced 9 verdict rows; the gap is undetectable from either side alone.',
    'TWO READERS OF ONE QUESTION IS A FILABLE SMELL, INCLUDING IN THE RETRO MACHINERY ITSELF: the RETRO sub-agents "does a valid retro exist" predicate and the handoff gates "which retro counts" predicate disagree, and the disagreement is silent.',
  ],

  success_patterns: [
    'Instruct reviewers to REFUTE, not confirm — measured yield ~30 defects across 9 rounds',
    'Run the reviewers own checks against your work BEFORE handing it over',
    'Test git-subject guards against real git, not fixtures',
    'Mutation-prove the discriminator (correct fix vs blind fix), then re-run it after any test refactor',
    'One definition shared by all consumers instead of two implementations that agree today',
    'Commit within minutes — it is the only defence against a peer sessions restore window',
    'Contain an escape the same session: clean, verify the count, fix the root cause, then close the CLASS',
  ],

  failure_patterns: [
    'The fix succeeding IS the hazard trigger (self-referential infrastructure)',
    'Guard shipped with no test that would notice it being disarmed',
    'Identity check that accepts a bare mkdir (rev-parse walks UP)',
    'Two checks defeated by ONE artifact because they were not independent (a ~50-byte .git file)',
    'Identity without integrity; metadata without content',
    'Hardening that removes a dependency the system needed (git config -> credential helper -> fetch)',
    'A new content check that re-opens the starvation it was added to prevent',
    'Refactoring a brittle-but-effective test into a vacuous one',
    'Defence pinned as a function, unwireable at every production call site with the suite green',
    'Verdicts carried against a stale HEAD',
    'Unbound test runner plus missing -C reaching the live repository',
    'Fixture that cannot resolve what production always has',
    'Policy tightened from inside an error handler',
    'Denylist over a vendor-extended namespace',
  ],

  improvement_areas: [
    'Review protocol: record the reviewed module BLOB, not a branch name',
    'Test infrastructure: bind every test runner that can invoke destructive git verbs',
    'Retro machinery: one predicate for "which retrospective counts", shared by the RETRO sub-agent and the handoff gates',
  ],

  action_items: [
    {
      action: 'Record the reviewed module BLOB hash (git rev-parse HEAD:<path>) in every SECURITY/TESTING evidence row, so a verdict can be proven to apply to the code that was actually read.',
      owner: 'EXEC Implementation Agent',
      deadline: 'Next guard-heavy SD',
      success_criteria: 'sub_agent_execution_results.metadata carries reviewed_blob per file; a verdict against a superseded blob is detectable without re-reading the diff',
      priority: 'high',
      smart_format: true,
      source: 'stale_head_incident',
    },
    {
      action: 'Unify the "which retrospective counts" predicate: have lib/sub-agents/retro/db-operations.js checkExistingRetrospective call the same exported predicate as scripts/modules/handoff/retro-filters.js getFilteredRetrospective (retro_type=SD_COMPLETION AND retrospective_type IS NULL AND created_at > LEAD-TO-PLAN acceptance).',
      owner: 'EXEC Implementation Agent',
      deadline: 'Next harness campaign',
      success_criteria: 'A retro the gate rejects is never reported as "valid completion retrospective found" by the RETRO sub-agent; one predicate, two callers, pinned by a test',
      priority: 'high',
      smart_format: true,
      source: 'found_while_writing_this_retro',
    },
    {
      action: 'DEFERRED (completion flag, not a gap) FR-3: serial git in the reaper measured at 5-7 minutes for 26 worktrees. This explains MANUAL-mode ergonomics only; it is NOT the starvation window and was correctly descoped.',
      owner: 'Fleet Infrastructure Agent',
      deadline: 'When reaper wall-clock becomes an operator complaint',
      success_criteria: 'Parallelised or batched git enumeration with a measured before/after on the same 26-worktree population',
      priority: 'medium',
      smart_format: true,
      source: 'deferred_scope',
    },
    {
      action: 'DEFERRED (completion flag) NI-R2: add a wall-clock gauge on (now - last_spawn_at). MUST read state from a consumer OTHER THAN tick(), because tick() returns before readState and would report a value it never observed.',
      owner: 'Fleet Infrastructure Agent',
      deadline: 'Next reaper alarm pass',
      success_criteria: 'Gauge is fed by a reader that runs after readState; a test proves the gauge changes when last_spawn_at ages and that tick() is not its source',
      priority: 'medium',
      smart_format: true,
      source: 'deferred_scope',
    },
    {
      action: 'DEFERRED (completion flag) TOCTOU-2: measured 247.6ms window against a LOCAL remote. Note the reviewer RETRACTED its own earlier "bounded ms" characterisation, so the bound is measured-local, not general.',
      owner: 'Fleet Infrastructure Agent',
      deadline: 'Before the reaper is pointed at a remote origin under load',
      success_criteria: 'Window re-measured against a NETWORK remote; if unbounded, close by lock or by re-verify-after-decision rather than by narrowing the window',
      priority: 'medium',
      smart_format: true,
      source: 'deferred_scope',
    },
    {
      action: 'DEFERRED (completion flag): the behavioural wire recipe that would retire the last remaining structural assertion (the one asserting the mechanism rather than the property).',
      owner: 'EXEC Implementation Agent',
      deadline: 'Next touch of lib/fleet/source-tree-refresh.cjs',
      success_criteria: 'Structural assertion deleted and replaced by a behavioural one that fails when the wire is cut; mutation-proven',
      priority: 'medium',
      smart_format: true,
      source: 'deferred_scope',
    },
    {
      action: 'DEFERRED (completion flag) R5-2: forged .git/worktrees entries — retired IN PRACTICE by the content check, never closed IN PRINCIPLE. Re-open only if the content check is ever relaxed.',
      owner: 'Fleet Infrastructure Agent',
      deadline: 'Conditional — on any relaxation of the content check',
      success_criteria: 'Either an explicit forged-entry test, or a documented dependency note on the content check that fails loudly if that check is weakened',
      priority: 'low',
      smart_format: true,
      source: 'deferred_scope',
    },
    {
      action: 'Add a disarm test alongside every new guard: a test that fails when the guard is deleted or short-circuited, not merely when its subject misbehaves.',
      owner: 'EXEC Implementation Agent',
      deadline: 'Standing practice from the next SD',
      success_criteria: 'Every guard introduced in a PR has a companion test that goes red when the guard body is replaced with return true',
      priority: 'high',
      smart_format: true,
      source: 'nineteen_self_committed_instances',
    },
  ],

  protocol_improvements: [
    {
      category: 'TESTING_ENFORCEMENT',
      improvement: 'For SDs whose deliverable is a GUARD, require a disarm test per guard and a mutation run that discriminates the correct fix from the blind fix.',
      evidence: `${SD_KEY}: two guards shipped with no disarm test; one test was refactored into a vacuous one and caught only by re-running the mutation afterwards.`,
      impact: 'Prevents shipping guards that no test can distinguish from absent ones',
      affected_phase: 'EXEC',
    },
    {
      category: 'TESTING_ENFORCEMENT',
      improvement: 'When the subject of a check is git or the filesystem, require at least one real-git test; fixtures alone are not acceptable evidence.',
      evidence: `${SD_KEY}: three fixture-blind rounds (no origin/main, no credential auth, .gitignore containing only node_modules/); a 17-case real-git suite found what every fixture had encoded away.`,
      impact: 'Removes the largest observed source of green-but-blind guard tests',
      affected_phase: 'EXEC',
    },
    {
      category: 'SUB_AGENT_AUTOMATION',
      improvement: 'Persist a verdict row for EVERY review round, and record the reviewed module blob on it.',
      evidence: `${SD_KEY}: 10 SECURITY evidence-writer artifacts produced 9 verdict rows, and 6 verdicts were carried against a stale HEAD.`,
      impact: 'Makes lost review rounds and stale-HEAD verdicts detectable from the evidence table alone',
      affected_phase: 'EXEC',
    },
    {
      category: 'PROCESS_SIMPLIFICATION',
      improvement: 'One exported predicate for "which retrospective counts", shared by the RETRO sub-agent and both retrospective gates.',
      evidence: `${SD_KEY}: checkExistingRetrospective would have enhanced a retro row created ~0.5s before LEAD-TO-PLAN acceptance, which getFilteredRetrospective (and therefore RETROSPECTIVE_QUALITY_GATE) cannot see.`,
      impact: 'Eliminates a silent class where a PUBLISHED retro exists and the gate still reports none',
      affected_phase: 'PLAN',
    },
  ],

  quality_score: 92,
  team_satisfaction: 8,
  business_value_delivered: 92,
  velocity_achieved: 100,
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 30,
  bugs_resolved: 30,
  tests_added: 91,
  customer_impact: 'Operator-facing: worktree reaping now runs on schedule and fails loudly in 4 distinct ways instead of stopping silently.',
  performance_impact: 'Reaper enumeration remains serial: 5-7 minutes for 26 worktrees (measured). Descoped as FR-3 — ergonomics, not the starvation window.',
  affected_components: [
    'lib/fleet/source-tree-refresh.cjs',
    'lib/fleet/spawn-control.js',
    'lib/fleet/tree-currency.cjs',
    'lib/worktree-reaper/detectors.js',
    'lib/coordinator/coordination-events.cjs',
    'scripts/fleet/worktree-reaper-tick.cjs',
    '.github/workflows/worktree-reaper-cadence.yml',
  ],
  related_files: [
    'lib/fleet/source-tree-refresh.cjs',
    'lib/fleet/spawn-control.js',
    'scripts/fleet/worktree-reaper-tick.cjs',
    'lib/worktree-reaper/detectors.js',
    'lib/coordinator/coordination-events.cjs',
    'tests/unit/fleet/source-tree-identity-realgit.test.js',
    'tests/unit/fleet/scrub-wire.test.js',
    'tests/unit/coordinator/reaper-alert-wire.test.js',
    'tests/unit/governance/reaper-gauge-antigaming.test.js',
  ],
  related_commits: [
    'e08df7c5847', '98174959998', '9195aa5e1a4', '51453e65274', '0d63ebb52cd',
    'ae0833e50af', 'd3cf95f8e85', 'bdf86b85c5c', '803ed185e3e', 'a0ea71c4300',
    '83f6b8d7399', '3412d65700d', '9057c171b3e', '364ef34b82d', '571c2a8e39a',
    'b1e622792f5', '339131fcb32', '48d9ca92fcc', 'd497c117500', '5a7082f7e7e',
    '0daea612633', '44b41e491d5', 'f932435ad4f',
  ],
  related_prs: [],
  tags: ['worktree-reaper', 'blind-guards', 'real-git-testing', 'mutation-testing', 'silent-stop', 'self-referential-infrastructure'],
  metadata: {
    branch: 'feat/SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001',
    head_commit: 'f932435ad4f',
    security_verdicts_measured: { fail_rows: 8, confidences: [82, 90, 92, 93, 95, 94, 96, 96], final: 'PASS', final_confidence: 95, open_blocking: [] },
    security_review_artifacts_on_branch: 10,
    evidence_gap_note: 'EXEC session reported nine refusal rounds (INHERITED); 8 FAIL rows persisted (MEASURED via sub_agent_execution_results). Review rounds and verdict rows are not 1:1.',
    handoffs: { 'LEAD-TO-PLAN': 94, 'PLAN-TO-EXEC': 95, 'EXEC-TO-PLAN': 87 },
    tests: { new_files: 12, new_cases: 91, real_git_suite_cases: 17 },
    incidents: [
      'Peer session mutate/restore window silently reverted an uncommitted edit; git status read CLEAN afterwards.',
      'LIVE-REPO ESCAPE: unbound test runner + argv carrying no -C ran worktree add/prune against the real repository (stale entry + 2 stray branches). Cleaned by hand, verified back to 33 worktrees / 0 prunable, root cause fixed with explicit -C, CLASS closed by binding the test runner.',
      'Six reviewer verdicts carried against a stale HEAD.',
    ],
    self_committed_defect_class_instances: 19,
    fresh_insert_reason: 'Pre-existing retro 50198501-a934-442c-8c31-02fac80bb72f (retro_type=HANDOFF, retrospective_type=LEAD_TO_PLAN) was created ~0.5s BEFORE LEAD-TO-PLAN acceptance; enhancing it in place would produce a row getFilteredRetrospective cannot see.',
  },
};

// Findings discovered WHILE WRITING this retrospective, in the retro machinery itself.
// Recorded here (rather than edited into the literal above) so their provenance is explicit.
retrospective.what_needs_improvement.push(
  'The shared retrospective schema validator (the validateRetrospective exported by scripts/validate-retrospective-schema.js) is unusable and nobody noticed, because scripts/generate-comprehensive-retrospective.js carries its own LOCAL copy. The exported one maps key_learnings to key_learnings and so errors on every valid retro; it also flags protocol_improvements (a real column) as a wrong field name; and its constraint-discovery query runs on ANON_KEY, silently returning zero rows and therefore an EMPTY allowlist that rejects generated_by=MANUAL and yields a team_satisfaction range of Infinity..-Infinity. An instrument nobody invokes is indistinguishable from an absent one.'
);
retrospective.action_items.push({
  action: 'Fix or delete the validateRetrospective exported by scripts/validate-retrospective-schema.js: repair the key_learnings self-map and the protocol_improvements mis-mapping, run constraint discovery on the service key (or drop the discovery step), and make generate-comprehensive-retrospective.js import it instead of keeping a private copy.',
  owner: 'EXEC Implementation Agent',
  deadline: 'Next harness campaign',
  success_criteria: 'One validator, imported by every retro writer; a known-good retro validates clean and a known-bad one fails for the right reason',
  priority: 'high',
  smart_format: true,
  source: 'found_while_writing_this_retro',
});
// Pre-flight: the exported schema validator is broken (see above), so check the few
// constraint-bearing fields against values MEASURED from live rows instead of trusting it.
const supabase = await createSupabaseServiceClient();
const { data: sample, error: sampleErr } = await supabase
  .from('retrospectives')
  .select('generated_by,status,retro_type,team_satisfaction')
  .limit(500);
if (sampleErr) {
  console.error('PREFLIGHT FAILED (could not sample live rows):', sampleErr.message);
  process.exit(1);
}
const distinct = (k) => new Set(sample.map((r) => r[k]).filter((v) => v !== null));
const problems = [];
for (const f of ['sd_id', 'title', 'retro_type', 'conducted_date', 'generated_by', 'status', 'what_went_well', 'what_needs_improvement', 'key_learnings']) {
  if (!retrospective[f]) problems.push(`required field missing: ${f}`);
}
for (const f of ['generated_by', 'status', 'retro_type']) {
  if (!distinct(f).has(retrospective[f])) problems.push(`${f}='${retrospective[f]}' not observed in live rows (${[...distinct(f)].join(', ')})`);
}
if (retrospective.team_satisfaction < 1 || retrospective.team_satisfaction > 10) problems.push('team_satisfaction outside 1..10');
for (const f of ['objectives_met', 'on_schedule', 'within_scope', 'auto_generated', 'technical_debt_addressed', 'technical_debt_created']) {
  if (typeof retrospective[f] !== 'boolean') problems.push(`${f} must be boolean`);
}
for (const f of ['quality_score', 'team_satisfaction', 'business_value_delivered', 'velocity_achieved', 'bugs_found', 'bugs_resolved', 'tests_added']) {
  if (typeof retrospective[f] !== 'number') problems.push(`${f} must be number`);
}
// Content integrity: an array element that is empty, or an action item with no action
// text, reads as a green write and lands in the row as '(no text)'. This check exists
// because THIS script committed exactly that defect on its first run (a blunt sed
// deleted the two lines carrying the text, and both the count-based preflight and the
// gate predicate still read green).
for (const f of ['what_went_well', 'what_needs_improvement', 'key_learnings', 'success_patterns', 'failure_patterns', 'improvement_areas']) {
  (retrospective[f] || []).forEach((s, i) => {
    if (typeof s !== 'string' || s.trim().length < 20) problems.push(`${f}[${i}] is empty or too short to be a real entry`);
  });
}
retrospective.action_items.forEach((a, i) => {
  if (!a || typeof a.action !== 'string' || a.action.trim().length < 20) problems.push(`action_items[${i}] has no usable action text`);
  if (!a?.owner) problems.push(`action_items[${i}] has no owner`);
});
retrospective.protocol_improvements.forEach((p, i) => {
  if (!p?.improvement || !p?.category) problems.push(`protocol_improvements[${i}] missing category/improvement`);
});

if (problems.length > 0) {
  console.error('PREFLIGHT FAILED:');
  for (const p of problems) console.error(' -', p);
  process.exit(1);
}
console.log(`Preflight passed (learnings=${retrospective.key_learnings.length}, went_well=${retrospective.what_went_well.length}, needs_improvement=${retrospective.what_needs_improvement.length}, actions=${retrospective.action_items.length})`);

if (process.argv.includes('--dry-run')) {
  console.log('DRY RUN - not stored.');
  process.exit(0);
}

const stored = await storeRetrospective(supabase, retrospective);
if (!stored.success) {
  console.error('STORE FAILED:', stored.error);
  process.exit(1);
}
console.log('STORED retrospective id:', stored.id);
