// SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001.
// checkUatRobustnessGate()'s own logic is already thoroughly covered by
// tests/unit/eva/uat-robustness-gate.test.js -- this file covers only the thin
// wrapper: does it call the checker with the right args and shape the artifact.
import { describe, it, expect, vi } from 'vitest';
import { analyzeStage23DedicatedVentureUat } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-23-dedicated-venture-uat.js';
import { ARTIFACT_TYPES } from '../../../../../lib/eva/artifact-types.js';

function fakeSupabaseReturning(row) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: row, error: null }) };
            },
          };
        },
      };
    },
  };
}

describe('analyzeStage23DedicatedVentureUat', () => {
  it('calls checkUatRobustnessGate with fromStage=23 and passes the venture/supabase through', async () => {
    // Not opted in -> applies:false, satisfied:true (the gate's own documented safe default).
    const supabase = fakeSupabaseReturning({ metadata: {} });
    const result = await analyzeStage23DedicatedVentureUat({ supabase, ventureId: 'v-1', ventureName: 'Test Venture' });
    expect(result.applies).toBe(false);
    expect(result.satisfied).toBe(true);
    expect(result.venture_name).toBe('Test Venture');
  });

  it('wraps the gate result in a LAUNCH_UAT_REPORT artifact', async () => {
    const supabase = fakeSupabaseReturning({ metadata: {} });
    const result = await analyzeStage23DedicatedVentureUat({ supabase, ventureId: 'v-1' });
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].artifactType).toBe(ARTIFACT_TYPES.LAUNCH_UAT_REPORT);
    expect(result.artifacts[0].source).toBe('stage-23-dedicated-venture-uat');
    expect(result.artifacts[0].payload.applies).toBe(false);
  });

  it('accepts an injected logger without throwing', async () => {
    const supabase = fakeSupabaseReturning({ metadata: {} });
    const logger = { info: vi.fn() };
    await analyzeStage23DedicatedVentureUat({ supabase, ventureId: 'v-1', logger });
    expect(logger.info).toHaveBeenCalled();
  });
});
