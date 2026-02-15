/**
 * Stage Chain Integration Tests - EVA Venture Lifecycle
 *
 * Tests that actual analysis step outputs chain correctly into downstream stages.
 * Unlike cross-stage-contracts.test.js (which uses synthetic genStageNN data) and
 * analysis-steps.test.js (which tests each stage in isolation), this test runs
 * the full 1→2→3→...→25 pipeline where each stage's REAL output feeds the next.
 *
 * This catches schema drift between what analysis steps actually produce vs
 * what downstream stages expect as input.
 */

import { vi, describe, it, expect } from 'vitest';

// Use vi.fn() so the mock works with vitest's hoisting.
// The real implementation is injected in beforeAll after dynamic import.
const mockComplete = vi.fn();
vi.mock('../../../lib/llm/index.js', () => ({
  getLLMClient: () => ({ complete: mockComplete }),
}));

// Import fixtures and configure mock to detect stage from prompt content
const { STAGE_FIXTURES } = await import('../../helpers/llm-mock-factory.js');

let stage2CallIndex = 0;
// Stage detection uses exact phrases from each analysis step's SYSTEM_PROMPT.
// These identifiers were extracted by grepping all 25 stage files.
mockComplete.mockImplementation(async (systemPrompt) => {
  const sys = systemPrompt.toLowerCase();

  // Stage 1: "Stage 1 Hydration Engine" — must check BEFORE stage 3 (prompt contains "calibration")
  if (sys.includes('hydration engine')) return JSON.stringify(STAGE_FIXTURES[1]);
  // Stage 2: "multi-persona evaluation" — 6 sequential persona calls
  if (sys.includes('multi-persona') || sys.includes('persona')) {
    const personas = STAGE_FIXTURES[2];
    const response = personas[stage2CallIndex % personas.length];
    stage2CallIndex++;
    return JSON.stringify(response);
  }
  // Stage 3: "independent validation engine for venture scoring"
  if (sys.includes('hybrid scoring') || sys.includes('validation engine for venture scoring')) return JSON.stringify(STAGE_FIXTURES[3]);
  // Stage 4: "competitive intelligence engine"
  if (sys.includes('competitive intelligence')) return JSON.stringify(STAGE_FIXTURES[4]);
  // Stage 5: "financial modeling engine"
  if (sys.includes('financial modeling engine')) return JSON.stringify(STAGE_FIXTURES[5]);
  // Stage 6: "Risk Assessment Engine"
  if (sys.includes('risk assessment engine')) return JSON.stringify(STAGE_FIXTURES[6]);
  // Stage 7: "Revenue Architecture Engine"
  if (sys.includes('revenue architecture')) return JSON.stringify(STAGE_FIXTURES[7]);
  // Stage 8: "Business Model Canvas Engine"
  if (sys.includes('business model canvas')) return JSON.stringify(STAGE_FIXTURES[8]);
  // Stage 9: "Exit Strategy Engine"
  if (sys.includes('exit strategy engine')) return JSON.stringify(STAGE_FIXTURES[9]);
  // Stage 10: "Brand Identity Engine" — uses mockResolvedValueOnce in the test
  //   (prompt-based detection via mockImplementation has stale-state issues after 15+ async calls)
  if (sys.includes('brand identity engine')) return JSON.stringify(STAGE_FIXTURES[10]);
  // Stage 11: "Go-To-Market Strategy Engine"
  if (sys.includes('go-to-market strategy engine')) return JSON.stringify(STAGE_FIXTURES[11]);
  // Stage 12: "Sales Logic Engine"
  if (sys.includes('sales logic engine')) return JSON.stringify(STAGE_FIXTURES[12]);
  // Stage 13: "Product Roadmap Engine"
  if (sys.includes('product roadmap engine')) return JSON.stringify(STAGE_FIXTURES[13]);
  // Stage 14: "Technical Architecture Engine"
  if (sys.includes('technical architecture engine')) return JSON.stringify(STAGE_FIXTURES[14]);
  // Stage 15: "Risk Identification Engine"
  if (sys.includes('risk identification engine')) return JSON.stringify(STAGE_FIXTURES[15]);
  // Stage 16: "Financial Projections Engine"
  if (sys.includes('financial projections engine')) return JSON.stringify(STAGE_FIXTURES[16]);
  // Stage 17: "Build Readiness Analyst"
  if (sys.includes('build readiness analyst')) return JSON.stringify(STAGE_FIXTURES[17]);
  // Stage 18: "Sprint Planning Engine"
  if (sys.includes('sprint planning engine')) return JSON.stringify(STAGE_FIXTURES[18]);
  // Stage 19: "Build Execution Analyst"
  if (sys.includes('build execution analyst')) return JSON.stringify(STAGE_FIXTURES[19]);
  // Stage 20: "Quality Assurance Analyst"
  if (sys.includes('quality assurance analyst')) return JSON.stringify(STAGE_FIXTURES[20]);
  // Stage 21: "Build Review and Integration Testing Analyst"
  if (sys.includes('build review') || sys.includes('integration testing analyst')) return JSON.stringify(STAGE_FIXTURES[21]);
  // Stage 22: "Release Readiness Analyst"
  if (sys.includes('release readiness analyst')) return JSON.stringify(STAGE_FIXTURES[22]);
  // Stage 23: "Launch Execution Analyst"
  if (sys.includes('launch execution analyst')) return JSON.stringify(STAGE_FIXTURES[23]);
  // Stage 24: "Metrics & Learning Analyst"
  if (sys.includes('metrics') && sys.includes('learning analyst')) return JSON.stringify(STAGE_FIXTURES[24]);
  // Stage 25: "Venture Review Analyst"
  if (sys.includes('venture review analyst')) return JSON.stringify(STAGE_FIXTURES[25]);

  // Fallback
  return JSON.stringify(STAGE_FIXTURES[1]);
});

