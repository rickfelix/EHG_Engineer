/**
 * SD-LEO-INFRA-UPSTREAM-OPERATING-MODEL-PROPAGATION-001 (FR-2) — give the S2 ops-realist persona the
 * operating-model context so its resource-feasibility score (-> S3 executionFeasibility) is AI-native
 * (AI-agent labor, not a hired team), instead of penalizing ventures for a team they never need.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const h = vi.hoisted(() => ({ capturedPrompts: [] }));
vi.mock('../../../lib/llm/index.js', () => ({
  getLLMClient: () => ({
    complete: async (_sys, userPrompt) => {
      h.capturedPrompts.push(userPrompt);
      return { content: JSON.stringify({ score: 75, confidence: 'high', summary: 's', strengths: ['a'], concerns: ['b'], reasoning: 'r' }) };
    },
  }),
}));

import { analyzeStage02 } from '../../../lib/eva/stage-templates/analysis-steps/stage-02-multi-persona.js';

const silent = { log: () => {}, warn: () => {}, error: () => {} };
const stage1 = { description: 'AI-native analytics SaaS', targetMarket: 'SMBs', problemStatement: 'manual reporting' };

describe('FR-2 ops-realist persona operating-model grounding', () => {
  it('source: only the ops-realist persona gets the operating-model context block', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '../../../lib/eva/stage-templates/analysis-steps/stage-02-multi-persona.js'), 'utf8');
    expect(src).toMatch(/persona\.id === 'ops-realist'[\s\S]*getOperatingModelPromptBlock\(\)/);
    expect(src).toMatch(/AI agents|not a hired human team/i);
  });

  it('the ops-realist persona prompt carries the AI-native resource framing (not other personas)', async () => {
    h.capturedPrompts = [];
    await analyzeStage02({ stage1Data: stage1, ventureName: 'V1', logger: silent });
    const opsPrompts = h.capturedPrompts.filter((p) => /OPERATING MODEL|AI agents.*NOT a hired/i.test(p));
    expect(opsPrompts.length).toBe(1); // exactly the ops-realist persona, not all 7
    // a non-ops persona prompt should NOT carry the operating-model resource framing
    const nonOps = h.capturedPrompts.filter((p) => /Operations Realist/.test(p) === false && /OPERATING MODEL/i.test(p));
    expect(nonOps.length).toBe(0);
  });

  it('the artifact flags the ops-realist grounding', async () => {
    const r = await analyzeStage02({ stage1Data: stage1, ventureName: 'V1', logger: silent });
    expect(r.ops_realist_operating_model_grounded).toBe(true);
  });
});
