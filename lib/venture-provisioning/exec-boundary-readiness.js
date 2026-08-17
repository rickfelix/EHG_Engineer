/**
 * EXEC-boundary provisioning readiness report for OPCO-A ventures.
 * SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-A (FR-1 deploy readiness, FR-2 distribution,
 * FR-3 payment-account SETUP, FR-4 analytics wiring).
 *
 * WHY A READINESS REPORT, NOT FOUR SEPARATE FEATURES: investigation found each FR has
 * a real chairman-reserved boundary or missing primitive sitting at the edge of what it
 * literally asks for:
 *  - FR-1 ("staging deploy, health_status green") -- the venture is already deployed LIVE
 *    via an out-of-band path this PRD didn't anticipate. There is no staging target to
 *    build; the honest deliverable is recording the REAL deployment state (was null).
 *  - FR-2 ("distribution channel config, draft/unpublished") -- provisionOrganicChannel()
 *    (lib/marketing/organic-channel-provisioning.js) is safe + idempotent but expects a
 *    Stage-22 channel-list artifact shape this venture doesn't have; its actual
 *    distribution_channel_config artifact is a landing-page/email-capture demand-test whose
 *    OWN `hands_to_chairman` field already names deploy + capture-endpoint wiring as
 *    chairman-hand. FR-2's own acceptance criteria says channel choice must be a recorded
 *    decision-point, not auto-selected -- so surfacing that existing boundary correctly IS
 *    the FR-2 deliverable, not something to route around.
 *  - FR-3 (payment-account SETUP, non-live) -- no account-provisioning primitive existed
 *    anywhere in lib/payments/ (verified: only stripe-client.js's API-call guard,
 *    analytics-bridge.js, attribution-resolver.js, checkout-provenance.js; zero hits for
 *    stripe.accounts.create/accountLinks.create/payment_account concepts repo-wide) --
 *    provisionPaymentAccountSetup() below fills that gap using the sanctioned
 *    getStripeForVenture() guard, but it can only ever run against a TEST key already
 *    present in the fleet environment (this module never creates/rotates keys -- chairman/
 *    Adam/dashboard-only). Held on a live-key exposure this session (removed from the
 *    shared-root .env, chairman-ruled per Adam 114e9a0a) until unheld; currently no test
 *    key is configured, so live execution surfaces as an honest FR-3 decision-point.
 *  - FR-4 (per-venture analytics wiring) -- no per-venture web-analytics sink exists
 *    anywhere in EHG_Engineer (verified: venture_analytics_events / venture_telemetry_events
 *    / analytics_events / venture_traffic_events / venture_funnel_events /
 *    venture_conversion_events all absent). Building one from scratch is out of this SD's
 *    scope; the honest deliverable is naming the gap as a decision-point.
 *
 * SAFETY: every operation here is reversible. FR-1's write records an ALREADY-TRUE fact
 * (no new deploy). FR-2 calls the existing safe/idempotent provisioning function and
 * otherwise only reads. FR-3's account.create grants no charge capability by itself
 * (Connect Express accounts start with charges_enabled=false until onboarding completes,
 * a human step this module never performs) and is refused outright by assertKeyAllowed()
 * for any non-test key. FR-4 only reads. No publish, no live activation, no DNS mutation.
 *
 * GATE-TOKEN WARNING (incident, resolved same-session): venture_artifacts.artifact_type
 * is NOT a semantically-neutral label -- some values are LIVE GATE TOKENS consumed by
 * fn_stage_artifact_precondition() (trigger fn_enforce_stage_advancement_artifact_gate,
 * BEFORE UPDATE OF current_lifecycle_stage ON ventures), which checks only
 * venture_id + is_current=true + artifact_type -- no lifecycle_stage predicate. The first
 * version of recordProvisioningReadiness() reused 'launch_readiness_checklist' (a real
 * gate token, gating AltifyAI's stage 23->24 launch-readiness check) and its is_current=true
 * insert at stage 19 silently disarmed that gate. Caught by a database-agent sub-agent
 * review, remediated by demoting the bad row. 'launch_deployment_runbook' (used below) was
 * verified live to be absent from both venture_stages.required_artifacts and
 * stage_artifact_requirements -- not a gate token. Before ever reusing an existing
 * artifact_type value here, verify it against those two tables first.
 *
 * The ventures UPDATE in recordProvisioningReadiness() also fires trg_ventures_update_sync_eva
 * (unconditional AFTER UPDATE), which mirrors health_status into eva_ventures -- not
 * something this module controls, but relevant if eva_ventures ever looks stale/duplicated.
 */

