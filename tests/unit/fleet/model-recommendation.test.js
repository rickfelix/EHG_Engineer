/**
 * lib/fleet/model-recommendation.cjs — SD-LEO-INFRA-OPERATIONALIZE-FABLE-USE-001 (FR-1).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { recommendModelTier, R1_KEYWORDS, R2_KEYWORDS, R3_KEYWORDS, R4_KEYWORDS, R5_KEYWORDS } = require('../../../lib/fleet/model-recommendation.cjs');

describe('recommendModelTier — default Sonnet, escalate only on a positive R-match', () => {
  it('TS-1: a detailing-shaped item with no R1-R5 match recommends sonnet', () => {
    const r = recommendModelTier({ title: 'Draft the schema for the already-decided field', description: 'Fill in the columns per the design doc' });
    expect(r).toEqual({ tier: 'sonnet', criterion: null, reason: expect.any(String) });
  });

  it('empty/missing input never yields fable (opposite bias from door-classifier)', () => {
    expect(recommendModelTier({})).toEqual({ tier: 'sonnet', criterion: null, reason: expect.any(String) });
    expect(recommendModelTier()).toEqual({ tier: 'sonnet', criterion: null, reason: expect.any(String) });
  });

  it('TS-2: an architecture/decomposition keyword (R1) recommends fable', () => {
    const r = recommendModelTier({ description: 'Decomposition of the big SD tree requires an architecture decision' });
    expect(r.tier).toBe('fable');
    expect(r.criterion).toBe('R1');
  });

  it('a negative-space keyword (R2) recommends fable', () => {
    const r = recommendModelTier({ description: 'Run a pre-mortem on the next two waves before they ship' });
    expect(r.tier).toBe('fable');
    expect(r.criterion).toBe('R2');
  });

  it('a taste keyword (R3) recommends fable', () => {
    const r = recommendModelTier({ description: 'Needs UI/UX judgment on the venture selection flow' });
    expect(r.tier).toBe('fable');
    expect(r.criterion).toBe('R3');
  });

  it('an explicit >=3 subsystem coupling statement (R4) recommends fable', () => {
    const r = recommendModelTier({ description: 'This decision touches >=3 subsystems and the failure mode is an interaction' });
    expect(r.tier).toBe('fable');
    expect(r.criterion).toBe('R4');
  });

  it('a reversal-stakes keyword (R5) recommends fable', () => {
    const r = recommendModelTier({ description: 'We may need to reverse the prior conclusion given new evidence' });
    expect(r.tier).toBe('fable');
    expect(r.criterion).toBe('R5');
  });

  it('TS-3: metadata.door_class.door === "one_way" recommends fable via R5 even with zero other keyword matches', () => {
    const r = recommendModelTier({ title: 'Fix a typo', description: 'Nothing special here', metadata: { door_class: { door: 'one_way', reasons: ['migration_file'] } } });
    expect(r).toEqual({ tier: 'fable', criterion: 'R5', reason: expect.any(String) });
  });

  it('a two_way door_class does not trigger the R5 shortcut on its own', () => {
    const r = recommendModelTier({ description: 'Plain content edit', metadata: { door_class: { door: 'two_way' } } });
    expect(r).toEqual({ tier: 'sonnet', criterion: null, reason: expect.any(String) });
  });

  it('purity: identical input always returns identical output, called twice', () => {
    const item = { description: 'architecture decision needed' };
    expect(recommendModelTier(item)).toEqual(recommendModelTier(item));
  });

  it('key_changes objects contribute their string values to the scored text (R1 via key_changes)', () => {
    const r = recommendModelTier({ key_changes: [{ change: 'Author the architecture doctrine', impact: 'high' }] });
    expect(r.tier).toBe('fable');
    expect(r.criterion).toBe('R1');
  });

  it('exports the keyword lists for introspection/testing', () => {
    expect(Array.isArray(R1_KEYWORDS)).toBe(true);
    expect(Array.isArray(R2_KEYWORDS)).toBe(true);
    expect(Array.isArray(R3_KEYWORDS)).toBe(true);
    expect(Array.isArray(R4_KEYWORDS)).toBe(true);
    expect(Array.isArray(R5_KEYWORDS)).toBe(true);
  });
});
