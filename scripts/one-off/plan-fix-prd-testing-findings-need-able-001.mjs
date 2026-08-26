// PLAN-phase PRD correction for SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001, applied after prospective
// TESTING sub-agent review (sub_agent_execution_results id 4b88bb44-51de-47ad-9321-b78e92a3bfa0,
// CONDITIONAL_PASS 85) found 4 real structural gaps before EXEC begins:
//  1. tests/unit/marketing/venture-activation-gate.test.js's fakeSupabase() mock only recognizes
//     venture_telemetry/ops_payment_events -- the FR-2 daily_rollups query will throw "unexpected
//     table" and break all 3 existing computeActivationVerdict() tests unless extended first.
//  2. The existing generic rungs-iteration assertion (~line 182-185) asserts RUNG_STATE vocabulary
//     + a .value field on every rung -- rungs.cpa's distinct no_writer_yet/live/stale +
//     value_cents_per_conversion vocabulary will fail it unless the assertion is narrowed to
//     ACTIVATION_RUNGS-only keys.
//  3. computeActivationVerdict() has no platform parameter, but TR-2 said "grouped by venture_id +
//     platform" -- resolved: the verdict-layer rungs.cpa aggregates across ALL platforms for the
//     venture; per-channel breakdown lives in the separate FR-3 CLI script, which DOES take an
//     explicit platform argument.
//  4. daily_rollups/venture_demand_verdicts have zero rows fleet-wide (confirmed live) -- FR-3/TS-6
//     need seeded synthetic test data, not an assumption of live production data.
// Also fixes the SD's smoke_test_steps, which pre-date LEAD's self-correction and still reference
// marketing_attribution (dropped from TR-2) and the citation field (TR-3 forbids touching it).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001';
const PRD_ID = `PRD-${SD_KEY}`;

