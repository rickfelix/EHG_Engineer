/**
 * Explicit column allow-list for writes into creative_assets from caller-supplied data.
 *
 * SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-D. SECURITY review db9a6d11-acd9-4ee3-8f33-
 * 99bbe50f1816 (SEC-1): the mass-assignment fix (explicit allow-list instead of
 * `.insert({ ...asset, ... })`) previously only landed in the Deno Edge Function
 * (supabase/functions/variant-scoring-bridge/index.ts) -- the sibling Node-side
 * lib/creative/variant-scoring-bridge.js#bridgeWriteVariant() still spread the caller's
 * `asset` object directly into an insert. Extracted here so there is ONE representation of
 * "which fields a caller may set on a creative_assets write", imported by both.
 *
 * DELIBERATELY DEPENDENCY-FREE (zero imports): this module is imported from BOTH the Node-side
 * lib/creative/variant-scoring-bridge.js AND the Deno-runtime
 * supabase/functions/variant-scoring-bridge/index.ts Edge Function. Do not add any import here
 * -- Deno's bundler cannot resolve bare Node built-in specifiers (see
 * lib/creative/venture-company-access.js's docblock for the concrete example that broke this
 * before: a bare `import crypto from 'crypto'` without a `node:` prefix).
 *
 * venture_id/campaign_id are intentionally NOT in this list -- callers never control those;
 * both bridgeWriteVariant() (Node) and the Edge Function's 'write' action always set them from
 * server-resolved/validated values, never from the caller's asset object.
 */
export const ASSET_WRITE_ALLOWED_FIELDS = ['id', 'capability', 'generator', 'prompt', 'provenance', 'cost'];

/**
 * @param {Record<string, unknown> | null | undefined} asset
 * @returns {Record<string, unknown>}
 */
export function pickAllowedAssetFields(asset) {
  const picked = {};
  if (!asset || typeof asset !== 'object') return picked;
  for (const field of ASSET_WRITE_ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(asset, field)) {
      picked[field] = asset[field];
    }
  }
  return picked;
}
