// SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-E — regression coverage for the model-config SSOT migration.
// GEMINI_IMAGE_MODEL is resolved at module-load time, so each scenario needs a fresh dynamic
// import after setting env vars (vi.resetModules()) rather than mutating process.env post-import.
import { describe, it, expect, afterEach, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

async function freshImport() {
  vi.resetModules();
  return import('./gemini.js');
}

describe('lib/creative/providers/gemini.js model resolution (SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-E)', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('resolves to the ratified default gemini-2.5-flash-image when no env override is set', async () => {
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_MODEL_CREATIVE_IMAGE_GENERATION;
    process.env.GEMINI_API_KEY = 'test-key';

    const { generateWithGemini } = await freshImport();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ mock: true }) });
    const result = await generateWithGemini(
      { capability: 'image', spec: { prompt: 'a hero image' } },
      { fetchImpl, testMode: false }
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/gemini-2.5-flash-image:generateContent'),
      expect.anything()
    );
    expect(result.provenance.model).toBe('gemini-2.5-flash-image');
  });

  it('documents the existing getGoogleModel precedence: the generic GEMINI_MODEL env var shadows the purpose default when no purpose-specific override is set', async () => {
    // This is pre-existing getGoogleModel() behavior (shared by every purpose key, including the
    // already-shipped 'image-generation' key) -- not introduced by this migration. Asserted here so
    // a future reader does not assume the hardcoded default always wins for this new purpose key.
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    delete process.env.GEMINI_MODEL_CREATIVE_IMAGE_GENERATION;
    process.env.GEMINI_API_KEY = 'test-key';

    const { generateWithGemini } = await freshImport();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ mock: true }) });
    const result = await generateWithGemini(
      { capability: 'image', spec: { prompt: 'a hero image' } },
      { fetchImpl, testMode: false }
    );

    expect(result.provenance.model).toBe('gemini-2.5-flash');
  });

  it('a purpose-specific GEMINI_MODEL_CREATIVE_IMAGE_GENERATION override wins over the generic GEMINI_MODEL', async () => {
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    process.env.GEMINI_MODEL_CREATIVE_IMAGE_GENERATION = 'gemini-test-override';
    process.env.GEMINI_API_KEY = 'test-key';

    const { generateWithGemini } = await freshImport();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ mock: true }) });
    const result = await generateWithGemini(
      { capability: 'image', spec: { prompt: 'a hero image' } },
      { fetchImpl, testMode: false }
    );

    expect(result.provenance.model).toBe('gemini-test-override');
  });
});
