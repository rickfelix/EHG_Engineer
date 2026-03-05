/**
 * Unit Tests for Financial Consistency Contract
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-F
 *
 * Tests the core module functions: setContract, getContract,
 * validateConsistency, refineContract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase client
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSingle = vi.fn();

function createMockChain(finalResult) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(finalResult),
    single: vi.fn().mockResolvedValue(finalResult),
  };
  return chain;
}

const mockSupabase = {
  from: vi.fn(),
};

// Mock createClient
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase),
}));

// Import after mock setup
const { setContract, getContract, validateConsistency, refineContract } = await import(
  '../../lib/eva/contracts/financial-contract.js'
);

describe('Financial Consistency Contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getContract', () => {
    it('returns null when no contract exists', async () => {
      const chain = createMockChain({ data: null, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await getContract('venture-123', { supabaseClient: mockSupabase });
      expect(result).toBeNull();
      expect(mockSupabase.from).toHaveBeenCalledWith('venture_financial_contract');
    });

    it('returns contract data when exists', async () => {
      const contractData = {
        id: 'contract-1',
        venture_id: 'venture-123',
        cac_estimate: 100,
        ltv_estimate: 500,
        capital_required: 50000,
        set_by_stage: 5,
      };
      const chain = createMockChain({ data: contractData, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await getContract('venture-123', { supabaseClient: mockSupabase });
      expect(result).toEqual(contractData);
    });

    it('throws on database error', async () => {
      const chain = createMockChain({ data: null, error: { message: 'DB error' } });
      mockSupabase.from.mockReturnValue(chain);

      await expect(getContract('venture-123', { supabaseClient: mockSupabase }))
        .rejects.toThrow('Failed to get financial contract');
    });
  });

  describe('setContract', () => {
    it('creates new contract when none exists', async () => {
      // First call: check existing (maybeSingle returns null)
      const selectChain = createMockChain({ data: null, error: null });
      // Second call: insert
      const insertResult = {
        id: 'new-id',
        venture_id: 'venture-123',
        cac_estimate: 100,
        ltv_estimate: 500,
      };
      const insertChain = createMockChain({ data: insertResult, error: null });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? selectChain : insertChain;
      });

      const result = await setContract('venture-123', 5, {
        cac: 100,
        ltv: 500,
        capitalRequired: 50000,
      }, { supabaseClient: mockSupabase });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(insertResult);
    });

    it('updates existing contract and appends to history', async () => {
      const existingContract = {
        venture_id: 'venture-123',
        cac_estimate: 80,
        ltv_estimate: 400,
        capital_required: 40000,
        refinement_history: [],
      };
      const selectChain = createMockChain({ data: existingContract, error: null });
      const updateChain = createMockChain({ data: { ...existingContract, cac_estimate: 100 }, error: null });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? selectChain : updateChain;
      });

      const result = await setContract('venture-123', 5, {
        cac: 100,
        ltv: 500,
      }, { supabaseClient: mockSupabase });

      expect(result.success).toBe(true);
    });
  });

  describe('validateConsistency', () => {
    it('returns consistent=true when no contract exists (backward compat)', async () => {
      const chain = createMockChain({ data: null, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await validateConsistency('venture-123', 8, {
        cac: 100,
      }, { supabaseClient: mockSupabase });

      expect(result.consistent).toBe(true);
      expect(result.deviations).toEqual([]);
    });

    it('returns ok severity for deviations <=20%', async () => {
      const contract = {
        venture_id: 'venture-123',
        cac_estimate: 100,
        ltv_estimate: 500,
        capital_required: 50000,
      };
      const chain = createMockChain({ data: contract, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await validateConsistency('venture-123', 8, {
        cac: 110,     // 10% deviation
        ltv: 480,     // 4% deviation
        capitalRequired: 52000, // 4% deviation
      }, { supabaseClient: mockSupabase });

      expect(result.consistent).toBe(true);
      expect(result.hasBlock).toBe(false);
      expect(result.hasWarning).toBe(false);
      expect(result.deviations.every(d => d.severity === 'ok')).toBe(true);
    });

    it('returns warning severity for 20-50% deviation', async () => {
      const contract = {
        venture_id: 'venture-123',
        cac_estimate: 100,
        ltv_estimate: 500,
        capital_required: 50000,
      };
      const chain = createMockChain({ data: contract, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await validateConsistency('venture-123', 8, {
        cac: 140,     // 40% deviation
        ltv: 500,
        capitalRequired: 50000,
      }, { supabaseClient: mockSupabase });

      expect(result.consistent).toBe(false);
      expect(result.hasWarning).toBe(true);
      expect(result.hasBlock).toBe(false);

      const cacDeviation = result.deviations.find(d => d.field === 'cac_estimate');
      expect(cacDeviation.severity).toBe('warning');
      expect(cacDeviation.pct_deviation).toBeCloseTo(40, 0);
    });

    it('returns block severity for >50% deviation', async () => {
      const contract = {
        venture_id: 'venture-123',
        cac_estimate: 100,
        ltv_estimate: 500,
        capital_required: 50000,
      };
      const chain = createMockChain({ data: contract, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await validateConsistency('venture-123', 8, {
        cac: 200,     // 100% deviation
        ltv: 500,
        capitalRequired: 50000,
      }, { supabaseClient: mockSupabase });

      expect(result.consistent).toBe(false);
      expect(result.hasBlock).toBe(true);

      const cacDeviation = result.deviations.find(d => d.field === 'cac_estimate');
      expect(cacDeviation.severity).toBe('block');
      expect(cacDeviation.pct_deviation).toBeCloseTo(100, 0);
    });

    it('skips null contract fields during comparison', async () => {
      const contract = {
        venture_id: 'venture-123',
        cac_estimate: null,
        ltv_estimate: 500,
        capital_required: null,
      };
      const chain = createMockChain({ data: contract, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await validateConsistency('venture-123', 8, {
        cac: 200,
        ltv: 500,
      }, { supabaseClient: mockSupabase });

      // Only ltv should be compared (cac and capital are null in contract)
      expect(result.deviations).toHaveLength(1);
      expect(result.deviations[0].field).toBe('ltv_estimate');
    });
  });

  describe('refineContract', () => {
    it('allows refinement within 20% tolerance', async () => {
      const contract = {
        venture_id: 'venture-123',
        cac_estimate: 100,
        ltv_estimate: 500,
        capital_required: 50000,
        refinement_history: [],
      };

      // getContract call
      const getChain = createMockChain({ data: contract, error: null });
      // validateConsistency calls getContract again
      const validateChain = createMockChain({ data: contract, error: null });
      // update call
      const updateChain = createMockChain({ data: { ...contract, cac_estimate: 115 }, error: null });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return getChain;
        return updateChain;
      });

      const result = await refineContract(
        'venture-123', 12,
        { cac: 115 },   // 15% deviation
        'Updated after detailed market research',
        { supabaseClient: mockSupabase },
      );

      expect(result.success).toBe(true);
      expect(result.warning).toBeFalsy();
    });

    it('blocks refinement exceeding 50% tolerance', async () => {
      const contract = {
        venture_id: 'venture-123',
        cac_estimate: 100,
        ltv_estimate: 500,
        capital_required: 50000,
        refinement_history: [],
      };

      const getChain = createMockChain({ data: contract, error: null });
      mockSupabase.from.mockReturnValue(getChain);

      const result = await refineContract(
        'venture-123', 12,
        { cac: 200 },   // 100% deviation
        'Dramatically different market conditions',
        { supabaseClient: mockSupabase },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('deviation exceeds 50%');
    });

    it('returns error when no contract exists', async () => {
      const chain = createMockChain({ data: null, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await refineContract(
        'venture-123', 12,
        { cac: 100 },
        'No baseline exists',
        { supabaseClient: mockSupabase },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No financial contract exists');
    });
  });
});
