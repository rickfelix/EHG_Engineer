#!/usr/bin/env node
/**
 * SD-LEO-INFRA-CANONICALIZE-TRI-PARTY-001 / FR-7
 * Register the ADAM_SELF_SCORE_CADENCE feature flag in leo_feature_flags via the governed
 * registry (lib/feature-flags/registry.js createFlag — requires owner + audit, per
 * SD-LEO-INFRA-ACTIVATE-FEATURE-FLAG-001). Registered as a TEMPORARY flag with a near-term
 * expiry so the DEFERRED runtime feed (FR-4 cadence wiring + FR-5 bidirectional consume in
 * coordinator-self-review.mjs) is FORCED as a tracked, governed follow-up — not forgotten
 * (the exact anti-forget posture FR-7 dogfoods). COORD_ADAM_REVIEW_V1 already exists (registered
 * by the flag-governance SD), so only this net-new flag is created here. Idempotent.
 */

import 'dotenv/config';
import { createFlag, getFlag } from '../../lib/feature-flags/registry.js';

const FLAG_KEY = 'ADAM_SELF_SCORE_CADENCE';

(async () => {
  try {
    const existing = await getFlag(FLAG_KEY).catch(() => null);
    if (existing) {
      console.log(`Flag ${FLAG_KEY} already registered — skipping (idempotent no-op).`);
      process.exit(0);
    }
    // ~30-day expiry forces the deferred FR-4/FR-5 runtime follow-up to be revisited.
    const expiryAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await createFlag({
      flagKey: FLAG_KEY,
      displayName: 'Adam self-score cadence (turn-triggered ~10 turns)',
      description: 'Gates the runtime feed of Adam\'s turn-triggered self-assessment score (cat=adam_self_assessment) into the bidirectional tri-party review. The RUBRIC + grade->action->verify loop are canonicalized in the Adam Role Contract (leo_protocol_sections id=601); this temporary flag tracks the deferred runtime wiring (FR-4/FR-5) of coordinator-self-review.mjs. SD-LEO-INFRA-CANONICALIZE-TRI-PARTY-001.',
      isEnabled: false,
      changedBy: 'SD-LEO-INFRA-CANONICALIZE-TRI-PARTY-001',
      ownerType: 'team',
      ownerId: 'adam',
      riskTier: 'low',
      isTemporary: true,
      expiryAt,
    });
    console.log(`Registered ${FLAG_KEY} (temporary, is_enabled=false, owner=team:adam, expiry=${expiryAt}).`);
  } catch (e) {
    console.error(`Failed to register ${FLAG_KEY}:`, e.message);
    process.exit(1);
  }
})();
