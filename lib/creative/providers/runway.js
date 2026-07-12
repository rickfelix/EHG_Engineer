// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-D (FR-1) — RunwayML adapter (PRIMARY, chairman
// ruling 2026-07-10: "RunwayML is PRIMARY for BOTH image and video"). Registered now so the
// routing table is complete and the provider decision never needs a call-site change later —
// but no credential exists yet (RUNWAY_API_KEY unset; the chairman's account + API-key
// walkthrough is a separate, not-yet-completed step per the design spec §2 provenance note).
//
// Deliberately NOT a fabricated/mocked client: rather than pretend to call an API this codebase
// has never integrated, this adapter throws a typed ProviderNotConfiguredError so callers (and
// the FR-1 routing layer) get an honest, distinguishable signal instead of a false success or a
// guessed request shape that would need rewriting anyway once the real credential lands.

import { ProviderNotConfiguredError } from '../errors.js';

export function isRunwayConfigured() {
  return Boolean(process.env.RUNWAY_API_KEY || process.env.RUNWAYML_API_KEY);
}

/**
 * @param {{capability: 'image'|'video', spec: object, constraints?: object}} params
 * @returns {Promise<{asset: object, provenance: object, cost: number}>}
 */
export async function generateWithRunway({ capability }) {
  if (!isRunwayConfigured()) {
    throw new ProviderNotConfiguredError('runway', capability);
  }
  // Real client implementation lands once RUNWAY_API_KEY is provisioned (chairman walkthrough).
  throw new ProviderNotConfiguredError('runway', capability);
}