async function main() {
  const { data: prd, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, technical_requirements, test_scenarios')
    .eq('id', PRD_ID)
    .single();
  if (fetchErr || !prd) {
    console.error('FETCH_FAILED', fetchErr);
    process.exit(1);
  }

  // TR-2 correction (platform scoping) + two new TRs (vocabulary distinction, mock extension)
  const technical_requirements = prd.technical_requirements.map((tr) =>
    tr.id === 'TR-2'
      ? {
          ...tr,
          requirement: 'CPA = SUM(daily_rollups.spend_cents) / SUM(daily_rollups.conversions), summed ACROSS ALL PLATFORMS for a given venture_id (computeActivationVerdict() has no platform parameter and computes venture-level, not per-platform), over a caller-supplied lookback window (default 30 days)',
          rationale: "daily_rollups is the only migration-confirmed table carrying spend_cents AND conversions together at venture+platform+day grain. Per-channel/per-platform breakdown is provided separately by the FR-3 CLI script, which DOES take an explicit platform argument -- resolving the platform-scoping gap the prospective TESTING review (sub_agent_execution_results 4b88bb44-51de-47ad-9321-b78e92a3bfa0) found between TR-2's original wording and computeActivationVerdict()'s real signature (venture-activation-gate.js:267, no platform param).",
        }
      : tr
  );
  technical_requirements.push(
    {
      id: 'TR-5',
      requirement: "rungs.cpa uses its own vocabulary ({ state: 'no_writer_yet'|'live'|'stale', value_cents_per_conversion: number|null, reason: string }), distinct from RUNG_STATE.MEASURED/UNMEASURABLE used by the funnel rungs (visitors/signups/activated/paid)",
      rationale: "CPA is a continuous measurement with a live/stale distinction (matching funnel-gauge.mjs's own vocabulary), not a binary measured-or-not funnel step judged against a ratified floor. tests/unit/marketing/venture-activation-gate.test.js's existing generic assertion (~line 182-185, `for (const r of Object.values(out.rungs)) expect(r.state).toBe(RUNG_STATE.UNMEASURABLE)`) iterates ALL rungs keys and will fail once rungs.cpa is added with a different vocabulary -- confirmed by prospective TESTING review. That assertion must be narrowed to iterate only ACTIVATION_RUNGS-named keys, with a new, separate assertion added for rungs.cpa's distinct shape.",
    },
    {
      id: 'TR-6',
      requirement: "tests/unit/marketing/venture-activation-gate.test.js's fakeSupabase() mock (~line 44-53) must be extended with a daily_rollups table case before the FR-2 wiring change lands",
      rationale: "The mock currently recognizes only venture_telemetry/ops_payment_events and throws 'unexpected table ${table}' for anything else (confirmed by prospective TESTING review, sub_agent_execution_results 4b88bb44-51de-47ad-9321-b78e92a3bfa0). Without this fix, the FR-2 wiring's supabase.from('daily_rollups') call breaks all 3 existing computeActivationVerdict() tests the moment it lands.",
    },
  );

  // FR-2 acceptance_criteria: add the mock-extension + assertion-narrowing requirement
  // FR-3 acceptance_criteria: replace "live data" assumption with seeded synthetic data
  const functional_requirements = prd.functional_requirements.map((fr) => {
    if (fr.id === 'FR-2') {
      return {
        ...fr,
        acceptance_criteria: [
          ...fr.acceptance_criteria,
          "tests/unit/marketing/venture-activation-gate.test.js's fakeSupabase() mock is extended with a daily_rollups case (TR-6), and its existing rungs-iteration assertion is narrowed to ACTIVATION_RUNGS-only keys (TR-5) before this FR is considered complete",
        ],
      };
    }
    if (fr.id === 'FR-3') {
      return {
        ...fr,
        acceptance_criteria: fr.acceptance_criteria.map((ac) =>
          ac.startsWith('Running the script for a venture/platform with live spend+conversion data')
            ? 'Running the script against a test venture seeded with synthetic daily_rollups rows (spend+conversions) prints a real, non-zero CPA number -- daily_rollups has zero rows fleet-wide as of PLAN phase (confirmed live), so this cannot rely on pre-existing production data'
            : ac
        ),
      };
    }
    return fr;
  });

  // test_scenarios: fix TS-4's description to name the real gaps, add TS-7 (multi-row SUM proof)
  const test_scenarios = prd.test_scenarios.map((ts) =>
    ts.id === 'TS-4'
      ? {
          ...ts,
          scenario: 'Non-gating regression proof, with mock and assertion fixes',
          given: "the existing 3 computeActivationVerdict() tests in tests/unit/marketing/venture-activation-gate.test.js, BEFORE which fakeSupabase() has been extended with a daily_rollups case (TR-6) and the generic rungs-iteration assertion has been narrowed to ACTIVATION_RUNGS-only keys (TR-5)",
          when: 'the FR-2 wiring change lands',
          then: 'the existing 3 tests still pass without throwing "unexpected table", rungs now additionally contains a cpa key with its own vocabulary, and verdict/citation/path_to_pass remain byte-identical to a pre-change snapshot for the same fixtures',
        }
      : ts
  );
  test_scenarios.push({
    id: 'TS-7',
    scenario: 'Multi-row SUM aggregation (not a single-row shortcut)',
    test_type: 'unit',
    given: 'multiple daily_rollups rows for the same venture across different rollup_dates (e.g. spend_cents=3000/conversions=5 on day 1, spend_cents=7000/conversions=15 on day 2)',
    when: 'computeCpaGaugeState() is called with both rows',
    then: "it returns state='live', value_cents_per_conversion=500 (i.e. (3000+7000)/(5+15)), proving genuine SUM aggregation across rows rather than a last-row-wins or single-row-only implementation",
  });

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ technical_requirements, functional_requirements, test_scenarios })
    .eq('id', PRD_ID);
  if (updateErr) {
    console.error('PRD_UPDATE_FAILED', updateErr);
    process.exit(1);
  }
  console.log('PRD_CORRECTED');

  const smoke_test_steps = [
    { instruction: 'Seed synthetic daily_rollups rows for a test venture/platform with known spend_cents + conversions (production daily_rollups is empty fleet-wide as of PLAN phase)', expected_outcome: 'Rows are inserted successfully and readable via a direct query' },
    { instruction: 'Call computeCpaGaugeState() (or the FR-3 CLI script) for that venture/platform', expected_outcome: 'Returns a real, non-fabricated CPA number matching the seeded spend/conversions' },
    { instruction: 'Call computeCpaGaugeState() (or the FR-3 CLI script) for a venture/platform with zero daily_rollups rows', expected_outcome: "Returns an explicit no_writer_yet state, never a fabricated 0" },
    { instruction: "Run computeActivationVerdict() for a test venture after the FR-2 wiring lands", expected_outcome: "The returned rungs object contains a cpa key (own vocabulary: state/value_cents_per_conversion/reason), and verdict/citation/path_to_pass are unchanged from the pre-change fixture snapshot" },
  ];
  const { error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .update({ smoke_test_steps })
    .eq('sd_key', SD_KEY);
  if (sdErr) {
    console.error('SD_SMOKE_TEST_UPDATE_FAILED', sdErr);
    process.exit(1);
  }
  console.log('SD_SMOKE_TEST_STEPS_CORRECTED');
}

main();
