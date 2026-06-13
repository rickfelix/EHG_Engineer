/**
 * Stripe client + key-safety guard for the payment rail.
 * SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001
 *
 * Safety contract (RISK + DESIGN sub-agent conditions):
 *  - TEST-mode first: only sk_test_ keys are permitted in CI/fleet/automated runs.
 *  - A sk_live_ key is REFUSED unless STRIPE_RAIL_LIVE_MODE === 'true' AND the
 *    context is not CI/fleet. LIVE activation is a chairman-gated step.
 *  - No secrets are stored here; keys come from the environment only.
 */

/** A live secret/restricted key (real money). */
export function isLiveKey(key) {
  return typeof key === 'string' && (key.startsWith('sk_live_') || key.startsWith('rk_live_'));
}

/** A test secret/restricted key (no real money). */
export function isTestKey(key) {
  return typeof key === 'string' && (key.startsWith('sk_test_') || key.startsWith('rk_test_'));
}

/** Automated context where a live key must never be used. */
export function isCIContext(env = process.env) {
  return Boolean(env.CI || env.GITHUB_ACTIONS || env.LEO_FLEET_CONTEXT);
}

/**
 * Throw unless `key` is allowed in the current context.
 * Pure + injectable for unit testing.
 */
export function assertKeyAllowed(key, opts = {}) {
  const env = opts.env || process.env;
  const isCI = opts.isCI ?? isCIContext(env);
  const liveModeEnabled = opts.liveModeEnabled ?? (env.STRIPE_RAIL_LIVE_MODE === 'true');

  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  if (isLiveKey(key)) {
    if (isCI) {
      throw new Error('Refusing sk_live_ key in CI/fleet/automated context — TEST mode only');
    }
    if (!liveModeEnabled) {
      throw new Error('Refusing sk_live_ key: STRIPE_RAIL_LIVE_MODE is not enabled (chairman-gated TEST->LIVE switch)');
    }
  } else if (!isTestKey(key)) {
    throw new Error('STRIPE_SECRET_KEY is neither a recognized test (sk_test_/rk_test_) nor live (sk_live_/rk_live_) key');
  }
  return true;
}

let _stripe = null;

/**
 * Lazily construct the Stripe SDK client after enforcing the key guard.
 * Returns null-safe: throws a clear error if the key is missing/unsafe.
 */
export async function getStripe(env = process.env) {
  if (_stripe) return _stripe;
  const key = env.STRIPE_SECRET_KEY;
  assertKeyAllowed(key, { env });
  const { default: Stripe } = await import('stripe');
  _stripe = new Stripe(key, { apiVersion: env.STRIPE_API_VERSION || undefined });
  return _stripe;
}

/** Test seam to reset the memoized client. */
export function _resetStripeClient() { _stripe = null; }
