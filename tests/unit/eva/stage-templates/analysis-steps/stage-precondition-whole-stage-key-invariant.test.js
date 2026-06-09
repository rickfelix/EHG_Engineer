/**
 * SD-FDBK-FIX-STAGE-LIKELY-SHARES-001 — Stage 22 precondition artifact-type mismatch.
 *
 * VERIFICATION OUTCOME: the hypothesised Stage 22 defect does NOT exist. The Stage 21 fix
 * (SD-LEO-FIX-FIX-STAGE-VISUAL-001) changed the Visual Assets analyzer's REQUIRED_UPSTREAM
 * from granular keys (e.g. stage11ColorData) that fetchUpstreamArtifacts never populated to
 * WHOLE-stage keys (stage11Data); the 21<->22 swap then made numeric stage 22 = Visual
 * Assets (same file, stage-21-visual-assets.js), so the fix carried forward. The sibling
 * Distribution Setup analyzer (stage-22-distribution-setup.js, numeric stage 21) was already
 * correct (whole-stage keys stage7Data/stage10Data/stage12Data; hardened by
 * SD-LEO-FIX-FIX-POST-BUILD-001's normalizeUpstreamParams).
 *
 * This test PINS the invariant so the granular-key mismatch class cannot reappear in either
 * pre-launch analyzer: every REQUIRED_UPSTREAM param_key must be a whole-stage `stage{N}Data`
 * key (the shape fetchUpstreamArtifacts returns), and its N must equal source_stage.
 */
import { describe, it, expect } from 'vitest';
import { REQUIRED_UPSTREAM as VISUAL_ASSETS_UPSTREAM } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-21-visual-assets.js';
import { REQUIRED_UPSTREAM as DISTRIBUTION_UPSTREAM } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js';

const WHOLE_STAGE_KEY = /^stage(\d+)Data$/;

const ANALYZERS = [
  { name: 'Visual Assets (numeric stage 22, stage-21-visual-assets.js)', upstream: VISUAL_ASSETS_UPSTREAM },
  { name: 'Distribution Setup (numeric stage 21, stage-22-distribution-setup.js)', upstream: DISTRIBUTION_UPSTREAM },
];

describe('pre-launch analyzers use whole-stage REQUIRED_UPSTREAM param_keys (SD-FDBK-FIX-STAGE-LIKELY-SHARES-001)', () => {
  for (const { name, upstream } of ANALYZERS) {
    describe(name, () => {
      it('declares at least one upstream requirement', () => {
        expect(Array.isArray(upstream)).toBe(true);
        expect(upstream.length).toBeGreaterThan(0);
      });

      it('every param_key is a whole-stage `stage{N}Data` key (no granular keys that fetchUpstreamArtifacts never populates)', () => {
        for (const req of upstream) {
          expect(req.param_key, `${name}: param_key "${req.param_key}" must match stage{N}Data`).toMatch(WHOLE_STAGE_KEY);
        }
      });

      it('each param_key stage number equals its source_stage (no producer/consumer drift)', () => {
        for (const req of upstream) {
          const n = Number(WHOLE_STAGE_KEY.exec(req.param_key)?.[1]);
          expect(n, `${name}: param_key "${req.param_key}" stage number must equal source_stage ${req.source_stage}`).toBe(req.source_stage);
        }
      });

      it('declares an artifact_type for every requirement', () => {
        for (const req of upstream) {
          expect(typeof req.artifact_type, `${name}: missing artifact_type`).toBe('string');
          expect(req.artifact_type.length).toBeGreaterThan(0);
        }
      });
    });
  }
});
