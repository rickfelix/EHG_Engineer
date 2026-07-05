/**
 * Stripe client + key-safety guard for the payment rail.
 * SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001
 *
 * Safety contract (RISK + DESIGN + adversarial-review SEC-001):
 *  - TEST-mode first: only sk_test_ keys are permitted in CI/fleet/automated runs.
 *  - A sk_live_ key is FAIL-CLOSED: refused unless ALL of (a) not an automated
 *    context, (b) STRIPE_RAIL_LIVE_MODE==='true', AND (c) an explicit positive
 *    human confirmation STRIPE_LIVE_DEPLOY_CONFIRM==='true'. Absence of CI markers
 *    is never treated as proof of an interactive session.
 *  - No secrets are stored here; keys come from the environment only.
 *
 * NOTE: webhook signature verification does NOT go through this guard — see
 * api/webhooks/stripe.js getWebhookVerifier() — so a key misconfig can never drop
 * a legitimately-signed payment event. This guard governs API CALLS (e.g. the
 * test-charge harness) only.
 */

/** A live secret/restricted key (real money). */
export function isLiveKey(key) {
  return typeof key === 'string' && (key.startsWith('sk_live_') || key.startsWith('rk_live_'));
}

/** A test secret/restricted key (no real money). */
export function isTestKey(key) {
  return typeof key === 'string' && (key.startsWith('sk_test_') || key.startsWith('rk_test_'));
}

/**
 * Automated context where a live key must never be used. Allowlist-style
 * positive detection across common CI providers PLUS fleet/agent sessions —
 * fail-closed: if we can detect automation at all, refuse live (SEC-001).
 */
export function isCIContext(env = process.env) {
  return Boolean(
    env.CI || env.CONTINUOUS_INTEGRATION || env.GITHUB_ACTIONS || env.GITLAB_CI ||
    env.CIRCLECI || env.TRAVIS || env.APPVEYOR || env.BUILDKITE || env.TEAMCITY_VERSION ||
    env.TF_BUILD || env.JENKINS_URL || env.JENKINS_HOME || env.BUILD_NUMBER || env.HUDSON_URL ||
    // Fleet / autonomous agent sessions are automated by definition:
    env.LEO_FLEET_CONTEXT || env.CLAUDE_SESSION_ID || env.CLAUDE_CODE
  );
}

/**
 * Throw unless `key` is allowed in the current context. Pure + injectable for tests.
 * Live keys are FAIL-CLOSED (require explicit positive confirmation, not the mere
 * absence of CI markers).
 */
export function assertKeyAllowed(key, opts = {}) {
  const env = opts.env || process.env;
  const isCI = opts.isCI ?? isCIContext(env);
  const liveModeEnabled = opts.liveModeEnabled ?? (env.STRIPE_RAIL_LIVE_MODE === 'true');
  const liveConfirmed = opts.liveConfirmed ?? (env.STRIPE_LIVE_DEPLOY_CONFIRM === 'true');

  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  if (isLiveKey(key)) {
    if (isCI) throw new Error('Refusing sk_live_ key in CI/fleet/automated context — TEST mode only');
    if (!liveModeEnabled) throw new Error('Refusing sk_live_ key: STRIPE_RAIL_LIVE_MODE is not enabled (chairman-gated TEST->LIVE switch)');
    if (!liveConfirmed) throw new Error('Refusing sk_live_ key: STRIPE_LIVE_DEPLOY_CONFIRM is not set (fail-closed — explicit human confirmation required)');
  } else if (!isTestKey(key)) {
    throw new Error('STRIPE_SECRET_KEY is neither a recognized test (sk_test_/rk_test_) nor live (sk_live_/rk_live_) key');
  }
  return true;
}

let _stripe = null;

/**
 * Lazily construct the Stripe SDK client after enforcing the key guard.
 * For API CALLS (charges) only — NOT used for webhook verification.
 */
export async function getStripe(env = process.env) {
  if (_stripe) return _stripe;
  const key = env.STRIPE_SECRET_KEY;
  assertKeyAllowed(key, { env });
  const { default: Stripe } = await import('stripe');
  _stripe = new Stripe(key, { apiVersion: env.STRIPE_API_VERSION || undefined });
  return _stripe;
}

/**
 * SD-LEO-INFRA-LAUNCH-MODE-POLICY-002 (FR-5): the env flag is now necessary but
 * NOT sufficient for live-rail motion — the VENTURE itself must be in live
 * launch_mode (chairman-flipped). A simulated venture never gets live-rail
 * calls even with STRIPE_RAIL_LIVE_MODE enabled. Fail-closed: mode read errors
 * degrade to 'simulated' (getLaunchMode contract) and are refused.
 * getLaunchMode is imported lazily so pure key-guard consumers pay no eva dep.
 * @param {{ supabase: object, ventureId: string, env?: object }} params
 * @returns {Promise<true>} throws on refusal
 */
export async function assertVentureLiveAllowed({ supabase, ventureId, env = process.env } = {}) {
  const liveModeEnabled = env.STRIPE_RAIL_LIVE_MODE === 'true';
  if (!liveModeEnabled) return true; // test rail: no venture-mode requirement
  if (!supabase || !ventureId) {
    throw new Error('Refusing live-rail Stripe call: venture context required when STRIPE_RAIL_LIVE_MODE is enabled (launch-mode policy)');
  }
  const { getLaunchMode, isLiveMode } = await import('../eva/launch-mode.js');
  const mode = await getLaunchMode(supabase, ventureId);
  if (!isLiveMode(mode)) {
    throw new Error(`Refusing live-rail Stripe call: venture ${ventureId} launch_mode='${mode}' (chairman has not flipped it to live — SD-LEO-INFRA-LAUNCH-MODE-POLICY-002)`);
  }
  return true;
}

/**
 * Venture-scoped Stripe entry point: runs the launch-mode guard, then the
 * standard key guard. New live-rail call sites should use THIS instead of
 * getStripe() so a simulated venture can never reach a live rail.
 */
export async function getStripeForVenture({ supabase, ventureId, env = process.env } = {}) {
  await assertVentureLiveAllowed({ supabase, ventureId, env });
  return getStripe(env);
}

/** Test seam to reset the memoized client. */
export function _resetStripeClient() { _stripe = null; }
