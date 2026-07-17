import { describe, it, expect } from 'vitest';
import { runFanout, hashRegionInputs } from '../../../lib/fable-suitability/fanout.mjs';
import { evaluateRefloat, computeFreshness } from '../../../lib/fable-suitability/living-update.mjs';
import { readModeBCandidates, toModeBCandidate, MODE_B_CONTRACT_VERSION } from '../../../lib/fable-suitability/mode-b-seam.mjs';

const mockClient = { async scoreStructured() { return { score: 3, rationale: 'mid' }; } };

function region(key, files = 5) {
  return {
    region: { region_key: key, repo: 'EHG_Engineer', summary: `${files} files` },
    dutyCluster: 'harness-depth',
    signals: {
      impact: { centrality: files, fanOut: files, crossRepoCount: 1 },
      opportunity: { issuePatterns: [], bypassCount: 0, failurePatternCount: 0, consumerCount: files, churn: 1, complexityProxy: files },
      reasoning: { blastRadius: files, lookAhead: files },
    },
  };
}

describe('runFanout — cost bound (FR-1 / TS-1)', () => {
  it('skips a region whose input-hash is unchanged (cache hit)', async () => {
    const r = region('ehg_engineer/lib/a');
    const cache = new Map([[r.region.region_key, hashRegionInputs(r.region, r.signals)]]);
    const persistCalls = [];
    const out = await runFanout({ regions: [r], client: mockClient, persist: async (row) => { persistCalls.push(row); return { status: 'CEREMONY_PENDING' }; }, cache });
    expect(out.skipped).toContain(r.region.region_key);
    expect(out.scored).toHaveLength(0);
    expect(persistCalls).toHaveLength(0);
  });

  it('scores only changed regions and respects maxBatch', async () => {
    const regions = [region('ehg_engineer/lib/a'), region('ehg_engineer/lib/b'), region('ehg_engineer/lib/c')];
    const out = await runFanout({ regions, client: mockClient, persist: async () => ({ status: 'CEREMONY_PENDING' }), maxBatch: 2 });
    expect(out.scored).toHaveLength(2);
    expect(out.batchTruncated).toBe(true);
  });

  it('CEREMONY_PENDING persist does not abort the run (inert-but-reachable)', async () => {
    const out = await runFanout({ regions: [region('ehg_engineer/lib/a')], client: mockClient, persist: async () => ({ status: 'CEREMONY_PENDING' }) });
    expect(out.scored).toHaveLength(1);
    expect(out.ceremonyPending).toBe(1);
    expect(out.persisted).toBe(0);
  });

  it('counts a successful persist', async () => {
    const out = await runFanout({ regions: [region('ehg_engineer/lib/a')], client: mockClient, persist: async () => ({ status: 'ok' }) });
    expect(out.persisted).toBe(1);
  });
});

describe('evaluateRefloat — debounced threshold (FR-2 / TS-2)', () => {
  const base = { region_key: 'lib/x', score_version: 1, recurrence_weight: 2, refloated_at: null };

  it('re-floats when recurrence climbs past threshold', () => {
    const r = evaluateRefloat(base, { recurrenceWeight: 4 }, { threshold: 1, now: 1_000_000_000_000 });
    expect(r.refloat).toBe(true);
    expect(r.patch.score_version).toBe(2);
    expect(r.patch.trigger_reason).toMatch(/recurrence/);
    expect(r.patch.input_snapshot).toBeTruthy();
  });

  it('does NOT re-float below threshold', () => {
    const r = evaluateRefloat(base, { recurrenceWeight: 2.5 }, { threshold: 1, now: 1_000_000_000_000 });
    expect(r.refloat).toBe(false);
  });

  it('does NOT re-float within the debounce window', () => {
    const recent = { ...base, refloated_at: new Date(1_000_000_000_000 - 1000).toISOString() };
    const r = evaluateRefloat(recent, { recurrenceWeight: 10 }, { threshold: 1, debounceMs: 60_000, now: 1_000_000_000_000 });
    expect(r.refloat).toBe(false);
    expect(r.reason).toMatch(/debounce/);
  });
});

describe('computeFreshness — observable gauge (FR-2 / TS-3)', () => {
  it('reports stale regions past staleAfterMs', () => {
    const now = 1_000_000_000_000;
    const rows = [
      { region_key: 'fresh', last_scored_at: new Date(now - 1000).toISOString() },
      { region_key: 'stale', last_scored_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString() },
    ];
    const g = computeFreshness(rows, { now, staleAfterMs: 7 * 24 * 60 * 60 * 1000 });
    expect(g.fresh).toBe(1);
    expect(g.stale).toBe(1);
    expect(g.staleRegionKeys).toContain('stale');
  });
});

describe('mode-b-seam — versioned inert-but-reachable contract (FR-3 / TS-4)', () => {
  it('projects a current-view row into the versioned candidate shape', () => {
    const cand = toModeBCandidate({
      region_key: 'ehg_engineer/lib/gates', repo: 'EHG_Engineer', duty_cluster: 'harness-depth',
      composite_score: 60, score_version: 2, last_scored_at: '2026-07-17T00:00:00.000Z',
      evidence: { axes: { impact: { rationale: 'i' }, opportunity: { rationale: 'o' }, reasoning_depth: { rationale: 'r' } } },
    });
    expect(cand.contract_version).toBe(MODE_B_CONTRACT_VERSION);
    expect(cand.source).toBe('fable-suitability-map');
    expect(cand.rationale).toBe('i | o | r');
  });

  it('returns CEREMONY_PENDING (inert) when the view is missing, without throwing', async () => {
    // The no-filter path awaits select('*') directly; resolve it with the PostgREST missing-table error.
    const seam = {
      from() {
        return { select() { return Promise.resolve({ error: { code: 'PGRST205', message: 'Could not find the table' } }); } };
      },
    };
    const r = await readModeBCandidates(seam);
    expect(r.status).toBe('CEREMONY_PENDING');
    expect(r.contract_version).toBe(MODE_B_CONTRACT_VERSION);
    expect(r.candidates).toHaveLength(0);
  });

  it('returns sorted candidates on a successful read', async () => {
    const rows = [
      { region_key: 'a', repo: 'EHG_Engineer', duty_cluster: 'dedup', composite_score: 10, score_version: 1, last_scored_at: 't', evidence: {} },
      { region_key: 'b', repo: 'EHG_Engineer', duty_cluster: 'dedup', composite_score: 40, score_version: 1, last_scored_at: 't', evidence: {} },
    ];
    const seam = { from() { return { select() { return Promise.resolve({ data: rows, error: null }); } }; } };
    const r = await readModeBCandidates(seam);
    expect(r.status).toBe('ok');
    expect(r.candidates[0].region_key).toBe('b'); // highest composite first
  });
});
