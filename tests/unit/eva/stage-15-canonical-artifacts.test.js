/**
 * Unit test for SD-LEO-INFRA-S15-USER-STORY-PACK-GAP-001 (FR-1/FR-3).
 *
 * Stage 15 must emit the FULL canonical set — blueprint_user_story_pack +
 * blueprint_wireframes + wireframe_screens — via the typed { artifacts:[...] } contract.
 *
 * SD-LEO-INFRA-S15-WIREFRAME-SCREENS-REGRESSION-001: wireframe_screens MUST be in the typed set.
 * The prior fix omitted it (assuming the daemon post-hook owned it), but that left it to a
 * post-ADVANCEMENT hook while the 15->16 boundary requires it pre-advance — a deadlock. The producer
 * now owns it (the post-hook is an idempotent fallback); this test guards against the omission.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const userStoryResult = { epics: [{ id: 'E1', stories: [{ id: 'S1' }] }] };
const iaResult = { pages: [{ name: 'Home' }], user_flows: [] };
const wireframeResult = { screens: [{ name: 'Home', deviceType: 'DESKTOP' }] };
// SD-LEO-INFRA-FIRST-CLASS-USER-001
const journeyResult = { journeys: [{ journey_id: 'jny-p1-goal', steps: [] }], coverage_selfcheck: { dag_valid: true }, findings: [] };

vi.mock('../../../lib/eva/stage-templates/analysis-steps/stage-15-user-story-pack.js', () => ({
  generateUserStoryPack: vi.fn(async () => userStoryResult),
}));
vi.mock('../../../lib/eva/stage-templates/analysis-steps/stage-15-ia-generator.js', () => ({
  generateInformationArchitecture: vi.fn(async () => iaResult),
}));
vi.mock('../../../lib/eva/stage-templates/analysis-steps/stage-15-wireframe-generator.js', () => ({
  analyzeStage15WireframeGenerator: vi.fn(async () => wireframeResult),
}));
vi.mock('../../../lib/eva/stage-templates/analysis-steps/stage-19-visual-convergence.js', () => ({
  analyzeStage19VisualConvergence: vi.fn(async () => ({ overall_score: 80, verdict: 'pass' })),
}));
vi.mock('../../../lib/eva/stage-templates/analysis-steps/stage-15-user-journey.js', () => ({
  generateUserJourneys: vi.fn(async () => journeyResult),
}));

import TEMPLATE from '../../../lib/eva/stage-templates/stage-15.js';

describe('Stage 15 canonical artifacts (SD-LEO-INFRA-S15-USER-STORY-PACK-GAP-001)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emits the FULL canonical set incl. wireframe_screens as typed artifacts, each exactly once', async () => {
    const ctx = {
      logger: { log() {}, warn() {}, error() {} },
      ventureId: 'v1',
      // S10 brand data present so the wireframe sub-step runs
      stage10Data: { customerPersonas: [{ id: 'p1' }], brandGenome: { palette: [] } },
    };

    const result = await TEMPLATE.analysisStep(ctx);

    expect(Array.isArray(result.artifacts)).toBe(true);
    const types = result.artifacts.map((a) => a.artifactType);
    expect(types).toContain('blueprint_user_story_pack');
    expect(types).toContain('blueprint_wireframes');
    // SD-LEO-INFRA-S15-WIREFRAME-SCREENS-REGRESSION-001: wireframe_screens MUST be present (the
    // 15->16 boundary requires it pre-advance; the producer owns it, post-hook is a fallback).
    expect(types).toContain('wireframe_screens');
    // SD-LEO-INFRA-FIRST-CLASS-USER-001: blueprint_user_journey MUST be present too.
    expect(types).toContain('blueprint_user_journey');
    // each canonical type EXACTLY once (no double-emission)
    for (const t of ['blueprint_user_story_pack', 'blueprint_wireframes', 'wireframe_screens', 'blueprint_user_journey']) {
      expect(types.filter((x) => x === t)).toHaveLength(1);
    }

    const pack = result.artifacts.find((a) => a.artifactType === 'blueprint_user_story_pack');
    expect(pack.payload).toEqual(userStoryResult);
    const wf = result.artifacts.find((a) => a.artifactType === 'blueprint_wireframes');
    expect(wf.payload).toEqual(wireframeResult);
    const screens = result.artifacts.find((a) => a.artifactType === 'wireframe_screens');
    expect(Array.isArray(screens.payload.screens)).toBe(true);
    expect(screens.payload.screenCount).toBe(screens.payload.screens.length);
    expect(screens.payload.screens.length).toBeGreaterThan(0);
    const journeys = result.artifacts.find((a) => a.artifactType === 'blueprint_user_journey');
    expect(journeys.payload).toEqual(journeyResult);

    // back-compat fields preserved
    expect(result.user_story_pack).toEqual(userStoryResult);
    expect(result.wireframes).toEqual(wireframeResult);
    expect(result.user_journeys).toEqual(journeyResult);
  });

  it('omits the wireframes artifact when S10 brand data is unavailable (still emits the user-story pack)', async () => {
    const ctx = { logger: { log() {}, warn() {}, error() {} }, ventureId: 'v1', stage10Data: {} };
    const result = await TEMPLATE.analysisStep(ctx);
    const types = result.artifacts.map((a) => a.artifactType);
    expect(types).toContain('blueprint_user_story_pack');
    // wireframes skipped -> no blueprint_wireframes artifact (conditional, not required at boundary)
    expect(types).not.toContain('blueprint_wireframes');
    // journeys depend on wireframe screens -> also skipped when wireframes are skipped
    expect(types).not.toContain('blueprint_user_journey');
  });
});