const ANALYTICS_SINK_CANDIDATES = Object.freeze([
  'venture_analytics_events',
  'venture_telemetry_events',
  'analytics_events',
  'venture_traffic_events',
  'venture_funnel_events',
  'venture_conversion_events',
]);

/**
 * Pure. Extracts .js/.css asset URLs referenced by src="" or href="" attributes and
 * resolves them against baseUrl. Built for Vite-style SPA shells (script[src]/link[href]).
 * @param {string} html
 * @param {string} baseUrl
 * @returns {string[]}
 */
export function extractAssetUrls(html, baseUrl) {
  const matches = [...String(html || '').matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  return matches.map((path) => new URL(path, baseUrl).toString());
}

/**
 * FR-1: verify the venture's real deployment is reachable AND functional. Pure network
 * check, no writes.
 *
 * A 200 on the entry URL alone does NOT prove the product renders -- a client-rendered SPA
 * serves the same static index.html shell (just a <div id="root"> + a script tag) whether
 * its JS bundle works, 404s, or throws at runtime (measured live against this exact
 * deployment: 393-byte shell, no server-rendered content at all). "reachable" only means the
 * shell loaded; "assetsVerified" additionally confirms every script/style the shell
 * references actually resolves, which rules out the most common broken-deploy failure mode
 * (missing/404 build assets) without requiring a headless browser to execute the JS.
 *
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, now?: () => string }} [deps]
 * @returns {Promise<{reachable: boolean, statusCode: number|null, checkedAt: string, error: string|null, assetsVerified: boolean, assetChecks: Array}>}
 */
export async function checkDeploymentHealth(url, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const checkedAt = deps.now ? deps.now() : new Date().toISOString();
  const base = { checkedAt, assetsVerified: false, assetChecks: [] };
  if (!url) return { reachable: false, statusCode: null, error: 'no_url', ...base };

  let res;
  try {
    res = await fetchImpl(url, { method: 'GET' });
  } catch (err) {
    return { reachable: false, statusCode: null, error: err.message, ...base };
  }
  if (!res.ok) {
    return { reachable: false, statusCode: res.status, error: null, ...base };
  }

  const html = await res.text();
  const assetUrls = extractAssetUrls(html, url);
  if (assetUrls.length === 0) {
    return { reachable: true, statusCode: res.status, error: 'no_asset_references_found_in_html', ...base };
  }

  const assetChecks = await Promise.all(assetUrls.map(async (assetUrl) => {
    try {
      const r = await fetchImpl(assetUrl, { method: 'GET' });
      return { url: assetUrl, ok: r.ok, statusCode: r.status };
    } catch (err) {
      return { url: assetUrl, ok: false, statusCode: null, error: err.message };
    }
  }));

  return {
    reachable: true,
    statusCode: res.status,
    checkedAt,
    error: null,
    assetsVerified: assetChecks.every((c) => c.ok),
    assetChecks,
  };
}

/**
 * FR-2: assess distribution-channel readiness without auto-selecting anything.
 * Pure given the artifact row + the provision-attempt result (both I/O, injected).
 * @param {object|null} channelConfigArtifact - the venture's distribution_channel_config
 *   venture_artifacts row (or null if absent)
 * @param {{ok: boolean, reason?: string}} provisionResult - result of calling the existing
 *   provisionOrganicChannel() against this venture (safe/idempotent, called by the caller)
 * @returns {{ organicChannelProvisioned: boolean, decisionPoint: object|null }}
 */
export function assessDistributionReadiness(channelConfigArtifact, provisionResult) {
  if (provisionResult.ok && provisionResult.reason !== 'no_channel_config_provided' && provisionResult.reason !== 'no_active_organic_channel_in_config' && provisionResult.reason !== 'no_distribution_channel_config') {
    return { organicChannelProvisioned: true, decisionPoint: null };
  }

  const data = channelConfigArtifact?.artifact_data;
  const looksLikeLandingPageDemandTest = data && data.record === 'landing_page' && typeof data.capture_endpoint === 'string';

  if (looksLikeLandingPageDemandTest) {
    return {
      organicChannelProvisioned: false,
      decisionPoint: {
        fr: 'FR-2',
        kind: 'distribution_channel',
        candidate: 'landing_page_email_capture',
        status: data.status || 'unknown',
        // Verbatim from the artifact's own hands_to_chairman field (coordinator ruling
        // f6d57c2a requirement 1) -- not paraphrased, so the chairman-window packet can
        // consume these items directly.
        blockedOn: data.hands_to_chairman || ['deploy landing page', 'wire capture endpoint'],
        note: 'Existing demand-test landing page is the real distribution candidate; activation (deploy + wire capture endpoint) is chairman-hand per the artifact\'s own hands_to_chairman field. Not auto-selected.',
      },
    };
  }

  return {
    organicChannelProvisioned: false,
    decisionPoint: {
      fr: 'FR-2',
      kind: 'distribution_channel',
      candidate: null,
      status: 'no_usable_channel_config',
      blockedOn: ['chairman/PLAN must supply a distribution_channel_config artifact in the organic-channel-list shape, or confirm the landing-page path as the intended channel'],
      note: `provisionOrganicChannel() reason: ${provisionResult.reason || 'unknown'}`,
    },
  };
}

/**
 * FR-4: assess whether a per-venture analytics sink exists. Pure given the presence map.
 * @param {Record<string, boolean>} sinkPresence - candidate table name -> exists
 * @returns {{ analyticsSinkExists: boolean, sinkTable: string|null, decisionPoint: object|null }}
 */
export function assessAnalyticsReadiness(sinkPresence) {
  const found = ANALYTICS_SINK_CANDIDATES.find((t) => sinkPresence[t]);
  if (found) {
    return { analyticsSinkExists: true, sinkTable: found, decisionPoint: null };
  }
  return {
    analyticsSinkExists: false,
    sinkTable: null,
    decisionPoint: {
      fr: 'FR-4',
      kind: 'analytics_wiring',
      candidate: null,
      status: 'unresourced',
      blockedOn: ['no per-venture web traffic/conversion/funnel analytics sink exists in EHG_Engineer', ...ANALYTICS_SINK_CANDIDATES],
      note: 'Checked candidate sink tables (' + ANALYTICS_SINK_CANDIDATES.join(', ') + '); none exist. Building a sink + event pipeline is new infrastructure, out of this SD\'s scope. Flagging as a decision-point rather than building blind.',
    },
  };
}

/**
 * FR-3: attempt to provision the venture's payment account into Stripe's SETUP/pending
 * state -- a Connect Express account whose onboarding is NOT complete (charges_enabled
 * stays false until the account holder finishes onboarding through Stripe, an out-of-band
 * human step this function never performs). This is NOT live activation: creating the
 * account object itself grants no charge capability.
 *
 * TEST-mode only, by construction: routes through getStripeForVenture() ->
 * assertKeyAllowed(), the SAME guard every other Stripe call in this repo uses -- a
 * sk_live_ key is refused unconditionally from a fleet/CI context (see
 * lib/payments/stripe-client.js). This function never creates, rotates, or reads a key
 * value itself; env.STRIPE_SECRET_KEY must already be a chairman/Adam-provisioned sk_test_
 * key. Preflights on its bare presence (not its prefix -- assertKeyAllowed is the single
 * source of truth for prefix validity) so a missing key produces a clean decision-point
 * instead of an uncaught guard exception.
 * @param {{ ventureId: string, ventureName?: string }} params
 * @param {{ supabase?: object, env?: object, getStripeForVenture?: Function }} [deps]
 * @returns {Promise<{ ok: boolean, accountId?: string, chargesEnabled?: boolean, detailsSubmitted?: boolean, reason?: string }>}
 */
export async function provisionPaymentAccountSetup({ ventureId, ventureName }, deps = {}) {
  const env = deps.env || process.env;
  if (!env.STRIPE_SECRET_KEY) {
    return { ok: false, reason: 'no_stripe_key_configured' };
  }

  const getStripeForVenture = deps.getStripeForVenture || (await import('../payments/stripe-client.js')).getStripeForVenture;
  let stripe;
  try {
    stripe = await getStripeForVenture({ supabase: deps.supabase, ventureId, env });
  } catch (err) {
    return { ok: false, reason: `guard_refused: ${err.message}` };
  }

  const account = await stripe.accounts.create({
    type: 'express',
    metadata: { venture_id: ventureId, venture_name: ventureName || '' },
  });

  return {
    ok: true,
    accountId: account.id,
    chargesEnabled: account.charges_enabled === true,
    detailsSubmitted: account.details_submitted === true,
  };
}

/**
 * FR-3: assess payment-account readiness. Pure given the provision-attempt result.
 * @param {{ok: boolean, accountId?: string, reason?: string}} provisionResult
 * @returns {{ paymentAccountProvisioned: boolean, decisionPoint: object|null }}
 */
export function assessPaymentAccountReadiness(provisionResult) {
  if (provisionResult.ok) {
    return { paymentAccountProvisioned: true, decisionPoint: null };
  }
  return {
    paymentAccountProvisioned: false,
    decisionPoint: {
      fr: 'FR-3',
      kind: 'payment_account',
      candidate: 'stripe_connect_express',
      status: 'blocked_no_test_key',
      blockedOn: [
        'no sk_test_ Stripe key is configured in the fleet environment',
        'payment-provider selection is itself a chairman-owned decision per this FR\'s own acceptance criteria -- Stripe Connect Express is the candidate given existing lib/payments/stripe-client.js infrastructure, not an auto-selected final choice',
      ],
      note: `provisionPaymentAccountSetup() reason: ${provisionResult.reason || 'unknown'}. Code path is built + unit-tested (Connect Express account.create via the sanctioned getStripeForVenture() guard) but cannot run live without a chairman/Adam-provisioned sk_test_ key -- this module never creates or rotates keys itself.`,
    },
  };
}

/**
 * Orchestrates FR-1/FR-2/FR-3/FR-4 assessment for one venture. I/O-heavy; injectable deps.
 * @param {{ supabase: object, ventureId: string, deploymentUrl: string, ventureName?: string }} params
 * @param {{ fetchImpl?: typeof fetch, provisionOrganicChannel?: Function, provisionPaymentAccountSetup?: Function, env?: object, now?: () => string }} [deps]
 * @returns {Promise<object>} the full readiness report
 */
export async function buildProvisioningReadinessReport({ supabase, ventureId, deploymentUrl, ventureName }, deps = {}) {
  const now = deps.now ? deps.now() : new Date().toISOString();

  // FR-1
  const health = await checkDeploymentHealth(deploymentUrl, deps);

  // FR-2
  const { data: channelConfigArtifact } = await supabase
    .from('venture_artifacts')
    .select('artifact_data')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'distribution_channel_config')
    .eq('is_current', true)
    .maybeSingle();

  const provisionOrganicChannel = deps.provisionOrganicChannel || (await import('../marketing/organic-channel-provisioning.js')).provisionOrganicChannel;
  const provisionResult = await provisionOrganicChannel({ ventureId }, { supabase });
  const distribution = assessDistributionReadiness(channelConfigArtifact, provisionResult);

  // FR-3
  const provisionPayment = deps.provisionPaymentAccountSetup || provisionPaymentAccountSetup;
  const paymentResult = await provisionPayment({ ventureId, ventureName }, { supabase, env: deps.env });
  const payment = assessPaymentAccountReadiness(paymentResult);

  // FR-4
  const sinkPresence = {};
  for (const table of ANALYTICS_SINK_CANDIDATES) {
    const { error } = await supabase.from(table).select('*').limit(0);
    sinkPresence[table] = !error;
  }
  const analytics = assessAnalyticsReadiness(sinkPresence);

  const decisionPoints = [distribution.decisionPoint, payment.decisionPoint, analytics.decisionPoint].filter(Boolean);

  return {
    ventureId,
    generatedAt: now,
    deploy: { url: deploymentUrl, ...health },
    distribution,
    payment,
    analytics,
    decisionPoints,
  };
}

