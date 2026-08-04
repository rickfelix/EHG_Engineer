import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = 'SD-LEO-INFRA-OUTCOME-SHAPED-LEDGER-001';

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: 'Run: node scripts/ledger-ref-shape-report.mjs (classifies every populated outcome_ref by shape and reports how many are machine-resolvable SD keys vs narrative prose)',
    expected_outcome: 'Prints the whole-column shape split — eligible SD keys vs prose vs other — with counts and percentages, and states the DERIVABLE CEILING for outcome_sd_key. Exits non-zero if the eligible count is reported without the ceiling, because a population number without its ceiling is the metric this SD exists to stop chasing.',
  },
  {
    step_number: 2,
    instruction: 'Run: node scripts/ledger-ref-shape-report.mjs --applicability (reports how many ledger rows could EVER carry a resolvable outcome_sd_key, separating not-yet-populated from not-applicable)',
    expected_outcome: 'Reports three buckets, never two: RESOLVABLE (an SD key is present or derivable), NOT-YET (a ref exists but no decision has been reconciled), and NOT-APPLICABLE (the advice outcome is a narrative, not an artifact). A run that reports only populated-vs-empty fails this step — collapsing not-applicable into not-yet is what makes 3.4% look like a bug rather than a ceiling.',
  },
  {
    step_number: 3,
    instruction: 'Run: npx vitest run tests/unit/ledger-ref-shape.test.js',
    expected_outcome: 'Green, including the seeded cases: a prose ref is classified NOT-APPLICABLE (not as a failure to populate), a lowercase SD- ref is reported as case-drift rather than silently derived, and a QF- ref is classified EXCLUDED-BY-DESIGN with the reason (quick fixes do not live in strategic_directives_v2, so the key would never resolve and the row would be re-selected by every batch forever).',
  },
];

const strategic_objectives = [
  'Replace an unbuildable remedy with the measured one. The SD prescribes wiring; measurement shows a correct writer already exists (coordinator-ack-adam.cjs, d4f7cbed4db, ancestor of origin/main) and the INPUT is what fails — 853 of 865 populated outcome_ref values are narrative prose, and exactly ONE matches the eligible SD-key shape.',
  'Name the overload: outcome_ref carries two incompatible jobs — an artifact REFERENCE (machine-resolvable, what the advice became) and an outcome NARRATIVE (human prose, what happened). The deriver needs the former; 98.6% of the column is the latter. One column, two meanings.',
  'Report a derivable CEILING alongside the population, so 3.4% is judged against what is achievable rather than against 100%. Chasing a coverage number on an inapplicable population is the failure this SD is about, one level up.',
];

const key_changes = [
  {
    change: 'Classify every populated outcome_ref by shape and publish the derivable ceiling for outcome_sd_key.',
    impact: 'MEASURED whole-column (865 values): 853 (98.6%) narrative prose, 4 commit sha, 4 SD- non-uppercase, 3 QF-, and exactly 1 (0.1%) eligible. ~650 of the 853 carry an era_closure: prefix — a BULK STAMP, not organic writes. Without a published ceiling, 3.4% reads as a broken writer instead of an absent input.',
  },
  {
    change: 'Separate NOT-APPLICABLE from NOT-YET in every report of ledger coverage.',
    impact: 'A row whose outcome is a narrative can never carry a resolvable SD key. Collapsing it with rows merely awaiting reconciliation makes an inapplicable population look like a backlog, which is what invites the wrong remedy.',
  },
  {
    change: 'DO NOT loosen the derivation pattern, and record why.',
    impact: 'The narrowings at coordinator-ack-adam.cjs are deliberate: QF keys are excluded because the reconciler resolves against strategic_directives_v2 where quick fixes do not live, and uppercase-only because sd_key is stored uppercase. An unresolvable key is WORSE than none — the row is re-selected by every scheduled batch forever, burning a slot and logging a skip each time. The prior author measured 13 of 31 existing values already failing to resolve. Turning an inert path NOISY is a regression, not a fix.',
  },
  {
    change: 'Carry the RETRACTION into the PRD, not only the corrected finding (coordinator 8b9720cb, explicit instruction).',
    impact: 'I first reported outcome_sd_key had NO writer. False — my exclusion filter dropped `row.outcome_sd_key` to remove reads and deleted the write, the same token up to the operator. My positive control could not catch it because I applied the SAME exclusion to the control. A PRD showing only the tidy conclusion teaches the next reader the conclusion was obvious; the useful content is how the wrong answer looked convincing.',
  },
];

const mechanism_verifications = [
  {
    verified_by: 'Bravo (e3610a71) — read the writer, retracting my own no-writer claim',
    verified_at: 'scripts/coordinator-ack-adam.cjs:249 — `row.outcome_sd_key = resolvedOutcomeRef` (added by d4f7cbed4db, verified an ancestor of origin/main)',
  },
  {
    verified_by: 'Bravo (e3610a71) — read the narrowings and their stated rationale',
    verified_at: 'scripts/coordinator-ack-adam.cjs:264 — SD keys only, uppercase only; QF excluded because the reconciler resolves against strategic_directives_v2 and an unresolvable key is worse than none',
  },
  {
    verified_by: 'Bravo (e3610a71) — read the consumer that skips rows lacking the key',
    verified_at: 'scripts/solomon-ledger-reconcile.cjs:64 — skips with reason "no outcome_sd_key"; scripts/solomon-ledger-reconcile.cjs:70 resolves the SD by that key to derive the outcome',
  },
  {
    verified_by: 'Bravo (e3610a71) — measured the whole column, not a sample; this is why the remedy changes',
    verified_at: 'scripts/coordinator-ack-adam.cjs:251 documents the dependency; measured live: of 865 populated outcome_ref values exactly 1 matches ^SD-[A-Z0-9-]+$, 853 are narrative prose (~650 with an era_closure: prefix)',
  },
];

const { data: sd, error: e0 } = await sb.from('strategic_directives_v2').select('metadata').eq('sd_key', KEY).single();
if (e0) { console.log('lookup failed: ' + e0.message); process.exit(1); }

const FILE_LINE = /\b[\w.-]+(?:\/[\w.-]+)*\.(?:js|cjs|mjs|ts|tsx|sql):\d+\b/;
const bad = mechanism_verifications.filter((r) => !FILE_LINE.test(r.verified_at));
if (bad.length) { console.log('SELF-CHECK FAILED — ' + bad.length + ' citation(s) lack file:LINE'); process.exit(1); }
console.log('self-check: all ' + mechanism_verifications.length + ' citations match the gate regex');

const metadata = { ...(sd.metadata || {}), mechanism_verifications };
const { error } = await sb.from('strategic_directives_v2')
  .update({ smoke_test_steps, strategic_objectives, key_changes, metadata }).eq('sd_key', KEY);
console.log(error ? ('ERR: ' + error.message)
  : `UPDATED smoke(${smoke_test_steps.length}) objectives(${strategic_objectives.length}) key_changes(${key_changes.length}) mechanism_verifications(${mechanism_verifications.length})`);
