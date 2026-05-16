import { describe, it, expect } from 'vitest';
import { walkContractChain } from '../../lib/contract-chain/walker.mjs';

function mockSupabase({ flagEnabled = true, links = [] } = {}) {
  return {
    from(table) {
      return {
        select() {
          return {
            eq() { return this; },
            order() { return this; },
            limit() { return this; },
            maybeSingle: async () => {
              if (table === 'app_config') return { data: flagEnabled ? { value: { enabled: true } } : { value: { enabled: false } }, error: null };
              return { data: null, error: null };
            },
          };
        },
      };
    },
    __mockChain(arr) { this._chain = arr; },
  };
}

describe('contract-chain walker', () => {
  it('short-circuits when feature flag OFF', async () => {
    const r = await walkContractChain({ entityType: 'sd', entityId: 'x', supabase: mockSupabase({ flagEnabled: false }) });
    expect(r.gated_off).toBe(true);
    expect(r.chain).toEqual([]);
    expect(r.complete).toBe(null);
  });

  it('returns no chain when no links found', async () => {
    const r = await walkContractChain({ entityType: 'sd', entityId: 'x', supabase: mockSupabase({ flagEnabled: true }) });
    expect(r.chain).toEqual([]);
    expect(r.missing_links.length).toBeGreaterThan(0);
  });

  it('walks chain when links present', async () => {
    let callCount = 0;
    const supabase = {
      from(table) {
        return {
          select() {
            return {
              eq() { return this; },
              order() { return this; },
              limit() { return this; },
              maybeSingle: async () => {
                if (table === 'app_config') return { data: { value: { enabled: true } }, error: null };
                callCount++;
                if (callCount === 1) return { data: { id: 'l1', parent_contract_type: 'sd', parent_contract_id: 'root', child_contract_type: 'prd', child_contract_id: 'x', link_status: 'active', schema_version: '1.0.0', vocabulary_version: '1.0.0' }, error: null };
                return { data: null, error: null };
              },
            };
          },
        };
      },
    };
    const r = await walkContractChain({ entityType: 'prd', entityId: 'x', supabase });
    expect(r.chain.length).toBe(1);
    expect(r.chain[0].parent_type).toBe('sd');
    expect(r.complete).toBe(true);
  });
});
