// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-D (FR-1) — the generateAsset() provider-abstraction
// primitive. ONE seam every creative-generation call site goes through (TR-2: no hardcoded
// provider call sites) — provider-per-capability routing lives HERE, in routing config, never
// inlined at callers, so the provider decision (chairman-ratified RunwayML-primary / Gemini-
// fallback, design spec §2) stays swappable without touching consumers.
//
// Image lane: RunwayML primary, Gemini fallback (registered but honest about not-yet-configured
// credentials). Video lane: RunwayML only — no Gemini fallback exists for video, so an unconfigured
// Runway credential means video genuinely cannot be driven yet. That IS the capability-envelope
// gate in effect for this primitive: a video request fails with a typed, distinguishable error
// rather than silently degrading to image or fabricating an asset (O9 / fail-toward-flattery ban).

import { generateWithRunway, isRunwayConfigured } from './providers/runway.js';
import { generateWithGemini, isGeminiConfigured } from './providers/gemini.js';
import { TaskFailedError, ProviderNotConfiguredError } from './errors.js';

// Provider-per-capability routing table (TR-2). Order = fallback priority.
const ROUTES = Object.freeze({
  image: [
    { name: 'runway', generate: generateWithRunway, isConfigured: isRunwayConfigured },
    { name: 'gemini', generate: generateWithGemini, isConfigured: isGeminiConfigured },
  ],
  video: [
    { name: 'runway', generate: generateWithRunway, isConfigured: isRunwayConfigured },
  ],
});

/**
 * @param {'image'|'video'} capability
 * @param {{prompt: string}} spec
 * @param {object} [constraints]
 * @returns {Promise<{asset: object, provenance: object, cost: number|null}>}
 * @throws {TaskFailedError} every configured provider attempt failed
 * @throws {ProviderNotConfiguredError} no provider for this capability has a usable credential
 */
export async function generateAsset(capability, spec, constraints = {}) {
  const route = ROUTES[capability];
  if (!route) {
    throw new TaskFailedError(`Unknown capability "${capability}"`, { capability, code: 'UNKNOWN_CAPABILITY' });
  }

  const attempted = [];
  let lastConfiguredFailure = null;

  for (const provider of route) {
    if (!provider.isConfigured()) continue;
    attempted.push(provider.name);
    try {
      return await provider.generate({ capability, spec, constraints }, {});
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) continue; // race with isConfigured(); try next
      lastConfiguredFailure = err;
      // typed failure, never a silent empty asset — but DO try the next provider in the fallback chain
    }
  }

  if (lastConfiguredFailure) throw lastConfiguredFailure;

  // No provider in this capability's route has a usable credential.
  throw new ProviderNotConfiguredError(route.map((p) => p.name).join('|') || 'none', capability);
}

export { ROUTES as CREATIVE_PROVIDER_ROUTES };
