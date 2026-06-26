/**
 * SD-LEO-INFRA-LLM-PURPOSE-THREADING-TRUNCATION-001 — _wrapAdapter purpose threading + MAX_TOKENS
 * cache guard, and parseJSON truncation-aware fail-loud.
 *
 * ROOT CAUSE: _wrapAdapter dropped the client's `purpose`, so the per-purpose content-generation
 * ceiling (16384) collapsed to the 4096 default → MAX_TOKENS truncation → unparseable JSON, and the
 * misleading "Failed to parse ... as JSON" sent the diagnosis down a JSON-robustness path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { _wrapAdapter } from '../../../lib/llm/client-factory.js';
import responseCache from '../../../lib/llm/response-cache.js';
import { parseJSON } from '../../../lib/eva/utils/parse-json.js';

function fakeAdapter(result = { content: '{}', finishReason: 'STOP' }) {
  const calls = [];
  return {
    model: 'fake-model',
    calls,
    complete: async (_sys, _user, opts = {}) => { calls.push(opts); return result; },
  };
}

describe('FR-1 _wrapAdapter forwards purpose into the adapter call', () => {
  it('forwards purpose: a REAL client purpose reaches originalComplete (so the 16384 ceiling applies)', async () => {
    const a = fakeAdapter();
    const wrapped = _wrapAdapter(a, { purpose: 'content-generation', cacheTTLMs: 0 });
    await wrapped.complete('sys-fr1-a', 'user-fr1-a', {});
    expect(a.calls[0].purpose).toBe('content-generation');
  });

  it('forwards purpose: an explicit per-call callOptions.purpose WINS over the client purpose', async () => {
    const a = fakeAdapter();
    const wrapped = _wrapAdapter(a, { purpose: 'content-generation', cacheTTLMs: 0 });
    await wrapped.complete('sys-fr1-b', 'user-fr1-b', { purpose: 'fast' });
    expect(a.calls[0].purpose).toBe('fast');
  });

  it('forwards purpose: a subAgent-only / unknown client purpose is NOT threaded (callOptions passed through)', async () => {
    const a = fakeAdapter();
    const wrapped = _wrapAdapter(a, { subAgent: 'SECURITY', cacheTTLMs: 0 }); // no real purpose
    await wrapped.complete('sys-fr1-c', 'user-fr1-c', {});
    expect(a.calls[0].purpose).toBeUndefined();
  });
});

describe('FR-2 a MAX_TOKENS (truncated) response is never cached or replayed', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('truncated result is NOT written to the cache', async () => {
    const setSpy = vi.spyOn(responseCache, 'set').mockImplementation(() => {});
    vi.spyOn(responseCache, 'get').mockReturnValue(undefined);
    const a = fakeAdapter({ content: '{"partial":', finishReason: 'MAX_TOKENS' });
    const wrapped = _wrapAdapter(a, { purpose: 'content-generation' });
    await wrapped.complete('sys-fr2-a', 'user-fr2-a', {});
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('a non-truncated result IS cached (no regression)', async () => {
    const setSpy = vi.spyOn(responseCache, 'set').mockImplementation(() => {});
    vi.spyOn(responseCache, 'get').mockReturnValue(undefined);
    const a = fakeAdapter({ content: '{}', finishReason: 'STOP' });
    const wrapped = _wrapAdapter(a, { purpose: 'content-generation' });
    await wrapped.complete('sys-fr2-b', 'user-fr2-b', {});
    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it('a cached MAX_TOKENS entry is NOT replayed — the adapter is re-called', async () => {
    vi.spyOn(responseCache, 'get').mockReturnValue({ content: '{"old":', finishReason: 'MAX_TOKENS' });
    vi.spyOn(responseCache, 'set').mockImplementation(() => {});
    const a = fakeAdapter({ content: '{"fresh":true}', finishReason: 'STOP' });
    const wrapped = _wrapAdapter(a, { purpose: 'content-generation' });
    const result = await wrapped.complete('sys-fr2-c', 'user-fr2-c', {});
    expect(a.calls.length).toBe(1); // re-called, not replayed
    expect(result.finishReason).toBe('STOP');
  });
});

describe('FR-3 parseJSON truncation fail-loud + docstring de-drift', () => {
  it('fail-loud: a MAX_TOKENS response surfaces the actionable truncation message', () => {
    expect(() => parseJSON({ content: '{"partial":', finishReason: 'MAX_TOKENS' }, { strict: true }))
      .toThrow(/truncated at token ceiling/i);
  });

  it('fail-loud: genuinely malformed (non-truncated) JSON still throws the generic parse-failure message', () => {
    expect(() => parseJSON({ content: 'not json at all', finishReason: 'STOP' }, { strict: true }))
      .toThrow(/Failed to parse LLM response as JSON/);
  });

  it('the source no longer advertises a non-existent JSON5 Layer 3 (docstring de-drift)', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, resolve } = await import('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '../../../lib/eva/utils/parse-json.js'), 'utf8');
    expect(src).not.toMatch(/JSON5 relaxed parse/);
  });
});
