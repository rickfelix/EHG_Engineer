/**
 * Live-DB seam contract e2e for the Fable-suitability Mode-B seam.
 * SD-LEO-INFRA-FABLE-SUITABILITY-MAP-001-C (FR-5, TS-6).
 *
 * Recurred-family rule: mocking the WHOLE seam ships green on dead code. This test drives the REAL
 * produce -> persist -> read path — fan-out (child B scorers) -> child A upsertRegionScore ->
 * readModeBCandidates -> a FIXTURE consumer standing in for parked Solomon Mode-B — so the seam is
 * provably wired, not merely present.
 *
 * Two-state around the STAGED child-A gate:
 *   - Child A unapplied  -> persist returns CEREMONY_PENDING and the seam returns the inert
 *     CEREMONY_PENDING result. We assert THAT (reachable-but-dormant proven against a real absent view).
 *   - Child A applied     -> a real ranked candidate round-trips to the fixture consumer at the
 *     current MODE_B_CONTRACT_VERSION.
 */
import { afterAll, beforeAll, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { describeDb } from '../helpers/db-available.js';
import { upsertRegionScore } from '../../lib/fable-suitability/map-writer.mjs';
import { runFanout } from '../../lib/fable-suitability/fanout.mjs';
import { readModeBCandidates, MODE_B_CONTRACT_VERSION } from '../../lib/fable-suitability/mode-b-seam.mjs';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TEST_REGION = 'ehg_engineer/__test__/fable-seam-ts6';
const detClient = { async scoreStructured() { return { score: 4, rationale: 'seam e2e' }; } };

/** Fixture Mode-B consumer: reads candidates and validates the versioned contract (stands in for Solomon). */
function fixtureModeBConsumer(seamResult) {
  if (seamResult.contract_version !== MODE_B_CONTRACT_VERSION) throw new Error('contract version mismatch');
  return seamResult.candidates.filter((c) => c.source === 'fable-suitability-map');
}

async function tableApplied() {
  const { error } = await supabase.from('fable_suitability_map').select('id').limit(1);
  return !error;
}

describeDb('Fable-suitability Mode-B seam — real produce->persist->read e2e (TS-6)', () => {
  let applied = false;

  beforeAll(async () => {
    applied = await tableApplied();
    if (applied) await supabase.from('fable_suitability_map').delete().eq('region_key', TEST_REGION);
  });
  afterAll(async () => {
    if (applied) await supabase.from('fable_suitability_map').delete().eq('region_key', TEST_REGION);
  });

  it('drives fan-out -> persist -> Mode-B read to a fixture consumer', async () => {
    const regions = [{
      region: { region_key: TEST_REGION, repo: 'EHG_Engineer', summary: 'seam e2e' },
      dutyCluster: 'harness-depth',
      signals: {
        impact: { centrality: 20, fanOut: 15, crossRepoCount: 2 },
        opportunity: { issuePatterns: [{ id: 'x', occurrence_count: 45, trend: 'increasing' }], bypassCount: 5, failurePatternCount: 5, consumerCount: 20, churn: 30, complexityProxy: 8 },
        reasoning: { blastRadius: 5, lookAhead: 5 },
      },
    }];

    const fan = await runFanout({ regions, client: detClient, persist: (row) => upsertRegionScore(supabase, row), maxBatch: 5 });
    expect(fan.scored).toHaveLength(1); // scoring is real regardless of persist state

    const seamResult = await readModeBCandidates(supabase, { dutyCluster: 'harness-depth' });

    if (!applied) {
      // Reachable-but-dormant: persist and seam are both CEREMONY_PENDING against the real absent view.
      expect(fan.ceremonyPending).toBe(1);
      expect(seamResult.status).toBe('CEREMONY_PENDING');
      expect(seamResult.candidates).toHaveLength(0);
      return;
    }

    // Applied: a real candidate round-trips to the fixture consumer at the current contract version.
    expect(fan.persisted).toBe(1);
    expect(seamResult.status).toBe('ok');
    const consumed = fixtureModeBConsumer(seamResult);
    const mine = consumed.filter((c) => c.region_key === TEST_REGION);
    expect(mine).toHaveLength(1);
    expect(mine[0].contract_version).toBe(MODE_B_CONTRACT_VERSION);
    expect(mine[0].composite_score).toBeGreaterThan(0); // a real ranked composite persisted + read back
  });
});
