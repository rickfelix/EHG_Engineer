/**
 * SD-LEO-INFRA-REPO-GROUNDED-INTELLIGENT-001 — repo-grounded intelligent decomposition (bridge side).
 *
 * Proves that selectApplicableLayers honors the S19 planner's per-item architectureLayer signal
 * (FR-2), right-sizes to one layer per item (FR-3), is gated by the REPO_GROUNDED_DECOMPOSITION
 * feature flag (FR-5), and that the S19→S20 _advanceStage invariant is untouched (count stays 7).
 *
 * Flag handling is HERMETIC: each test sets/clears REPO_GROUNDED_DECOMPOSITION explicitly and
 * afterEach restores the original value, so the suite is green whether the flag is ambiently set or
 * unset (lesson from SD-LEO-INFRA-PATH-SCOPED-BLOCKING-001: a gate's seed suite must pass with the
 * flag both SET and UNSET).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { _internal } from '../../../lib/eva/lifecycle-sd-bridge.js';

const {
  selectApplicableLayers,
  PLANNER_TO_BRIDGE_LAYER,
  isRepoGroundedDecompositionEnabled,
  ARCHITECTURE_LAYERS,
} = _internal;

const FLAG = 'REPO_GROUNDED_DECOMPOSITION';
const ALL_LAYERS = ARCHITECTURE_LAYERS.length; // 4

describe('SD-LEO-INFRA-REPO-GROUNDED-INTELLIGENT-001 — repo-grounded decomposition (bridge)', () => {
  let saved;
  beforeEach(() => { saved = process.env[FLAG]; });
  afterEach(() => {
    if (saved === undefined) delete process.env[FLAG];
    else process.env[FLAG] = saved;
  });

  describe('FR-5 feature flag', () => {
    it('defaults ON when the flag is unset', () => {
      delete process.env[FLAG];
      expect(isRepoGroundedDecompositionEnabled()).toBe(true);
    });
    it('is OFF for false/0/off/no (case-insensitive)', () => {
      for (const v of ['false', '0', 'off', 'no', 'FALSE', 'Off']) {
        process.env[FLAG] = v;
        expect(isRepoGroundedDecompositionEnabled(), `value=${v}`).toBe(false);
      }
    });
    it('is ON for any other truthy value', () => {
      process.env[FLAG] = 'true';
      expect(isRepoGroundedDecompositionEnabled()).toBe(true);
    });
  });

  describe('FR-2 taxonomy translation', () => {
    it('maps every planner taxonomy value to a real bridge layer key', () => {
      const bridgeKeys = new Set(ARCHITECTURE_LAYERS.map(l => l.key));
      for (const planner of ['frontend', 'backend', 'database', 'infrastructure', 'integration', 'security']) {
        const mapped = PLANNER_TO_BRIDGE_LAYER[planner];
        expect(bridgeKeys.has(mapped), `${planner}→${mapped}`).toBe(true);
      }
    });
    it('maps frontend→ui and database→data exactly', () => {
      expect(PLANNER_TO_BRIDGE_LAYER.frontend).toBe('ui');
      expect(PLANNER_TO_BRIDGE_LAYER.database).toBe('data');
    });
  });

  describe('FR-2 / FR-3 right-sizing (flag ON)', () => {
    beforeEach(() => { process.env[FLAG] = 'true'; });

    it('TS-1: a frontend item resolves to exactly the ui layer (not all four)', () => {
      const layers = selectApplicableLayers({ title: 'Landing Hero', architectureLayer: 'frontend' });
      expect(layers).toHaveLength(1);
      expect(layers[0].key).toBe('ui');
    });

    it('TS-2: a frontend-only item never produces a data- or api-layer SD', () => {
      const keys = selectApplicableLayers({ architectureLayer: 'frontend' }).map(l => l.key);
      expect(keys).not.toContain('data');
      expect(keys).not.toContain('api');
    });

    it('backend→api and database→data right-size to one layer each', () => {
      expect(selectApplicableLayers({ architectureLayer: 'backend' }).map(l => l.key)).toEqual(['api']);
      expect(selectApplicableLayers({ architectureLayer: 'database' }).map(l => l.key)).toEqual(['data']);
    });

    it('TS-4: the all-four multiplier is retired for a signalled item (1, not 4)', () => {
      expect(selectApplicableLayers({ architectureLayer: 'frontend' })).toHaveLength(1);
    });

    it('a genuinely large item marked decomposition_strategy=layered still gets all four layers', () => {
      const layers = selectApplicableLayers({ architectureLayer: 'frontend', decomposition_strategy: 'layered' });
      expect(layers).toHaveLength(ALL_LAYERS);
    });

    it('an item with no signal falls back to all four layers', () => {
      expect(selectApplicableLayers({})).toHaveLength(ALL_LAYERS);
    });

    it('the explicit plural architecture_layers hint is still honored', () => {
      expect(selectApplicableLayers({ architecture_layers: ['data', 'api'] }).map(l => l.key)).toEqual(['data', 'api']);
    });
  });

  describe('FR-5 legacy kill-switch (flag OFF)', () => {
    beforeEach(() => { process.env[FLAG] = 'false'; });

    it('TS-7: a signalled item reverts to legacy all-four behavior', () => {
      expect(selectApplicableLayers({ architectureLayer: 'frontend' })).toHaveLength(ALL_LAYERS);
    });

    it('the plural hint and empty fallback are byte-identical to legacy', () => {
      expect(selectApplicableLayers({ architecture_layers: ['ui'] }).map(l => l.key)).toEqual(['ui']);
      expect(selectApplicableLayers({})).toHaveLength(ALL_LAYERS);
    });
  });

  describe('Safety invariant — S19→S20 advance path untouched', () => {
    it('TS-5: this._advanceStage call-count in stage-execution-worker.js stays exactly 7', () => {
      const here = dirname(fileURLToPath(import.meta.url));
      const workerPath = resolve(here, '../../../lib/eva/stage-execution-worker.js');
      const src = readFileSync(workerPath, 'utf8');
      // Strip block + line comments so a commented reference can never inflate the count.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      const calls = (code.match(/this\._advanceStage\s*\(/g) || []).length;
      expect(calls).toBe(7);
    });
  });
});
