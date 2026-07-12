// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-D (FR-1) — Gemini image-generation adapter.
// gemini-2.5-flash-image via raw fetch is the ratified image path (design spec §2). Registered
// as the live FALLBACK behind generateAsset() — RunwayML is primary once configured, per the
// chairman's ruling (2026-07-10) — never a hardcoded call site elsewhere in the codebase.
//
// Same env convention as lib/llm/client-factory.js (GEMINI_API_KEY || GOOGLE_AI_API_KEY) and the
// same generativelanguage.googleapis.com host, so this adapter is not a new integration pattern.

import { TaskFailedError, ProviderNotConfiguredError } from '../errors.js';

const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';
const GEMINI_HOST = 'https://generativelanguage.googleapis.com/v1beta/models';

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY);
}

/**
 * @param {{capability: 'image'|'video', spec: {prompt: string}, constraints?: object}} params
 * @param {{fetchImpl?: typeof fetch, testMode?: boolean}} [deps]
 * @returns {Promise<{asset: object, provenance: object, cost: number}>}
 */
export async function generateWithGemini({ capability, spec, constraints = {} }, deps = {}) {
  if (capability !== 'image') {
    // Gemini is the image-lane fallback only; video has no Gemini fallback (Runway-only, envelope-flagged).
    throw new TaskFailedError(`Gemini adapter does not support capability "${capability}"`, {
      provider: 'gemini', capability, code: 'CAPABILITY_UNSUPPORTED',
    });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new ProviderNotConfiguredError('gemini', capability);
  }

  const fetchImpl = deps.fetchImpl || fetch;
  const testMode = deps.testMode ?? true; // fail-safe default: never fires a live call unless explicitly disabled

  if (testMode) {
    // Watermarked/sandboxed synthetic output (design spec §2) — the simulated run and APA
    // fixtures never consume production quota silently.
    return {
      asset: { kind: 'watermarked-stub', capability: 'image', prompt: spec.prompt },
      provenance: { generator: 'gemini', model: GEMINI_IMAGE_MODEL, testMode: true, prompt: spec.prompt },
      cost: 0,
    };
  }

  let response;
  try {
    response = await fetchImpl(
      `${GEMINI_HOST}/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: spec.prompt }] }],
          generationConfig: constraints.generationConfig || {},
        }),
      }
    );
  } catch (cause) {
    throw new TaskFailedError('Gemini image generation request failed', {
      provider: 'gemini', capability, code: 'NETWORK_ERROR', cause,
    });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new TaskFailedError(`Gemini image generation failed (${response.status})`, {
      provider: 'gemini', capability, code: `HTTP_${response.status}`, cause: body,
    });
  }

  const data = await response.json();
  return {
    asset: { kind: 'generated', capability: 'image', raw: data },
    provenance: { generator: 'gemini', model: GEMINI_IMAGE_MODEL, testMode: false, prompt: spec.prompt },
    cost: constraints.estimatedCost ?? null, // Gemini image pricing not yet wired to the spend-envelope model
  };
}
