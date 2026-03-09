/**
 * Unit tests for GATE_WIREFRAME_REQUIRED
 * Validates wireframe artifact detection for PLAN-TO-EXEC handoff.
 *
 * Part of SD-LEO-INFRA-LEO-PROTOCOL-WIREFRAME-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWireframeRequiredGate } from './wireframe-required.js';

describe('GATE_WIREFRAME_REQUIRED', () => {
  let gate;
  let mockPrdRepo;
  let mockSupabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrdRepo = { getBySdId: vi.fn().mockResolvedValue(null) };
    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    };
    gate = createWireframeRequiredGate(mockPrdRepo, mockSupabase);
  });

  it('has correct gate name', () => {
    expect(gate.name).toBe('GATE_WIREFRAME_REQUIRED');
  });

  it('is advisory (required: false)', () => {
    expect(gate.required).toBe(false);
  });

  describe('SD type exemptions', () => {
    for (const sdType of ['infrastructure', 'documentation', 'fix']) {
      it(`exempts ${sdType} SDs with score 100`, async () => {
        const result = await gate.validator({ sd: { sd_type: sdType } });
        expect(result.passed).toBe(true);
        expect(result.score).toBe(100);
        expect(result.details.exempt).toBe(true);
      });
    }
  });

  describe('feature SDs', () => {
    it('passes with score 100 when PRD has wireframe references', async () => {
      const prd = {
        ui_ux_requirements: { wireframe: 'Dashboard layout with sidebar' },
      };
      mockPrdRepo.getBySdId.mockResolvedValue(prd);

      const result = await gate.validator({
        sd: { id: 'test-id', sd_type: 'feature' },
        sdId: 'test-id',
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.details.wireframeEvidence.length).toBeGreaterThan(0);
    });

    it('passes with score 50 when no wireframes found', async () => {
      mockPrdRepo.getBySdId.mockResolvedValue({
        ui_ux_requirements: [],
        functional_requirements: [],
        executive_summary: 'Add a button',
      });

      const result = await gate.validator({
        sd: { id: 'test-id', sd_type: 'feature' },
        sdId: 'test-id',
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(50);
      expect(result.details.wireframeMissing).toBe(true);
    });

    it('detects wireframes in functional_requirements', async () => {
      const prd = {
        functional_requirements: [
          { description: 'Implement per mockup design spec' },
        ],
      };
      mockPrdRepo.getBySdId.mockResolvedValue(prd);

      const result = await gate.validator({
        sd: { id: 'test-id', sd_type: 'feature' },
        sdId: 'test-id',
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
    });

    it('detects wireframes in agent_artifacts', async () => {
      mockPrdRepo.getBySdId.mockResolvedValue({});
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({
              data: [{ title: 'Dashboard Wireframe', artifact_type: 'wireframe' }],
              error: null,
            }),
          }),
        }),
      });

      const result = await gate.validator({
        sd: { id: 'test-id', sd_type: 'feature' },
        sdId: 'test-id',
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
    });

    it('uses ctx._prd when available', async () => {
      const prd = {
        executive_summary: 'Implementation per wireframe spec',
      };

      const result = await gate.validator({
        sd: { id: 'test-id', sd_type: 'feature' },
        _prd: prd,
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(mockPrdRepo.getBySdId).not.toHaveBeenCalled();
    });
  });
});
