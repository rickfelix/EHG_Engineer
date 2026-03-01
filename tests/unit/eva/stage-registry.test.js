/**
 * Tests for StageRegistry — A03 Stage Framework Extensibility
 * SD-MAN-ORCH-VISION-ARCHITECTURE-HARDENING-001-D
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StageRegistry } from '../../../lib/eva/stage-registry/core.js';
import {
  loadFromDatabase,
  loadFallbackTemplates,
  createStageRegistry,
  getStageRegistry,
} from '../../../lib/eva/stage-registry/index.js';

describe('StageRegistry Core', () => {
  let registry;

  beforeEach(() => {
    registry = new StageRegistry();
  });

  it('registers and retrieves stage config', () => {
    registry.register(1, { stage_name: 'Draft Idea', phase_number: 1 });
    const config = registry.get(1);
    expect(config).toBeTruthy();
    expect(config.stage_name).toBe('Draft Idea');
  });

  it('returns null for unregistered stage', () => {
    expect(registry.get(99)).toBeNull();
  });

  it('has() checks existence', () => {
    registry.register(1, { stage_name: 'Draft Idea' });
    expect(registry.has(1)).toBe(true);
    expect(registry.has(99)).toBe(false);
  });

  it('throws on invalid stage number', () => {
    expect(() => registry.register(-1, {})).toThrow();
    expect(() => registry.register('abc', {})).toThrow();
  });

  it('getRegisteredStages returns sorted numbers', () => {
    registry.register(5, { stage_name: 'S5' });
    registry.register(1, { stage_name: 'S1' });
    registry.register(3, { stage_name: 'S3' });
    expect(registry.getRegisteredStages()).toEqual([1, 3, 5]);
  });

  it('getStagesForPhase returns correct subset', () => {
    registry.register(1, { stage_name: 'S1', phase_number: 1 });
    registry.register(2, { stage_name: 'S2', phase_number: 1 });
    registry.register(3, { stage_name: 'S3', phase_number: 2 });
    const phase1 = registry.getStagesForPhase(1);
    expect(phase1).toHaveLength(2);
    expect(phase1[0].stage_name).toBe('S1');
  });

  it('getStats returns registration info', () => {
    registry.register(1, { stage_name: 'S1', phase_number: 1 });
    registry.register(2, { stage_name: 'S2', phase_number: 1 });
    const stats = registry.getStats();
    expect(stats.totalRegistered).toBe(2);
    expect(stats.byPhase[1]).toBe(2);
  });

  it('fallback stages are returned when primary not found', () => {
    registry.registerFallback(1, { stage_name: 'Fallback' });
    expect(registry.get(1).stage_name).toBe('Fallback');
    expect(registry.has(1)).toBe(true);
  });

  it('primary stages take precedence over fallbacks', () => {
    registry.registerFallback(1, { stage_name: 'Fallback' });
    registry.register(1, { stage_name: 'Primary' });
    expect(registry.get(1).stage_name).toBe('Primary');
  });

  it('cache validity tracking works', () => {
    expect(registry.isCacheValid()).toBe(false);
    registry.markCacheLoaded();
    expect(registry.isCacheValid()).toBe(true);
    registry.invalidateCache();
    expect(registry.isCacheValid()).toBe(false);
  });

  it('clear removes all stages and resets cache', () => {
    registry.register(1, { stage_name: 'S1' });
    registry.markCacheLoaded();
    registry.clear();
    expect(registry.stages.size).toBe(0);
    expect(registry.isCacheValid()).toBe(false);
  });
});

describe('StageRegistry — loadFromDatabase', () => {
  it('loads stages from lifecycle_stage_config', async () => {
    const registry = new StageRegistry();
    const mockData = [
      { stage_number: 1, stage_name: 'Draft Idea', phase_number: 1, phase_name: 'THE TRUTH', work_type: 'artifact_only', sd_required: false, advisory_enabled: false, depends_on: [], required_artifacts: ['idea_brief'], metadata: {}, description: '' },
      { stage_number: 2, stage_name: 'Chairman Review', phase_number: 1, phase_name: 'THE TRUTH', work_type: 'decision_gate', sd_required: false, advisory_enabled: false, depends_on: [1], required_artifacts: [], metadata: {}, description: '' },
    ];

    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      })),
    };

    const result = await loadFromDatabase(registry, supabase);
    expect(result.loaded).toBe(2);
    expect(result.error).toBeNull();
    expect(registry.has(1)).toBe(true);
    expect(registry.has(2)).toBe(true);
    expect(registry.isCacheValid()).toBe(true);
  });

  it('returns cached data within TTL', async () => {
    const registry = new StageRegistry();
    registry.register(1, { stage_name: 'Cached' });
    registry.markCacheLoaded();

    const result = await loadFromDatabase(registry, {});
    expect(result.cached).toBe(true);
    expect(result.loaded).toBe(1);
  });

  it('handles DB errors gracefully', async () => {
    const registry = new StageRegistry();
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: { message: 'connection failed' } }),
      })),
    };

    const result = await loadFromDatabase(registry, supabase);
    expect(result.loaded).toBe(0);
    expect(result.error).toContain('connection failed');
  });

  it('handles exceptions gracefully', async () => {
    const registry = new StageRegistry();
    const supabase = {
      from: vi.fn(() => { throw new Error('DB down'); }),
    };

    const result = await loadFromDatabase(registry, supabase);
    expect(result.loaded).toBe(0);
    expect(result.error).toContain('DB down');
  });

  it('returns error when no supabase client', async () => {
    const registry = new StageRegistry();
    const result = await loadFromDatabase(registry, null);
    expect(result.error).toBeTruthy();
  });
});

describe('StageRegistry — createStageRegistry', () => {
  it('creates registry with DB data', async () => {
    const mockData = Array.from({ length: 5 }, (_, i) => ({
      stage_number: i + 1,
      stage_name: `Stage ${i + 1}`,
      phase_number: 1,
      phase_name: 'TEST',
      work_type: 'artifact_only',
      sd_required: false,
      advisory_enabled: false,
      depends_on: [],
      required_artifacts: [],
      metadata: {},
      description: '',
    }));

    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      })),
    };

    const registry = await createStageRegistry({ supabase, loadFallbacks: false });
    expect(registry.stages.size).toBe(5);
    expect(registry.isCacheValid()).toBe(true);
  });

  it('creates registry without DB (fallback only)', async () => {
    const registry = await createStageRegistry({ loadFallbacks: false });
    expect(registry.stages.size).toBe(0);
  });
});

describe('StageRegistry — getStageRegistry singleton', () => {
  it('returns same instance', () => {
    const a = getStageRegistry();
    const b = getStageRegistry();
    expect(a).toBe(b);
  });
});
