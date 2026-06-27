/**
 * SD↔PRD Drift Gate — regression tests
 * SD-LEO-INFRA-SD-PRD-DRIFT-GATE-001 (FR-1..FR-5)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createSDPRDDriftGate,
  extractSdFrs,
  extractPrdFrs,
  findDriftedFrs,
  checkGovPrecondition,
} from './sd-prd-drift.js';

/** Minimal supabase stub: serves a PRD by directive_id/id and chairman_decisions. */
function stubSupabase({ prd = null, decisions = [] } = {}) {
  return {
    from(table) {
      const api = {
        select() { return api; },
        or() { return api; },
        eq() { return api; },
        in() { return api; },
        limit() { return api; },
        async maybeSingle() { return { data: table === 'product_requirements_v2' ? prd : null, error: null }; },
        then(resolve) { return resolve({ data: table === 'chairman_decisions' ? decisions : [], error: null }); },
      };
      return api;
    },
  };
}

const SD_PROSE = {
  sd_key: 'SD-X-001', id: 'uuid-x',
  description: 'FR-1 the detector compares SD and PRD. FR-2 false-positive guard via identity match. FR-3 actionable output naming missing FRs. FR-4 governance precondition enforcement.',
  scope: '',
  metadata: {},
};

describe('FR-1 SD/PRD FR extraction + drift detection', () => {
  it('extracts SD FRs from prose FR-N markers', () => {
    const frs = extractSdFrs(SD_PROSE);
    expect(frs.map((f) => f.id)).toEqual(['FR-1', 'FR-2', 'FR-3', 'FR-4']);
    expect(frs[0].text).toMatch(/compares SD and PRD/);
  });

  it('prefers structured metadata.functional_requirements when present', () => {
    const frs = extractSdFrs({ metadata: { functional_requirements: [{ id: 'FR-1', title: 'A', description: 'a' }, { id: 'FR-2', title: 'B' }] } });
    expect(frs.map((f) => f.id)).toEqual(['FR-1', 'FR-2']);
  });

  it('extracts PRD FRs from a JSONB array and a JSON string', () => {
    expect(extractPrdFrs({ functional_requirements: [{ id: 'FR-1', title: 'x' }] }).length).toBe(1);
    expect(extractPrdFrs({ functional_requirements: JSON.stringify([{ id: 'FR-1' }, { id: 'FR-2' }]) }).length).toBe(2);
  });

  it('detects an SD FR absent from the PRD', () => {
    const sdFrs = extractSdFrs(SD_PROSE);
    const prdFrs = [{ id: 'FR-1', text: 'detector' }, { id: 'FR-2', text: 'guard' }, { id: 'FR-4', text: 'governance' }];
    const drift = findDriftedFrs(sdFrs, prdFrs);
    expect(drift.map((f) => f.id)).toEqual(['FR-3']);
  });
});

describe('FR-2 false-positive guard (identity match, not string equality)', () => {
  it('treats a key-matched FR as present regardless of text', () => {
    const drift = findDriftedFrs([{ id: 'FR-1', text: 'totally different words here' }], [{ id: 'FR-1', text: 'unrelated prd prose' }]);
    expect(drift).toHaveLength(0);
  });

  it('treats a reworded-but-similar FR (no key match) as present via similarity', () => {
    const sdFrs = [{ id: 'FR-9', text: 'detector compares functional requirements between directive and product document' }];
    const prdFrs = [{ id: 'FR-A', text: 'the detector compares functional requirements across the directive and product requirements' }];
    expect(findDriftedFrs(sdFrs, prdFrs)).toHaveLength(0);
  });

  it('flags a genuinely-absent FR with no key match and low similarity', () => {
    const sdFrs = [{ id: 'FR-9', text: 'enforce spend guardrails with hard dollar caps for billing safety' }];
    const prdFrs = [{ id: 'FR-A', text: 'render a marketing roadmap timeline component on the dashboard' }];
    expect(findDriftedFrs(sdFrs, prdFrs).map((f) => f.id)).toEqual(['FR-9']);
  });
});

