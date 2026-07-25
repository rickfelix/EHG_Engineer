/**
 * QF-20260724-245 — normalizeModel() did an exact-key lookup against MODEL_STRENGTH, whose
 * keys are bare FAMILY names (haiku|sonnet|opus|fable). Workers self-report their REAL model
 * id at checkin ('claude-opus-5', 'claude-opus-5[1m]', 'claude-opus-4-8'), every one of which
 * missed the map and fell into the unknown branch -> STRONGEST_MODEL='fable'. Genuine Opus
 * seats therefore scored 14 (fable-tier) instead of 10 (opus-tier). deriveLiveLadder
 * dense-ranks on capabilityScore, so an all-Opus fleet could dense-rank as if it were fable
 * seats — material under the 50% weekly Fable cap policy and fable_window_active gating.
 *
 * The conservative-UP fallback for genuinely unknown models is DELIBERATE and must survive:
 * these tests pin both halves — real ids resolve to their family, unknown/empty still go UP.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  normalizeModel,
  capabilityScore,
  MODEL_STRENGTH,
} = require('../../lib/fleet/tier-ladder.cjs');

describe('normalizeModel — resolves a full model ID to its family', () => {
  it('maps the live specimen claude-opus-5[1m] to opus, not fable', () => {
    // The exact value observed on worker 074ec1e1 when this was reported.
    expect(normalizeModel('claude-opus-5[1m]')).toBe('opus');
  });

  it.each([
    ['claude-opus-5', 'opus'],
    ['claude-opus-4-8', 'opus'],
    ['claude-sonnet-5', 'sonnet'],
    ['claude-haiku-4-5-20251001', 'haiku'],
    ['claude-fable-5', 'fable'],
    ['us.anthropic.claude-opus-5-v1:0', 'opus'],
  ])('maps %s -> %s', (id, family) => {
    expect(normalizeModel(id)).toBe(family);
  });

  it('is case- and whitespace-insensitive on full ids', () => {
    expect(normalizeModel('  CLAUDE-Opus-5[1M]  ')).toBe('opus');
  });

  it('still accepts the bare family names unchanged (no regression)', () => {
    for (const family of Object.keys(MODEL_STRENGTH)) {
      expect(normalizeModel(family)).toBe(family);
    }
  });
});

describe('normalizeModel — conservative-UP is preserved for genuinely unknown input', () => {
  it.each([
    ['gemini-3-5-pro'],
    ['gpt-6'],
    ['some-model-nobody-has-heard-of'],
  ])('maps unrecognized %s UP to the strongest model', (id) => {
    expect(normalizeModel(id)).toBe('fable');
  });

  it.each([[''], ['   '], [undefined], [null], [42], [{}]])(
    'maps missing/non-string %s UP to the strongest model',
    (bad) => {
      expect(normalizeModel(bad)).toBe('fable');
    },
  );

  it('takes the STRONGEST family when an id somehow names more than one', () => {
    // Never resolve DOWN on an ambiguous id — same direction as the unknown fallback.
    expect(normalizeModel('claude-opus-and-fable-hybrid')).toBe('fable');
    expect(normalizeModel('haiku-sonnet-blend')).toBe('sonnet');
  });
});

describe('capabilityScore — the actual regression this fixes', () => {
  it('scores a full opus id identically to the bare family, not as fable', () => {
    expect(capabilityScore('claude-opus-5[1m]', 'high')).toBe(capabilityScore('opus', 'high'));
    expect(capabilityScore('claude-opus-5[1m]', 'high')).not.toBe(capabilityScore('fable', 'high'));
  });
});
