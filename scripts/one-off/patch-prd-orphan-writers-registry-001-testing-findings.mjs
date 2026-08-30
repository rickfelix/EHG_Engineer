import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const PRD_ID = 'PRD-54daa184-4ef8-4d19-babb-80ad0b11e17c';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: prd, error: readErr } = await supabase.from('product_requirements_v2').select('*').eq('id', PRD_ID).single();
  if (readErr) throw readErr;

  const frs = prd.functional_requirements;
  const byId = Object.fromEntries(frs.map((f, i) => [f.id, i]));

  // FR-1: TESTING F-7 -- a frozen ORPHAN_ENTRIES cannot be fixture-injected for TS-1.
  // Add an exported pure validator function as the actual test surface.
  frs[byId['FR-1']] = {
    ...frs[byId['FR-1']],
    description: frs[byId['FR-1']].description +
      ' Per TESTING finding F-7, the module ALSO exports a pure function validateOrphanEntry(entry) (and validateAllEntries(entries)) so the completeness test can exercise both the frozen real baseline AND injected bad fixtures without mutating ORPHAN_ENTRIES.',
    acceptance_criteria: [
      ...frs[byId['FR-1']].acceptance_criteria,
      'validateOrphanEntry/validateAllEntries are exported pure functions usable against both ORPHAN_ENTRIES and ad-hoc test fixtures',
    ],
  };

  // FR-4: TESTING F-1 -- incrementConsecutiveMiss is mechanically unsuitable (keyed to
  // periodic_process_registry.process_key + last_state='OVERDUE', RETURNING null on any
  // other state, silently returning count:0 -- ships the exact orphan-write defect class).
  frs[byId['FR-4']] = {
    ...frs[byId['FR-4']],
    requirement: 'Two-consecutive-window notifier (revised mechanism per TESTING F-1)',
    description:
      'A notifier (scripts/orphan-writers-notify.mjs) raises an adam_advisory when a registered predicate returns empty for two consecutive windows. adam_advisory is NOT a dedicated table -- it is a session_coordination row with payload.kind=\'adam_advisory\', written via the existing scripts/adam-advisory.cjs conventions. TESTING F-1 measured that lib/periodic-liveness/ladder-escalation.mjs incrementConsecutiveMiss is NOT reusable here: its RPC is scoped to rows with last_state=\'OVERDUE\' in periodic_process_registry, returns null (silently, no error) for any other state including the real specimen keys, and Number(null)=0 means climbLadder never fires -- reusing it would ship this SD\'s own defect class. REVISED mechanism: consecutive-miss state is tracked via the EXISTING canonical `feedback` writer (lib/governance/emit-feedback.js), category=\'orphan_writer_miss\', one row per (entry_id, window) with a dedup key, NOT a new table. The notifier queries the last 2 rows for a given entry_id ordered by created_at to determine consecutive-miss count before deciding whether to fire. This applies ONLY to entry_types whose predicate is a live emptiness read (wired-but-blind, no-stamper-wired); shipped-but-not-applied is a one-time boolean latch (see FR-4a) and is explicitly NOT subject to two-window debouncing (TESTING F-6: a latch cannot flap, so debouncing a monotonic boolean is meaningless).',
    acceptance_criteria: [
      'A predicate returning empty once does NOT fire an advisory (for wired-but-blind / no-stamper-wired entries)',
      'A predicate returning empty on two consecutive runs DOES fire exactly one adam_advisory naming the writer, reader, and entry_type',
      'The advisory uses the existing scripts/adam-advisory.cjs writer, not a new table or channel',
      'The consecutive-miss counter uses the existing feedback table via emit-feedback.js, not a reused-but-mechanically-incompatible periodic_process_registry RPC, and not a new table',
    ],
  };
  frs.push({
    id: 'FR-4a',
    requirement: 'shipped-but-not-applied: single-fire boolean advisory (no debounce)',
    description:
      'For entries typed shipped-but-not-applied, the predicate is a one-time boolean latch (has the migration/artifact\'s effect gone live?), not a repeatable emptiness read. TESTING F-6: this predicate is monotonic and cannot flap, so the two-consecutive-window debounce in FR-4 does not apply. orphan-writers-count.mjs fires an adam_advisory the first time this predicate is observed false, with no repeat-suppression beyond the existing scripts/adam-advisory.cjs dedup conventions.',
    priority: 'MUST',
    acceptance_criteria: [
      'A shipped-but-not-applied predicate observed false fires an advisory on first observation, not the second',
      'Once the predicate flips true (artifact applied), no further advisories fire for that entry',
    ],
  });

  // FR-5/FR-6: TESTING F-8 -- MUST requirements with zero test scenarios.
  frs[byId['FR-5']] = {
    ...frs[byId['FR-5']],
    acceptance_criteria: [
      ...frs[byId['FR-5']].acceptance_criteria,
      'Covered by TS-8 (self-registration round-trip)',
    ],
  };
  frs[byId['FR-6']] = {
    ...frs[byId['FR-6']],
    acceptance_criteria: [
      ...frs[byId['FR-6']].acceptance_criteria,
      'Covered by TS-9 (no duplicate representation of the feedback-sla-breach specimen)',
    ],
  };

  // Test scenarios: fix TS-1 (frozen-array fixture issue), TS-3 (wrong columns + magic
  // number 7), TS-5 (self-falsifying reproducibility claim), add TS-7/TS-8/TS-9.
  const scenarios = prd.test_scenarios.map((ts) => {
    if (ts.id === 'TS-1') {
      return { ...ts, expected: 'validateOrphanEntry() (exported pure function, NOT the frozen ORPHAN_ENTRIES array) returns invalid for a fixture entry with no predicate declared' };
    }
    if (ts.id === 'TS-3') {
      return {
        ...ts,
        scenario: 'no-stamper-wired specimens present, keyed by identity not count',
        expected: 'ORPHAN_ENTRIES contains the coordinator standard_loop rows keyed by their real process_key values (not a hardcoded count), read via the correct columns liveness_source=\'self_stamped\' (a VALUE, not a boolean column) and currently_expected_active=true (per TESTING F-3, correcting the nonexistent self_stamped/expected_active column names); a query error on these columns must NOT be treated as an empty-predicate result',
      };
    }
    if (ts.id === 'TS-5') {
      return {
        ...ts,
        expected: 'orphan-writers-count.mjs computes its verdicts BEFORE self-stamping periodic_process_registry (TESTING F-5: the script must not mutate the rows it measures), and excludes its own self-registration row from the count it reports; two consecutive runs against otherwise-unchanged DB state return the identical count',
      };
    }
    return ts;
  });
  scenarios.push(
    { id: 'TS-7', scenario: 'shipped-but-not-applied: single-fire, no debounce', expected: 'A false boolean predicate fires an advisory on first observation (not the second run); once true, no further advisories' },
    { id: 'TS-8', scenario: 'Self-registration round-trip (FR-5)', expected: 'The triage script\'s own periodic_process_registry row is stamped on each run, and its own writes have a corresponding ORPHAN_ENTRIES entry with a real reader (entry_type=PASS)' },
    { id: 'TS-9', scenario: 'No duplicate feedback-sla-breach representation (FR-6)', expected: 'ORPHAN_ENTRIES references DRAIN_DESCRIPTORS[\'feedback-sla-breach\'] for this specimen rather than declaring a second, independent entry for the same underlying writer' },
  );

  const { error: updErr } = await supabase.from('product_requirements_v2').update({ functional_requirements: frs, test_scenarios: scenarios }).eq('id', PRD_ID);
  if (updErr) throw updErr;
  console.log('Patched PRD with TESTING sub-agent findings (FR-1 validator export, FR-4 mechanism revision + FR-4a, FR-5/6 test coverage, TS-1/3/5 corrections, TS-7/8/9 added).');
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
