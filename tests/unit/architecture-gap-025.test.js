/**
 * Tests for Architecture Gap 025 modules
 * SD-MAN-INFRA-CORRECTIVE-ARCHITECTURE-GAP-025
 *
 * Tests tri-modal routing state machine, unified escalation router,
 * artifact versioning, and analysis history preservation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Supabase ───────────────────────────────────────

function createMockSupabase(overrides = {}) {
  const defaultResult = { data: null, error: null };
  const chainable = (result = defaultResult) => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: vi.fn((cb) => cb(result)),
  });

  return {
    from: vi.fn((table) => {
      const override = overrides[table];
      if (override) return override;
      return chainable();
    }),
  };
}

// ── Routing State Machine ───────────────────────────────

describe('routing-state-machine', () => {
  let mod;

  beforeEach(async () => {
    mod = await import('../../lib/eva/routing-state-machine.js');
  });

  it('exports ROUTING_MODES with 3 modes', () => {
    expect(Object.keys(mod.ROUTING_MODES)).toHaveLength(3);
    expect(mod.ROUTING_MODES.PRIORITY_QUEUE).toBe('PRIORITY_QUEUE');
    expect(mod.ROUTING_MODES.EVENT_BUS).toBe('EVENT_BUS');
    expect(mod.ROUTING_MODES.ESCALATION).toBe('ESCALATION');
  });

  it('validates allowed transitions', () => {
    expect(mod.isValidTransition('PRIORITY_QUEUE', 'EVENT_BUS')).toBe(true);
    expect(mod.isValidTransition('PRIORITY_QUEUE', 'ESCALATION')).toBe(true);
    expect(mod.isValidTransition('EVENT_BUS', 'PRIORITY_QUEUE')).toBe(true);
    expect(mod.isValidTransition('EVENT_BUS', 'ESCALATION')).toBe(true);
    expect(mod.isValidTransition('ESCALATION', 'EVENT_BUS')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    // ESCALATION can only go to EVENT_BUS
    expect(mod.isValidTransition('ESCALATION', 'PRIORITY_QUEUE')).toBe(false);
  });

  it('getValidTransitions returns info for valid mode', () => {
    const result = mod.getValidTransitions('ESCALATION');
    expect(result).not.toBeNull();
    expect(result.validTransitions).toEqual(['EVENT_BUS']);
    expect(result.entryCondition).toContain('DFE');
  });

  it('getValidTransitions returns null for invalid mode', () => {
    expect(mod.getValidTransitions('INVALID')).toBeNull();
  });

  it('getCurrentMode defaults to PRIORITY_QUEUE when no history', async () => {
    const supabase = createMockSupabase({
      eva_event_log: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      },
    });
    const mode = await mod.getCurrentMode(supabase, 'venture-123');
    expect(mode).toBe('PRIORITY_QUEUE');
  });

  it('transitionMode throws on invalid transition', async () => {
    // Mock getCurrentMode to return ESCALATION
    const mockEventLog = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { metadata: { to_mode: 'ESCALATION' } },
        error: null,
      }),
      single: vi.fn().mockResolvedValue({ data: { id: 'evt-1' }, error: null }),
    };
    const supabase = createMockSupabase({ eva_event_log: mockEventLog });

    await expect(mod.transitionMode(supabase, {
      ventureId: 'venture-123',
      toMode: 'PRIORITY_QUEUE',
      triggerReason: 'test',
    })).rejects.toThrow('Cannot transition from ESCALATION to PRIORITY_QUEUE');
  });

  it('throws on missing supabase client', async () => {
    await expect(mod.getCurrentMode(null, 'v1')).rejects.toThrow('supabase client is required');
  });

  it('throws on unknown routing mode', async () => {
    const supabase = createMockSupabase({
      eva_event_log: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      },
    });
    await expect(mod.transitionMode(supabase, {
      ventureId: 'v1',
      toMode: 'INVALID_MODE',
      triggerReason: 'test',
    })).rejects.toThrow('Unknown routing mode');
  });
});

// ── Unified Escalation Router ───────────────────────────

describe('unified-escalation-router', () => {
  let mod;

  beforeEach(async () => {
    mod = await import('../../lib/eva/unified-escalation-router.js');
  });

  it('exports ESCALATION_TYPES', () => {
    expect(mod.ESCALATION_TYPES.DFE_SEVERITY).toBe('DFE_SEVERITY');
    expect(mod.ESCALATION_TYPES.CHAIRMAN_TIMEOUT).toBe('CHAIRMAN_TIMEOUT');
    expect(mod.ESCALATION_TYPES.GATE_FAILURE).toBe('GATE_FAILURE');
    expect(mod.ESCALATION_TYPES.MANUAL_OVERRIDE).toBe('MANUAL_OVERRIDE');
  });

  it('routeEscalation handles DFE L2 severity', async () => {
    const mockEventLog = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'evt-1' }, error: null }),
    };
    const mockDecisions = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
    const supabase = createMockSupabase({
      eva_event_log: mockEventLog,
      chairman_decisions: mockDecisions,
    });

    const result = await mod.routeEscalation(supabase, {
      type: 'DFE_SEVERITY',
      ventureId: 'venture-123',
      severity: 'L2',
      reason: 'Cost threshold exceeded',
      dfeResult: { triggers: [{ type: 'cost_threshold' }], severity_score: 7 },
    });

    expect(result.severity).toBe('L2');
    expect(result.requiresChairman).toBe(true);
    expect(result.action).toBe('escalate_notify');
    expect(result.eventId).toBe('evt-1');
  });

  it('routeEscalation handles chairman timeout', async () => {
    const mockEventLog = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'evt-2' }, error: null }),
    };
    const mockDecisions = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
    const supabase = createMockSupabase({
      eva_event_log: mockEventLog,
      chairman_decisions: mockDecisions,
    });

    const result = await mod.routeEscalation(supabase, {
      type: 'CHAIRMAN_TIMEOUT',
      ventureId: 'venture-123',
      timeoutContext: { decision_type: 'gate_decision', timeout_ms: 14400000 },
      reason: 'Decision timed out',
    });

    expect(result.severity).toBe('L2');
    expect(result.requiresChairman).toBe(true);
  });

  it('routeEscalation handles L1 (no chairman needed)', async () => {
    const mockEventLog = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'evt-3' }, error: null }),
    };
    const supabase = createMockSupabase({ eva_event_log: mockEventLog });

    const result = await mod.routeEscalation(supabase, {
      type: 'DFE_SEVERITY',
      ventureId: 'venture-123',
      severity: 'L1',
      reason: 'Minor issue detected',
    });

    expect(result.severity).toBe('L1');
    expect(result.requiresChairman).toBe(false);
    expect(result.action).toBe('log_and_continue');
  });

  it('throws on missing escalation type', async () => {
    const supabase = createMockSupabase();
    await expect(mod.routeEscalation(supabase, {
      ventureId: 'v1',
    })).rejects.toThrow('escalation type is required');
  });

  it('throws on invalid escalation type', async () => {
    const supabase = createMockSupabase();
    await expect(mod.routeEscalation(supabase, {
      type: 'INVALID',
      ventureId: 'v1',
    })).rejects.toThrow('Unknown escalation type');
  });
});

// ── Artifact Versioning ─────────────────────────────────

describe('artifact-versioning', () => {
  let mod;

  beforeEach(async () => {
    mod = await import('../../lib/eva/artifact-versioning.js');
  });

  it('createVersionedArtifact sets version=1', async () => {
    const mockArtifacts = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'art-1' }, error: null }),
    };
    const supabase = createMockSupabase({ venture_artifacts: mockArtifacts });

    const result = await mod.createVersionedArtifact(supabase, {
      ventureId: 'venture-123',
      artifactType: 'analysis',
      stageId: '5',
      content: { summary: 'test' },
    });

    expect(result.version).toBe(1);
    expect(result.id).toBe('art-1');

    // Verify metadata includes version=1
    const insertCall = mockArtifacts.insert.mock.calls[0][0];
    expect(insertCall.metadata.version).toBe(1);
    expect(insertCall.is_current).toBe(true);
  });

  it('updateArtifactVersion increments version', async () => {
    const mockArtifacts = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn()
        // First call: fetch current artifact
        .mockResolvedValueOnce({
          data: {
            id: 'art-1',
            venture_id: 'venture-123',
            artifact_type: 'analysis',
            stage_id: '5',
            content: { summary: 'v1' },
            metadata: { version: 1 },
            is_current: true,
          },
          error: null,
        })
        // Second call: insert new version
        .mockResolvedValueOnce({ data: { id: 'art-2' }, error: null }),
    };
    const supabase = createMockSupabase({ venture_artifacts: mockArtifacts });

    const result = await mod.updateArtifactVersion(supabase, {
      artifactId: 'art-1',
      content: { summary: 'v2' },
    });

    expect(result.version).toBe(2);
    expect(result.previousId).toBe('art-1');
  });

  it('getArtifactHistory returns ordered results', async () => {
    const mockArtifacts = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn((cb) => cb({
        data: [
          { id: 'art-2', metadata: { version: 2 }, is_current: true, created_at: '2026-02-28T12:00:00Z' },
          { id: 'art-1', metadata: { version: 1 }, is_current: false, created_at: '2026-02-28T11:00:00Z' },
        ],
        error: null,
      })),
    };
    const supabase = createMockSupabase({ venture_artifacts: mockArtifacts });

    const history = await mod.getArtifactHistory(supabase, {
      ventureId: 'venture-123',
      artifactType: 'analysis',
    });

    expect(history).toHaveLength(2);
    expect(history[0].version).toBe(2);
    expect(history[1].version).toBe(1);
  });

  it('throws on missing supabase', async () => {
    await expect(mod.createVersionedArtifact(null, {
      ventureId: 'v1',
    })).rejects.toThrow('supabase client is required');
  });
});

// ── Analysis History ────────────────────────────────────

describe('analysis-history', () => {
  let mod;

  beforeEach(async () => {
    mod = await import('../../lib/eva/analysis-history.js');
  });

  it('archiveAnalysisStep persists to eva_event_log', async () => {
    const mockEventLog = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'evt-1' }, error: null }),
      then: vi.fn((cb) => cb({ data: [], error: null })),
    };
    const supabase = createMockSupabase({ eva_event_log: mockEventLog });

    const result = await mod.archiveAnalysisStep(supabase, {
      ventureId: 'venture-123',
      stageId: '5',
      analysisResult: { score: 85, summary: 'Good analysis' },
      reason: 'stage_reanalysis',
    });

    expect(result.eventId).toBe('evt-1');
    expect(result.archivedAt).toBeTruthy();
    expect(result.historyCount).toBe(1);
  });

  it('getAnalysisHistory returns chronological results', async () => {
    const mockEventLog = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: vi.fn((cb) => cb({
        data: [
          { id: 'evt-1', metadata: { stage_id: '5', analysis_result: { score: 80 }, archived_at: '2026-02-28T10:00:00Z', history_index: 1 }, created_at: '2026-02-28T10:00:00Z' },
          { id: 'evt-2', metadata: { stage_id: '5', analysis_result: { score: 85 }, archived_at: '2026-02-28T11:00:00Z', history_index: 2 }, created_at: '2026-02-28T11:00:00Z' },
          { id: 'evt-3', metadata: { stage_id: '5', analysis_result: { score: 90 }, archived_at: '2026-02-28T12:00:00Z', history_index: 3 }, created_at: '2026-02-28T12:00:00Z' },
        ],
        error: null,
      })),
    };
    const supabase = createMockSupabase({ eva_event_log: mockEventLog });

    const history = await mod.getAnalysisHistory(supabase, 'venture-123', '5');

    expect(history).toHaveLength(3);
    expect(history[0].historyIndex).toBe(1);
    expect(history[2].historyIndex).toBe(3);
    expect(history[0].analysisResult.score).toBe(80);
    expect(history[2].analysisResult.score).toBe(90);
  });

  it('preserveBeforeReanalysis skips when no current analysis', async () => {
    const mockStages = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const supabase = createMockSupabase({ eva_venture_stages: mockStages });

    const result = await mod.preserveBeforeReanalysis(supabase, {
      ventureId: 'venture-123',
      stageId: '5',
    });

    expect(result.archived).toBe(false);
    expect(result.historyCount).toBe(0);
  });

  it('throws on missing ventureId', async () => {
    const supabase = createMockSupabase();
    await expect(mod.archiveAnalysisStep(supabase, {
      stageId: '5',
      analysisResult: {},
    })).rejects.toThrow('ventureId is required');
  });
});
