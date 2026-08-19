/**
 * SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001 FR-1/FR-1b.
 *
 * FR-1: metadata.journey_steps is derived from the venture's Stage-15
 * blueprint_user_journey artifact (generateUserJourneys() output), never from
 * Stage-19 acceptance criteria. deriveJourneySteps() is pure/DB-free.
 *
 * FR-1b: the derived steps are stamped onto the orchestrator SD's own metadata
 * at creation time in lifecycle-sd-bridge.js's convertSprintToSDs — the earliest
 * point the orchestrator row (and therefore its metadata) exists. Stage 19
 * (analyzeStage19) is a pure function with no DB access and cannot be the write
 * site, so journey_steps is fetched directly by venture_id rather than routed
 * through sd_bridge_payloads (which are per sprint-item, not venture-scoped).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveJourneySteps } from '../../../lib/eva/bridge/orchestrator-journey-steps.js';
import { fetchCurrentJourneyArtifact } from '../../../lib/eva/lifecycle-sd-bridge.js';

describe('deriveJourneySteps (pure)', () => {
  const journey = (overrides = {}) => ({
    journey_id: 'jny-casual-seller-upload-generate',
    persona_ref: 'Casual Seller',
    tombstones: [],
    steps: [
      {
        step_id: 'stp-a1b2-upload-image',
        seq: 10,
        goal: 'upload a product photo',
        screen_ref: 'screen-2',
        route: '/upload',
        action: 'upload a single image from my computer',
        expected_outcome: 'I can quickly generate alt text for it.',
        side_effects_claimed: ['image stored'],
        requires: [],
        story_refs: ['story-1'],
      },
      {
        step_id: 'stp-c3d4-generate-alt-text',
        seq: 20,
        goal: 'generate alt text',
        screen_ref: 'screen-2',
        route: '/upload',
        action: 'click generate',
        expected_outcome: 'alt text appears',
        side_effects_claimed: [],
        requires: ['stp-a1b2-upload-image'],
        story_refs: ['story-2'],
      },
    ],
    ...overrides,
  });

  it('flattens a single journey\'s steps, tagging each with journey_id/persona_ref', () => {
    const result = deriveJourneySteps({ journeys: [journey()] });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      step_id: 'stp-a1b2-upload-image',
      journey_id: 'jny-casual-seller-upload-generate',
      persona_ref: 'Casual Seller',
      screen_ref: 'screen-2',
      route: '/upload',
      action: 'upload a single image from my computer',
      expected_outcome: 'I can quickly generate alt text for it.',
      requires: [],
    });
    expect(result[1].requires).toEqual(['stp-a1b2-upload-image']);
    // Journey-level / non-walkable fields must not leak onto the flattened step.
    expect(result[0]).not.toHaveProperty('side_effects_claimed');
    expect(result[0]).not.toHaveProperty('story_refs');
  });

  it('flattens steps across multiple journeys together', () => {
    const j2 = journey({
      journey_id: 'jny-power-seller-bulk-upload',
      persona_ref: 'Power Seller',
      steps: [{ step_id: 'stp-e5f6-bulk-upload', seq: 10, action: 'bulk upload', expected_outcome: 'all queued' }],
    });
    const result = deriveJourneySteps({ journeys: [journey(), j2] });
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.step_id)).toContain('stp-e5f6-bulk-upload');
  });

  it('drops tombstoned steps', () => {
    const result = deriveJourneySteps({ journeys: [journey({ tombstones: ['stp-a1b2-upload-image'] })] });
    expect(result).toHaveLength(1);
    expect(result[0].step_id).toBe('stp-c3d4-generate-alt-text');
  });

  it('returns null (never []) when every step is tombstoned', () => {
    const result = deriveJourneySteps({
      journeys: [journey({ tombstones: ['stp-a1b2-upload-image', 'stp-c3d4-generate-alt-text'] })],
    });
    expect(result).toBeNull();
  });

  it('returns null for missing/empty journeys, and is total on malformed input', () => {
    expect(deriveJourneySteps(null)).toBeNull();
    expect(deriveJourneySteps(undefined)).toBeNull();
    expect(deriveJourneySteps({})).toBeNull();
    expect(deriveJourneySteps({ journeys: [] })).toBeNull();
    expect(deriveJourneySteps({ journeys: [null, { journey_id: 'x' /* no .steps */ }] })).toBeNull();
    expect(deriveJourneySteps({ journeys: [{ steps: [{ /* no step_id */ action: 'x' }] }] })).toBeNull();
  });
});

describe('fetchCurrentJourneyArtifact', () => {
  function makeChain(resolved) {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => resolved),
    };
    return chain;
  }

  it('returns null without querying when ventureId is absent', async () => {
    const fromSpy = vi.fn();
    const result = await fetchCurrentJourneyArtifact({ from: fromSpy }, null);
    expect(result).toBeNull();
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('parses a JSON-encoded string content column (the live venture_artifacts shape)', async () => {
    const chain = makeChain({ data: { content: JSON.stringify({ journeys: [{ journey_id: 'j1', steps: [] }] }) }, error: null });
    const supabase = { from: vi.fn(() => chain) };
    const result = await fetchCurrentJourneyArtifact(supabase, 'venture-1');
    expect(supabase.from).toHaveBeenCalledWith('venture_artifacts');
    expect(chain.eq).toHaveBeenCalledWith('artifact_type', 'blueprint_user_journey');
    expect(result).toEqual({ journeys: [{ journey_id: 'j1', steps: [] }] });
  });

  it('passes through an already-parsed object content column', async () => {
    const content = { journeys: [{ journey_id: 'j1', steps: [] }] };
    const chain = makeChain({ data: { content }, error: null });
    const result = await fetchCurrentJourneyArtifact({ from: () => chain }, 'venture-1');
    expect(result).toBe(content);
  });

  it('returns null on a DB error, a missing row, or malformed JSON (never throws)', async () => {
    expect(await fetchCurrentJourneyArtifact({ from: () => makeChain({ data: null, error: { message: 'boom' } }) }, 'v1')).toBeNull();
    expect(await fetchCurrentJourneyArtifact({ from: () => makeChain({ data: null, error: null }) }, 'v1')).toBeNull();
    expect(await fetchCurrentJourneyArtifact({ from: () => makeChain({ data: { content: '{not json' }, error: null }) }, 'v1')).toBeNull();
  });
});