// Import all analysis steps (they'll use the mocked getLLMClient)
const {
  analyzeStage01, analyzeStage02, analyzeStage03, analyzeStage04, analyzeStage05,
  analyzeStage06, analyzeStage07, analyzeStage08, analyzeStage09, analyzeStage10,
  analyzeStage11, analyzeStage12, analyzeStage13, analyzeStage14, analyzeStage15,
  analyzeStage16, analyzeStage17, analyzeStage18, analyzeStage19, analyzeStage20,
  analyzeStage21, analyzeStage22, analyzeStage23, analyzeStage24, analyzeStage25,
} = await import('../../../lib/eva/stage-templates/analysis-steps/index.js');

// Import cross-stage contract validation
const { validateCrossStageContract } = await import('../../../lib/eva/stage-templates/validation.js');

// Import stage templates for contract specs and computeDerived
const stage02Template = await import('../../../lib/eva/stage-templates/stage-02.js');
const stage03Template = await import('../../../lib/eva/stage-templates/stage-03.js');
const stage04Template = await import('../../../lib/eva/stage-templates/stage-04.js');
const stage05Template = await import('../../../lib/eva/stage-templates/stage-05.js');
const stage06Template = await import('../../../lib/eva/stage-templates/stage-06.js');
const stage07Template = await import('../../../lib/eva/stage-templates/stage-07.js');
const stage08Template = await import('../../../lib/eva/stage-templates/stage-08.js');
const stage09Template = await import('../../../lib/eva/stage-templates/stage-09.js');

const silentLogger = { warn() {}, info() {}, error() {}, debug() {}, log() {} };
const VENTURE_NAME = 'Chain Test Venture';

// Shared state: each stage writes its output here for downstream stages to consume
const stageOutputs = {};

