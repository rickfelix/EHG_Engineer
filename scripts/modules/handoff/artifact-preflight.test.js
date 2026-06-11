/**
 * SD-MAN-ORCH-LEO-HARNESS-EFFICIENCY-001-A (program L1) — artifact pre-flight.
 *
 * Pins the FR-2 design contract:
 *  - HARD_FAIL only on shapes the gates deterministically reject
 *    (GATE_SD_METRICS_SUFFICIENCY mirror at LEAD-TO-PLAN, exact gate function);
 *  - everything else advisory (PLAN-TO-LEAD empty actuals — the gate
 *    auto-populates, so blocking would false-positive);
 *  - any internal error fails OPEN (verdict ERROR, never throws);
 *  - executeHandoff wiring: HARD_FAIL stops pre-pipeline with the remediation
 *    list, clean payloads pass through byte-identical, exceptions fall open.
 */

import { describe, it, expect, vi } from 'vitest';
import { runArtifactPreflight, executeArtifactPreflight } from './artifact-preflight.js';

const THREE_METRICS = [
  { metric: 'A', target: '>=1', actual: '1 — done' },
  { metric: 'B', target: '>=2', actual: '2 — done' },
  { metric: 'C', target: '>=3', actual: '3 — done' },
];

describe('runArtifactPreflight (pure core)', () => {
  it('LEAD-TO-PLAN: insufficient success_metrics (no criteria fallback) → HARD_FAIL naming success_metrics', () => {
    const r = runArtifactPreflight({
      handoffType: 'LEAD-TO-PLAN',
      sd: { sd_key: 'SD-T-001', success_metrics: [{ metric: 'only one', target: 'x' }] },
    });
    expect(r.verdict).toBe('HARD_FAIL');
    expect(r.violations.length).toBeGreaterThanOrEqual(1);
    expect(r.violations[0].field).toBe('success_metrics');
    expect(r.violations[0].hint).toContain('GATE_SD_METRICS_SUFFICIENCY');
  });

  it('LEAD-TO-PLAN: >=3 unique metrics → PASS (no deterministic reject)', () => {
    const r = runArtifactPreflight({
      handoffType: 'LEAD-TO-PLAN',
      sd: { sd_key: 'SD-T-002', success_metrics: THREE_METRICS },
    });
    expect(r.verdict).toBe('PASS');
    expect(r.violations).toEqual([]);
  });

  it('LEAD-TO-PLAN: duplicate-padded metrics dedup to insufficient → HARD_FAIL (gate parity)', () => {
    const dup = { metric: 'same text', target: 'x' };
    const r = runArtifactPreflight({
      handoffType: 'LEAD_TO_PLAN', // underscore form accepted
      sd: { sd_key: 'SD-T-003', success_metrics: [dup, { ...dup }, { ...dup }] },
    });
    expect(r.verdict).toBe('HARD_FAIL');
  });

  it('PLAN-TO-LEAD: empty metric actuals are ADVISORY ONLY (gate auto-populates — never block)', () => {
    const r = runArtifactPreflight({
      handoffType: 'PLAN-TO-LEAD',
      sd: { sd_key: 'SD-T-004', success_metrics: [{ metric: 'M1', target: '>=1', actual: '' }, { metric: 'M2', target: '>=1' }] },
    });
    expect(r.verdict).toBe('PASS');
    expect(r.advisories.length).toBe(2);
    expect(r.advisories[0].field).toBe('success_metrics[0].actual');
    expect(r.advisories[0].expected).toContain('LEADING WITH A NUMBER');
  });

  it('PLAN-TO-LEAD: evidence-bound metrics with empty actuals get NO advisory (gate resolves from evidence)', () => {
    const r = runArtifactPreflight({
      handoffType: 'PLAN-TO-LEAD',
      sd: {
        sd_key: 'SD-T-005',
        success_metrics: [{ metric: 'M1', target: '>=85', actual: '', evidence: { kind: 'gate_score', ref: { handoff: 'EXEC-TO-PLAN', expect: '>=85' } } }],
      },
    });
    expect(r.verdict).toBe('PASS');
    expect(r.advisories).toEqual([]);
  });

  it('LEAD-TO-PLAN with no PRD: no PRD-scoped checks run (per-handoff-type scoping)', () => {
    const r = runArtifactPreflight({
      handoffType: 'LEAD-TO-PLAN',
      sd: { sd_key: 'SD-T-006', success_metrics: THREE_METRICS },
      prd: null,
    });
    expect(r.verdict).toBe('PASS');
    expect(r.violations.every(v => !String(v.field).startsWith('prd'))).toBe(true);
  });

  it('missing SD row → PASS (pipeline owns SD-existence failures)', () => {
    expect(runArtifactPreflight({ handoffType: 'PLAN-TO-LEAD', sd: null }).verdict).toBe('PASS');
  });

  it('EXEC-TO-PLAN: no deterministic checks today → PASS pass-through', () => {
    const r = runArtifactPreflight({ handoffType: 'EXEC-TO-PLAN', sd: { sd_key: 'SD-T-007' } });
    expect(r.verdict).toBe('PASS');
    expect(r.violations).toEqual([]);
  });
});

describe('executeArtifactPreflight (fail-open wrapper)', () => {
  it('repo throw → verdict ERROR, never rejects', async () => {
    const r = await executeArtifactPreflight({
      sdRepo: { getById: vi.fn().mockRejectedValue(new Error('db down')) },
      prdRepo: null,
      handoffType: 'LEAD-TO-PLAN',
      sdId: 'SD-T-008',
    });
    expect(r.verdict).toBe('ERROR');
    expect(r.error).toContain('db down');
    expect(r.violations).toEqual([]);
  });

  it('fetches PRD only for PLAN-TO-EXEC', async () => {
    const getBySdId = vi.fn().mockResolvedValue({ id: 'prd-1' });
    const sdRepo = { getById: vi.fn().mockResolvedValue({ id: 'uuid-1', sd_key: 'SD-T-009', success_metrics: THREE_METRICS }) };
    await executeArtifactPreflight({ sdRepo, prdRepo: { getBySdId }, handoffType: 'LEAD-TO-PLAN', sdId: 'SD-T-009' });
    expect(getBySdId).not.toHaveBeenCalled();
    await executeArtifactPreflight({ sdRepo, prdRepo: { getBySdId }, handoffType: 'PLAN-TO-EXEC', sdId: 'SD-T-009' });
    expect(getBySdId).toHaveBeenCalledTimes(1);
  });
});
