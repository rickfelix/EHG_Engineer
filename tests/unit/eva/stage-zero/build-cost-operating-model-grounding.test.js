/**
 * SD-LEO-INFRA-UPSTREAM-OPERATING-MODEL-PROPAGATION-001 (FR-1) — ground the Stage-0 build-cost producer
 * in the operating model at the FIRST point cost is estimated, so burn is born zero-payroll /
 * venture-hosting-standard. Prevents the wrong cost assumptions from entering the pipeline upstream.
 */
import { describe, it, expect } from 'vitest';
import { estimateBuildCost } from '../../../../lib/eva/stage-zero/synthesis/build-cost-estimation.js';
import { getOperatingModelPromptBlock } from '../../../../lib/eva/standards/operating-model.js';

const silent = { log: () => {}, warn: () => {}, error: () => {} };
const pathOutput = { suggested_name: 'V1', suggested_problem: 'p', suggested_solution: 's', target_market: 'm' };

// injectable LLM client that captures the SYSTEM prompt + returns a controllable analysis JSON
function makeClient(analysis) {
  const calls = [];
  return {
    calls,
    complete: async (systemPrompt, userPrompt) => { calls.push({ systemPrompt, userPrompt }); return { content: JSON.stringify(analysis) }; },
  };
}

describe('FR-1 Stage-0 build-cost grounding', () => {
  it('injects the operating-model block as the SYSTEM prompt (was empty)', async () => {
    const client = makeClient({ complexity: 'moderate', infrastructure: { estimated_monthly_cost: 40 } });
    await estimateBuildCost(pathOutput, { logger: silent, llmClient: client });
    expect(client.calls[0].systemPrompt).toBe(getOperatingModelPromptBlock());
    expect(client.calls[0].systemPrompt).toMatch(/AI operations|payroll/i);
  });

  it('grounds an omitted/zero infra monthly cost to the operating-model hosting band (DERIVED)', async () => {
    const client = makeClient({ complexity: 'moderate', infrastructure: { required: ['supabase'], estimated_monthly_cost: 0 } });
    const r = await estimateBuildCost(pathOutput, { logger: silent, llmClient: client });
    expect(r.infrastructure.estimated_monthly_cost).toBeGreaterThan(0); // grounded, not $0 phantom-free burn
    expect(r.infra_cost_provenance).toBe('DERIVED-from-operating-model');
    expect(r.operating_model_grounded).toBe(true);
  });

  it('preserves a provided infra monthly cost (ESTIMATE, not over-grounded)', async () => {
    const client = makeClient({ complexity: 'simple', infrastructure: { estimated_monthly_cost: 40 } });
    const r = await estimateBuildCost(pathOutput, { logger: silent, llmClient: client });
    expect(r.infrastructure.estimated_monthly_cost).toBe(40);
    expect(r.infra_cost_provenance).toBe('ESTIMATE');
    expect(r.operating_model_grounded).toBe(false);
  });
});
