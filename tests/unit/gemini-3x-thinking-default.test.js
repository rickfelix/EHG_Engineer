/**
 * QF-20260818-343: gemini-3.x thinking-config default.
 *
 * Before this fix, `if (effortLevel && isGemini3x)` meant a caller with NO effortLevel
 * fell through the whole branch with no thinkingConfig set at all -- unlike gemini-2.5,
 * which explicitly disables thinking by default on the flash tier. Gemini 3.x has no
 * thinking-OFF state (thinkingLevel min is 'low'), so an unset config leaves the
 * server-side default in effect, which measurably burned output-token budget on hidden
 * thinking before any content (observed: a 4096-token validation-role response truncated
 * with finishReason=MAX_TOKENS and near-zero visible content).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GoogleAdapter } from '../../lib/sub-agents/vetting/provider-adapters.js';

function requestBodyFrom(fetchSpy) {
  const [, init] = fetchSpy.mock.calls[0];
  return JSON.parse(init.body);
}

describe('QF-20260818-343: GoogleAdapter thinkingConfig default for gemini-3.x', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gemini-3.7-flash with NO effortLevel gets thinkingLevel=low (not unset)', async () => {
    const adapter = new GoogleAdapter({ apiKey: 'test-key', model: 'gemini-3.7-flash' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('test-stub'));
    try {
      await adapter.complete('sys', 'user prompt', {});
    } catch { /* expected -- stubbed fetch rejects */ }

    const body = requestBodyFrom(fetchSpy);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  });

  it('gemini-3.7-flash with an explicit effortLevel is unaffected (still resolves via the map)', async () => {
    const adapter = new GoogleAdapter({ apiKey: 'test-key', model: 'gemini-3.7-flash' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('test-stub'));
    try {
      await adapter.complete('sys', 'user prompt', { effortLevel: 'high' });
    } catch { /* expected */ }

    const body = requestBodyFrom(fetchSpy);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'high' });
  });

  it('gemini-3-flash-preview (ladder tier 3) also gets the low default with no effortLevel', async () => {
    const adapter = new GoogleAdapter({ apiKey: 'test-key', model: 'gemini-3-flash-preview' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('test-stub'));
    try {
      await adapter.complete('sys', 'user prompt', {});
    } catch { /* expected */ }

    const body = requestBodyFrom(fetchSpy);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  });

  it('gemini-2.5-flash behavior is unchanged (thinkingBudget:0 by default, not thinkingLevel)', async () => {
    const adapter = new GoogleAdapter({ apiKey: 'test-key', model: 'gemini-2.5-flash' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('test-stub'));
    try {
      await adapter.complete('sys', 'user prompt', {});
    } catch { /* expected */ }

    const body = requestBodyFrom(fetchSpy);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('purpose=content-generation still skips thinkingConfig entirely for gemini-3.x (unchanged)', async () => {
    const adapter = new GoogleAdapter({ apiKey: 'test-key', model: 'gemini-3.7-flash' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('test-stub'));
    try {
      await adapter.complete('sys', 'user prompt', { purpose: 'content-generation' });
    } catch { /* expected */ }

    const body = requestBodyFrom(fetchSpy);
    expect(body.generationConfig.thinkingConfig).toBeUndefined();
  });
});