/**
 * Pure. Maps deploy observations to the ventures.health_status CHECK constraint's actual
 * allowed values ('healthy' | 'warning' | 'critical' -- confirmed against
 * database/migrations/20251221_add_venture_health_metrics.sql; 'green'/'red' are NOT
 * valid values for this table and were caught live by the constraint on first persist
 * attempt). 'warning' is the shell-loads-but-assets-unverified case the coordinator
 * flagged (ruling f6d57c2a requirement 2) -- distinct from 'critical' (unreachable
 * entirely), so a broken-bundle deploy is visibly degraded rather than indistinguishable
 * from a fully-down one.
 * @param {{reachable: boolean, assetsVerified: boolean}} deploy
 * @returns {'healthy'|'warning'|'critical'}
 */
export function toVentureHealthStatus(deploy) {
  if (!deploy.reachable) return 'critical';
  if (!deploy.assetsVerified) return 'warning';
  return 'healthy';
}

/** venture_artifacts.artifact_type used for the persisted readiness report. Verified live
 * (post-incident) to be ABSENT from both venture_stages.required_artifacts and
 * stage_artifact_requirements -- not a gate token. See the module header's GATE-TOKEN
 * WARNING before ever changing this to a different reused enum value. */
const READINESS_ARTIFACT_TYPE = 'launch_deployment_runbook';