describe('FR-4 governance-precondition enforcement', () => {
  it('skips when the SD carries no chairman precondition', async () => {
    const r = await checkGovPrecondition({ metadata: {} }, {}, stubSupabase());
    expect(r).toEqual({ required: false, satisfied: true, marker: null });
  });

  it('passes when the precondition is reflected in the PRD', async () => {
    const sd = { sd_key: 'SD-X', metadata: { chairman_decision_required: true } };
    const prd = { functional_requirements: [{ id: 'FR-1', description: 'must not cut over until chairman bless is recorded' }] };
    const r = await checkGovPrecondition(sd, prd, stubSupabase());
    expect(r.required).toBe(true);
    expect(r.satisfied).toBe(true);
  });

  it('passes when blessed via an approved chairman_decision', async () => {
    const sd = { sd_key: 'SD-X', id: 'uuid', metadata: { chairman_decision_required: true } };
    const prd = { functional_requirements: [{ id: 'FR-1', description: 'unrelated' }] };
    const r = await checkGovPrecondition(sd, prd, stubSupabase({ decisions: [{ id: 'd1', status: 'approved' }] }));
    expect(r.satisfied).toBe(true);
  });

  it('flags an unreflected, unblessed precondition', async () => {
    const sd = { sd_key: 'SD-X', id: 'uuid', metadata: { chairman_decision_required: true } };
    const prd = { functional_requirements: [{ id: 'FR-1', description: 'unrelated prose' }] };
    const r = await checkGovPrecondition(sd, prd, stubSupabase({ decisions: [] }));
    expect(r.required).toBe(true);
    expect(r.satisfied).toBe(false);
  });
});

describe('FR-5 advisory vs enforcing + gate shape', () => {
  const prdMissingFr3 = { functional_requirements: [{ id: 'FR-1', title: 'detector' }, { id: 'FR-2', title: 'guard' }, { id: 'FR-4', title: 'governance' }] };

  afterEach(() => { delete process.env.SD_PRD_DRIFT_ENFORCING; });

  it('gate has the standard shape', () => {
    const gate = createSDPRDDriftGate(stubSupabase());
    expect(gate.name).toBe('SD_PRD_DRIFT');
    expect(typeof gate.validator).toBe('function');
  });

  it('advisory (default): drift yields warnings + passed=true (never wedges)', async () => {
    delete process.env.SD_PRD_DRIFT_ENFORCING;
    const gate = createSDPRDDriftGate(stubSupabase({ prd: prdMissingFr3 }));
    const r = await gate.validator({ sd: SD_PROSE, sdId: 'uuid-x', supabase: stubSupabase({ prd: prdMissingFr3 }) });
    expect(r.passed).toBe(true);
    expect(r.warnings.some((w) => /FR-3/.test(w))).toBe(true);
    expect(r.details.missing_frs.map((f) => f.id)).toContain('FR-3');
  });

  it('enforcing: drift yields issues + passed=false naming the missing FR', async () => {
    process.env.SD_PRD_DRIFT_ENFORCING = 'true';
    const gate = createSDPRDDriftGate(stubSupabase({ prd: prdMissingFr3 }));
    expect(gate.required).toBe(true);
    const r = await gate.validator({ sd: SD_PROSE, sdId: 'uuid-x', supabase: stubSupabase({ prd: prdMissingFr3 }) });
    expect(r.passed).toBe(false);
    expect(r.issues.some((i) => /FR-3/.test(i))).toBe(true);
    expect(r.remediation).toMatch(/re-sync/i);
  });

  it('passes (no drift) when all SD FRs are reflected in the PRD', async () => {
    const fullPrd = { functional_requirements: [{ id: 'FR-1' }, { id: 'FR-2' }, { id: 'FR-3' }, { id: 'FR-4' }] };
    const gate = createSDPRDDriftGate(stubSupabase({ prd: fullPrd }));
    const r = await gate.validator({ sd: SD_PROSE, sdId: 'uuid-x', supabase: stubSupabase({ prd: fullPrd }) });
    expect(r.passed).toBe(true);
    expect(r.details.missing_frs).toHaveLength(0);
  });

  it('no-ops (advisory pass) when there is no PRD or no extractable SD FRs', async () => {
    const gate = createSDPRDDriftGate(stubSupabase({ prd: null }));
    const r = await gate.validator({ sd: SD_PROSE, sdId: 'uuid-x', supabase: stubSupabase({ prd: null }) });
    expect(r.passed).toBe(true);
    expect(r.details.skipped).toBe(true);
  });
});
