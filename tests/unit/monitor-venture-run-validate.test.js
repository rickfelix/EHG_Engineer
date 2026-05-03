/**
 * SD-LEO-REFAC-REFACTOR-MONITOR-EXPECTED-001 / FR-004
 * Source-aware filter unit tests for monitor-venture-run.cjs.
 *
 * Tests the worker-vs-advisory source-prefix filter and verifies the filter
 * matches the EMPIRICAL distribution of source values in venture_artifacts
 * (verified 2026-05-03 via SELECT DISTINCT source — see PR body).
 *
 * No DB dependency — pure logic over in-memory data.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const monitor = require('../../scripts/monitor-venture-run.cjs');
const { isWorkerSourceForStage, ADVISORY_SOURCES, ADVISORY_SUFFIXES } = monitor;

describe('isWorkerSourceForStage — source-aware filter', () => {
  describe('worker sources (must match)', () => {
    it('matches stage-NN exact (zero-padded for 1-9)', () => {
      expect(isWorkerSourceForStage('stage-01', 1)).toBe(true);
      expect(isWorkerSourceForStage('stage-09', 9)).toBe(true);
    });

    it('matches stage-NN exact (unpadded for 10+)', () => {
      expect(isWorkerSourceForStage('stage-10', 10)).toBe(true);
      expect(isWorkerSourceForStage('stage-15', 15)).toBe(true);
      expect(isWorkerSourceForStage('stage-23', 23)).toBe(true);
    });

    it('matches stage-NN-<sub-variant> for sub-stage workers (e.g., S17 archetype generator)', () => {
      expect(isWorkerSourceForStage('stage-17-archetype-generator', 17)).toBe(true);
      expect(isWorkerSourceForStage('stage-17-selection-flow', 17)).toBe(true);
      expect(isWorkerSourceForStage('stage-17-design-mastering', 17)).toBe(true);
      expect(isWorkerSourceForStage('stage-17-strategy-recommender', 17)).toBe(true);
      expect(isWorkerSourceForStage('stage-17-strategy-stats', 17)).toBe(true);
    });

    it('matches both padded and unpadded forms regardless of which is used', () => {
      // If production data ever uses stage-1 instead of stage-01, the filter
      // still matches — defensive against the empirical convention shifting.
      expect(isWorkerSourceForStage('stage-1', 1)).toBe(true);
    });
  });

  describe('advisory sources (must NOT match)', () => {
    it.each([...ADVISORY_SOURCES])(
      'rejects advisory source: %s',
      (advisorySource) => {
        for (let stage = 1; stage <= 26; stage += 1) {
          expect(isWorkerSourceForStage(advisorySource, stage)).toBe(false);
        }
      }
    );

    it.each(ADVISORY_SUFFIXES)(
      'rejects sources ending in advisory suffix: %s',
      (suffix) => {
        expect(isWorkerSourceForStage(`stage-10${suffix}`, 10)).toBe(false);
        expect(isWorkerSourceForStage(`stage-15${suffix}`, 15)).toBe(false);
      }
    );

    it('null or undefined source is not a worker', () => {
      expect(isWorkerSourceForStage(null, 10)).toBe(false);
      expect(isWorkerSourceForStage(undefined, 10)).toBe(false);
      expect(isWorkerSourceForStage('', 10)).toBe(false);
    });
  });

  describe('cross-stage isolation', () => {
    it('stage-12 source does not match stage 11 worker filter', () => {
      expect(isWorkerSourceForStage('stage-12', 11)).toBe(false);
    });

    it('stage-17-archetype-generator does not match stage 16', () => {
      expect(isWorkerSourceForStage('stage-17-archetype-generator', 16)).toBe(false);
    });

    it('zero-padded stage-01 does not match stage 10', () => {
      expect(isWorkerSourceForStage('stage-01', 10)).toBe(false);
    });
  });

  describe('regression: PrivacyPatrol AI false-positive scenario', () => {
    it('S15 with worker stage-15 row + stage-15-post-hook advisory only counts the worker', () => {
      const arts = [
        { source: 'stage-15', artifact_type: 'wireframe_screens' },
        { source: 'stage-15-post-hook', artifact_type: 'blueprint_wireframes_legacy_marker' },
      ];
      const workerOnly = arts.filter((a) => isWorkerSourceForStage(a.source, 15));
      expect(workerOnly).toHaveLength(1);
      expect(workerOnly[0].source).toBe('stage-15');
    });

    it('Advisory-only stage produces empty worker set', () => {
      const arts = [
        { source: 'stage-gates', artifact_type: 'gate_decision' },
        { source: 'devils-advocate', artifact_type: 'system_devils_advocate_review' },
      ];
      const workerOnly = arts.filter((a) => isWorkerSourceForStage(a.source, 17));
      expect(workerOnly).toHaveLength(0);
    });

    it('Mixed worker + advisory keeps only worker', () => {
      const arts = [
        { source: 'stage-12', artifact_type: 'identity_brand_guidelines' },
        { source: 'stage-12', artifact_type: 'identity_gtm_sales_strategy' },
        { source: 'stage-gates', artifact_type: 'gate_decision' },
        { source: 'devils-advocate', artifact_type: 'critique_note' },
      ];
      const workerOnly = arts.filter((a) => isWorkerSourceForStage(a.source, 12));
      expect(workerOnly).toHaveLength(2);
      expect(workerOnly.map((a) => a.artifact_type).sort()).toEqual([
        'identity_brand_guidelines',
        'identity_gtm_sales_strategy',
      ]);
    });
  });
});
