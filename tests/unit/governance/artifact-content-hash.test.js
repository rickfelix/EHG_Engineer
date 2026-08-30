import { describe, it, expect } from 'vitest';
import { computeArtifactHash } from '../../../lib/governance/artifact-content-hash.mjs';

function fakeSupabase({ sd, prd }) {
  return {
    from(table) {
      const row = table === 'strategic_directives_v2' ? sd : prd;
      const builder = {
        select: () => builder,
        or: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: row, error: null }),
      };
      return builder;
    },
  };
}

describe('computeArtifactHash (QF-20260830-312)', () => {
  it('TS-1: an unchanged SD produces the SAME hash on two computations', async () => {
    const sb = fakeSupabase({ sd: { title: 'T', description: 'D', success_criteria: [] }, prd: null });
    const a = await computeArtifactHash(sb, 'SD-X');
    const b = await computeArtifactHash(sb, 'SD-X');
    expect(a.sd).toBe(b.sd);
    expect(a.prd).toBeNull();
  });

  it('TS-2: editing one SD field changes the hash', async () => {
    const sbBefore = fakeSupabase({ sd: { title: 'T', description: 'D' }, prd: null });
    const sbAfter = fakeSupabase({ sd: { title: 'T', description: 'D2' }, prd: null });
    const before = await computeArtifactHash(sbBefore, 'SD-X');
    const after = await computeArtifactHash(sbAfter, 'SD-X');
    expect(before.sd).not.toBe(after.sd);
  });

  it('TS-3: a present PRD contributes a non-null prd hash', async () => {
    const sb = fakeSupabase({ sd: { title: 'T' }, prd: { functional_requirements: ['FR-1'], test_scenarios: [] } });
    const result = await computeArtifactHash(sb, 'SD-X');
    expect(result.prd).toBeTruthy();
  });
});
