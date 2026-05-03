/**
 * SD-LEO-FIX-GOOGLEADAPTER-TIMEOUT-DOESN-001
 *
 * Covers:
 *  - resolveTimeout decision matrix (FR-1, all 7 priority branches)
 *  - Per-call debug log emission + LLM_TIMEOUT_DEBUG_LOG suppression (FR-2)
 *  - Adapter-side wiring of resolveTimeout (FR-1 integration, FR-4 retry-preservation)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveTimeout,
  PROVIDER_TIMEOUT_LONG_MS,
  PROVIDER_TIMEOUT_MS,
  AnthropicAdapter,
  OpenAIAdapter,
  GoogleAdapter
} from '../../lib/sub-agents/vetting/provider-adapters.js';

describe('resolveTimeout — decision matrix (FR-1)', () => {
  it('TS-1: explicit options.timeout wins', () => {
    expect(resolveTimeout('gemini-2.5-pro', { timeout: 45000 })).toEqual({ value: 45000, reason: 'explicit' });
  });

  it('TS-1b: invalid options.timeout (0/NaN/negative/non-number) falls through to next branch (preserves pre-helper safety net)', () => {
    // 0 was previously masked by `options.timeout || PROVIDER_TIMEOUT_MS`; preserve fall-through.
    expect(resolveTimeout('gemini-2.5-flash', { timeout: 0 }).reason).toBe('default');
    expect(resolveTimeout('gemini-2.5-flash', { timeout: NaN }).reason).toBe('default');
    expect(resolveTimeout('gemini-2.5-flash', { timeout: -1 }).reason).toBe('default');
    expect(resolveTimeout('gemini-2.5-flash', { timeout: '30000' }).reason).toBe('default');
    // And invalid timeout still allows downstream signals (e.g. purpose) to fire LONG.
    expect(resolveTimeout('gemini-2.5-flash', { timeout: 0, purpose: 'content-generation' }).reason).toBe('purpose');
  });

  it('TS-2: purpose=content-generation triggers LONG', () => {
    expect(resolveTimeout('gemini-2.5-flash', { purpose: 'content-generation' }))
      .toEqual({ value: PROVIDER_TIMEOUT_LONG_MS, reason: 'purpose' });
  });

  it('TS-3: thinkingBudget>0 triggers LONG', () => {
    expect(resolveTimeout('any-model', { thinkingBudget: 2048 }))
      .toEqual({ value: PROVIDER_TIMEOUT_LONG_MS, reason: 'thinking' });
  });

  it('TS-3b: thinkingBudget=0 does NOT trigger LONG (must be >0)', () => {
    expect(resolveTimeout('claude-sonnet', { thinkingBudget: 0 }))
      .toEqual({ value: PROVIDER_TIMEOUT_MS, reason: 'default' });
  });

  it('effortLevel=high triggers LONG', () => {
    expect(resolveTimeout('any-model', { effortLevel: 'high' }))
      .toEqual({ value: PROVIDER_TIMEOUT_LONG_MS, reason: 'effort' });
  });

  it('effortLevel=low|medium does NOT trigger LONG', () => {
    expect(resolveTimeout('any-model', { effortLevel: 'low' }).reason).toBe('default');
    expect(resolveTimeout('any-model', { effortLevel: 'medium' }).reason).toBe('default');
  });

  it('TS-4: stream=true triggers LONG', () => {
    expect(resolveTimeout('any-model', { stream: true }))
      .toEqual({ value: PROVIDER_TIMEOUT_LONG_MS, reason: 'stream' });
  });

  it('TS-5: model id matches /pro/ → LONG', () => {
    expect(resolveTimeout('gemini-2.5-pro', {}))
      .toEqual({ value: PROVIDER_TIMEOUT_LONG_MS, reason: 'model-tier' });
  });

  it('TS-5b: model id matches /opus/ → LONG', () => {
    expect(resolveTimeout('claude-opus-4-7', {}).reason).toBe('model-tier');
  });

  it('TS-5c: model id matches /o1/ or /o3/ → LONG', () => {
    expect(resolveTimeout('o3-mini', {}).reason).toBe('model-tier');
    expect(resolveTimeout('o1-preview', {}).reason).toBe('model-tier');
  });

  it('TS-5d: model regex does NOT match flash/mini/haiku/sonnet/promo (false-positive guards)', () => {
    expect(resolveTimeout('gemini-2.5-flash', {}).reason).toBe('default');
    expect(resolveTimeout('gpt-4o-mini', {}).reason).toBe('default');
    expect(resolveTimeout('claude-haiku-4-5', {}).reason).toBe('default');
    expect(resolveTimeout('claude-sonnet-4-6', {}).reason).toBe('default');
    expect(resolveTimeout('promo-model-2026', {}).reason).toBe('default');
  });

  it('TS-6: default short timeout for fast utility models with no signals', () => {
    expect(resolveTimeout('gemini-2.5-flash', {}))
      .toEqual({ value: PROVIDER_TIMEOUT_MS, reason: 'default' });
  });

  it('TS-7: PRECEDENCE — explicit options.timeout overrides all other LONG signals', () => {
    expect(resolveTimeout('gemini-2.5-pro', {
      timeout: 10000,
      purpose: 'content-generation',
      thinkingBudget: 4096,
      effortLevel: 'high',
      stream: true
    })).toEqual({ value: 10000, reason: 'explicit' });
  });

  it('null model is safe', () => {
    expect(resolveTimeout(null, {}).reason).toBe('default');
  });

  it('undefined options is safe', () => {
    expect(resolveTimeout('gemini-2.5-flash')).toEqual({ value: PROVIDER_TIMEOUT_MS, reason: 'default' });
  });
});

describe('per-call debug log (FR-2)', () => {
  let debugSpy;
  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    delete process.env.LLM_TIMEOUT_DEBUG_LOG;
  });
  afterEach(() => {
    debugSpy.mockRestore();
    delete process.env.LLM_TIMEOUT_DEBUG_LOG;
  });

  it('GoogleAdapter logs a resolvedTimeoutMs line on first attempt', async () => {
    const adapter = new GoogleAdapter({ apiKey: 'test-key', model: 'gemini-2.5-pro' });
    // Stub fetch so we don't actually call Gemini. Make it reject quickly.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('test-stub'));
    try {
      await adapter.complete('sys', 'user', { purpose: 'content-generation' });
    } catch { /* expected */ }
    fetchSpy.mockRestore();

    const matched = debugSpy.mock.calls.find(([msg]) =>
      typeof msg === 'string' && msg.startsWith('[GoogleAdapter]') && msg.includes('reason=purpose')
    );
    expect(matched, 'expected GoogleAdapter debug log with reason=purpose').toBeTruthy();
    expect(matched[0]).toContain(`resolvedTimeoutMs=${PROVIDER_TIMEOUT_LONG_MS}`);
  }, 30000);

  it('LLM_TIMEOUT_DEBUG_LOG=off suppresses the debug log', async () => {
    process.env.LLM_TIMEOUT_DEBUG_LOG = 'off';
    const adapter = new GoogleAdapter({ apiKey: 'test-key', model: 'gemini-2.5-pro' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('test-stub'));
    try {
      await adapter.complete('sys', 'user', { purpose: 'content-generation' });
    } catch { /* expected */ }
    fetchSpy.mockRestore();

    const matched = debugSpy.mock.calls.find(([msg]) =>
      typeof msg === 'string' && msg.startsWith('[GoogleAdapter]')
    );
    expect(matched).toBeFalsy();
  }, 30000);

  it('OpenAIAdapter emits its own labelled debug log line', async () => {
    const adapter = new OpenAIAdapter({ apiKey: 'test-key', model: 'gpt-4o-mini' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('test-stub'));
    try {
      await adapter.complete('sys', 'user', { purpose: 'content-generation' });
    } catch { /* expected */ }
    fetchSpy.mockRestore();

    const matched = debugSpy.mock.calls.find(([msg]) =>
      typeof msg === 'string' && msg.startsWith('[OpenAIAdapter]')
    );
    expect(matched).toBeTruthy();
    expect(matched[0]).toContain(`resolvedTimeoutMs=${PROVIDER_TIMEOUT_LONG_MS}`);
    expect(matched[0]).toContain('reason=purpose');
  }, 30000);
});

