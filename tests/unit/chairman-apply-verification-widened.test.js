// SD-LEO-INFRA-COMPLETION-FAIL-OWN-001
// CHAIRMAN_APPLY_VERIFICATION widened to UNGATED SDs (coordinator ruling 454e005a).
//
// The incident: SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 reached status=completed while
// venture_demand_verdicts and venture_consent_events did not exist — its flag was unset, so the
// gate declared itself not applicable and the ungated branch went completely unenforced.
// Every positive-control case below PASSES against the pre-widening code; that is the point.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const classifyMigrationApplyState = vi.fn();
vi.mock(
  '../../scripts/modules/handoff/executors/lead-final-approval/chairman-apply-state.js',
  () => ({ classifyMigrationApplyState: (...a) => classifyMigrationApplyState(...a) })
);

const { createChairmanApplyVerificationGate } = await import(
  '../../scripts/modules/handoff/executors/lead-final-approval/gates.js'
);

const gate = () => createChairmanApplyVerificationGate();
const sdWith = (metadata) => ({ sd: { sd_key: 'SD-TEST-001', metadata } });

beforeEach(() => classifyMigrationApplyState.mockReset());

describe('positive control: an UNGATED SD with its own NOT_APPLIED migration is blocked', () => {
  it('blocks, names the file + missing objects, and names the coordinator clearance path', async () => {
    classifyMigrationApplyState.mockResolvedValue({
      files: [
        { file: '20260101_SD-TEST-001_add_thing.sql', status: 'NOT_APPLIED', missing: ['table:thing'] },
        { file: '20260102_unrelated.sql', status: 'APPLIED' }
      ],
      error: null
    });
    const r = await gate().validator(sdWith({}));
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    const text = r.issues.join('\n');
    expect(text).toContain('20260101_SD-TEST-001_add_thing.sql');
    expect(text).toContain('NOT_APPLIED');
    // Applier-reachability (ruling condition 4): the refusal must say WHO clears it.
    expect(text).toMatch(/REMEDIATION \(ungated\)/);
    expect(text).toMatch(/coordinator/i);
    expect(text).not.toMatch(/chairman GO/);
  });

  it('would have blocked the incident SD: PARTIAL counts as not applied for ungated too', async () => {
    classifyMigrationApplyState.mockResolvedValue({
      files: [{ file: '20260101_SD-TEST-001_add_thing.sql', status: 'PARTIAL', missing: ['table:thing'] }],
      error: null
    });
    const r = await gate().validator(sdWith({}));
    expect(r.passed).toBe(false);
    expect(r.issues.join('\n')).toContain('PARTIAL');
  });
});

describe('accept half: the widened gate does not blanket-block ungated SDs', () => {
  it('passes an ungated SD whose owned migration is APPLIED', async () => {
    classifyMigrationApplyState.mockResolvedValue({
      files: [{ file: '20260101_SD-TEST-001_add_thing.sql', status: 'APPLIED' }],
      error: null
    });
    const r = await gate().validator(sdWith({}));
    expect(r.passed).toBe(true);
    expect(r.details.verified).toEqual(['20260101_SD-TEST-001_add_thing.sql']);
    expect(r.details.gated).toBe(false);
  });

  it('passes an ungated SD owning no migration at all (the fleet majority)', async () => {
    classifyMigrationApplyState.mockResolvedValue({
      files: [{ file: '20260102_unrelated.sql', status: 'APPLIED' }],
      error: null
    });
    const r = await gate().validator(sdWith({}));
    expect(r.passed).toBe(true);
    expect(r.details.migrationless).toBe(true);
  });
});

describe('fail-closed now reaches the ungated population', () => {
  it('blocks an ungated SD when the classifier errors (previously the early-return passed it)', async () => {
    classifyMigrationApplyState.mockResolvedValue({ files: [], error: 'connect ECONNREFUSED' });
    const r = await gate().validator(sdWith({}));
    expect(r.passed).toBe(false);
    expect(r.details.fail_closed).toBe(true);
  });

  it('blocks an ungated SD whose DECLARED migration is absent from the corpus', async () => {
    classifyMigrationApplyState.mockResolvedValue({
      files: [{ file: '20260102_unrelated.sql', status: 'APPLIED' }],
      error: null
    });
    const r = await gate().validator(sdWith({ migration_files: ['20260101_typo.sql'] }));
    expect(r.passed).toBe(false);
    expect(r.issues.join('\n')).toContain('20260101_typo.sql');
  });

  it('still fails closed for a GATED SD owning nothing — the flag is a promise a migration exists', async () => {
    classifyMigrationApplyState.mockResolvedValue({ files: [], error: null });
    const r = await gate().validator(sdWith({ requires_chairman_apply: true }));
    expect(r.passed).toBe(false);
    expect(r.details.fail_closed).toBe(true);
  });
});

describe('gated refusals name the chairman ceremony (clearance path per class)', () => {
  it('a gated NOT_APPLIED refusal instructs chairman GO + coordinator apply', async () => {
    classifyMigrationApplyState.mockResolvedValue({
      files: [{ file: '20260101_SD-TEST-001_add_thing.sql', status: 'NOT_APPLIED', missing: [] }],
      error: null
    });
    const r = await gate().validator(sdWith({ requires_chairman_apply: true }));
    expect(r.passed).toBe(false);
    const text = r.issues.join('\n');
    expect(text).toMatch(/REMEDIATION \(chairman-gated\)/);
    expect(text).toMatch(/chairman GO/);
  });
});

describe('probe-shape pin: the gate consults the real classifier, never a head-count', () => {
  // Measured live twice (2026-08-09, worker + coordinator independently): on the SAME absent
  // table a real select errors PGRST205 while select(id,{count:'exact',head:true}) returns NO
  // error and count=null — a head-count gate cannot tell an absent table from an empty one.
  it('the gate source imports chairman-apply-state and contains no head-count existence probe', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.join(here, '../../scripts/modules/handoff/executors/lead-final-approval/gates.js'),
      'utf8'
    );
    const start = src.indexOf('export function createChairmanApplyVerificationGate');
    const end = src.indexOf('function failClosed');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const gateSection = src.slice(start, end);
    expect(gateSection).toContain("import('./chairman-apply-state.js')");
    expect(gateSection).not.toMatch(/count:\s*['"]exact['"]/);
    expect(gateSection).not.toMatch(/head:\s*true/);
  });
});
