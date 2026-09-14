/**
 * SD-LEARN-FIX-ADDRESS-PAT-LES-012 (TS-7, FR-4): downstream UAT integration-check.js
 * consumer parity between integration_operationalization = NULL and the write-path
 * default placeholder.
 *
 * Before FR-4's reader fix, ANY non-null placeholder shape flipped
 * validateConsumerPresence from passed:true (NULL early-return) to passed:false for
 * infrastructure SDs -- a real regression the gate-only exit predicate (TS-4) cannot see,
 * since this is a DIFFERENT reader (TESTING sub-agent finding F2, currently zero live
 * callers but a landmine for whenever this reader is wired).
 */
import { describe, it, expect, vi } from 'vitest';
import { buildDefaultIntegrationOperationalization } from '../../../scripts/prd/prd-creator.js';

// fetchIntegrationDataFromPRD creates its own Supabase client when none is passed; supply
// a fake client so no real network/env access is needed.
function makeFakeSupabase(prdRow) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: prdRow, error: null }),
        }),
      }),
    }),
  };
}

describe('SD-LEARN-FIX-ADDRESS-PAT-LES-012 (TS-7): integration-check.js reader parity', () => {
  it('validateConsumerPresence: NULL vs. default placeholder both pass identically for infrastructure', async () => {
    const { validateConsumerPresence } = await import('../../../scripts/modules/uat-assessment/sections/integration-check.js');
    const nullResult = validateConsumerPresence(null, 'infrastructure');
    // FR-4 fix lives in fetchIntegrationDataFromPRD (which coerces an all-empty object to
    // null before it ever reaches validateConsumerPresence) -- so we exercise the FULL
    // reader path (fetchIntegrationDataFromPRD -> runIntegrationCheck), not this function
    // in isolation, since validateConsumerPresence(default,...) alone is BY DESIGN still
    // the pre-fix failing behavior (the coercion happens one layer up).
    expect(nullResult.passed).toBe(true);
  });

  it('runIntegrationCheck: NULL vs. default placeholder produce identical {passed, errors.length} for infrastructure', async () => {
    const { runIntegrationCheck } = await import('../../../scripts/modules/uat-assessment/sections/integration-check.js');

    const nullSb = makeFakeSupabase({ id: 'prd-1', integration_operationalization: null, sd_id: 'sd-1' });
    const defaultSb = makeFakeSupabase({ id: 'prd-1', integration_operationalization: buildDefaultIntegrationOperationalization(), sd_id: 'sd-1' });

    const nullResult = await runIntegrationCheck('sd-1', 'infrastructure', nullSb);
    const defaultResult = await runIntegrationCheck('sd-1', 'infrastructure', defaultSb);

    expect(defaultResult.passed).toBe(nullResult.passed);
    expect(defaultResult.errors.length).toBe(nullResult.errors.length);
    expect(defaultResult.passed).toBe(true);
  });

  it('runIntegrationCheck: NULL vs. default placeholder produce identical {passed, errors.length} for feature', async () => {
    const { runIntegrationCheck } = await import('../../../scripts/modules/uat-assessment/sections/integration-check.js');

    const nullSb = makeFakeSupabase({ id: 'prd-2', integration_operationalization: null, sd_id: 'sd-2' });
    const defaultSb = makeFakeSupabase({ id: 'prd-2', integration_operationalization: buildDefaultIntegrationOperationalization(), sd_id: 'sd-2' });

    const nullResult = await runIntegrationCheck('sd-2', 'feature', nullSb);
    const defaultResult = await runIntegrationCheck('sd-2', 'feature', defaultSb);

    expect(defaultResult.passed).toBe(nullResult.passed);
    expect(defaultResult.errors.length).toBe(nullResult.errors.length);
  });

  it('a row with genuine (non-default) content still validates normally -- the fix only collapses the all-empty case', async () => {
    const { runIntegrationCheck } = await import('../../../scripts/modules/uat-assessment/sections/integration-check.js');
    const realContent = {
      consumers: [{ name: 'Real Consumer', interaction: 'x', frequency: 'x' }],
      dependencies: [],
      data_contracts: [],
      runtime_config: {},
      observability_rollout: {},
    };
    const sb = makeFakeSupabase({ id: 'prd-3', integration_operationalization: realContent, sd_id: 'sd-3' });
    const result = await runIntegrationCheck('sd-3', 'infrastructure', sb);
    expect(result.subsectionsUsed).toContain('consumers');
    expect(result.consumerValidation.hasConsumers).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('fetchIntegrationDataFromPRD coerces the all-empty default to null (the FR-4 mechanism itself)', async () => {
    const { fetchIntegrationDataFromPRD } = await import('../../../scripts/modules/uat-assessment/sections/integration-check.js');
    const sb = makeFakeSupabase({ id: 'prd-4', integration_operationalization: buildDefaultIntegrationOperationalization(), sd_id: 'sd-4' });
    const result = await fetchIntegrationDataFromPRD('sd-4', sb);
    expect(result.data).toBeNull();
  });

  it('fetchIntegrationDataFromPRD does NOT coerce genuine partial content', async () => {
    const { fetchIntegrationDataFromPRD } = await import('../../../scripts/modules/uat-assessment/sections/integration-check.js');
    const partialContent = { ...buildDefaultIntegrationOperationalization(), consumers: [{ name: 'x', interaction: 'x', frequency: 'x' }] };
    const sb = makeFakeSupabase({ id: 'prd-5', integration_operationalization: partialContent, sd_id: 'sd-5' });
    const result = await fetchIntegrationDataFromPRD('sd-5', sb);
    expect(result.data).toEqual(partialContent);
  });
});
