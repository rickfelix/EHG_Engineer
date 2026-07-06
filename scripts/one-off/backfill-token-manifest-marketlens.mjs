#!/usr/bin/env node
/**
 * One-time backfill: lock MarketLens's blueprint_token_manifest from its
 * existing identity_naming_visual artifact. MarketLens generated its visual
 * identity (Stage 11) before the extractAndLockTokens() call site existed
 * (SD-LEO-INFRA-FABLE-VENTURE-DESIGN-001 FR-1), so it never got a locked
 * manifest and needs a one-time backfill rather than a fresh Stage 17 run.
 *
 * Idempotent: ensureTokenManifestLocked() short-circuits on an existing lock,
 * so this is safe to re-run.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { ensureTokenManifestLocked, getTokenConstraints } from '../../lib/eva/stage-17/token-manifest.js';

const MARKETLENS_VENTURE_ID = 'ecbba50e-3c98-4493-9e77-1719cf6b6f00';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const before = await getTokenConstraints(MARKETLENS_VENTURE_ID, supabase);
if (before) {
  console.log('[backfill-token-manifest] MarketLens already has a locked manifest — no-op.');
  console.log(JSON.stringify(before, null, 2));
  process.exit(0);
}

const manifest = await ensureTokenManifestLocked(MARKETLENS_VENTURE_ID, supabase);
console.log('[backfill-token-manifest] Locked blueprint_token_manifest for MarketLens:');
console.log(JSON.stringify(manifest, null, 2));
