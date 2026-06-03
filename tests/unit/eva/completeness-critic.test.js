/**
 * Unit tests for the Verify layer — completeness critic.
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 3 (FR-006)
 */
import { describe, it, expect } from 'vitest';
import { findUncoveredCapabilities, assessCompleteness, defaultMatcher } from '../../../lib/eva/bridge/completeness-critic.js';

// A DataDistill-like tree where the ENGINE is present but PII masking + run history are NOT —
// exactly the under-scoping the critic must catch.
const SDS = [
  { title: 'Landing copy', description: 'SaaS framing for the marketing site' },
  { title: 'Authentication', description: 'Clerk authentication: signup and session' },
  { title: 'Distillation engine worker', description: 'SCAN WALK DIST distillation engine with job enqueue' },
];
const VISION_CAPABILITIES = ['distillation engine', 'pii masking', 'run history dashboard', 'authentication'];

describe('findUncoveredCapabilities', () => {
  it('flags vision capabilities that no SD covers (engine present, masking + dashboard missing)', () => {
    const uncovered = findUncoveredCapabilities(VISION_CAPABILITIES, SDS);
    expect(uncovered).toContain('pii masking');
    expect(uncovered).toContain('run history dashboard');
    expect(uncovered).not.toContain('distillation engine'); // engine IS covered
    expect(uncovered).not.toContain('authentication');      // auth IS covered
  });

  it('returns empty when every capability is covered', () => {
    const sds = [{ title: 'all', description: 'distillation engine pii masking run history dashboard authentication' }];
    expect(findUncoveredCapabilities(VISION_CAPABILITIES, sds)).toEqual([]);
  });

  it('tolerates empty/non-array inputs', () => {
    expect(findUncoveredCapabilities([], SDS)).toEqual([]);
    expect(findUncoveredCapabilities(VISION_CAPABILITIES, [])).toEqual(VISION_CAPABILITIES);
    expect(() => findUncoveredCapabilities(null, null)).not.toThrow();
  });

  it('accepts a custom (e.g. LLM-backed) matcher', () => {
    const always = () => true;
    expect(findUncoveredCapabilities(VISION_CAPABILITIES, SDS, always)).toEqual([]);
  });
});

describe('assessCompleteness', () => {
  it('reports incomplete with the uncovered list and a coverage fraction', () => {
    const r = assessCompleteness(VISION_CAPABILITIES, SDS);
    expect(r.complete).toBe(false);
    expect(r.uncovered.length).toBe(2);
    expect(r.coverage).toBeCloseTo(0.5, 5); // 2 of 4 covered
  });

  it('is complete (coverage 1) when capability list is empty', () => {
    const r = assessCompleteness([], SDS);
    expect(r.complete).toBe(true);
    expect(r.coverage).toBe(1);
  });
});

describe('defaultMatcher', () => {
  it('requires all significant tokens of the capability to appear', () => {
    const sd = { title: 'engine', description: 'distillation engine worker' };
    expect(defaultMatcher('distillation engine', sd)).toBe(true);
    expect(defaultMatcher('pii masking', sd)).toBe(false);
  });

  it('ignores short stop-tokens so "run history" needs both real words', () => {
    expect(defaultMatcher('run history', { description: 'a run of the mill feature' })).toBe(false); // no "history"
    expect(defaultMatcher('run history', { description: 'run history dashboard' })).toBe(true);
  });
});
