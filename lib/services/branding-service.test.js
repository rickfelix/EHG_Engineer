/**
 * Tests for Branding Service
 * SD: SD-LEO-ORCH-EHG-VENTURE-FACTORY-001-D
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrandingService } from './branding-service.js';

function createMockSupabase(overrides = {}) {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
  const fromFn = vi.fn().mockReturnValue(chainable);
  return { from: fromFn, _chainable: chainable };
}

const MOCK_VENTURE_ID = '72efb937-981c-495c-b12c-1f006aee50d0';
const MOCK_SERVICE_ID = '37914cf7-3bd0-4eca-b8ff-c8d94daf1d77';

const FULL_INPUT = {
  venture_name: 'ClarityStats',
  industry: 'analytics',
  target_audience: 'Data-driven decision makers',
  brand_values: ['clarity', 'precision', 'trust'],
  color_preferences: ['#7C3AED', '#4F46E5'],
  style: 'modern',
};

const MINIMAL_INPUT = {
  venture_name: 'ClarityStats',
  industry: 'analytics',
};

describe('BrandingService', () => {
  let service;
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    service = new BrandingService({
      supabaseClient: mockSupabase,
      serviceId: MOCK_SERVICE_ID,
    });
  });

  describe('generateBrandArtifacts', () => {
    it('generates artifacts with full input', () => {
      const { artifacts, confidence } = service.generateBrandArtifacts(FULL_INPUT);

      expect(artifacts.brand_name).toBe('ClarityStats');
      expect(artifacts.confidence).toBeGreaterThan(0.8);
      expect(artifacts.artifacts.logo_spec).toBeDefined();
      expect(artifacts.artifacts.color_palette).toBeDefined();
      expect(artifacts.artifacts.typography).toBeDefined();
      expect(artifacts.artifacts.brand_guidelines).toBeDefined();
      expect(confidence).toBeGreaterThan(0.8);
    });

    it('generates artifacts with minimal input', () => {
      const { artifacts, confidence } = service.generateBrandArtifacts(MINIMAL_INPUT);

      expect(artifacts.brand_name).toBe('ClarityStats');
      expect(confidence).toBeLessThanOrEqual(0.5);
      expect(artifacts.artifacts.logo_spec).toBeDefined();
      expect(artifacts.artifacts.color_palette).toHaveLength(5);
    });

    it('uses color_preferences when provided', () => {
      const { artifacts } = service.generateBrandArtifacts(FULL_INPUT);
      expect(artifacts.artifacts.color_palette).toEqual(['#7C3AED', '#4F46E5']);
    });

    it('falls back to industry palette without preferences', () => {
      const { artifacts } = service.generateBrandArtifacts(MINIMAL_INPUT);
      expect(artifacts.artifacts.color_palette).toHaveLength(5);
      expect(artifacts.artifacts.color_palette[0]).toBe('#7C3AED'); // analytics palette
    });

    it('includes logo spec with typography and icon', () => {
      const { artifacts } = service.generateBrandArtifacts(FULL_INPUT);
      const logo = artifacts.artifacts.logo_spec;

      expect(logo.concept).toContain('ClarityStats');
      expect(logo.style).toBe('modern');
      expect(logo.typography.primary).toBeDefined();
      expect(logo.icon_suggestion).toBe('line-chart');
    });

    it('generates brand guidelines string', () => {
      const { artifacts } = service.generateBrandArtifacts(FULL_INPUT);
      const guidelines = artifacts.artifacts.brand_guidelines;

      expect(guidelines).toContain('ClarityStats');
      expect(guidelines).toContain('analytics');
    });
  });

  describe('computeConfidence', () => {
    it('returns 1.0 for complete input', () => {
      const score = service.computeConfidence(FULL_INPUT);
      expect(score).toBe(1);
    });

    it('returns 0.4 for minimal input (name + industry)', () => {
      const score = service.computeConfidence(MINIMAL_INPUT);
      expect(score).toBe(0.4);
    });

    it('returns 0 for empty input', () => {
      const score = service.computeConfidence({});
      expect(score).toBe(0);
    });

    it('handles empty arrays as missing', () => {
      const score = service.computeConfidence({
        venture_name: 'Test',
        industry: 'tech',
        brand_values: [],
      });
      expect(score).toBe(0.4);
    });

    it('handles empty strings as missing', () => {
      const score = service.computeConfidence({
        venture_name: 'Test',
        industry: '',
      });
      expect(score).toBe(0.2);
    });
  });

  describe('resolveServiceId', () => {
    it('returns cached service ID if set', async () => {
      const id = await service.resolveServiceId();
      expect(id).toBe(MOCK_SERVICE_ID);
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('queries database when no cached ID', async () => {
      const svc = new BrandingService({ supabaseClient: mockSupabase });
      mockSupabase._chainable.single.mockResolvedValue({
        data: { id: MOCK_SERVICE_ID },
        error: null,
      });

      const id = await svc.resolveServiceId();
      expect(id).toBe(MOCK_SERVICE_ID);
      expect(mockSupabase.from).toHaveBeenCalledWith('ehg_services');
    });

    it('throws if service not found', async () => {
      const svc = new BrandingService({ supabaseClient: mockSupabase });
      mockSupabase._chainable.single.mockResolvedValue({
        data: null,
        error: { message: 'not found' },
      });

      await expect(svc.resolveServiceId()).rejects.toThrow('Branding service not found');
    });
  });

  describe('createTask', () => {
    it('creates a pending task with artifacts and confidence', async () => {
      mockSupabase._chainable.single.mockResolvedValue({
        data: { id: 'task-uuid-001' },
        error: null,
      });

      const result = await service.createTask(MOCK_VENTURE_ID, FULL_INPUT);

      expect(result.taskId).toBe('task-uuid-001');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.artifacts).toBeDefined();
      expect(result.artifacts.brand_name).toBe('ClarityStats');

      expect(mockSupabase.from).toHaveBeenCalledWith('service_tasks');
      const insertCall = mockSupabase._chainable.insert.mock.calls[0][0];
      expect(insertCall.venture_id).toBe(MOCK_VENTURE_ID);
      expect(insertCall.service_id).toBe(MOCK_SERVICE_ID);
      expect(insertCall.task_type).toBe('brand_generation');
      expect(insertCall.status).toBe('pending');
      expect(insertCall.confidence_score).toBeGreaterThan(0.8);
    });

    it('throws on insert error', async () => {
      mockSupabase._chainable.single.mockResolvedValue({
        data: null,
        error: { message: 'FK violation' },
      });

      await expect(service.createTask(MOCK_VENTURE_ID, FULL_INPUT))
        .rejects.toThrow('Failed to create branding task');
    });

    it('applies custom priority', async () => {
      mockSupabase._chainable.single.mockResolvedValue({
        data: { id: 'task-002' },
        error: null,
      });

      await service.createTask(MOCK_VENTURE_ID, FULL_INPUT, { priority: 1 });

      const insertCall = mockSupabase._chainable.insert.mock.calls[0][0];
      expect(insertCall.priority).toBe(1);
    });
  });

  describe('reportTelemetry', () => {
    it('inserts telemetry record', async () => {
      mockSupabase._chainable.insert.mockReturnValue({
        error: null,
      });

      const result = await service.reportTelemetry({
        taskId: 'task-001',
        ventureId: MOCK_VENTURE_ID,
        outcomes: { confidence_score: 0.92, artifacts_generated: true },
      });

      expect(result.success).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith('service_telemetry');
    });
  });

  describe('completeTask', () => {
    it('updates task status and reports telemetry', async () => {
      // Mock task fetch
      const fetchChainable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            venture_id: MOCK_VENTURE_ID,
            service_id: MOCK_SERVICE_ID,
            artifacts: { brand_name: 'ClarityStats' },
            confidence_score: 0.92,
          },
          error: null,
        }),
      };

      // Mock task update
      const updateChainable = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnValue({ error: null }),
      };

      // Mock telemetry insert
      const telemetryChainable = {
        insert: vi.fn().mockReturnValue({ error: null }),
      };

      let callCount = 0;
      mockSupabase.from = vi.fn().mockImplementation((table) => {
        if (table === 'service_telemetry') return telemetryChainable;
        callCount++;
        if (callCount === 1) return fetchChainable; // First service_tasks call = fetch
        return updateChainable; // Second = update
      });

      const result = await service.completeTask('task-001', { user_accepted: true });

      expect(result.success).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith('service_tasks');
      expect(mockSupabase.from).toHaveBeenCalledWith('service_telemetry');
    });
  });
});
