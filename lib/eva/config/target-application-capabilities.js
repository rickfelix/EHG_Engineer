/**
 * Target Application Capabilities — declares which architecture layers each
 * target_application can actually host. Drives the lifecycle-sd-bridge
 * grandchild emission filter so we don't generate `api` layer SDs for
 * frontend-only deployments (Vite SPA, static sites) that have no
 * serverless runtime to fulfil them.
 *
 * Why this exists: auto-pipeline-stage-17-doc-gen mechanically decomposes
 * every "Implement *" parent into 4 architecture layers (data/api/ui/tests).
 * For target_application=ehg this produces api SDs that can never ship —
 * vercel.json rewrites /api/* to /index.html, and vite.config.ts has no
 * serverless plugin. The class-fix is to pre-filter layers by capability
 * at emit time.
 *
 * Sibling pattern: lib/eva/config/venture-default-capabilities.js.
 *
 * Default behaviour: targets not listed here are assumed capable across
 * all layers (preserves existing emission for unrecognised ventures).
 * Add an explicit entry to opt out of a layer.
 *
 * @module lib/eva/config/target-application-capabilities
 */

export const TARGET_CAPABILITIES_VERSION = '2026.05';

const RAW_CAPABILITIES = {
  // EHG customer-facing app — Vite SPA on Vercel, no serverless runtime
  ehg: {
    has_serverless_api: false,
    notes: 'Vite SPA; vercel.json rewrites all non-asset paths to /index.html. No serverless plugin in vite.config.ts.',
  },
  // EHG_Engineer — Node service + Supabase Edge Functions; full backend
  ehg_engineer: {
    has_serverless_api: true,
    notes: 'Node service with API routes and supabase/functions/*; backed serverless API supported.',
  },
};

const FROZEN_DEFAULTS = Object.freeze({
  has_serverless_api: true,
  notes: 'Default — unknown target assumed capable to preserve existing emission.',
});

export const TARGET_APPLICATION_CAPABILITIES = Object.freeze(
  Object.fromEntries(
    Object.entries(RAW_CAPABILITIES).map(([k, v]) => [k, Object.freeze(v)]),
  ),
);

/**
 * Lookup capabilities for a target_application. Match is case-insensitive
 * and treats `EHG_Engineer`, `ehg_engineer`, `EHG Engineer` as equivalent.
 *
 * @param {string|null|undefined} targetApplication
 * @returns {{has_serverless_api: boolean, notes: string}}
 */
export function getTargetApplicationCapabilities(targetApplication) {
  if (!targetApplication) return FROZEN_DEFAULTS;
  const key = String(targetApplication).toLowerCase().replace(/[\s-]+/g, '_');
  return TARGET_APPLICATION_CAPABILITIES[key] || FROZEN_DEFAULTS;
}
