/**
 * Tests for Cross-Coherence Check
 * SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001-F (C6)
 */

import { describe, it, expect, vi } from 'vitest';
import { checkCrossCoherence } from '../../../scripts/modules/cross-coherence-check.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

function createMockSupabase(orchestrator, children, visionDoc = null, archPlan = null) {
  return {
    from: vi.fn((table) => {
      if (table === 'strategic_directives_v2') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockImplementation(() => {
            return Promise.resolve({ data: children, error: null });
          }),
          single: vi.fn().mockImplementation(() => {
            return Promise.resolve({ data: orchestrator, error: null });
          }),
        };
      }
      if (table === 'eva_vision_documents') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: visionDoc, error: null }),
        };
      }
      if (table === 'eva_architecture_plans') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: archPlan, error: null }),
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null }) };
    }),
  };
}

describe('Cross-Coherence Check', () => {
  const orchestrator = {
    id: 'orch-1',
    sd_key: 'SD-ORCH-001',
    title: 'Test Orchestrator',
    success_criteria: [
      { criterion: 'All database migrations applied' },
      { criterion: 'API endpoints working' },
    ],
    metadata: { vision_key: 'VISION-001', plan_key: 'ARCH-001' },
  };

  const completedChildren = [
    { sd_key: 'SD-ORCH-001-A', title: 'Child A', status: 'completed', current_phase: 'COMPLETED', scope: 'Database migrations', key_changes: [{ change: 'migration applied', type: 'infrastructure' }], metadata: {}, success_criteria: [{ criterion: 'migration passes' }] },
    { sd_key: 'SD-ORCH-001-B', title: 'Child B', status: 'completed', current_phase: 'COMPLETED', scope: 'API endpoints', key_changes: [{ change: 'api working', type: 'feature' }], metadata: {}, success_criteria: [{ criterion: 'endpoints respond' }] },
  ];

  it('should PASS when all children completed and no gaps', async () => {
    const sb = createMockSupabase(orchestrator, completedChildren);
    const result = await checkCrossCoherence('SD-ORCH-001', { supabase: sb, logger: silentLogger });

    expect(result.pass).toBe(true);
    expect(result.summary.incomplete_children).toBe(0);
  });

  it('should detect incomplete children', async () => {
    const mixedChildren = [
      { ...completedChildren[0] },
      { ...completedChildren[1], status: 'in_progress', current_phase: 'EXEC' },
    ];
    const sb = createMockSupabase(orchestrator, mixedChildren);
    const result = await checkCrossCoherence('SD-ORCH-001', { supabase: sb, logger: silentLogger });

    expect(result.pass).toBe(false);
    expect(result.summary.incomplete_children).toBe(1);
  });

  it('should detect file conflicts between siblings', async () => {
    const conflictChildren = [
      { ...completedChildren[0], key_changes: [{ file: 'lib/eva/worker.js', change: 'modify A' }] },
      { ...completedChildren[1], key_changes: [{ file: 'lib/eva/worker.js', change: 'modify B' }] },
    ];
    const sb = createMockSupabase(orchestrator, conflictChildren);
    const result = await checkCrossCoherence('SD-ORCH-001', { supabase: sb, logger: silentLogger });

    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0].file).toBe('lib/eva/worker.js');
    expect(result.conflicts[0].sds).toContain('SD-ORCH-001-A');
    expect(result.conflicts[0].sds).toContain('SD-ORCH-001-B');
  });

  it('should calculate AC coverage', async () => {
    const sb = createMockSupabase(orchestrator, completedChildren);
    const result = await checkCrossCoherence('SD-ORCH-001', { supabase: sb, logger: silentLogger });

    expect(result.coverage.total).toBe(2);
    expect(result.coverage.covered).toBeGreaterThanOrEqual(1);
  });

  it('should return error for missing orchestrator', async () => {
    const sb = createMockSupabase(null, []);
    const result = await checkCrossCoherence('SD-MISSING', { supabase: sb, logger: silentLogger });

    expect(result.pass).toBe(false);
    expect(result.error).toContain('not found');
  });
});
