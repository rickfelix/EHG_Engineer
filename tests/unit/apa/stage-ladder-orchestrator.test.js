/**
 * lib/apa/stage-ladder-orchestrator unit tests
 * SD-LEO-INFRA-AUTOMATED-PRODUCT-ASSESSMENT-001-D
 *
 * Covers PRD test scenarios TS-1 through TS-10.
 */

import { describe, it, expect } from 'vitest';
import {
  runStageLadder,
  runStageWithFixLoop,
  resolvePersonas,
  runPersonaMatrix,
  assertChairmanStampEligible,
} from '../../../lib/apa/stage-ladder-orchestrator.mjs';

describe('TS-1/TS-2: runStageLadder gating', () => {
  it('TS-1: halts on first failure, never runs downstream stages', async () => {
    const calls = [];
    const stages = ['S0', 'S1', 'S2'].map((id) => ({
      id,
      run: async () => { calls.push(id); return { pass: id !== 'S0' }; },
    }));
    const result = await runStageLadder(stages);
    expect(calls).toEqual(['S0']);
    expect(result.haltedAt).toBe('S0');
    expect(result.completedStages).toEqual([]);
  });

  it('TS-2: completes fully when every stage passes', async () => {
    const stages = ['S0', 'S1', 'S2'].map((id) => ({ id, run: async () => ({ pass: true }) }));
    const result = await runStageLadder(stages);
    expect(result.completedStages).toEqual(['S0', 'S1', 'S2']);
    expect(result.haltedAt).toBeNull();
  });
});

describe('TS-3/TS-4/TS-5: runStageWithFixLoop', () => {
  it('TS-3: plateaus within 2 re-runs on identical recurring findings', async () => {
    const stage = { id: 'S1', run: async () => ({ pass: false, findings: [{ key: 'same' }] }) };
    const result = await runStageWithFixLoop(stage, {}, { maxRetries: 5 });
    expect(result.plateaued).toBe(true);
    expect(result.capped).toBe(false);
    expect(result.attempts).toBeLessThanOrEqual(3);
  });

  it('TS-4: does not falsely plateau on genuinely improving findings', async () => {
    let remaining = 3;
    const stage = {
      id: 'S1',
      run: async () => {
        if (remaining === 0) return { pass: true, findings: [] };
        const findings = Array.from({ length: remaining }, (_, i) => ({ key: `f${i}` }));
        remaining -= 1;
        return { pass: false, findings };
      },
    };
    const result = await runStageWithFixLoop(stage, {}, { maxRetries: 10 });
    expect(result.clean).toBe(true);
    expect(result.plateaued).toBe(false);
  });

  it('TS-5: hits the retry cap (capped:true) on non-plateauing, never-clearing findings', async () => {
    let counter = 0;
    const stage = {
      id: 'S1',
      run: async () => {
        counter += 1;
        return { pass: false, findings: [{ key: `f${counter}` }] };
      },
    };
    const result = await runStageWithFixLoop(stage, {}, { maxRetries: 3 });
    expect(result.capped).toBe(true);
    expect(result.plateaued).toBe(false);
    expect(result.attempts).toBe(4);
  });

  it('a stage that passes immediately returns clean:true on the first attempt', async () => {
    const stage = { id: 'S0', run: async () => ({ pass: true }) };
    const result = await runStageWithFixLoop(stage, {});
    expect(result).toMatchObject({ clean: true, attempts: 1 });
  });
});

describe('TS-6/TS-7: resolvePersonas', () => {
  const makeSupabase = (rows, error = null) => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            order: () => ({
              limit: async () => ({ data: rows, error }),
            }),
          }),
        }),
      }),
    }),
  });

  it('TS-6: returns the real parsed persona list, unmodified', async () => {
    const personas = [{ name: 'Chloe' }, { name: 'Mark' }];
    const sb = makeSupabase([{ content: { personas }, created_at: '2026-01-01' }]);
    const result = await resolvePersonas('venture-1', sb);
    expect(result.personas).toEqual(personas);
    expect(result.findings).toEqual([]);
  });

  it('handles content stored as a JSON string, not just an object', async () => {
    const personas = [{ name: 'Chloe' }];
    const sb = makeSupabase([{ content: JSON.stringify({ personas }), created_at: '2026-01-01' }]);
    const result = await resolvePersonas('venture-1', sb);
    expect(result.personas).toEqual(personas);
  });

  it('TS-7: no matching artifact resolves to empty array + a structured finding, never a default', async () => {
    const sb = makeSupabase([]);
    const result = await resolvePersonas('venture-2', sb);
    expect(result.personas).toEqual([]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].type).toBe('PERSONA_PROVENANCE_MISSING');
  });

  it('a query error also resolves to empty + finding, never throws', async () => {
    const sb = makeSupabase(null, { message: 'boom' });
    const result = await resolvePersonas('venture-3', sb);
    expect(result.personas).toEqual([]);
    expect(result.findings[0].reason).toContain('boom');
  });

  it('an artifact with an empty personas array is also a provenance-missing finding', async () => {
    const sb = makeSupabase([{ content: { personas: [] }, created_at: '2026-01-01' }]);
    const result = await resolvePersonas('venture-4', sb);
    expect(result.personas).toEqual([]);
    expect(result.findings[0].type).toBe('PERSONA_PROVENANCE_MISSING');
  });
});

describe('TS-8: runPersonaMatrix cross-product', () => {
  it('produces exactly N*M tagged results', () => {
    const checkers = [
      { id: 'sideEffectHonesty', check: () => ({ pass: true }) },
      { id: 'recoveryPath', check: () => ({ pass: false, findings: [{ key: 'x' }] }) },
    ];
    const personas = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
    const results = runPersonaMatrix(checkers, personas, {});
    expect(results).toHaveLength(6);
    expect(results.filter((r) => r.checkerId === 'recoveryPath')).toHaveLength(3);
    expect(results.filter((r) => r.personaName === 'A')).toHaveLength(2);
  });

  it('zero personas produces zero results', () => {
    const checkers = [{ id: 'c1', check: () => ({ pass: true }) }];
    expect(runPersonaMatrix(checkers, [], {})).toEqual([]);
  });
});

describe('TS-9/TS-10: assertChairmanStampEligible', () => {
  it('TS-9: refuses a partial ladder, naming the missing stage', () => {
    const s5Result = { completedStages: ['S0', 'S1', 'S2'], results: {} };
    const verdict = assertChairmanStampEligible(s5Result);
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toContain('S3');
  });

  it('TS-10: grants eligibility for a full, zero-finding S0-S4 pass', () => {
    const s5Result = {
      completedStages: ['S0', 'S1', 'S2', 'S3', 'S4'],
      results: {
        S0: { findings: [] }, S1: { findings: [] }, S2: { findings: [] }, S3: { findings: [] }, S4: { findings: [] },
      },
    };
    expect(assertChairmanStampEligible(s5Result).eligible).toBe(true);
  });

  it('refuses when any stage carries findings, even if the ladder completed', () => {
    const s5Result = {
      completedStages: ['S0', 'S1', 'S2', 'S3', 'S4'],
      results: {
        S0: { findings: [] }, S1: { findings: [] }, S2: { findings: [{ key: 'x' }] }, S3: { findings: [] }, S4: { findings: [] },
      },
    };
    const verdict = assertChairmanStampEligible(s5Result);
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toContain('S2');
  });
});
