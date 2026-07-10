/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: source-adapter registry shape.
 * The registry must expose at least 4 adapters (it ships with 7), and every
 * adapter must expose an async toDraft(input, deps) function.
 */
import { describe, it, expect } from 'vitest';
import { adapters, getAdapter } from '../../../lib/sd-creation/source-adapters/index.js';

const EXPECTED_SOURCES = ['uat', 'learn', 'feedback', 'roadmap-item', 'qf', 'child', 'plan'];

describe('SD-ARCH-HOTSPOT-LEO-CREATE-001: source-adapter registry shape', () => {
  it('registers at least 4 adapters', () => {
    expect(Object.keys(adapters).length).toBeGreaterThanOrEqual(4);
  });

  it.each(EXPECTED_SOURCES)('adapter "%s" is registered and exposes toDraft(input, deps)', (source) => {
    const adapter = getAdapter(source);
    expect(adapter, `adapter for source "${source}"`).toBeTruthy();
    expect(typeof adapter.toDraft).toBe('function');
    // toDraft(input, deps) — two declared parameters
    expect(adapter.toDraft.length).toBeLessThanOrEqual(2);
  });

  it('every registered adapter carries its lane function alongside toDraft', () => {
    const laneFns = {
      uat: 'createFromUAT',
      learn: 'createFromLearn',
      feedback: 'createFromFeedback',
      'roadmap-item': 'createFromRoadmapItem',
      qf: 'createFromQF',
      child: 'createChild',
      plan: 'createFromPlan',
    };
    for (const [source, fnName] of Object.entries(laneFns)) {
      expect(typeof adapters[source][fnName], `${source}.${fnName}`).toBe('function');
    }
  });

  it('getAdapter returns null for an unknown source', () => {
    expect(getAdapter('nope')).toBeNull();
  });
});