describe('Stage Chain: Full 1→25 Pipeline with Real Outputs', () => {
  // Phase 1: THE IDEA (Stages 1-3)
  describe('Phase 1: THE IDEA', () => {
    it('Stage 1 → produces valid output for downstream chain', async () => {
      stageOutputs[1] = await analyzeStage01({
        synthesis: 'AI-powered marketplace connecting local artisans to global buyers',
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[1]).toBeDefined();
      expect(stageOutputs[1].description).toBeDefined();
      expect(stageOutputs[1].archetype).toBeDefined();
    });

    it('Stage 1 output satisfies Stage 2 cross-stage contract', () => {
      const template = stage02Template.default || stage02Template;
      const contract = template.crossStageContract;
      if (contract) {
        const result = validateCrossStageContract(stageOutputs[1], contract, 'stage1→2');
        expect(result.valid).toBe(true);
      }
    });

    it('Stage 2 → consumes Stage 1 output and produces valid output', async () => {
      stageOutputs[2] = await analyzeStage02({
        stage1Data: stageOutputs[1],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[2]).toBeDefined();
      expect(stageOutputs[2].critiques).toBeDefined();
      expect(Array.isArray(stageOutputs[2].critiques)).toBe(true);
      expect(typeof stageOutputs[2].compositeScore).toBe('number');
    });

    it('Stage 2 output satisfies Stage 3 cross-stage contract', () => {
      const template = stage03Template.default || stage03Template;
      const contract = template.crossStageContract;
      if (contract) {
        const result = validateCrossStageContract(stageOutputs[2], contract, 'stage2→3');
        expect(result.valid).toBe(true);
      }
    });

    it('Stage 3 → consumes Stage 1+2 output and produces valid output', async () => {
      stageOutputs[3] = await analyzeStage03({
        stage1Data: stageOutputs[1],
        stage2Data: stageOutputs[2],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[3]).toBeDefined();
      expect(typeof stageOutputs[3].overallScore).toBe('number');
      expect(stageOutputs[3].decision).toBeDefined();
    });
  });

  // Phase 2: THE TRUTH (Stages 4-5)
  describe('Phase 2: THE TRUTH', () => {
    it('Stage 3 output satisfies Stage 4 cross-stage contract', () => {
      const template = stage04Template.default || stage04Template;
      const contract = template.crossStageContract;
      if (contract) {
        const result = validateCrossStageContract(stageOutputs[3], contract, 'stage3→4');
        expect(result.valid).toBe(true);
      }
    });

    it('Stage 4 → consumes Stage 1+3 output', async () => {
      stageOutputs[4] = await analyzeStage04({
        stage1Data: stageOutputs[1],
        stage3Data: stageOutputs[3],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[4]).toBeDefined();
      expect(Array.isArray(stageOutputs[4].competitors)).toBe(true);
      expect(stageOutputs[4].competitors.length).toBeGreaterThan(0);
    });

    it('Stage 4 output (with computeDerived) satisfies Stage 5 cross-stage contract', () => {
      // Apply Stage 4's own computeDerived to enrich its output
      const stage4Tmpl = stage04Template.default || stage04Template;
      if (stage4Tmpl.computeDerived) {
        const derived = stage4Tmpl.computeDerived(stageOutputs[4]);
        Object.assign(stageOutputs[4], derived);
      }
      // Validate against Stage 5's cross-stage contract
      const stage5Tmpl = stage05Template.default || stage05Template;
      const contract = stage5Tmpl.crossStageContract;
      if (contract) {
        const result = validateCrossStageContract(stageOutputs[4], contract, 'stage4→5');
        expect(result.valid).toBe(true);
      }
    });

    it('Stage 5 → consumes Stage 1+3+4 output', async () => {
      stageOutputs[5] = await analyzeStage05({
        stage1Data: stageOutputs[1],
        stage3Data: stageOutputs[3],
        stage4Data: stageOutputs[4],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[5]).toBeDefined();
      expect(stageOutputs[5].unitEconomics).toBeDefined();
      expect(typeof stageOutputs[5].roi3y).toBe('number');
    });
  });

  // Phase 3: THE PLAN (Stages 6-9)
  describe('Phase 3: THE PLAN', () => {
    it('Stage 5 output (with computeDerived) satisfies Stage 6 cross-stage contract', () => {
      // Apply Stage 5's own computeDerived to enrich its output
      const stage5Tmpl = stage05Template.default || stage05Template;
      if (stage5Tmpl.computeDerived) {
        const derived = stage5Tmpl.computeDerived(stageOutputs[5]);
        Object.assign(stageOutputs[5], derived);
      }
      // Validate against Stage 6's cross-stage contract
      const stage6Tmpl = stage06Template.default || stage06Template;
      const contract = stage6Tmpl.crossStageContract;
      if (contract) {
        const result = validateCrossStageContract(stageOutputs[5], contract, 'stage5→6');
        expect(result.valid).toBe(true);
      }
    });

    it('Stage 6 → consumes Stage 1+3+4+5 output', async () => {
      stageOutputs[6] = await analyzeStage06({
        stage1Data: stageOutputs[1],
        stage3Data: stageOutputs[3],
        stage4Data: stageOutputs[4],
        stage5Data: stageOutputs[5],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[6]).toBeDefined();
      expect(Array.isArray(stageOutputs[6].risks)).toBe(true);
      expect(stageOutputs[6].risks.length).toBeGreaterThan(0);
    });

    it('Stage 6 output satisfies Stage 7 cross-stage contract', () => {
      const template = stage07Template.default || stage07Template;
      const contract = template.crossStageContract;
      if (contract) {
        const result = validateCrossStageContract(stageOutputs[6], contract, 'stage6→7');
        expect(result.valid).toBe(true);
      }
    });

    it('Stage 7 → consumes Stage 1+4+5+6 output', async () => {
      stageOutputs[7] = await analyzeStage07({
        stage1Data: stageOutputs[1],
        stage4Data: stageOutputs[4],
        stage5Data: stageOutputs[5],
        stage6Data: stageOutputs[6],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[7]).toBeDefined();
      expect(Array.isArray(stageOutputs[7].tiers)).toBe(true);
      expect(stageOutputs[7].tiers.length).toBeGreaterThan(0);
    });

    it('Stage 7 output satisfies Stage 8 cross-stage contract', () => {
      const template = stage08Template.default || stage08Template;
      const contract = template.crossStageContract;
      if (contract) {
        const result = validateCrossStageContract(stageOutputs[7], contract, 'stage7→8');
        expect(result.valid).toBe(true);
      }
    });

    it('Stage 8 → consumes Stage 1+4+5+6+7 output', async () => {
      stageOutputs[8] = await analyzeStage08({
        stage1Data: stageOutputs[1],
        stage4Data: stageOutputs[4],
        stage5Data: stageOutputs[5],
        stage6Data: stageOutputs[6],
        stage7Data: stageOutputs[7],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[8]).toBeDefined();
      // BMC should have the 9 blocks
      expect(stageOutputs[8].customerSegments || stageOutputs[8].customer_segments).toBeDefined();
    });

    it('Stage 8 output satisfies Stage 9 cross-stage contract', () => {
      const template = stage09Template.default || stage09Template;
      const contract = template.crossStageContract;
      if (contract) {
        const result = validateCrossStageContract(stageOutputs[8], contract, 'stage8→9');
        expect(result.valid).toBe(true);
      }
    });

    it('Stage 9 → consumes Stage 1+5+6+7+8 output', async () => {
      stageOutputs[9] = await analyzeStage09({
        stage1Data: stageOutputs[1],
        stage5Data: stageOutputs[5],
        stage6Data: stageOutputs[6],
        stage7Data: stageOutputs[7],
        stage8Data: stageOutputs[8],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[9]).toBeDefined();
      expect(stageOutputs[9].exit_thesis || stageOutputs[9].exitThesis).toBeDefined();
    });
  });

  // Phase 4: THE BRAND (Stages 10-12)
  describe('Phase 4: THE BRAND', () => {
    it('Stage 10 → consumes Stage 1+3+5+8 output', async () => {
      // Reset mock and use mockResolvedValueOnce to avoid any stale state from prior 15+ calls
      const savedImpl = mockComplete.getMockImplementation();
      mockComplete.mockResolvedValueOnce(JSON.stringify(STAGE_FIXTURES[10]));

      stageOutputs[10] = await analyzeStage10({
        stage1Data: stageOutputs[1],
        stage3Data: stageOutputs[3],
        stage5Data: stageOutputs[5],
        stage8Data: stageOutputs[8],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      // Restore prompt-based implementation for subsequent stages
      if (savedImpl) mockComplete.mockImplementation(savedImpl);
      expect(stageOutputs[10]).toBeDefined();
    });

    it('Stage 11 → consumes Stage 1+5+10 output', async () => {
      stageOutputs[11] = await analyzeStage11({
        stage1Data: stageOutputs[1],
        stage5Data: stageOutputs[5],
        stage10Data: stageOutputs[10],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[11]).toBeDefined();
      expect(stageOutputs[11].tiers || stageOutputs[11].channels).toBeDefined();
    });

    it('Stage 12 → consumes Stage 1+5+7+10+11 output', async () => {
      stageOutputs[12] = await analyzeStage12({
        stage1Data: stageOutputs[1],
        stage5Data: stageOutputs[5],
        stage7Data: stageOutputs[7],
        stage10Data: stageOutputs[10],
        stage11Data: stageOutputs[11],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[12]).toBeDefined();
    });
  });

  // Phase 5: THE BLUEPRINT (Stages 13-16)
  describe('Phase 5: THE BLUEPRINT', () => {
    it('Stage 13 → consumes Stage 1+5+8+9 output', async () => {
      stageOutputs[13] = await analyzeStage13({
        stage1Data: stageOutputs[1],
        stage5Data: stageOutputs[5],
        stage8Data: stageOutputs[8],
        stage9Data: stageOutputs[9],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[13]).toBeDefined();
      expect(stageOutputs[13].milestones || stageOutputs[13].vision_statement).toBeDefined();
    });

    it('Stage 14 → consumes Stage 1+13 output', async () => {
      stageOutputs[14] = await analyzeStage14({
        stage1Data: stageOutputs[1],
        stage13Data: stageOutputs[13],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[14]).toBeDefined();
    });

    it('Stage 15 → consumes Stage 1+6+13+14 output', async () => {
      stageOutputs[15] = await analyzeStage15({
        stage1Data: stageOutputs[1],
        stage6Data: stageOutputs[6],
        stage13Data: stageOutputs[13],
        stage14Data: stageOutputs[14],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[15]).toBeDefined();
      expect(Array.isArray(stageOutputs[15].risks)).toBe(true);
    });

    it('Stage 16 → consumes Stage 1+13+14+15 output', async () => {
      stageOutputs[16] = await analyzeStage16({
        stage1Data: stageOutputs[1],
        stage13Data: stageOutputs[13],
        stage14Data: stageOutputs[14],
        stage15Data: stageOutputs[15],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[16]).toBeDefined();
    });
  });

  // Phase 6: BUILD LOOP (Stages 17-22)
  describe('Phase 6: BUILD LOOP', () => {
    it('Stage 17 → consumes Stage 13+14+15+16 output', async () => {
      stageOutputs[17] = await analyzeStage17({
        stage13Data: stageOutputs[13],
        stage14Data: stageOutputs[14],
        stage15Data: stageOutputs[15],
        stage16Data: stageOutputs[16],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[17]).toBeDefined();
    });

    it('Stage 18 → consumes Stage 17+13+14 output', async () => {
      stageOutputs[18] = await analyzeStage18({
        stage17Data: stageOutputs[17],
        stage13Data: stageOutputs[13],
        stage14Data: stageOutputs[14],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[18]).toBeDefined();
    });

    it('Stage 19 → consumes Stage 18+17 output', async () => {
      stageOutputs[19] = await analyzeStage19({
        stage18Data: stageOutputs[18],
        stage17Data: stageOutputs[17],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[19]).toBeDefined();
    });

    it('Stage 20 → consumes Stage 19+18 output', async () => {
      stageOutputs[20] = await analyzeStage20({
        stage19Data: stageOutputs[19],
        stage18Data: stageOutputs[18],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[20]).toBeDefined();
    });

    it('Stage 21 → consumes Stage 20+19 output', async () => {
      stageOutputs[21] = await analyzeStage21({
        stage20Data: stageOutputs[20],
        stage19Data: stageOutputs[19],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[21]).toBeDefined();
    });

    it('Stage 22 → consumes Stage 17+18+19+20+21 output', async () => {
      stageOutputs[22] = await analyzeStage22({
        stage17Data: stageOutputs[17],
        stage18Data: stageOutputs[18],
        stage19Data: stageOutputs[19],
        stage20Data: stageOutputs[20],
        stage21Data: stageOutputs[21],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[22]).toBeDefined();
    });
  });

  // Phase 7: LAUNCH & LEARN (Stages 23-25)
  describe('Phase 7: LAUNCH & LEARN', () => {
    it('Stage 23 → consumes Stage 22+1 output', async () => {
      stageOutputs[23] = await analyzeStage23({
        stage22Data: stageOutputs[22],
        stage01Data: stageOutputs[1],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[23]).toBeDefined();
    });

    it('Stage 24 → consumes Stage 23+5 output', async () => {
      stageOutputs[24] = await analyzeStage24({
        stage23Data: stageOutputs[23],
        stage05Data: stageOutputs[5],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[24]).toBeDefined();
    });

    it('Stage 25 → consumes Stage 24+23+1+5+16+13 output', async () => {
      stageOutputs[25] = await analyzeStage25({
        stage24Data: stageOutputs[24],
        stage23Data: stageOutputs[23],
        stage01Data: stageOutputs[1],
        stage05Data: stageOutputs[5],
        stage16Data: stageOutputs[16],
        stage13Data: stageOutputs[13],
        ventureName: VENTURE_NAME,
        logger: silentLogger,
      });

      expect(stageOutputs[25]).toBeDefined();
    });

    it('all 25 stages produced output', () => {
      for (let i = 1; i <= 25; i++) {
        expect(stageOutputs[i]).toBeDefined();
      }
    });
  });
});
