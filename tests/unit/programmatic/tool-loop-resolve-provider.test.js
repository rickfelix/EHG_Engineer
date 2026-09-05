/**
 * QF-20260903-508 — resolveProvider() regression tests.
 *
 * A silent, automatic model-backend fallback (Anthropic primary -> Google Gemini) can produce
 * output that does not honour a caller's output contract even when the primary reliably does.
 * The caller's own error used to name only the symptom ("no JSON in output"), never the backend
 * that produced it, so a provider outage read as a fault in the caller's own prompt or item.
 * resolveProvider() is exported from lib/programmatic/tool-loop.js specifically so a caller can
 * name the active backend in its own error message -- these tests pin that it reports correctly
 * across every env-var permutation resolveProvider() itself branches on.
 *
 * Deliberately in tests/unit/, not tests/programmatic/ -- the sibling
 * tests/programmatic/tool-loop.test.js is quarantined (tests/quarantine-manifest.json,
 * reason_class="assertion-drift", quarantined 2026-06-11) and excluded from the enforced
 * "Run Unit Tier (quarantine-aware)" CI gate; a test added there would never actually run in CI.
 * resolveProvider() needs no @anthropic-ai/sdk mock (it is a pure env-var reader), so it has no
 * dependency on whatever made that sibling file flaky.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveProvider } from '../../../lib/programmatic/tool-loop.js';

describe('resolveProvider', () => {
  const ENV_KEYS = ['LLM_PROVIDER', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_AI_API_KEY'];
  let saved;

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('ANTHROPIC_API_KEY present, no forced preference -> anthropic', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    expect(resolveProvider()).toBe('anthropic');
  });

  it('only GEMINI_API_KEY present (the silent-fallback case this QF is about) -> google', () => {
    process.env.GEMINI_API_KEY = 'g-test';
    expect(resolveProvider()).toBe('google');
  });

  it('only GOOGLE_AI_API_KEY present -> google', () => {
    process.env.GOOGLE_AI_API_KEY = 'g-test';
    expect(resolveProvider()).toBe('google');
  });

  it('LLM_PROVIDER=google forces google even when an Anthropic key exists', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.GEMINI_API_KEY = 'g-test';
    process.env.LLM_PROVIDER = 'google';
    expect(resolveProvider()).toBe('google');
  });

  it('LLM_PROVIDER=google with no Google key falls back to anthropic', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.LLM_PROVIDER = 'google';
    expect(resolveProvider()).toBe('anthropic');
  });

  it('no keys at all -> anthropic (will fail loud with a clear provider error, never silently mislabels)', () => {
    expect(resolveProvider()).toBe('anthropic');
  });

  it('a caller can name the backend in an error message exactly as retrospective-generator.js does', () => {
    process.env.GEMINI_API_KEY = 'g-test';
    const message = `No JSON in retrospective-generator output (backend: ${resolveProvider()}):`;
    expect(message).toContain('backend: google');
  });
});
