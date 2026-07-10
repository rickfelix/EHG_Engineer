/**
 * QF-20260710-125 (Solomon 41a2e6da H1): strategic-fit must NOT be a constant.
 *
 * The defect: callers omitted strategicContext, so computeStrategicFit returned a
 * constant 50 and the strategic_fit ranking weight bought nothing. These pins assert
 * (1) differing contexts produce differing fit — non-constant across contexts,
 * (2) ranking output actually moves with the context under a fit-weighted posture,
 * (3) the ranking-pipeline caller now threads strategicContext through (grep-reach).
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve as resolvePath } from 'path';
import { computeStrategicFit } from '../../../../lib/eva/stage-zero/utils/strategic-fit.js';
import { rankCandidates } from '../../../../lib/eva/stage-zero/paths/discovery-mode.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(__dir, '../../../..');

const FIT_ONLY_WEIGHTS = {
  automation_feasibility: 0.0,
  monthly_revenue_potential: 0.0,
  target_market_specificity: 0.0,
  strategic_fit: 1.0,
  competition_level: 0.0,
};

const candidate = {
  name: 'FinBot',
  prompt_version: '2026-07-10-v3',
  problem_statement: 'Automated bookkeeping for fintech startups',
  solution: 'Fintech automation agents for B2B SaaS accounting',
  target_market: 'B2B SaaS fintech startups',
  automation_feasibility: 7,
  competition_level: 'medium',
};

const FINTECH_CTX = { themes: ['fintech automation', 'B2B SaaS'] };
const GAMING_CTX = { themes: ['casual mobile gaming', 'consumer entertainment'] };

describe('QF-20260710-125: strategic fit is non-constant across contexts', () => {
  test('computeStrategicFit differs between matching and non-matching contexts', () => {
    const fitMatch = computeStrategicFit(candidate, FINTECH_CTX);
    const fitMiss = computeStrategicFit(candidate, GAMING_CTX);
    expect(fitMatch).not.toBe(fitMiss);
    expect(fitMatch).toBeGreaterThan(fitMiss);
  });

  test('null context is the neutral 50 (the old constant) — context genuinely adds signal', () => {
    expect(computeStrategicFit(candidate, null)).toBe(50);
    expect(computeStrategicFit(candidate, FINTECH_CTX)).not.toBe(50);
  });

  test('ranking output moves with the context under a fit-weighted posture', () => {
    const withMatch = rankCandidates([candidate], { weights: FIT_ONLY_WEIGHTS, strategicContext: FINTECH_CTX });
    const withMiss = rankCandidates([candidate], { weights: FIT_ONLY_WEIGHTS, strategicContext: GAMING_CTX });
    expect(withMatch[0].composite_score).not.toBe(withMiss[0].composite_score);
    expect(withMatch[0].composite_score).toBeGreaterThan(withMiss[0].composite_score);
  });

  test('reach: ranking-pipeline threads strategicContext into executeDiscoveryMode', () => {
    const src = readFileSync(resolvePath(repoRoot, 'lib/eva/stage-zero/ranking-pipeline.js'), 'utf8');
    expect(src).toMatch(/loadStrategicContext/);
    expect(src).toMatch(/strategicContext[\s\S]{0,200}executeDiscoveryMode|executeDiscoveryMode[\s\S]{0,300}strategicContext/);
  });
});
