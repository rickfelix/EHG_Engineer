/**
 * Stakes-based DB router — decides a venture's effective database provider.
 *
 * SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-B (FR-1).
 *
 * PURE module (no I/O). Consumes child A's stack descriptor
 * (lib/venture-deploy/stack-descriptor.js) and applies the research-resolved
 * STAKES policy:
 *   - A 'replit-autoscale' deployment_target stays on replit-postgres (no-op).
 *   - Otherwise (a cloud target) every venture DEFAULTS to cheap Cloudflare D1
 *     and GRADUATES to Neon Postgres as soon as it hits ANY of the 5 graduation
 *     triggers below — OR when the descriptor explicitly requests db_provider
 *     'neon' (an upstream decision the router must honor, never downgrade).
 *
 * The 5 graduation triggers are the canonical research-resolved set (hosting
 * triangulation 2026-06-14, verify2-openai): D1 for the disposable/experimental
 * phase; graduate to Neon at the first sign of stakes. They are read from the
 * descriptor's `graduation` passthrough object (whose meaning A delegated to B).
 *
 * @module lib/venture-deploy/stakes-router
 */

import { validateStackDescriptor, deployTargetFamily } from './stack-descriptor.js';

/**
 * The 5 canonical D1→Neon graduation triggers. ANY truthy flag graduates the
 * venture from D1 to Neon. Keys are read from descriptor.graduation.<key>.
 */
export const GRADUATION_TRIGGERS = Object.freeze([
  'collects_irreplaceable_data', // 1. begins collecting irreplaceable customer or financial data
  'write_amplifying_jobs',       // 2. has background jobs capable of large write amplification
  'needs_postgres_features',     // 3. requires complex transactions or Postgres extensions
  'needs_portable_migration',    // 4. needs predictable migration to another provider
  'revenue_bearing',             // 5. is likely to become a meaningful revenue-bearing business
]);

/**
 * @typedef {Object} RouteResult
 * @property {'d1'|'neon'|'replit-postgres'} provider — the effective DB provider to provision
 * @property {string[]} triggersFired — which of the 5 graduation triggers were truthy
 * @property {string} reason — human-readable explanation of the decision
 */

/**
 * Route a venture stack descriptor to its effective DB provider.
 *
 * FAIL-LOUD: a malformed/invalid descriptor throws rather than silently
 * defaulting — a wrong DB decision is a stakes/cost/data-safety error, so the
 * caller must supply a valid descriptor.
 *
 * @param {unknown} descriptor — a venture stack descriptor (A's contract)
 * @returns {RouteResult}
 */
export function routeDbProvider(descriptor) {
  const { valid, errors } = validateStackDescriptor(descriptor);
  if (!valid) {
    throw new Error(`stakes-router: invalid stack descriptor — cannot route DB provider: ${errors.join('; ')}`);
  }

  // Replit lane: no D1/Neon provisioning. A's validator already guarantees a
  // 'replit-autoscale' target carries db_provider 'replit-postgres'.
  if (deployTargetFamily(descriptor) === 'replit') {
    return {
      provider: 'replit-postgres',
      triggersFired: [],
      reason: 'deployment_target is replit-autoscale — DB stays on replit-postgres (no D1/Neon provisioning)',
    };
  }

  // Cloud lane: D1 by default, graduate to Neon on any stakes trigger.
  const graduation = (descriptor && typeof descriptor === 'object' && descriptor.graduation) || {};
  const triggersFired = GRADUATION_TRIGGERS.filter((t) => Boolean(graduation[t]));

  // Honor an explicit upstream neon request — never downgrade a venture A/B
  // already decided is Neon-worthy.
  const explicitNeon = descriptor.db_provider === 'neon';

  if (triggersFired.length > 0 || explicitNeon) {
    const why = triggersFired.length > 0
      ? `graduation trigger(s) fired: ${triggersFired.join(', ')}`
      : 'descriptor explicitly requests db_provider "neon"';
    return { provider: 'neon', triggersFired, reason: `graduated to Neon — ${why}` };
  }

  return {
    provider: 'd1',
    triggersFired: [],
    reason: 'cloud target with no stakes triggers — defaulting to cheap Cloudflare D1',
  };
}

export default { GRADUATION_TRIGGERS, routeDbProvider };
