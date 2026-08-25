#!/usr/bin/env node
// SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001 -- PLAN-phase PRD revision (round 2) after a
// prospective TESTING review (before EXEC) measured 5 blocking premise errors in the round-1
// PRD: (1) FR-4's "new entitlement field" is false -- users.plan_tier already exists and is
// already written/tested; a new column would create dual representation. (2) FR-1's PBN
// scoring premise is unusable -- measured PBN_NOT_SCORED, and PBN is a pass/park verdict, not
// a price signal. (3) FR-5's retrofit-SD coordination claim is factually wrong (that SD has
// zero revenue/ledger scope) and no ledger table exists anywhere -- dropped from this SD.
// (4) FR-2 self-contradicted on reading EHG_Engineer's Stripe test key. (5) TR-3's
// constructEvent() will throw under this Worker's wrangler.toml (no nodejs_compat) --
// needs constructEventAsync + createSubtleCryptoProvider + createFetchHttpClient. Also
// found: Cloudflare secret provisioning is not automatable in this environment (wrangler
// unauthenticated, no deploy pipeline) -- carved out as a human-action prerequisite, not a
// completion blocker, matching the existing live-key-provisioning precedent.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { updatePRDWithLLMContent } from '../prd/prd-creator.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001';
const PRD_ID = 'PRD-SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001';

