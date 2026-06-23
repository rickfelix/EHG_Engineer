/**
 * Unit tests for the LLM brainstorm distiller.
 * SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001-C (FR-3).
 *
 * Fake client + fake supabase — no live LLM/DB.
 */
import { describe, it, expect } from 'vitest';
import {
  buildDistillPrompt,
  parseDistillResponse,
  coercePayload,
  keywordDistill,
  distillItem,
  toQueueCandidate,
  DISTILL_CONFIG,
} from '../../../lib/integrations/distill-brainstorm.js';

const ITEM = {
  wave_item_id: 'wave-1',
  title: 'Few-shot example libraries for EVA decision gates',
  description: 'Curate good/bad examples per decision point to improve EVA judgment consistency.',
  chairman_intent: 'idea',
  target_application: 'ehg_engineer',
  target_aspects: ['eva', 'decision-quality'],
  refine_composite_score: 78,
};

function fakeClient(jsonOrObj, { asContent = false, throws = false, inlineOnly = false } = {}) {
  return {
    isInlineOnly: inlineOnly,
    async complete() {
      if (throws) throw new Error('boom');
      const text = typeof jsonOrObj === 'string' ? jsonOrObj : JSON.stringify(jsonOrObj);
      return asContent ? { content: text } : text;
    },
  };
}

const GOOD_PAYLOAD = {
  title: 'Add few-shot example libraries for EVA decision gates',
  description: 'Curate exemplar good/bad decisions per gate.',
  scope: 'Build example libraries for each EVA/LEO gate; exclude runtime tuning.',
  rationale: 'Improves decision consistency.',
  sd_type: 'infrastructure',
  confidence_tier: 'high',
};

describe('buildDistillPrompt', () => {
  it('includes the enriched fields and the JSON contract', () => {
    const p = buildDistillPrompt(ITEM);
    expect(p).toContain('Few-shot example libraries');
    expect(p).toContain('chairman_intent: idea');
    expect(p).toContain('sd_type');
  });
});

describe('coercePayload / parseDistillResponse', () => {
  it('coerces a valid object and clamps unknown sd_type/tier to defaults', () => {
    const out = coercePayload({ ...GOOD_PAYLOAD, sd_type: 'nonsense', confidence_tier: 'weird' });
    expect(out.sd_type).toBe('feature');
    expect(out.confidence_tier).toBe('medium');
    expect(DISTILL_CONFIG.SD_TYPES).toContain(out.sd_type);
  });
  it('returns null when title is missing', () => {
    expect(coercePayload({ description: 'x' })).toBeNull();
  });
  it('parses a fenced ```json block', () => {
    const out = parseDistillResponse('```json\n' + JSON.stringify(GOOD_PAYLOAD) + '\n```');
    expect(out.title).toBe(GOOD_PAYLOAD.title);
  });
  it('returns null on unparseable text', () => {
    expect(parseDistillResponse('not json at all')).toBeNull();
  });
  it('accepts a {content} response shape', () => {
    const out = parseDistillResponse({ content: JSON.stringify(GOOD_PAYLOAD) });
    expect(out.sd_type).toBe('infrastructure');
  });
});

describe('keywordDistill (deterministic fallback)', () => {
  it('produces a valid payload from intent/aspects with tier from score', () => {
    const out = keywordDistill(ITEM);
    expect(out.title.length).toBeGreaterThan(0);
    expect(out.sd_type).toBe('feature'); // no infra keyword present (eva/decision aren't infra; 'engineer' != 'engine')
    expect(out.confidence_tier).toBe('high'); // score 78 >= 70
  });
  it('classifies infra keywords as infrastructure', () => {
    const out = keywordDistill({ ...ITEM, description: 'build a sourcing pipeline gate', target_aspects: [] });
    expect(out.sd_type).toBe('infrastructure');
  });
  it('defaults tier to low when no score', () => {
    const out = keywordDistill({ ...ITEM, refine_composite_score: null });
    expect(out.confidence_tier).toBe('low');
  });
});

describe('distillItem', () => {
  it('uses the AI path when the client returns valid JSON', async () => {
    const { payload, method } = await distillItem(ITEM, { client: fakeClient(GOOD_PAYLOAD) });
    expect(method).toBe('ai');
    expect(payload.title).toBe(GOOD_PAYLOAD.title);
  });
  it('handles a {content} response', async () => {
    const { payload, method } = await distillItem(ITEM, { client: fakeClient(GOOD_PAYLOAD, { asContent: true }) });
    expect(method).toBe('ai');
    expect(payload.confidence_tier).toBe('high');
  });
  it('falls back to keyword when the client throws', async () => {
    const { method } = await distillItem(ITEM, { client: fakeClient(null, { throws: true }) });
    expect(method).toBe('keyword');
  });
  it('falls back to keyword for an inline-only stub', async () => {
    const { method } = await distillItem(ITEM, { client: fakeClient(GOOD_PAYLOAD, { inlineOnly: true }) });
    expect(method).toBe('keyword');
  });
  it('falls back to keyword on unparseable AI output', async () => {
    const { method } = await distillItem(ITEM, { client: fakeClient('garbage') });
    expect(method).toBe('keyword');
  });
});

describe('toQueueCandidate', () => {
  it('maps a payload + source id into the enqueue contract', () => {
    const c = toQueueCandidate(GOOD_PAYLOAD, 'wave-1', 78);
    expect(c.sourceWaveItemId).toBe('wave-1');
    expect(c.distilledPayload).toEqual(GOOD_PAYLOAD);
    expect(c.title).toBe(GOOD_PAYLOAD.title);
    expect(c.confidenceTier).toBe('high');
    expect(c.priorityScore).toBe(78);
  });
  it('omits priorityScore when no score', () => {
    const c = toQueueCandidate(GOOD_PAYLOAD, 'wave-1', null);
    expect('priorityScore' in c).toBe(false);
  });
});