describe('AnthropicAdapter wires resolveTimeout (FR-1 integration, FR-4 retry preserved)', () => {
  let messagesCreateSpy;
  let debugSpy;
  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    if (messagesCreateSpy) messagesCreateSpy.mockRestore();
    debugSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('emits AnthropicAdapter debug log with reason=thinking when thinkingBudget>0', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test-key', model: 'claude-opus-4-7' });
    // Make messages.create reject so we don't actually call Anthropic.
    messagesCreateSpy = vi.spyOn(adapter.client.messages, 'create').mockRejectedValue(new Error('test-stub'));
    try {
      await adapter.complete('sys', 'user', { thinkingBudget: 4096 });
    } catch { /* expected */ }

    const matched = debugSpy.mock.calls.find(([msg]) =>
      typeof msg === 'string' && msg.startsWith('[AnthropicAdapter]') && msg.includes('reason=thinking')
    );
    expect(matched).toBeTruthy();
    expect(matched[0]).toContain(`resolvedTimeoutMs=${PROVIDER_TIMEOUT_LONG_MS}`);
  }, 30000);

  it('FR-4: retry strategy preserved — 3 attempts on persistent stub failure', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test-key', model: 'claude-opus-4-7' });
    messagesCreateSpy = vi.spyOn(adapter.client.messages, 'create').mockRejectedValue(new Error('stub-stuck'));
    await expect(
      adapter.complete('sys', 'user', { timeout: 50 })
    ).rejects.toThrow(/Anthropic call failed after 3 attempts/);
    expect(messagesCreateSpy).toHaveBeenCalledTimes(3);
  }, 30000);
});
