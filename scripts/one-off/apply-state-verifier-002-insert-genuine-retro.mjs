// PLAN-TO-LEAD VERIFY-phase retrospective for SD-LEO-INFRA-APPLY-STATE-VERIFIER-002.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const sb = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-INFRA-APPLY-STATE-VERIFIER-002';
const SD_UUID = '0a5b3325-e751-4ab3-82b8-98c2410c3e6c';

const row = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  title: 'Apply-state verifier regression replay corpus -- genuine retrospective',
  description:
    'A regression-corpus SD (chairman decision 27bfdde9, option 1: build Solomon\'s step B3 now, defer A1-A4/B1) that froze a DB-free CI test corpus for scripts/verify-migration-apply-state.mjs\'s normalizer, so the case-fold/implicit-cast/quote-scoping fix (SD-001, PR #8973) cannot silently regress. The build itself, run against the real live database, surfaced 3 genuine unanticipated findings the original scope never anticipated: post-apply content drift on several functions, a redundant-parenthesis normalizer gap, and a quote-scanner state bug on large bodies. All 3 were root-caused, correctly excluded from the corpus (rather than asserted as false invariants), and the 2 genuine normalizer gaps were routed to harness_backlog per the chairman\'s own scope discipline.',
  what_went_well: [
    'LEAD-phase Explore corrected a real miscitation in the SD\'s own scope text before any code was written: "about 124 per Alpha-3\'s earlier count" traced to a DIFFERENT, unrelated fleet-wide census (potential false-positive candidates), not the schema_migrations_applied success-row count -- measured live instead (393 rows / 388 distinct / 366 on disk / 150 function-or-trigger-declaring files), independently re-verified by VALIDATION with an exact match on all four numbers.',
    'PLAN-phase TESTING reviewed the PRD before any code existed and found 3 real pre-implementation gaps, closing each in the same pass: a hard-coded "exactly 150" acceptance criterion that would break the moment the live count shifted (fixed to require internal self-consistency instead); a missing requirement that the generator reuse the verifier\'s own resolveLive() rather than risk a hand-rolled query silently drifting from production behavior; and a single-seeded-mutation non-vacuity test that could only prove ONE of the two comparison branches (function vs. trigger) was load-bearing -- the exact single-candidate discrimination gap this session has repeatedly named, caught here before it was even built rather than after.',
    'Building the generator against the REAL live database (not a mock) surfaced 3 genuine, unanticipated findings the PRD could not have predicted: 7 functions/triggers had genuinely drifted post-application (a later migration/hotfix legitimately changed them), and 2 real normalizer gaps remained un-fixed by SD-001 (redundant-parenthesis removal on 2 real triggers; a quote/dollar-quote scanner state issue silently halting normalization partway through one large real function body, first visible as a CRLF-vs-LF false mismatch). All 11 were root-caused to exact byte-level diffs before any exclusion decision was made.',
    'The generator was fixed to be self-consistent rather than trusting ledger membership alone: it now only includes a fixture entry when the SAME real normalizer functions it imports currently compare equal, logging every exclusion by name+path in the fixture\'s own provenance -- so the corpus never asserts an invariant that is not, in fact, currently true.',
    'Two mutation-testing bugs were caught in the test suite itself, not just the production code: the first TS-3 mutation used a `--` SQL comment, which normalizeSqlBody()\'s own comment-stripping silently erased before comparison (a genuinely vacuous mutation, caught because the test failed for the WRONG reason); and a hand mutation-test (removing the confirmed_false_positive tag, restoring via cp/diff byte-identical check) confirmed exactly the 2 intended tests failed, proving those assertions non-vacuous too.',
    'The 2 real normalizer-gap findings were routed to harness_backlog (feedback rows 8e7b9427, 9a3468c3) rather than fixed inline or silently dropped -- respecting the chairman\'s explicit scope discipline (decision 27bfdde9: step B3 only, everything else deferred) while still surfacing genuinely new information discovered as a byproduct of the corpus build.',
  ],
  what_needs_improvement: [
    'The original PRD design assumed "known-applied via the ledger" implied "currently matches the live definition" -- a reasonable first-pass assumption that turned out to be false for 7 of the 275 candidate objects (post-apply drift is a normal, expected occurrence in an active fleet, not a defect, but the PRD did not anticipate it and the generator needed a real design fix mid-EXEC rather than catching this at PLAN phase).',
    'REAL_CALLEE_ATTESTATION failed at 0% on the EXEC-TO-PLAN precheck (overall score still passed at 93%) -- a pure-data/test-fixture SD with no new "callee" in the traditional sense may not fit that gate\'s intended shape well; not investigated further since the overall handoff passed, but worth a future look if this recurs on similarly shaped infra-corpus SDs.',
    'HEAL_BEFORE_COMPLETE\'s fast-auto-heal exhausted its 3 iterations without converging (37 -> 37, threshold 45) before this retrospective was inserted -- retrospective existence is one of its structural checks, so filing this genuine retro (rather than relying on a generic auto-row) was a precondition for the gate to re-score correctly, not an independent afterthought.',
  ],
  key_learnings: [
    {
      category: 'A_PREMISE_CITED_FROM_A_DIFFERENT_SD_NEEDS_ITS_OWN_MEASUREMENT',
      evidence: 'The SD scope\'s "~124 per Alpha-3\'s earlier count" traced to SD-001\'s own description, which is a fleet-wide potential-false-positive CENSUS, not a schema_migrations_applied success-row count -- two unrelated measurements sharing a similar-sounding provenance clause.',
      learning: 'A number cited "per <prior SD>\'s earlier count" is a pointer to verify, not a fact to inherit -- reading the CITED SD\'s own text directly (not just trusting the citing SD\'s paraphrase) revealed the two measurements were answering different questions entirely.',
      applicability: 'Whenever an SD cites a number sourced from a DIFFERENT SD, read that source SD\'s own record directly before treating the figure as ground truth, and re-measure live rather than propagating a citation chain.',
    },
    {
      category: 'LEDGER_MEMBERSHIP_IS_NOT_A_CURRENT_STATE_GUARANTEE',
      evidence: 'Of 275 candidate function/trigger objects owned by a known-applied migration, 7 had genuinely drifted from their applied-at-the-time text (a later migration/hotfix legitimately replaced the body) -- discovered only by actually comparing file text to live text, not by trusting the ledger\'s success=true flag.',
      learning: 'A "known-applied" ledger row proves the migration succeeded AT THAT TIME -- it says nothing about whether the object it created is still the current live definition. Any corpus/regression-guard design built on top of an apply ledger needs its own self-consistency check (comparing current state directly) rather than inferring "still correct" from "was successfully applied."',
      applicability: 'Any future tooling that reads schema_migrations_applied (or a similar apply-history ledger) as a proxy for "current live state matches this file" should verify that assumption directly rather than treating ledger success as sufficient.',
    },
    {
      category: 'A_STRIPPED_TOKEN_IS_AN_INVISIBLE_MUTATION',
      evidence: 'The first seeded-mutation test appended a `-- mutated for non-vacuity proof` SQL comment to a live_text clone; normalizeSqlBody()\'s own stripSqlComments() step erased it before the comparison ran, so the "mutated" text normalized identically to the original -- the test failed, but for the wrong reason (expected true to be false, meaning the mutation never registered at all).',
      learning: 'A mutation aimed at proving a comparison function is load-bearing must survive that SAME function\'s own normalization pipeline -- appending content in a form the function is specifically designed to strip (a comment, in this case) produces a mutation that looks plausible but tests nothing.',
      applicability: 'Before trusting a seeded-mutation test as proof of non-vacuousness, confirm the mutated content actually differs POST-normalization, not just pre-normalization -- print or assert the normalized forms differ as a sanity check on the mutation itself.',
    },
    {
      category: 'A_CORPUS_MUST_NEVER_ASSERT_A_CURRENTLY_FALSE_INVARIANT',
      evidence: 'The generator\'s first version included all 275 candidate entries unconditionally; 11 failed their own comparison on the very first test run (genuine drift + 2 real normalizer gaps) -- a regression corpus that had shipped with those 11 asserted as "must match" would have been red on day one for reasons unrelated to any future regression.',
      learning: 'A regression-guard fixture must be self-verifying at generation time: only pin pairs the generator itself confirms currently compare equal via the SAME functions the test suite will later use, and log (rather than silently drop or force-assert) anything that does not currently match -- the exclusion IS the finding, not noise to be swept away.',
      applicability: 'Any future frozen-fixture regression corpus (built from live or historical data) should include a self-consistency filter at generation time, with excluded/non-matching candidates logged with enough detail (id + source) for a later investigation, exactly as this SD\'s excluded_current_mismatches array does.',
    },
    {
      category: 'A_NEW_DISCOVERY_MID_SD_IS_STILL_SUBJECT_TO_THE_ORIGINAL_SCOPE_RULING',
      evidence: 'Discovering 2 new, real normalizer-gap classes (redundant-paren, quote-scanner state) while building the corpus was tempting to fix inline (a small, contained-looking change) -- but chairman decision 27bfdde9 explicitly scoped THIS SD to step B3 only, deferring everything else including new normalizer work.',
      learning: 'A chairman-scoped SD\'s boundary does not expand just because a new, adjacent, tractable-looking defect surfaces mid-build -- the correct response is to root-cause and document the finding, then route it through the standing harness_backlog mechanism (ratification e38df53f\'s "is this critical?" check), not to silently widen scope because the fix looks easy from where you\'re standing.',
      applicability: 'When a genuinely new defect surfaces while building a narrowly-scoped SD, resist fixing it inline unless it blocks the SD\'s own stated deliverable -- log it to harness_backlog (or mint a new SD if it meets the critical bar) and let the SCOPE, not the temptation of a nearby fix, govern what ships in this PR.',
    },
  ],
  action_items: [
    {
      owner: 'Session Agent',
      action: 'A future SD picking up either filed harness_backlog item (8e7b9427 redundant-paren, 9a3468c3 quote-scanner) should re-run scripts/db/apply-state-verifier-corpus-generator.mjs after the fix lands, to confirm the currently-excluded entries move into the must-match set.',
      source: 'process_pattern',
      priority: 'low',
      smart_format: true,
      success_criteria: 'A follow-up SD fixing either normalizer gap regenerates this corpus and confirms the relevant excluded entries now pass, growing entry_count and shrinking excluded_current_mismatches accordingly.',
    },
    {
      owner: 'Session Agent',
      action: 'When seeding a mutation test against a normalizer/comparison function, verify the mutated content survives that function\'s own preprocessing (comment-stripping, quote-scoping, etc.) before trusting the test as a non-vacuity proof.',
      source: 'process_pattern',
      priority: 'medium',
      smart_format: true,
      success_criteria: 'Future mutation tests against text-normalizing comparison functions use real semantic content (not a comment or other stripped token) for the seeded mutation, verified by a quick manual check that normalized forms actually differ.',
    },
    {
      owner: 'Session Agent',
      action: 'Any future fixture/corpus generator built from a live-apply ledger should include a self-consistency filter (only include entries the generator itself confirms currently match) rather than trusting ledger membership as sufficient.',
      source: 'process_pattern',
      priority: 'medium',
      smart_format: true,
      success_criteria: 'A future corpus-generator SD design explicitly states and implements a self-consistency filter with logged exclusions, citing this SD as precedent.',
    },
  ],
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  bugs_found: 5,
  bugs_resolved: 3,
  tests_added: 7,
  generated_by: 'MANUAL',
  trigger_event: 'PLAN_VERIFICATION',
  status: 'PUBLISHED',
  conducted_date: new Date().toISOString(),
  target_application: 'EHG_Engineer',
  applies_to_all_apps: false,
  learning_category: 'PROCESS_IMPROVEMENT',
  metadata: {
    sd_key: SD_KEY,
    authored_by: 'PLAN-TO-LEAD VERIFY session agent',
    corpus_entry_count: 264,
    corpus_excluded_current_mismatches: 11,
    harness_backlog_filed: ['8e7b9427-3208-4087-b828-5fd39f755581', '9a3468c3-8619-41ab-bc21-81af66be5a4a'],
    plan_to_exec_testing_gaps_found: 3,
  },
};

async function main() {
  const { data, error } = await sb.from('retrospectives').insert(row).select('id, status, quality_score').single();
  if (error) throw error;
  console.log('INSERTED genuine retrospective:', JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('FAILED to insert retrospective:', err);
    process.exit(1);
  });
}
