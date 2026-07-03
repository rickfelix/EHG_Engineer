/**
 * SD-LEO-INFRA-LLM-FACTORY-TIER-LADDER-001 — 4-tier Gemini ladder
 * (getGeminiLadderModel, getLadderClient, callWithLadderEscalation).
 *
 * GoogleAdapter is mocked at the module boundary so these tests never hit a
 * live API: getAdapterForModel() (internal to client-factory.js) resolves any
 * gemini-* model string to the mocked class, so getLadderClient/complete()
 * calls stay fully offline and deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const completeMock = vi.fn();

vi.mock('../../lib/sub-agents/vetting/provider-adapters.js', async (importOriginal) => {
  const actual = await importOriginal();
  class FakeGoogleAdapter {
    constructor(options = {}) {
      this.model = options.model || 'fake-default-model';
      this.provider = 'google';
      this.family = 'google';
    }
    async complete(systemPrompt, userPrompt, options = {}) {
      return completeMock(this.model, systemPrompt, userPrompt, options);
    }
  }
  return { ...actual, GoogleAdapter: FakeGoogleAdapter };
});

const { getGeminiLadderModel, GEMINI_LADDER_DEFAULTS, getGoogleModel } = await import('../../lib/config/model-config.js');
const { getLadderClient, callWithLadderEscalation } = await import('../../lib/llm/client-factory.js');

describe('TS-1/TS-3 getGeminiLadderModel default resolution + invalid tier', () => {
  it('resolves the documented default for each tier 1-4', () => {
    expect(getGeminiLadderModel(1)).toBe(GEMINI_LADDER_DEFAULTS[1]);
    expect(getGeminiLadderModel(2)).toBe(GEMINI_LADDER_DEFAULTS[2]);
    expect(getGeminiLadderModel(3)).toBe(GEMINI_LADDER_DEFAULTS[3]);
    expect(getGeminiLadderModel(4)).toBe(GEMINI_LADDER_DEFAULTS[4]);
  });

  it('throws on an invalid tier', () => {
    expect(() => getGeminiLadderModel(5)).toThrow(/Invalid ladder tier/);
    expect(() => getGeminiLadderModel(0)).toThrow(/Invalid ladder tier/);
  });
});

describe('TS-2 per-tier env var override', () => {
  const ENV_VAR = 'GEMINI_MODEL_TIER2';
  let original;

  beforeEach(() => { original = process.env[ENV_VAR]; });
  afterEach(() => {
    if (original === undefined) delete process.env[ENV_VAR];
    else process.env[ENV_VAR] = original;
  });

  it('an env var override wins over the hardcoded default', () => {
    process.env[ENV_VAR] = 'gemini-custom-tier2-override';
    expect(getGeminiLadderModel(2)).toBe('gemini-custom-tier2-override');
  });

  it('an unset env var falls through to the default (no throw)', () => {
    delete process.env[ENV_VAR];
    expect(getGeminiLadderModel(2)).toBe(GEMINI_LADDER_DEFAULTS[2]);
  });
});

describe('TS-4 existing purpose-based routing is unaffected (regression guard)', () => {
  it('MODEL_DEFAULTS.google purpose routing is byte-identical to pre-SD values', () => {
    expect(getGoogleModel('validation')).toBe('gemini-2.5-flash');
    expect(getGoogleModel('fast')).toBe('gemini-2.5-flash');
    expect(getGoogleModel('reasoning')).toBe('gemini-2.5-pro');
  });
});

describe('getLadderClient routing (no network — GoogleAdapter constructor only)', () => {
  it('pins the returned client to the resolved tier model', () => {
    expect(getLadderClient({ tier: 1 }).model).toBe(GEMINI_LADDER_DEFAULTS[1]);
    expect(getLadderClient({ tier: 4 }).model).toBe(GEMINI_LADDER_DEFAULTS[4]);
  });
});

describe('TS-5..TS-8 callWithLadderEscalation state machine', () => {
  beforeEach(() => { completeMock.mockReset(); });

  it('TS-5 pass-first-try: 1 attempt, no escalation', async () => {
    completeMock.mockResolvedValueOnce({ content: '{"ok":true}' });
    const validateFn = vi.fn().mockReturnValue(true);

    const outcome = await callWithLadderEscalation(2, 'sys', 'user', validateFn);

    expect(outcome).toMatchObject({ tierUsed: 2, escalated: false, attempts: 1 });
    expect(outcome.failed).toBeUndefined();
    expect(completeMock).toHaveBeenCalledTimes(1);
  });

  it('TS-6 pass-second-try: 2 attempts at the same tier, no escalation', async () => {
    completeMock
      .mockResolvedValueOnce({ content: 'malformed' })
      .mockResolvedValueOnce({ content: '{"ok":true}' });
    const validateFn = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const outcome = await callWithLadderEscalation(2, 'sys', 'user', validateFn);

    expect(outcome).toMatchObject({ tierUsed: 2, escalated: false, attempts: 2 });
    expect(completeMock).toHaveBeenCalledTimes(2);
  });

  it('TS-7 escalate-once: 2 failures at startTier then 1 success at startTier+1', async () => {
    completeMock
      .mockResolvedValueOnce({ content: 'bad-1' })
      .mockResolvedValueOnce({ content: 'bad-2' })
      .mockResolvedValueOnce({ content: '{"ok":true}' });
    const validateFn = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const outcome = await callWithLadderEscalation(2, 'sys', 'user', validateFn);

    expect(outcome).toMatchObject({ tierUsed: 3, escalated: true, attempts: 3 });
    expect(completeMock).toHaveBeenCalledTimes(3);
    // escalation call used tier 3's model, not tier 2's
    expect(completeMock.mock.calls[2][0]).toBe(GEMINI_LADDER_DEFAULTS[3]);
  });

  it('TS-8a tier-4-exhaustion: starting AT tier 4 never escalates further, returns failed:true', async () => {
    completeMock.mockResolvedValue({ content: 'always-bad' });
    const validateFn = vi.fn().mockReturnValue(false);

    const outcome = await callWithLadderEscalation(4, 'sys', 'user', validateFn);

    expect(outcome).toMatchObject({ tierUsed: 4, escalated: false, attempts: 2, failed: true });
    expect(completeMock).toHaveBeenCalledTimes(2);
  });

  it('TS-8b escalation to tier 4 that still fails returns failed:true (capped, no further escalation)', async () => {
    completeMock.mockResolvedValue({ content: 'always-bad' });
    const validateFn = vi.fn().mockReturnValue(false);

    const outcome = await callWithLadderEscalation(3, 'sys', 'user', validateFn);

    expect(outcome).toMatchObject({ tierUsed: 4, escalated: true, attempts: 3, failed: true });
    expect(completeMock).toHaveBeenCalledTimes(3);
  });

  it('same-tier retry bypasses the response cache (cacheTTLMs: 0) so a deterministic failure is not replayed', async () => {
    completeMock.mockResolvedValue({ content: 'bad' });
    const validateFn = vi.fn().mockReturnValue(false);

    await callWithLadderEscalation(1, 'sys', 'user', validateFn);

    for (const call of completeMock.mock.calls) {
      const options = call[3];
      expect(options.cacheTTLMs).toBe(0);
    }
  });

  it('caller-supplied cacheTTLMs overrides the default bypass', async () => {
    completeMock.mockResolvedValueOnce({ content: '{"ok":true}' });
    const validateFn = vi.fn().mockReturnValue(true);

    await callWithLadderEscalation(1, 'sys', 'user', validateFn, { cacheTTLMs: 60000 });

    expect(completeMock.mock.calls[0][3].cacheTTLMs).toBe(60000);
  });
});
