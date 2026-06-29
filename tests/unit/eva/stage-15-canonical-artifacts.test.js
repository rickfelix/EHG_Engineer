/**
 * Unit test for SD-LEO-INFRA-S15-USER-STORY-PACK-GAP-001 (FR-1/FR-3).
 *
 * Stage 15 must emit the canonical blueprint_user_story_pack + blueprint_wireframes
 * artifacts (via the typed { artifacts:[...] } contract) so the orchestrator
 * persists the FULL canonical set — not just wireframe_screens. wireframe_screens
 * is owned by the daemon S15 post-hook, so it is intentionally NOT in the typed
 * set (avoids duplicate rows).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const userStoryResult = { epics: [{ id: 'E1', stories: [{ id: 'S1' }] }] };
const iaResult = { pages: [{ name: 'Home' }], user_flows: [] };
const wireframeResult = { screens: [{ name: 'Home', deviceType: 'DESKTOP' }] };

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

import TEMPLATE from '../../../lib/eva/stage-templates/stage-15.js';

describe('Stage 15 canonical artifacts (SD-LEO-INFRA-S15-USER-STORY-PACK-GAP-001)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emits blueprint_user_story_pack + blueprint_wireframes as typed artifacts (not wireframe_screens)', async () => {
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
    // wireframe_screens is owned by the daemon post-hook — must NOT be duplicated here
    expect(types).not.toContain('wireframe_screens');

    const pack = result.artifacts.find((a) => a.artifactType === 'blueprint_user_story_pack');
    expect(pack.payload).toEqual(userStoryResult);
    const wf = result.artifacts.find((a) => a.artifactType === 'blueprint_wireframes');
    expect(wf.payload).toEqual(wireframeResult);

    // back-compat fields preserved
    expect(result.user_story_pack).toEqual(userStoryResult);
    expect(result.wireframes).toEqual(wireframeResult);
  });

  it('omits the wireframes artifact when S10 brand data is unavailable (still emits the user-story pack)', async () => {
    const ctx = { logger: { log() {}, warn() {}, error() {} }, ventureId: 'v1', stage10Data: {} };
    const result = await TEMPLATE.analysisStep(ctx);
    const types = result.artifacts.map((a) => a.artifactType);
    expect(types).toContain('blueprint_user_story_pack');
    // wireframes skipped -> no blueprint_wireframes artifact (conditional, not required at boundary)
    expect(types).not.toContain('blueprint_wireframes');
  });
});
