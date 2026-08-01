/**
 * Genuine post-implementation retrospective for SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001.
 *
 * WHY A NEW ROW RATHER THAN A TIMESTAMP NUDGE: an SD_COMPLETION retrospective already existed
 * (37ff07e3), created 2026-08-01T11:06:37.265Z — 563ms before the gate's threshold, but also
 * BEFORE the PRD existed (11:10:57) and roughly an hour before any implementation code was
 * written. It is an artifact claiming to summarise a completion, produced before the completion.
 * That is the same family as the defect this SD repairs, so beating the timestamp on it would
 * have been the wrong move twice over. This row records what actually happened.
 *
 * Idempotent on the marker in metadata.
 */
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_UUID = '222e317f-926c-4d5c-99eb-b98ee8d24f53';
const MARKER = 'alpha_post_implementation_retro_v1';

const existing = await s.from('retrospectives').select('id, metadata').eq('sd_id', SD_UUID);
if ((existing.data || []).some((r) => r.metadata && r.metadata.marker === MARKER)) {
  console.log('ALREADY PRESENT');
  process.exit(0);
}

const row = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  project_name: 'FR-Delivery Gate: Honest Scoring and the UNVERIFIABLE State',
  title: 'SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001 Retrospective (post-implementation)',
  description:
    'Repaired the FR-delivery completion gate, which reported a fabricated score of 100 whenever it could not measure delivery. Written AFTER implementation, unlike the pre-work SD_COMPLETION row 37ff07e3 that this supersedes.',
  conducted_date: new Date().toISOString(),
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['Explore', 'VALIDATION', 'RETRO', 'RCA', 'TESTING', 'SECURITY'],
  human_participants: [],
  what_went_well: [
    'The diagnosis was EXECUTED, not read. Running the real classifier against the real specimen row turned a filed claim of "2 of 6 FRs unbuilt scored 93" into the measured fact that the gate computed 0 delivered / 6 undelivered and still reported 100.',
    'A cheap and apparently perfect fix was found AND killed before it shipped. The positional story_key linkage is real and confirmed in data (49/49 SDs with contiguous US-NNN ordinals), but executed against the specimen it returns 6/6 DELIVERED including the two FRs that SD s own metadata records as not delivered. It would have converted a loud wrong answer into a quiet one.',
    'The variance check generalised. status=completed 275/275 and validation_status=validated 275/275 are constants, and a variable with zero variance carries zero information — so the classifier s "validated story" precondition was a tautology, not a filter.',
    'Adversarial validation was invited rather than avoided: the VALIDATION agent was explicitly told to argue FOR the fix I preferred to reject, and it refuted three of my claims and found a scope-changing defect I had missed (0 of 62 LEAD-FINAL rows persist gate_results).',
    'An existing test caught a real flaw in the new design. The zero-stories hard-fail case was right to object, and it produced the has_work_product distinction: blindness needs something to be blind to.',
    'Mutants were verified PRESENT ON DISK before being run, so a mutation that failed to apply could not be misread as one the suite survived.',
  ],
  what_needs_improvement: [
    'I asserted "no writer ever emits the FR id into story text" as an absolute. Grep killed it: 146 stories carry one, 34 FRs across 10 SDs classify DELIVERED on text match. The healthy path never emits it; the accident path does, in about a fifth of rows. An absolute was the wrong shape for a claim I had sampled rather than enumerated.',
    'My blast-radius arithmetic assumed ~23 equal-weight gates. Rosters are 29-43 (mean 39.6), so my per-gate delta was wrong, and a uniform model could not see that SMALL rosters amplify the hit to -10.0.',
    'I accepted the SD s premise that the 93 came from PLAN-TO-LEAD. That roster contains no FR gate at all; the fabricated 100 landed in EXEC-TO-PLAN via the sibling wrapper. I should have measured which handoff emitted the number before designing against it.',
    'I hit the backtick-in-double-quoted-bash trap I already had recorded in memory, corrupting one word of a signal body.',
    'The PRD promised each mutant would fail a DISTINCT test count; M2 and M3 both fail 2. The criterion was over-specified at PLAN time and I reported the deviation rather than reshaping the mutants to fit it.',
  ],
  key_learnings: [
    'A GATE THAT CANNOT LOWER A SCORE IS NOT A GATE. The warn-only path pinned the score at 100 and moved the truth to details.raw_score, so the composite mean could not distinguish six-of-six from zero-of-six. "Zero blast radius" was purchased by making the instrument structurally unable to report a shortfall.',
    'TWO DEFECTS CAN CONCEAL EACH OTHER AND NEITHER IS FINDABLE ALONE. The unusable measurement is why the gate shipped OFF; the fabricated 100 is why OFF looked like a pass. Each one prevented the other from being noticed, which is why this survived long enough to become the fifth green-where-blind instance.',
    'CHECK A SIGNAL S ATTAINABLE RANGE BEFORE TRUSTING IT. If a variable is constant across the population the check runs against, it is a no-op wearing the costume of a precondition.',
    'A FIX THAT CONVERTS A LOUD WRONG ANSWER INTO A QUIET ONE IS A REGRESSION EVEN THOUGH EVERY NUMBER IMPROVES. Text-match failing at 45/55 is visibly broken and therefore gets filed; positional matching at uniform 100% would never have been questioned.',
    'DECIDE THE NEGATIVE CASE AT THE RIGHT SCOPE. Whether a missing reference means UNDELIVERED or UNVERIFIABLE cannot be decided per-FR — it depends on whether the SD uses the convention at all. Deciding it per-FR makes UNDELIVERED unreachable; deciding it per-SD is what gives the verdict meaning.',
    'AN UNBOUNDED NON-FAILING STATE BECOMES A PERMANENT ESCAPE HATCH. The WAIT verdict needed a ceiling retrofitted after it was load-bearing, so UNVERIFIABLE shipped with LEO_FR_UNVERIFIABLE_CEILING on day one.',
    'A REPAIR TO AN UNAUDITABLE VERDICT FIXES NOTHING OBSERVABLE. 0 of 62 LEAD-FINAL rows carried gate_results, so this gate had no execution record for any recent completed SD. Persistence had to be in scope or the fix would only ever be demonstrable in a unit test.',
    'THE FIX MUST NOT EXEMPT ITSELF. This SD s own FRs classify UNVERIFIABLE under its own repaired gate, because its stories do not use the FR-reference convention either. That is correct behaviour and worth stating rather than hiding.',
    'MEASURE THE POPULATION BEFORE PROPOSING ENFORCEMENT. 51 of 55 recent completed SDs would have hard-failed under naive enforcement, and most of those failures would have been FALSE. Enforcing a broken measurement is worse than not enforcing it.',
    'AN UNACTIONABLE BLOCKER IS WORSE THAN A WRONG ONE. TESTING blocked with a message naming a condition already satisfied, whose remediation was a literal no-op — and whose only real remediation the harness converts into fabricated evidence.',
  ],
  action_items: [
    'P0 (outside this SD, signalled 7b6afb37): plan-to-lead/state-transitions.js:119-121 stamps e2e_test_status=passing on a TRUTHY STRING with no execution — 726 stories affected, 10 pointing at a placeholder path reading "no E2E required". Fix before anything that pressures workers to populate e2e_test_path.',
    'P1: phase4-evidence.js:90-94 emits a T1-hardcoded label for a three-term disjunction; carry the failing term in the message and the payload. 181 of 422 BLOCKED rows across 78 SDs.',
    'P2: leo_sub_agents.depends_on does not exist, so the orchestrator has run every sub-agent concurrently since 2026-01-29. Add a schema-contract test asserting every column the orchestrator filters on exists — that catches the class.',
    'P3: RETRO generated an SD_COMPLETION retrospective at 11:06, before the PRD existed and an hour before implementation. A completion artifact produced before completion is the same defect family this SD repairs.',
    'Follow-up: promote FR delivery enforcement once story->FR linkage is actually recorded; the ceiling is the ratchet.',
    'Follow-up: the six sibling completion checks enumerated in the Explore evidence row can each pass without evidence — a separate single-representation SD.',
  ],
  quality_score: 90,
  business_value_delivered: 'HIGH',
  customer_impact: 'LOW',
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 3,
  bugs_resolved: 1,
  tests_added: 24,
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  success_patterns: ['Execute rather than read', 'Falsify your own preferred fix', 'Adversarial validation invited', 'Mutants verified applied before trusting the result'],
  failure_patterns: ['Absolute claims from sampled evidence', 'Arithmetic from an unmeasured roster size', 'Inheriting a filing premise without measuring it'],
  improvement_areas: ['Measure before asserting', 'Scope every absolute', 'Re-read own memory before shell quoting'],
  generated_by: 'MANUAL',   // authored by the EXEC worker directly, not by a sub-agent
  trigger_event: 'PLAN_TO_LEAD_HANDOFF',
  status: 'PUBLISHED',
  target_application: 'EHG_Engineer',
  // learning_category: the invented 'QUALITY_GATES' was rejected by check_learning_category and
  // the column is NOT NULL, so a value must be chosen. TESTING_STRATEGY is the closest
  // observed-valid value: this SD is materially about the quality of verification evidence.
  learning_category: 'TESTING_STRATEGY',
  applies_to_all_apps: false,
  related_commits: ['0547e5e6594'],
  affected_components: [
    'scripts/modules/handoff/gates/fr-delivery-classifier.js',
    'scripts/modules/handoff/gates/fr-delivery-traceability-gate.js',
    'scripts/modules/handoff/executors/lead-final-approval/gates.js',
    'scripts/modules/handoff/executors/lead-final-approval/index.js',
  ],
  tags: ['SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001', 'green-where-blind', 'single-representation', 'post-implementation'],
  metadata: {
    marker: MARKER,
    supersedes: '37ff07e3-ebb0-48ee-9d79-b0202820cdc7',
    supersedes_reason: 'That row is retro_type=SD_COMPLETION but was created 2026-08-01T11:06:37.265Z — before the PRD existed (11:10:57) and about an hour before any implementation. It cannot be a retrospective of this work.',
    evidence: {
      commit: '0547e5e6594',
      tests_passing: 52,
      full_unit_suite: '33956 passing, 9 pre-existing failures named',
      mutants_falsified: 3,
      population_effect: 'would-hard-fail set 51/55 -> 12/55',
    },
  },
};

const { data, error } = await s.from('retrospectives').insert(row).select('id,retro_type,created_at');
if (error) { console.log('INSERT ERR:', error.message); process.exit(1); }
console.log('WROTE RETRO:', JSON.stringify(data[0]));