// ── Integration: convertSprintToSDs stamps journey_steps on the orchestrator insert ──

vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockResolvedValue('SD-DD-LEO-ORCH-SPRINT-001'),
  generateChildKey: vi.fn((parentKey, index) => `${parentKey}-${String.fromCharCode(65 + index)}`),
  generateGrandchildKey: vi.fn((childKey, j) => `${childKey}-${j + 1}`),
  normalizeVenturePrefix: vi.fn((name) => name.toUpperCase().replace(/\s+/g, '-')),
  keyExists: vi.fn().mockResolvedValue(false),
  SD_SOURCES: { LEO: 'LEO' },
  SD_TYPES: { feature: 'FEAT', orchestrator: 'ORCH' },
}));

vi.mock('../../../lib/eva/config/target-application-capabilities.js', () => ({
  getTargetApplicationCapabilities: () => ({ has_serverless_api: true }),
}));

const { convertSprintToSDs } = await import('../../../lib/eva/lifecycle-sd-bridge.js');

function makeRecordingSupabase() {
  const inserts = [];
  const sdTable = {
    insert: vi.fn((row) => { inserts.push(row); return Promise.resolve({ error: null }); }),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        })),
      })),
      order: vi.fn(() => ({ then: vi.fn() })),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  };
  return {
    inserts,
    from: vi.fn((table) => {
      if (table === 'design_reference_library') {
        return { select: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) })) };
      }
      if (table === 'eva_vision_documents') {
        const vc = {
          select: vi.fn(() => vc), eq: vi.fn(() => vc), in: vi.fn(() => vc),
          order: vi.fn(() => vc), limit: vi.fn(() => vc),
          maybeSingle: vi.fn().mockResolvedValue({ data: { vision_key: 'VISION-DD-L2-001', version: 'v1' }, error: null }),
        };
        return vc;
      }
      return sdTable;
    }),
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
  };
}

function stageOutput() {
  return {
    sprint_name: 'Sprint Build',
    sprint_goal: 'Ship MVP',
    sprint_duration_days: 14,
    sd_bridge_payloads: [{
      title: 'Core feature', description: 'desc', priority: 'high', type: 'feature',
      scope: 'backend', success_criteria: 'works', dependencies: [], risks: [],
      target_application: 'EHG_Engineer',
    }],
  };
}

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
const venture = { id: 'venture-510177ba', name: 'DataDistill' };

describe('convertSprintToSDs FR-1b: orchestrator metadata.journey_steps', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stamps metadata.journey_steps when the injected fetcher returns a journey artifact', async () => {
    const supabase = makeRecordingSupabase();
    const fetchJourneyArtifact = vi.fn().mockResolvedValue({
      journeys: [{ journey_id: 'j1', persona_ref: 'Buyer', tombstones: [], steps: [
        { step_id: 'stp-a1b2-upload-image', seq: 10, action: 'upload', expected_outcome: 'stored' },
      ] }],
    });
    const result = await convertSprintToSDs(
      { stageOutput: stageOutput(), ventureContext: venture, options: { skipEnrichment: true, generateGrandchildren: false } },
      { supabase, logger, fetchJourneyArtifact },
    );

    expect(result.created).toBe(true);
    expect(fetchJourneyArtifact).toHaveBeenCalledWith(supabase, venture.id);
    const orchestrator = supabase.inserts.find((r) => r.sd_type === 'orchestrator');
    expect(orchestrator.metadata.journey_steps).toEqual([{
      step_id: 'stp-a1b2-upload-image', journey_id: 'j1', persona_ref: 'Buyer',
      seq: 10, goal: null, screen_ref: null, route: null,
      action: 'upload', expected_outcome: 'stored', requires: [],
    }]);
  });

  it('omits metadata.journey_steps entirely (not null, not []) when no journey artifact exists', async () => {
    const supabase = makeRecordingSupabase();
    const fetchJourneyArtifact = vi.fn().mockResolvedValue(null);
    const result = await convertSprintToSDs(
      { stageOutput: stageOutput(), ventureContext: venture, options: { skipEnrichment: true, generateGrandchildren: false } },
      { supabase, logger, fetchJourneyArtifact },
    );

    expect(result.created).toBe(true);
    const orchestrator = supabase.inserts.find((r) => r.sd_type === 'orchestrator');
    expect(orchestrator.metadata).not.toHaveProperty('journey_steps');
  });

  it('a throwing fetcher is fail-soft: orchestrator creation still succeeds with no journey_steps', async () => {
    const supabase = makeRecordingSupabase();
    const fetchJourneyArtifact = vi.fn().mockRejectedValue(new Error('DB blip'));
    const result = await convertSprintToSDs(
      { stageOutput: stageOutput(), ventureContext: venture, options: { skipEnrichment: true, generateGrandchildren: false } },
      { supabase, logger, fetchJourneyArtifact },
    );

    expect(result.created).toBe(true);
    const orchestrator = supabase.inserts.find((r) => r.sd_type === 'orchestrator');
    expect(orchestrator.metadata).not.toHaveProperty('journey_steps');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('journey_steps derivation skipped'));
  });
});