const llmContent = {
  executive_summary:
    'Build genuinely new Stripe checkout + minimal entitlement for AltifyAI, corrected after a prospective review measured 5 false premises in round 1 (fake entitlement field, unusable PBN pricing data, wrong retrofit-SD claim, self-contradictory secret rule, Workers-incompatible SDK usage).',
  functional_requirements: [
    {
      id: 'FR-1',
      requirement:
        'Pricing surface: present one simple paid tier on the live AltifyAI site. The price point is set by explicit chairman decision (measured: AltifyAI\'s venture_pbn_status is PBN_NOT_SCORED and has no numeric score fields at all; PBN itself is a pass/park merit verdict, not a price signal -- there is no automated pricing-evidence source to query). Chairman is informed of the price point and asked to confirm it before public exposure.',
      acceptance_criteria: [
        'A pricing page/section is live on the AltifyAI site showing exactly one paid tier with a stated price.',
        'The price point is explicitly chairman-set (not derived from an automated score), and that provenance is documented in the PR/commit.',
        'Chairman confirmation of the price point is recorded before the price is publicly exposed.',
      ],
    },
    {
      id: 'FR-2',
      requirement:
        'Stripe secret provisioning: measured -- wrangler is unauthenticated in this environment (no CLOUDFLARE_API_TOKEN with Workers scope; AltifyAI\'s only CI workflow has no deploy/wrangler step), so `wrangler secret put`/`wrangler deploy` cannot be executed by EXEC. EXEC\'s deliverable is: (a) the exact provisioning commands documented for a human to run, (b) application code that reads Stripe secrets correctly at Worker runtime via env bindings (env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET), never hardcoded. EHG_Engineer\'s own STRIPE_TEST_SECRET_KEY may be read ONLY as the value piped into a documented `wrangler secret put` command -- never read by the deployed Worker at runtime, and never committed/logged. Actual provisioning + deployment is a documented human-action follow-up (a human runs `wrangler login` or supplies a Workers-scoped token), not a blocker for this SD\'s completion.',
      acceptance_criteria: [
        'The exact `wrangler secret put STRIPE_SECRET_KEY` / `wrangler secret put STRIPE_WEBHOOK_SECRET` commands are documented, ready for a human with Workers-scoped credentials to run.',
        'No Stripe secret value appears in any committed file, log output, or error message.',
        'Application code reads Stripe secrets exclusively via Worker env bindings, never from EHG_Engineer\'s dotenv context at runtime.',
      ],
    },
    {
      id: 'FR-3',
      requirement:
        'Checkout: implement Stripe Checkout session creation and a webhook handler built for the Cloudflare Workers runtime specifically (see TR-3). The webhook route must live under `/api/webhooks/stripe` (exact match, no trailing slash) so it is dispatched by the Worker\'s PUBLIC_ROUTES table before `run_worker_first = ["/api/*"]` -- any other path is silently served the SPA fallback with HTTP 200, so Stripe would report successful delivery while no handler code ever runs. Checkout-session creation carries the authenticated user\'s identifier via `client_reference_id`/metadata (see TR-6), since the webhook itself is unauthenticated. No card data touches AltifyAI\'s own surfaces -- Stripe Checkout\'s hosted page handles all card entry.',
      acceptance_criteria: [
        'A checkout session can be created for the FR-1 pricing tier and completed using a Stripe test card, redirecting to a configured success route.',
        'The webhook handler, tested with Web-Crypto-signed fixture payloads (see FR-5), correctly verifies a valid signature and rejects a deliberately invalid one (4xx).',
        'A request to any path other than the exact registered webhook path does not reach the webhook handler (confirms the routing trap in TR-5 does not silently swallow deliveries).',
      ],
    },
    {
      id: 'FR-4',
      requirement:
        'Minimal entitlement: reuse the EXISTING `users.plan_tier` column (migrations/0002_create_users_table.sql, DEFAULT \'free_trial\', already written at registration and already read elsewhere) -- do NOT add a new field, which would create two conflicting representations of the same fact. The webhook flips `plan_tier` to a paid value on a confirmed successful payment, guarded by a Stripe event-id idempotency check (see TR-7) so Stripe\'s retry-on-non-2xx behavior can never double-process. Add a value constraint (CHECK or app-layer allowlist) on `plan_tier`, since it currently accepts any string with no validation (tests/users-schema.test.js confirms an arbitrary value is accepted today) -- a malformed webhook value must not silently corrupt entitlement state. Add at least one real gate check elsewhere in the app that reads `plan_tier` and changes observable behavior -- none exists today despite the column being written.',
      acceptance_criteria: [
        'No new D1 migration adds an entitlement column; the webhook writes to the existing `users.plan_tier` column.',
        'A successful test-mode payment webhook flips `plan_tier` to the paid value for the correct user (correlated via client_reference_id/metadata), verified by a direct D1 query after the webhook fires; a second delivery of the same Stripe event id does not double-process.',
        'A migration adds a value constraint/allowlist on `plan_tier`, and a webhook payload with an invalid tier value is rejected rather than silently written.',
        'At least one real gate check in the app reads `plan_tier` and changes observable behavior based on its value.',
      ],
    },
    {
      id: 'FR-5',
      requirement:
        'Fixtures and test-mode-first verification: prove checkout session creation, webhook signature verification (both valid and invalid), entitlement flip, and decline/cancel-clean paths entirely in local/CI tests. Web-Crypto-signed fixture payloads (Node\'s globalThis.crypto.subtle, matching Stripe\'s HMAC-SHA256 signing scheme) are the PRIMARY verification mechanism for signature checking -- a live Stripe-dashboard-delivered webhook event is not obtainable in this environment (no public URL for local Worker dev, no Stripe CLI installed) and is deferred to a post-deployment manual check once FR-2\'s human-action prerequisite is satisfied. Live-key provisioning remains explicitly out of scope for this SD\'s completion criteria.',
      acceptance_criteria: [
        'All test scenarios in this PRD pass locally/in CI using Stripe test-mode credentials, test cards, and Web-Crypto-signed fixture payloads.',
        'A documented decision point exists for the post-deployment manual live-webhook check and for live-key provisioning, rather than silently expanding this SD\'s scope to include them.',
        'Chairman is informed of and confirms the price point (FR-1) before this SD is marked complete, regardless of deployment status.',
      ],
    },
  ],
  technical_requirements: [
    {
      id: 'TR-1',
      requirement:
        'Scope fence, generalized after measurement: actual Cloudflare deployment, secret provisioning, and D1 migration application against the live Worker all require a human-provisioned Workers-scoped CLOUDFLARE_API_TOKEN (measured: wrangler is unauthenticated in this environment; AltifyAI\'s only CI workflow, .github/workflows/ci.yml, has no deploy/wrangler step). EXEC\'s deliverable is code + passing local/CI tests + documented provisioning commands; live provisioning/deployment is a documented follow-up, not a completion blocker. This SD\'s code changes land primarily in the AltifyAI repo; EHG_Engineer changes are limited to LEO protocol coordination artifacts.',
    },
    {
      id: 'TR-2',
      requirement:
        'No existing Stripe integration pattern exists anywhere in the portfolio (measured at LEAD: searched AltifyAI, apexniche-ai, and the main ehg platform repo) -- this is new integration work, following Stripe\'s own official Checkout + webhook documentation directly.',
    },
    {
      id: 'TR-3',
      requirement:
        'Webhook signature verification must use `stripe.webhooks.constructEventAsync(rawBody, sigHeader, secret, undefined, Stripe.createSubtleCryptoProvider())` -- NOT the default `constructEvent()`, which requires Node\'s synchronous node:crypto HMAC and will throw, since this Worker\'s wrangler.toml (compatibility_date 2025-10-01) has no `nodejs_compat` flag. The Stripe client itself must be constructed with `{ httpClient: Stripe.createFetchHttpClient() }` for the same reason. `stripe` must be added as a new npm dependency (not currently present in package.json). Raw body must be read via `await request.text()` strictly before any JSON parsing of the same request.',
    },
    {
      id: 'TR-4',
      requirement:
        'Entitlement reuses the existing `users.plan_tier` column -- no new D1 migration adds an entitlement field. A separate additive migration adds a value CHECK constraint or equivalent allowlist enforcement on `plan_tier`, safe for existing rows (all currently \'free_trial\' or a small known set of values).',
    },
    {
      id: 'TR-5',
      requirement:
        'The webhook route must be registered in src/index.js\'s PUBLIC_ROUTES table under the exact path `/api/webhooks/stripe` (matching wrangler.toml\'s `run_worker_first = ["/api/*"]`, no trailing slash) -- any path outside that prefix is served the SPA fallback (`not_found_handling = "single-page-application"`) with HTTP 200 instead of reaching the Worker, which would make Stripe report successful delivery while no handler code runs. Success/cancel checkout redirect routes must similarly be SPA client routes or under `/api/*`.',
    },
    {
      id: 'TR-6',
      requirement:
        'Checkout-session creation must pass the authenticated user\'s identifier (e.g. Clerk user id or internal users.id) via Stripe\'s `client_reference_id` or session `metadata`, since the webhook handler is unauthenticated (no Clerk principal reaches it) and has no other way to correlate a payment event back to a specific user.',
    },
    {
      id: 'TR-7',
      requirement:
        'Webhook processing must be idempotent against the Stripe event id -- store/check processed event ids before flipping `plan_tier` or writing any side effect -- so Stripe\'s retry-on-non-2xx-response behavior and duplicate deliveries can never double-process a single payment.',
    },
  ],
  test_scenarios: [
    { scenario: 'Complete a Stripe test-mode checkout with a valid test card for the FR-1 pricing tier.', type: 'happy_path' },
    { scenario: 'Verify a webhook signature using a Web-Crypto-signed fixture payload matching a valid Stripe HMAC-SHA256 signature.', type: 'happy_path' },
    { scenario: 'Send a webhook request with a deliberately invalid/tampered signature.', type: 'error_handling' },
    { scenario: 'After a successful payment webhook, query users.plan_tier directly and confirm it flipped to the paid value for the correct user (correlated via client_reference_id).', type: 'happy_path' },
    { scenario: 'Redeliver the identical Stripe event id a second time and confirm no double-processing (idempotency guard holds).', type: 'edge_case' },
    { scenario: 'Attempt to write an invalid/unrecognized value to plan_tier via the webhook path and confirm the CHECK constraint/allowlist rejects it.', type: 'error_handling' },
    { scenario: 'Use a Stripe test card that triggers a decline.', type: 'error_handling' },
    { scenario: 'Start a checkout session and cancel it before completion.', type: 'edge_case' },
    { scenario: 'Send a webhook-shaped request to a path other than the exact registered webhook path and confirm it does not reach the handler (SPA-fallback routing trap).', type: 'edge_case' },
    { scenario: 'Confirm the entitlement gate check actually changes observable app behavior for a paid vs. unpaid plan_tier value.', type: 'happy_path' },
  ],
  risks: [
    {
      risk: 'Cloudflare deployment/secret-provisioning credentials do not exist in this environment (wrangler unauthenticated, no deploy pipeline in CI) -- FR-2/TR-1 explicitly carve this out as a human-action prerequisite rather than something EXEC silently attempts and fails on.',
      mitigation: 'TR-1 scopes EXEC\'s deliverable to code + tests + documented provisioning commands; actual `wrangler secret put`/`wrangler deploy` execution is a documented follow-up gated on a human providing Workers-scoped credentials.',
    },
    {
      risk: 'The default Stripe Node SDK methods (constructEvent, default http client) require APIs unavailable under this Worker\'s compatibility settings and would throw at runtime if used as originally specified.',
      mitigation: 'TR-3 mandates the Workers-compatible async/fetch/subtle-crypto variants explicitly, verified by a fixture-based unit test exercising the real verification path before any deployment.',
    },
    {
      risk: 'A naive new entitlement column would create two conflicting representations of paid status alongside the existing users.plan_tier column.',
      mitigation: 'FR-4/TR-4 explicitly reuse the existing column and add a value constraint instead of a new field.',
    },
    {
      risk: 'Stripe retries webhook deliveries on any non-2xx response and can also deliver duplicates, which could double-process a single payment (flip tier twice, double-count revenue) without an idempotency guard.',
      mitigation: 'TR-7 requires a processed-event-id check before any webhook side effect, tested explicitly via the FR-5/test_scenarios redelivery case.',
    },
  ],
  acceptance_criteria: [
    'A real Stripe test-mode payment completes end-to-end: checkout session created, payment completed, webhook verified via the Workers-compatible SDK path, users.plan_tier flipped for the correct user, idempotent against redelivery.',
    'Decline and cancel paths leave plan_tier unchanged.',
    'No Stripe secret is committed to the repo, logged, or read by the deployed Worker from the wrong source (EHG_Engineer\'s dotenv instead of Worker env bindings).',
  ],
};

async function run() {
  const supabase = createSupabaseServiceClient();

  const { data: sdData, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw new Error(`SD fetch failed: ${sdErr.message}`);

  const ok = await updatePRDWithLLMContent(supabase, PRD_ID, SD_KEY, sdData, llmContent);
  if (!ok) throw new Error('updatePRDWithLLMContent returned false');

  console.log('PRD revised (round 2) successfully.');
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
