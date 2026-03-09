/**
 * Unit tests for GATE_WIREFRAME_QA_VALIDATION
 * Validates wireframe-to-implementation conformance checking.
 *
 * Part of SD-LEO-INFRA-LEO-PROTOCOL-WIREFRAME-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWireframeQaValidationGate } from './wireframe-qa-validation.js';

describe('GATE_WIREFRAME_QA_VALIDATION', () => {
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
    gate = createWireframeQaValidationGate(mockPrdRepo, mockSupabase);
  });

  it('has correct gate name', () => {
    expect(gate.name).toBe('GATE_WIREFRAME_QA_VALIDATION');
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

  describe('no wireframes present', () => {
    it('passes with score 100 when no wireframes and no UI changes', async () => {
      mockPrdRepo.getBySdId.mockResolvedValue({});

      const result = await gate.validator({
        sd: { id: 'test-id', sd_type: 'feature' },
        sdId: 'test-id',
        _changedFiles: ['scripts/utils.js'],
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
    });

    it('warns with score 60 when no wireframes but UI files changed', async () => {
      mockPrdRepo.getBySdId.mockResolvedValue({});

      const result = await gate.validator({
        sd: { id: 'test-id', sd_type: 'feature' },
        sdId: 'test-id',
        _changedFiles: ['src/components/Dashboard.tsx', 'src/pages/Home.tsx'],
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(60);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('wireframes present', () => {
    it('scores 90 when wireframes and UI implementation both present', async () => {
      const prd = {
        ui_ux_requirements: { wireframe: 'Layout spec' },
      };
      mockPrdRepo.getBySdId.mockResolvedValue(prd);

      const result = await gate.validator({
        sd: { id: 'test-id', sd_type: 'feature' },
        sdId: 'test-id',
        _changedFiles: ['src/components/Widget.tsx'],
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(90);
      expect(result.details.adherenceScore).toBe(90);
    });

    it('scores 70 when wireframes exist but no UI files changed', async () => {
      const prd = {
        executive_summary: 'Implementation per wireframe spec',
      };
      mockPrdRepo.getBySdId.mockResolvedValue(prd);

      const result = await gate.validator({
        sd: { id: 'test-id', sd_type: 'feature' },
        sdId: 'test-id',
        _changedFiles: ['scripts/utils.js'],
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(70);
    });
  });

  describe('UI file detection', () => {
    it('detects .tsx files as UI implementation', async () => {
      mockPrdRepo.getBySdId.mockResolvedValue({});

      const result = await gate.validator({
        sd: { id: 'test-id', sd_type: 'feature' },
        sdId: 'test-id',
        _changedFiles: ['src/components/Nav.tsx'],
      });

      expect(result.details.uiFiles).toContain('src/components/Nav.tsx');
    });

    it('detects .jsx files as UI implementation', async () => {
      mockPrdRepo.getBySdId.mockResolvedValue({});

      const result = await gate.validator({
        sd: { id: 'test-id', sd_type: 'feature' },
        sdId: 'test-id',
        _changedFiles: ['src/views/Dashboard.jsx'],
      });

      expect(result.details.uiFiles).toContain('src/views/Dashboard.jsx');
    });
  });
});
