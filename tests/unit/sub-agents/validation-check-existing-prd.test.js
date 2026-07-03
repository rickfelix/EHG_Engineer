/**
 * SD-LEARN-FIX-ADDRESS-SAL-VALIDATION-001 — checkExistingPRD() UUID-column fix.
 *
 * ROOT CAUSE: checkExistingPRD(sdId) queried product_requirements_v2 by
 * `.eq('directive_id', sdId)`, but sdId at this call site is the SD's UUID
 * (lib/sub-agent-executor/executor.js passes sdUUID) while directive_id
 * intentionally stores the SD KEY STRING (scripts/prd/index.js). The UUID-
 * bearing column is sd_id. The mismatch produced a false "no PRD" result
 * (and the recurring "PLAN agent should create PRD before EXEC phase
 * begins" recommendation) for essentially every SD that actually has one.
 */
import { describe, it, expect, vi } from 'vitest';
import { checkExistingPRD } from '../../../lib/sub-agents/validation.js';

function fakeSupabaseFor(expectedColumn, expectedValue, row) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push({ table });
      return {
        select: (cols) => {
          calls[calls.length - 1].select = cols;
          return {
            eq: (col, value) => {
              calls[calls.length - 1].eq = { col, value };
              return {
                single: async () => {
                  if (col === expectedColumn && value === expectedValue) {
                    return { data: row, error: null };
                  }
                  return { data: null, error: { message: 'Not found' } };
                }
              };
            }
          };
        }
      };
    }
  };
}

describe('checkExistingPRD queries by sd_id (UUID), not directive_id (key string)', () => {
  const sdUUID = 'b89a7682-b171-42b5-992c-a47a43acec6f';
  const prdRow = {
    id: 'PRD-SD-LEO-INFRA-LLM-FACTORY-TIER-LADDER-001',
    title: 'Product Requirements for SD-LEO-INFRA-LLM-FACTORY-TIER-LADDER-001',
    status: 'in_progress',
    functional_requirements: [{ id: 'FR-1' }],
    non_functional_requirements: [],
    acceptance_criteria: ['a', 'b']
  };

  it('finds the PRD when the fixture has sd_id = the SD UUID (real-world shape)', async () => {
    const client = fakeSupabaseFor('sd_id', sdUUID, prdRow);

    const result = await checkExistingPRD(sdUUID, client);

    expect(result.found).toBe(true);
    expect(result.prd.title).toBe(prdRow.title);
    expect(client.calls[0].eq).toEqual({ col: 'sd_id', value: sdUUID });
  });

  it('regression guard: querying by directive_id (the pre-fix column) would NOT find this PRD', async () => {
    // Simulates the exact bug: directive_id holds the SD KEY STRING, not the UUID,
    // so a client that only matches on directive_id never returns this row for a UUID.
    const client = fakeSupabaseFor('directive_id', 'SD-LEO-INFRA-LLM-FACTORY-TIER-LADDER-001', prdRow);

    const result = await checkExistingPRD(sdUUID, client);

    expect(result.found).toBe(false);
  });

  it('returns found:false without throwing when no PRD exists for this SD', async () => {
    const client = fakeSupabaseFor('sd_id', 'some-other-uuid', prdRow);

    const result = await checkExistingPRD(sdUUID, client);

    expect(result.found).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
