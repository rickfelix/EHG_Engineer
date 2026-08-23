/**
 * Launch Workflow Module Tests
 *
 * SD: SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-J
 */

import { describe, it, expect, vi } from 'vitest';
import { getLaunchStatus, getChecklist, getTimeline } from '../../lib/eva/launch-workflow/index.js';

// Helper to create a mock supabase client
function createMockSupabase(responses = {}) {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(responses.venture || { data: null, error: null }),
  };

  // For queries that end with maybeSingle vs those that don't
  let callCount = 0;
  const from = vi.fn().mockImplementation((table) => {
    if (table === 'eva_ventures') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue(
              responses.venture || { data: null, error: null }
            ),
            gte: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue(
                responses.gates || { data: [], error: null }
              ),
            }),
          }),
        }),
      };
    }
    if (table === 'eva_stage_gate_results') {
      // SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001 (VALIDATION VAL-B1): the real queries now end in
      // .limit(100) (count-truncation-diff-lint bounded-by-design requirement) -- .order() no
      // longer resolves directly, it returns a chain ending in .limit().
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(
                  responses.gates || { data: [], error: null }
                ),
              }),
            }),
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(
                responses.gates || { data: [], error: null }
              ),
            }),
          }),
        }),
      };
    }
    return chainable;
  });

  return { from };
}

describe('Launch Workflow Module', () => {
  describe('getLaunchStatus', () => {
    it('returns no-client when supabase is missing', async () => {
      const result = await getLaunchStatus('test-id');
      expect(result).toEqual({ ventureId: 'test-id', status: 'no-client' });
    });

    it('returns not-found when venture does not exist', async () => {
      const supabase = createMockSupabase({
        venture: { data: null, error: null },
      });
      const result = await getLaunchStatus('missing-id', { supabase });
      expect(result.status).toBe('not-found');
    });

    it('returns launch status for a venture in launch phase', async () => {
      const supabase = createMockSupabase({
        venture: {
          data: {
            id: 'v1', name: 'Test Venture', status: 'active',
            current_lifecycle_stage: 23, created_at: '2026-01-01', updated_at: '2026-03-01',
          },
          error: null,
        },
        gates: {
          data: [
            { stage_number: 21, passed: true, gate_type: 'chairman', notes: 'Good', created_at: '2026-02-01' },
            { stage_number: 24, passed: false, gate_type: 'chairman', notes: 'Needs work', created_at: '2026-03-01' },
          ],
          error: null,
        },
      });

      const result = await getLaunchStatus('v1', { supabase });
      expect(result.inLaunchPhase).toBe(true);
      expect(result.ventureName).toBe('Test Venture');
      expect(result.currentStage).toBe(23);
      expect(result.launchReadiness.stage21Gate.reasoning).toBe('Good');
      expect(result.launchReadiness.allGatesPassed).toBe(false);
    });

    it('fails loud on a real column-mismatch error (SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001 / FR-1)', async () => {
      const supabase = createMockSupabase({
        venture: {
          data: { id: 'v1', name: 'Test Venture', status: 'active', current_lifecycle_stage: 23 },
          error: null,
        },
        gates: {
          data: null,
          error: { code: '42703', message: 'column eva_stage_gate_results.reasoning does not exist' },
        },
      });

      await expect(getLaunchStatus('v1', { supabase })).rejects.toThrow(/42703|gate query failed/);
    });
  });

  describe('getChecklist', () => {
    it('returns empty checklist without supabase', async () => {
      const result = await getChecklist('test-id');
      expect(result).toEqual({ ventureId: 'test-id', items: [], ready: false });
    });

    it('returns checklist items from gate results', async () => {
      const supabase = createMockSupabase({
        gates: {
          data: [
            { stage_number: 21, passed: true, gate_type: 'chairman', notes: 'OK', overall_score: 90, created_at: '2026-02-01' },
            { stage_number: 23, passed: true, gate_type: 'advisory', notes: 'Good', overall_score: 85, created_at: '2026-02-15' },
          ],
          error: null,
        },
      });

      const result = await getChecklist('v1', { supabase });
      expect(result.evaluatedCount).toBe(2);
      expect(result.items.length).toBe(2);
      expect(result.items[0].reasoning).toBe('OK');
      expect(result.items[0].score).toBe(90);
      expect(result.ready).toBe(true);
    });

    it('fails loud on a real column-mismatch error (SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001 / FR-1)', async () => {
      const supabase = createMockSupabase({
        gates: {
          data: null,
          error: { code: '42703', message: 'column eva_stage_gate_results.score does not exist' },
        },
      });

      await expect(getChecklist('v1', { supabase })).rejects.toThrow(/42703|gate query failed/);
    });
  });

  describe('getTimeline', () => {
    it('returns empty timeline without supabase', async () => {
      const result = await getTimeline('test-id');
      expect(result).toEqual({ ventureId: 'test-id', events: [] });
    });

    it('maps phase correctly for stage numbers', async () => {
      const supabase = createMockSupabase({
        venture: {
          data: { current_lifecycle_stage: 5, created_at: '2026-01-01' },
          error: null,
        },
        gates: {
          data: [
            { stage_number: 1, passed: true, gate_type: 'auto', overall_score: 80, created_at: '2026-01-05' },
            { stage_number: 5, passed: true, gate_type: 'auto', overall_score: 75, created_at: '2026-01-20' },
            { stage_number: 23, passed: false, gate_type: 'chairman', overall_score: 50, created_at: '2026-02-01' },
          ],
          error: null,
        },
      });

      const result = await getTimeline('v1', { supabase });
      expect(result.stageCount).toBe(3);
      expect(result.events[0].phase).toBe('EVALUATION');
      expect(result.events[1].phase).toBe('STRATEGY');
      expect(result.events[2].phase).toBe('LAUNCH');
      expect(result.events[0].score).toBe(80);
    });

    it('fails loud on a real column-mismatch error (SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001 / FR-1)', async () => {
      const supabase = createMockSupabase({
        gates: {
          data: null,
          error: { code: '42703', message: 'column eva_stage_gate_results.score does not exist' },
        },
      });

      await expect(getTimeline('v1', { supabase })).rejects.toThrow(/42703|gate query failed/);
    });
  });
});
