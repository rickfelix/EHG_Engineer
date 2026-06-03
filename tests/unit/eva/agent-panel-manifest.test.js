/**
 * Unit tests for the agent-panel manifest + DAG ordering.
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 1 (FR-003 / FR-004)
 */
import { describe, it, expect } from 'vitest';
import {
  PANEL_AGENTS,
  LAYER_DEPENDENCIES,
  resolveVentureCriteria,
  selectAgentManifest,
  orderPanelDAG,
  buildOrderedManifest,
} from '../../../lib/eva/bridge/agent-panel-manifest.js';

const codes = (agents) => agents.map((a) => a.code);
const idx = (agents, code) => agents.findIndex((a) => a.code === code);

describe('resolveVentureCriteria', () => {
  it('defaults sparse input to safe-inclusive criteria', () => {
    const c = resolveVentureCriteria({});
    expect(c.touchesData).toBe(true);
    expect(c.hasUI).toBe(true);
    expect(c.dataSensitive).toBe(false);
    expect(c.archetype).toBe('crud');
  });
});

describe('selectAgentManifest (FR-003 dynamic selection)', () => {
  it('always includes architecture (API), venture-stack compliance, and acceptance (STORIES)', () => {
    const m = selectAgentManifest({ touchesData: false, hasUI: false, dataSensitive: false });
    expect(codes(m)).toEqual(expect.arrayContaining(['API', 'VENTURE_STACK', 'STORIES']));
  });

  it('a data-sensitive algorithm-core SaaS pulls in DATABASE, SECURITY, and the algorithm specialist', () => {
    const m = selectAgentManifest({ dataSensitive: true, touchesData: true, archetype: 'algorithm-core' });
    expect(codes(m)).toEqual(expect.arrayContaining(['DATABASE', 'SECURITY', 'PERFORMANCE']));
  });

  it('a non-data, non-sensitive content site excludes DATABASE/SECURITY/algorithm but keeps DESIGN', () => {
    const m = selectAgentManifest({ touchesData: false, dataSensitive: false, archetype: 'content', hasUI: true });
    const c = codes(m);
    expect(c).not.toContain('DATABASE');
    expect(c).not.toContain('SECURITY');
    expect(c).not.toContain('PERFORMANCE');
    expect(c).toContain('DESIGN');
  });

  it('opt-in dimensions (monetization, growth) only appear when relevant', () => {
    const base = codes(selectAgentManifest({}));
    expect(base).not.toContain('PRICING');
    expect(base).not.toContain('MARKETING');
    const withGrowth = codes(selectAgentManifest({ monetizationRelevant: true, growthRelevant: true }));
    expect(withGrowth).toEqual(expect.arrayContaining(['PRICING', 'MARKETING']));
  });
});

describe('orderPanelDAG (FR-004 panel internal DAG)', () => {
  it('orders architecture -> schema -> ui -> tests', () => {
    const ordered = buildOrderedManifest({ dataSensitive: true, touchesData: true, hasUI: true, archetype: 'algorithm-core' });
    expect(idx(ordered, 'API')).toBeLessThan(idx(ordered, 'DATABASE'));   // architecture before schema
    expect(idx(ordered, 'DATABASE')).toBeLessThan(idx(ordered, 'DESIGN')); // schema before ui
    expect(idx(ordered, 'DESIGN')).toBeLessThan(idx(ordered, 'STORIES'));  // ui before tests
    expect(idx(ordered, 'API')).toBe(0);                                   // architecture runs first
    expect(idx(ordered, 'STORIES')).toBe(ordered.length - 1);             // acceptance runs last
  });

  it('places cross-cutting agents (VENTURE_STACK, SECURITY) after architecture but before tests', () => {
    const ordered = buildOrderedManifest({ dataSensitive: true, touchesData: true });
    expect(idx(ordered, 'API')).toBeLessThan(idx(ordered, 'VENTURE_STACK'));
    expect(idx(ordered, 'VENTURE_STACK')).toBeLessThan(idx(ordered, 'STORIES'));
    expect(idx(ordered, 'SECURITY')).toBeLessThan(idx(ordered, 'STORIES'));
  });

  it('throws UNKNOWN_LAYER for an agent with a layer absent from the dependency graph', () => {
    expect(() => orderPanelDAG([{ dimension: 'x', code: 'X', layer: 'bogus' }]))
      .toThrowError(/UNKNOWN_LAYER/);
  });

  it('throws CYCLE when the injected layer graph is cyclic', () => {
    const cyclic = { a: ['b'], b: ['a'] };
    expect(() => orderPanelDAG([{ dimension: 'p', code: 'P', layer: 'a' }, { dimension: 'q', code: 'Q', layer: 'b' }], cyclic))
      .toThrowError(/CYCLE/);
  });

  it('is stable and total — every selected agent appears exactly once', () => {
    const selected = selectAgentManifest({ dataSensitive: true, touchesData: true, hasUI: true, archetype: 'algorithm-core', monetizationRelevant: true, growthRelevant: true });
    const ordered = orderPanelDAG(selected);
    expect(ordered).toHaveLength(selected.length);
    expect(new Set(codes(ordered)).size).toBe(selected.length);
  });
});

describe('catalog integrity', () => {
  it('every panel agent declares a layer present in LAYER_DEPENDENCIES', () => {
    for (const a of PANEL_AGENTS) {
      expect(LAYER_DEPENDENCIES[a.layer], `layer ${a.layer} for ${a.dimension}`).toBeDefined();
    }
  });
});