/**
 * Persists the report: (FR-1) updates the ventures row's deploy columns to the REAL
 * observed state, and (FR-2/FR-4 + FR-1 summary) inserts a venture_artifacts row.
 * Never touches anything irreversible (no publish, no payment, no DNS).
 *
 * Idempotent: supersedes (is_current=false) any prior current row of this artifact_type
 * for this venture BEFORE inserting -- deliberately not scoped by lifecycle_stage, because
 * fn_stage_artifact_precondition() itself has no lifecycle_stage predicate (see header), so
 * "one current readiness report per venture" is the semantics that actually matters. Falls
 * back to UPDATE on a 23505 unique-violation (idx_unique_current_artifact) from a
 * same-stage concurrent re-run racing the supersede step.
 * @param {{ supabase: object, ventureId: string, report: object }} params
 * @returns {Promise<{ ventureUpdated: boolean, artifactId: string|null }>}
 */
export async function recordProvisioningReadiness({ supabase, ventureId, report }) {
  const { data: updatedVentureRows, error: ventureUpdateError } = await supabase
    .from('ventures')
    .update({
      deployment_target: 'cloudflare_workers',
      deployment_url: report.deploy.url,
      health_status: toVentureHealthStatus(report.deploy),
    })
    .eq('id', ventureId)
    .select('id');

  // supabase-js resolves {data:null, error:null} even when zero rows matched the .eq() --
  // an update() without .select() cannot distinguish "updated" from "matched nothing".
  // Assert a row actually came back rather than trusting the absence of an error.
  const ventureUpdated = !ventureUpdateError && Array.isArray(updatedVentureRows) && updatedVentureRows.length > 0;

  // venture_artifacts.lifecycle_stage is NOT NULL -- caught live by the constraint on
  // first persist attempt. Read the venture's own current stage rather than hardcode one,
  // so this module works for any venture, not just the one it was authored against.
  const { data: ventureRow } = await supabase
    .from('ventures')
    .select('current_lifecycle_stage')
    .eq('id', ventureId)
    .maybeSingle();
  const lifecycleStage = ventureRow?.current_lifecycle_stage ?? 0;

  // Supersede any prior current row of this type for this venture before inserting, so a
  // re-run (e.g. after a lifecycle_stage transition) never leaves two concurrent
  // is_current=true rows -- idx_unique_current_artifact would not catch that, since it's
  // scoped by lifecycle_stage.
  await supabase
    .from('venture_artifacts')
    .update({ is_current: false })
    .eq('venture_id', ventureId)
    .eq('artifact_type', READINESS_ARTIFACT_TYPE)
    .eq('is_current', true);

  const artifactRow = {
    venture_id: ventureId,
    lifecycle_stage: lifecycleStage,
    artifact_type: READINESS_ARTIFACT_TYPE,
    title: 'OPCO-A provisioning readiness report (FR-1/FR-2/FR-4 decision-points)',
    is_current: true,
    source: 'SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-A',
    artifact_data: report,
  };

  let { data: inserted, error: insertError } = await supabase
    .from('venture_artifacts')
    .insert(artifactRow)
    .select('id')
    .single();

  const isUniqueViolation = insertError && (
    insertError.code === '23505' ||
    /idx_unique_current_artifact|duplicate key value violates unique constraint/i.test(insertError.message || '')
  );
  if (isUniqueViolation) {
    const { data: updated, error: updateError } = await supabase
      .from('venture_artifacts')
      .update({ title: artifactRow.title, source: artifactRow.source, artifact_data: artifactRow.artifact_data, is_current: true })
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', lifecycleStage)
      .eq('artifact_type', READINESS_ARTIFACT_TYPE)
      .select('id')
      .single();
    inserted = updated;
    insertError = updateError;
  }

  return {
    ventureUpdated,
    ventureUpdateError: ventureUpdateError?.message || null,
    artifactId: inserted?.id || null,
    insertError: insertError?.message || null,
  };
}
