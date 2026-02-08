/**
 * Tests for Lifecycle-to-SD Bridge module
 * SD-LEO-FEAT-LIFECYCLE-SD-BRIDGE-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  convertSprintToSDs,
  buildBridgeArtifactRecord,
  _internal,
} from '../../lib/eva/lifecycle-sd-bridge.js';

const { TYPE_MAP, findExistingOrchestrator } = _internal;

// Mock sd-key-generator
vi.mock('../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockResolvedValue('SD-ACME-LEO-ORCH-SPRINT-001'),
  generateChildKey: vi.fn((parentKey, index) => `${parentKey}-${index}`),
  normalizeVenturePrefix: vi.fn(name => name.toUpperCase().replace(/\s+/g, '-')),
  keyExists: vi.fn().mockResolvedValue(false),
  SD_SOURCES: { LEO: 'LEO' },
  SD_TYPES: { feature: 'FEAT', orchestrator: 'ORCH' },
}));

function createMockSupabase({ insertError = null, selectData = [], selectError = null } = {}) {
  const mockSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: selectData, error: selectError }),
        }),
      }),
    }),
    order: vi.fn().mockReturnValue({
      then: vi.fn(),
    }),
  });

  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: insertError }),
      select: mockSelect,
    }),
  };
}

function createMockLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function createStageOutput(itemCount = 2) {
  const items = Array.from({ length: itemCount }, (_, i) => ({
    title: `Feature ${i + 1}`,
    description: `Description for feature ${i + 1}`,
    priority: 'high',
    type: 'feature',
    scope: `Scope for feature ${i + 1}`,
    success_criteria: `Feature ${i + 1} works correctly`,
    dependencies: [],
    risks: [],
    target_application: 'EHG_Engineer',
  }));

  return {
    sprint_name: 'Sprint Alpha',
    sprint_goal: 'Deliver core features for MVP launch',
    sprint_duration_days: 14,
    items,
    total_items: items.length,
    total_story_points: items.length * 5,
    sd_bridge_payloads: items.map(item => ({
      title: item.title,
      description: item.description,
      priority: item.priority,
      type: item.type,
      scope: item.scope,
      success_criteria: item.success_criteria,
      dependencies: item.dependencies,
      risks: item.risks,
      target_application: item.target_application,
    })),
  };
}

describe('TYPE_MAP', () => {
  it('maps Stage 18 types to database sd_type values', () => {
    expect(TYPE_MAP.feature).toBe('feature');
    expect(TYPE_MAP.bugfix).toBe('bugfix');
    expect(TYPE_MAP.enhancement).toBe('feature');
    expect(TYPE_MAP.refactor).toBe('refactor');
    expect(TYPE_MAP.infra).toBe('infrastructure');
  });
});

describe('convertSprintToSDs', () => {
  let mockSupabase;
  let mockLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    mockLogger = createMockLogger();
  });

  it('creates orchestrator and child SDs from sprint payloads', async () => {
    const stageOutput = createStageOutput(2);
    const ventureContext = { id: 'venture-uuid-123', name: 'Acme Labs' };

    const result = await convertSprintToSDs(
      { stageOutput, ventureContext },
      { supabase: mockSupabase, logger: mockLogger },
    );

    expect(result.created).toBe(true);
    expect(result.orchestratorKey).toBe('SD-ACME-LEO-ORCH-SPRINT-001');
    expect(result.childKeys).toHaveLength(2);
    expect(result.errors).toHaveLength(0);

    // Verify orchestrator insert was called
    const fromCalls = mockSupabase.from.mock.calls;
    expect(fromCalls.some(c => c[0] === 'strategic_directives_v2')).toBe(true);
  });

  it('returns early with empty payloads', async () => {
    const stageOutput = { sprint_name: 'Sprint', sprint_goal: 'Goal', sd_bridge_payloads: [] };
    const ventureContext = { id: 'v-1', name: 'Test' };

    const result = await convertSprintToSDs(
      { stageOutput, ventureContext },
      { supabase: mockSupabase, logger: mockLogger },
    );

    expect(result.created).toBe(false);
    expect(result.orchestratorKey).toBeNull();
    expect(result.childKeys).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('No sprint items');
  });

  it('returns existing SDs on idempotency check (no duplicates)', async () => {
    // Mock findExistingOrchestrator to return existing
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [{ id: 'existing-uuid', sd_key: 'SD-ACME-LEO-ORCH-SPRINT-001' }],
              error: null,
            }),
          }),
        }),
      }),
    });

    const childSelectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [{ sd_key: 'SD-ACME-LEO-ORCH-SPRINT-001-A' }, { sd_key: 'SD-ACME-LEO-ORCH-SPRINT-001-B' }],
          error: null,
        }),
      }),
    });

    let callCount = 0;
    const idempotentSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: null }),
        select: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return selectMock();
          return childSelectMock();
        }),
      }),
    };

    const stageOutput = createStageOutput(2);
    const ventureContext = { id: 'venture-uuid-123', name: 'Acme Labs' };

    const result = await convertSprintToSDs(
      { stageOutput, ventureContext },
      { supabase: idempotentSupabase, logger: mockLogger },
    );

    expect(result.created).toBe(false);
    expect(result.orchestratorKey).toBe('SD-ACME-LEO-ORCH-SPRINT-001');
    expect(result.childKeys).toHaveLength(2);
  });

  it('handles orchestrator creation failure', async () => {
    const failSupabase = createMockSupabase({ insertError: { message: 'Unique constraint violation' } });
    const stageOutput = createStageOutput(1);
    const ventureContext = { id: 'v-1', name: 'Test' };

    const result = await convertSprintToSDs(
      { stageOutput, ventureContext },
      { supabase: failSupabase, logger: mockLogger },
    );

    expect(result.created).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Unique constraint');
  });

  it('handles child creation failure gracefully', async () => {
    let insertCallCount = 0;
    const partialFailSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockImplementation(() => {
          insertCallCount++;
          if (insertCallCount === 1) return Promise.resolve({ error: null }); // Orchestrator succeeds
          if (insertCallCount === 2) return Promise.resolve({ error: null }); // Child A succeeds
          return Promise.resolve({ error: { message: 'Child B failed' } }); // Child B fails
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    };

    const stageOutput = createStageOutput(2);
    const ventureContext = { id: 'v-1', name: 'Test' };

    const result = await convertSprintToSDs(
      { stageOutput, ventureContext },
      { supabase: partialFailSupabase, logger: mockLogger },
    );

    expect(result.created).toBe(true);
    expect(result.childKeys).toHaveLength(1); // Only A succeeded
    expect(result.errors).toHaveLength(1); // B failed
    expect(result.errors[0]).toContain('Child B failed');
  });

  it('handles missing venture context gracefully', async () => {
    const stageOutput = createStageOutput(1);

    const result = await convertSprintToSDs(
      { stageOutput, ventureContext: {} },
      { supabase: mockSupabase, logger: mockLogger },
    );

    // Should still create SDs without venture prefix
    expect(result.created).toBe(true);
    expect(result.orchestratorKey).toBeTruthy();
  });

  it('maps sprint item types correctly', async () => {
    const stageOutput = {
      sprint_name: 'Test Sprint',
      sprint_goal: 'Test various types',
      sprint_duration_days: 7,
      sd_bridge_payloads: [
        { title: 'Bug Fix', description: 'Fix bug', priority: 'high', type: 'bugfix', scope: 's', success_criteria: 'c', target_application: 'EHG_Engineer' },
        { title: 'Infra', description: 'Setup', priority: 'low', type: 'infra', scope: 's', success_criteria: 'c', target_application: 'EHG_Engineer' },
      ],
    };

    const result = await convertSprintToSDs(
      { stageOutput, ventureContext: { id: 'v-1', name: 'Test' } },
      { supabase: mockSupabase, logger: mockLogger },
    );

    expect(result.created).toBe(true);
    expect(result.childKeys).toHaveLength(2);
  });
});

describe('buildBridgeArtifactRecord', () => {
  it('builds valid venture_artifacts row for successful bridge', () => {
    const result = {
      created: true,
      orchestratorKey: 'SD-ACME-LEO-ORCH-SPRINT-001',
      childKeys: ['SD-ACME-LEO-ORCH-SPRINT-001-A', 'SD-ACME-LEO-ORCH-SPRINT-001-B'],
      errors: [],
    };

    const row = buildBridgeArtifactRecord('venture-uuid-123', 18, result);
    expect(row.venture_id).toBe('venture-uuid-123');
    expect(row.lifecycle_stage).toBe(18);
    expect(row.artifact_type).toBe('lifecycle_sd_bridge');
    expect(row.is_current).toBe(true);
    expect(row.quality_score).toBe(100);
    expect(row.validation_status).toBe('validated');

    const content = JSON.parse(row.content);
    expect(content.created).toBe(true);
    expect(content.orchestratorKey).toBe('SD-ACME-LEO-ORCH-SPRINT-001');
    expect(content.childCount).toBe(2);
  });

  it('marks artifacts with errors with reduced quality score', () => {
    const result = {
      created: true,
      orchestratorKey: 'SD-TEST-001',
      childKeys: ['SD-TEST-001-A'],
      errors: ['Child B failed', 'Child C failed'],
    };

    const row = buildBridgeArtifactRecord('venture-uuid', 18, result);
    expect(row.quality_score).toBe(50); // 100 - 2*25
    expect(row.validation_status).toBe('pending');
  });

  it('handles no-creation result (idempotency)', () => {
    const result = {
      created: false,
      orchestratorKey: 'SD-EXISTING-001',
      childKeys: ['SD-EXISTING-001-A'],
      errors: [],
    };

    const row = buildBridgeArtifactRecord('venture-uuid', 18, result);
    expect(row.quality_score).toBe(100);
    const content = JSON.parse(row.content);
    expect(content.created).toBe(false);
  });
});

describe('findExistingOrchestrator', () => {
  it('returns null when no match found', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    };

    const result = await findExistingOrchestrator(mockSupabase, 'venture-1', 'Sprint Alpha');
    expect(result).toBeNull();
  });

  it('returns null when ventureId is missing', async () => {
    const result = await findExistingOrchestrator({}, null, 'Sprint Alpha');
    expect(result).toBeNull();
  });

  it('returns null when sprintName is missing', async () => {
    const result = await findExistingOrchestrator({}, 'venture-1', null);
    expect(result).toBeNull();
  });
});
