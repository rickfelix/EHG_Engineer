// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-D (FR-1) — generateAsset() primitive tests.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { generateAsset } from './generate-asset.js';
import { generateWithGemini, isGeminiConfigured } from './providers/gemini.js';
import { generateWithRunway, isRunwayConfigured } from './providers/runway.js';
import { TaskFailedError, ProviderNotConfiguredError } from './errors.js';

const ORIGINAL_ENV = { ...process.env };

describe('generateAsset() provider-abstraction primitive', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('routes image requests to Gemini fallback when Runway is unconfigured (test-mode, no live call)', async () => {
    delete process.env.RUNWAY_API_KEY;
    delete process.env.RUNWAYML_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key';

    const result = await generateAsset('image', { prompt: 'a hero image' });
    expect(result.provenance.generator).toBe('gemini');
    expect(result.provenance.testMode).toBe(true); // safe default — no live API call fired
    expect(result.cost).toBe(0);
  });

  it('throws ProviderNotConfiguredError for video when Runway is unconfigured (no fallback for video)', async () => {
    delete process.env.RUNWAY_API_KEY;
    delete process.env.RUNWAYML_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key'; // present but irrelevant — video has no Gemini route

    await expect(generateAsset('video', { prompt: 'a demo video' })).rejects.toThrow(ProviderNotConfiguredError);
  });

  it('throws ProviderNotConfiguredError when no provider for the capability is configured at all', async () => {
    delete process.env.RUNWAY_API_KEY;
    delete process.env.RUNWAYML_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;

    await expect(generateAsset('image', { prompt: 'x' })).rejects.toThrow(ProviderNotConfiguredError);
  });

  it('throws TaskFailedError (never a silent empty asset) on unknown capability', async () => {
    await expect(generateAsset('audio', { prompt: 'x' })).rejects.toThrow(TaskFailedError);
  });

  it('never fabricates a success result on a typed provider failure — propagates the error', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.RUNWAY_API_KEY;
    delete process.env.RUNWAYML_API_KEY;

    // Force Gemini out of test-mode via a direct call to confirm the live-path error contract
    // (generateAsset() itself always test-mode-defaults; this exercises the adapter directly).
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(
      generateWithGemini({ capability: 'image', spec: { prompt: 'x' } }, { fetchImpl, testMode: false })
    ).rejects.toThrow(TaskFailedError);
  });
});

describe('gemini adapter', () => {
  afterEach(() => { process.env = { ...ORIGINAL_ENV }; vi.restoreAllMocks(); });

  it('rejects video (image-lane fallback only, no Gemini video path)', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    await expect(generateWithGemini({ capability: 'video', spec: { prompt: 'x' } })).rejects.toThrow(TaskFailedError);
  });

  it('reports configured based on GEMINI_API_KEY or GOOGLE_AI_API_KEY', () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    expect(isGeminiConfigured()).toBe(false);
    process.env.GOOGLE_AI_API_KEY = 'x';
    expect(isGeminiConfigured()).toBe(true);
  });
});

describe('runway adapter (not yet configured — honest, not fabricated)', () => {
  afterEach(() => { process.env = { ...ORIGINAL_ENV }; });

  it('reports unconfigured with no credential present', () => {
    delete process.env.RUNWAY_API_KEY;
    delete process.env.RUNWAYML_API_KEY;
    expect(isRunwayConfigured()).toBe(false);
  });

  it('throws ProviderNotConfiguredError rather than a fabricated success', async () => {
    delete process.env.RUNWAY_API_KEY;
    delete process.env.RUNWAYML_API_KEY;
    await expect(generateWithRunway({ capability: 'image' })).rejects.toThrow(ProviderNotConfiguredError);
  });
});
