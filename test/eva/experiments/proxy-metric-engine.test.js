/**
 * Proxy Metric Engine Tests
 *
 * SD-MAN-ORCH-STAGE-ZERO-COLD-001-C
 */

import { describe, test, expect } from 'vitest';
import {
  generateProxyScores,
  generateBatchProxyScores,
  SYNTHESIS_COMPONENTS,
} from '../../../lib/eva/experiments/proxy-metric-engine.js';

// ── Fixture venture UUIDs ──────────────────────────────

const VENTURE_A = '550e8400-e29b-41d4-a716-446655440000';
const VENTURE_B = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const VENTURE_C = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

// ── generateProxyScores ────────────────────────────────

describe('generateProxyScores', () => {
  test('returns exactly 14 scored components by default', () => {
    const scores = generateProxyScores(VENTURE_A);

    expect(scores).toHaveLength(14);
    expect(scores).toHaveLength(SYNTHESIS_COMPONENTS.length);
  });

  test('all scores are between 0 and 100 inclusive', () => {
    const scores = generateProxyScores(VENTURE_A);

    for (const entry of scores) {
      expect(entry.score).toBeGreaterThanOrEqual(0);
      expect(entry.score).toBeLessThanOrEqual(100);
    }
  });

  test('all scores have provenance=proxy', () => {
    const scores = generateProxyScores(VENTURE_A);

    for (const entry of scores) {
      expect(entry.provenance).toBe('proxy');
    }
  });

  test('each entry has component name', () => {
    const scores = generateProxyScores(VENTURE_A);
    const componentNames = scores.map(s => s.component);

    expect(componentNames).toEqual(SYNTHESIS_COMPONENTS);
  });

  test('is deterministic — same input produces identical output', () => {
    const run1 = generateProxyScores(VENTURE_A);
    const run2 = generateProxyScores(VENTURE_A);

    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });

  test('different ventures produce different scores', () => {
    const scoresA = generateProxyScores(VENTURE_A);
    const scoresB = generateProxyScores(VENTURE_B);

    // At least some scores should differ
    const allIdentical = scoresA.every(
      (entry, i) => entry.score === scoresB[i].score,
    );
    expect(allIdentical).toBe(false);
  });

  test('accepts custom component list', () => {
    const customComponents = ['component-alpha', 'component-beta'];
    const scores = generateProxyScores(VENTURE_A, customComponents);

    expect(scores).toHaveLength(2);
    expect(scores[0].component).toBe('component-alpha');
    expect(scores[1].component).toBe('component-beta');
  });

  test('throws when ventureId is missing', () => {
    expect(() => generateProxyScores(undefined)).toThrow('ventureId is required');
    expect(() => generateProxyScores('')).toThrow('ventureId is required');
  });
});

// ── generateBatchProxyScores ───────────────────────────

describe('generateBatchProxyScores', () => {
  test('generates scores for multiple ventures', () => {
    const batch = generateBatchProxyScores([VENTURE_A, VENTURE_B, VENTURE_C]);

    expect(batch.size).toBe(3);
    expect(batch.get(VENTURE_A)).toHaveLength(14);
    expect(batch.get(VENTURE_B)).toHaveLength(14);
    expect(batch.get(VENTURE_C)).toHaveLength(14);
  });

  test('batch results match individual calls', () => {
    const batch = generateBatchProxyScores([VENTURE_A, VENTURE_B]);
    const individualA = generateProxyScores(VENTURE_A);
    const individualB = generateProxyScores(VENTURE_B);

    expect(JSON.stringify(batch.get(VENTURE_A))).toBe(JSON.stringify(individualA));
    expect(JSON.stringify(batch.get(VENTURE_B))).toBe(JSON.stringify(individualB));
  });
});

// ── SYNTHESIS_COMPONENTS ───────────────────────────────

describe('SYNTHESIS_COMPONENTS', () => {
  test('contains 14 components', () => {
    expect(SYNTHESIS_COMPONENTS).toHaveLength(14);
  });

  test('all component names are non-empty strings', () => {
    for (const name of SYNTHESIS_COMPONENTS) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });
});
