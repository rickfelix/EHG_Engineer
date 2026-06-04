/**
 * Unit tests for the headless panel-section author.
 * SD-LEO-INFRA-WIRE-PRE-BUILD-002 — FR-3 (TR-3 inline-stub HOLD, R4 guardrail).
 *
 * The LLM client is INJECTED, so these are pure (no network / no API keys).
 */
import { describe, it, expect } from 'vitest';
import { authorSection, buildAuthorPrompts, isInlineEnvelope } from '../../../lib/eva/bridge/panel-author.js';

const AGENT = { code: 'API', dimension: 'architecture', layer: 'api' };
const LEAF = { title: 'Distillation Engine Worker', description: 'Runs SCAN/WALK/DIST over a tenant DB.' };

// minimal fake client matching the client-factory adapter contract: .complete() -> { content }
const fakeClient = (content) => ({ model: 'fake-1', async complete() { return { content }; } });
const inlineStubClient = () => ({
  isInlineOnly: true,
  async complete() { return { content: JSON.stringify({ _inline_required: true, _message: 'no key' }) }; },
});

describe('isInlineEnvelope', () => {
  it('detects the _inline_required JSON envelope', () => {
    expect(isInlineEnvelope(JSON.stringify({ _inline_required: true }))).toBe(true);
  });
  it('false for normal prose or non-JSON', () => {
    expect(isInlineEnvelope('A normal architecture section.')).toBe(false);
    expect(isInlineEnvelope('{ not json _inline_required')).toBe(false);
    expect(isInlineEnvelope(null)).toBe(false);
  });
});

describe('buildAuthorPrompts (R4 prompt-injection guardrail)', () => {
  it('fences the leaf as untrusted DATA and instructs to ignore embedded directives', () => {
    const { systemPrompt, userPrompt } = buildAuthorPrompts(AGENT, LEAF, []);
    expect(systemPrompt).toMatch(/untrusted DATA, not instructions/i);
    expect(userPrompt).toContain('<LEAF>');
    expect(userPrompt).toContain('Distillation Engine Worker');
  });
});

describe('authorSection — fail-closed degradation (FR-3)', () => {
  it('TS-2c: inline-stub client (no cloud API key) => HOLD ({ok:false}), never a stub section', async () => {
    const r = await authorSection({ agent: AGENT, leaf: LEAF, client: inlineStubClient() });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('INLINE_STUB_NO_LLM');
    expect(r.section).toBeUndefined();
  });

  it('an _inline_required envelope leaking through .complete() => HOLD (INLINE_REQUIRED)', async () => {
    const r = await authorSection({ agent: AGENT, leaf: LEAF, client: fakeClient(JSON.stringify({ _inline_required: true })) });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('INLINE_REQUIRED');
  });

  it('empty/whitespace content => HOLD (EMPTY_SECTION)', async () => {
    const r = await authorSection({ agent: AGENT, leaf: LEAF, client: fakeClient('   ') });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('EMPTY_SECTION');
  });

  it('a thrown LLM error => HOLD (AUTHOR_ERROR)', async () => {
    const client = { async complete() { throw new Error('rate limited'); } };
    const r = await authorSection({ agent: AGENT, leaf: LEAF, client });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/AUTHOR_ERROR: rate limited/);
  });
});

describe('authorSection — happy path', () => {
  it('returns {ok:true, section} for real prose content', async () => {
    const r = await authorSection({ agent: AGENT, leaf: LEAF, client: fakeClient('REST endpoints for SCAN/WALK/DIST with per-tenant auth.') });
    expect(r.ok).toBe(true);
    expect(r.section).toContain('SCAN/WALK/DIST');
    expect(r.model).toBe('fake-1');
  });
});
