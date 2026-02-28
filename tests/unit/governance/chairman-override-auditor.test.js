/**
 * Chairman Override Auditor Tests
 * Part of SD-MAN-GEN-CORRECTIVE-VISION-GAP-003
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditChairmanOverride, getOverrideHistory } from '../../../lib/governance/chairman-override-auditor.js';

function createMockSupabase({ insertData = { id: 'dec-abc' }, insertError = null, selectData = [], selectError = null } = {}) {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: insertData, error: insertError }),
        }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: selectData, error: selectError }),
          }),
        }),
      }),
    }),
  };
}

describe('auditChairmanOverride', () => {
  it('returns error when no supabase client provided', async () => {
    const result = await auditChairmanOverride({ guardrailId: 'GR-TEST', sdId: 'uuid-1', sdKey: 'SD-TEST-001' }, null);
    expect(result.success).toBe(false);
    expect(result.error).toBe('No supabase client provided');
  });

  it('inserts audit record and returns decision ID', async () => {
    const mockSupabase = createMockSupabase();
    const result = await auditChairmanOverride({
      guardrailId: 'GR-OKR-HARD-STOP',
      sdId: 'uuid-1',
      sdKey: 'SD-TEST-001',
      reason: 'Late cycle priority work',
    }, mockSupabase);

    expect(result.success).toBe(true);
    expect(result.decisionId).toBe('dec-abc');
    expect(mockSupabase.from).toHaveBeenCalledWith('chairman_decisions');
  });

  it('handles insert error gracefully', async () => {
    const mockSupabase = createMockSupabase({ insertError: { message: 'DB error' } });
    const result = await auditChairmanOverride({
      guardrailId: 'GR-OKR-HARD-STOP',
      sdId: 'uuid-1',
      sdKey: 'SD-TEST-001',
    }, mockSupabase);

    expect(result.success).toBe(false);
    expect(result.error).toBe('DB error');
  });
});

describe('getOverrideHistory', () => {
  it('returns empty array when no supabase client', async () => {
    const result = await getOverrideHistory('uuid-1', null);
    expect(result).toEqual([]);
  });

  it('returns override records for SD', async () => {
    const records = [{ id: 'dec-1', decision_type: 'OVERRIDE_REQUEST', status: 'approved', context: {}, created_at: '2026-01-01' }];
    const mockSupabase = createMockSupabase({ selectData: records });
    const result = await getOverrideHistory('uuid-1', mockSupabase);
    expect(result).toEqual(records);
  });
});
