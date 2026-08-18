/**
 * Account-Prerequisite Checklist — SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-6 (class f).
 *
 * The chairman's incident: 5 separate round-trips discovering missing one-time bootstrap
 * accounts/credentials for a single venture, one at a time, only when each one's absence broke
 * something downstream. This module consolidates the known, DB-observable account-prerequisite
 * indicators into ONE checklist so gaps surface together, before a venture's first deploy
 * attempt — not one at a time during it.
 *
 * SCOPE, stated honestly: this checks what is DB-observable for a venture (billing product on
 * the applications row, deploy-target routing on the venture's stack_descriptor) plus, when a
 * local clone exists, a filesystem placeholder-value check mirroring FR-5's insight -- including,
 * as of an independent post-ship sweep, the Clerk publishable key (VITE_CLERK_PUBLISHABLE_KEY
 * per docs/03_protocols_and_standards/venture-hosting-standard.md), the OTHER half of the
 * chairman's AltifyAI incident this module's own header used to name as entirely out of scope.
 * This can only ever confirm a LOCAL scaffold placeholder was never replaced -- it does NOT
 * validate a live/deployed key against Clerk's own API, or see secrets that never appear in
 * wrangler.toml at all (Cloudflare Pages dashboard vars, `wrangler secret put`, a venture's own
 * GitHub Actions secrets) -- checking those would require live per-venture provider API calls, a
 * materially larger scope this SD does not attempt. That residual gap is still named explicitly
 * in the checklist output (present:null, detail explains why) rather than silently omitted or
 * falsely reported as present.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
// SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-5/TR-5: reuse the shared TOML placeholder-scanner
// (lib/venture-deploy/config-completeness.js) instead of a second, independent regex here --
// FR-5 extracted this module's original inline database_id check into that shared home.
import { scanTomlForPlaceholders, isPlaceholderValue } from '../../venture-deploy/config-completeness.js';

/** wrangler.toml var name for the Clerk publishable key (venture-hosting-standard.md). */
const CLERK_KEY_TOML_KEY = 'VITE_CLERK_PUBLISHABLE_KEY';

/** Value patterns that mean "never actually configured", not "genuinely absent". */
const PLACEHOLDER_D1_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Pure: build the consolidated checklist from already-resolved indicators. No I/O here --
 * callers resolve indicators (DB reads, filesystem checks) and pass them in, so this function
 * is trivially unit-testable without mocking a database or filesystem.
 * @param {object} indicators
 * @param {string|null} [indicators.stripeBillingProductId]
 * @param {boolean} [indicators.applicationRowFound] - false if no applications row was found via
 *   venture_id at all (ambiguous -- applications.venture_id is nullable, ~47% unpopulated as
 *   measured live 2026-08-18, so "not found" may mean not-yet-linked, not a confirmed absence)
 * @param {string|null} [indicators.cloudflareConnectionProvider] - stack_descriptor.connection.provider
 * @param {string|null} [indicators.sentryDsn]
 * @param {string|null} [indicators.wranglerD1DatabaseId] - null if no local clone / no wrangler.toml found
 * @param {string|null} [indicators.clerkPublishableKeyValue] - null if no local clone, no wrangler.toml,
 *   or the key isn't present in it (ambiguous -- may be configured elsewhere, not a confirmed gap)
 * @returns {Array<{account: string, present: boolean|null, detail: string}>}
 */
export function buildAccountPrerequisiteChecklist(indicators = {}) {
  const {
    stripeBillingProductId = null,
    applicationRowFound = true,
    cloudflareConnectionProvider = null,
    sentryDsn = null,
    wranglerD1DatabaseId = null,
    clerkPublishableKeyValue = null,
  } = indicators;

  return [
    // Independent post-ship sweep (R1): 3-state, mirroring cloudflare_d1_real_id/clerk_auth_keys.
    // applications.venture_id is nullable and, measured live, ~47% unpopulated -- the earlier
    // venture_id-based join fix (correctly closing a real name-collision mis-attribution risk)
    // traded it for a different fabricated-certainty risk: no row found via venture_id could mean
    // "genuinely no application" OR "one exists but isn't linked yet", and a name-based fallback
    // would reopen the exact collision bug that fix closed. present:null when the FK lookup finds
    // nothing at all -- only a REAL row with billing_product_id genuinely unset is present:false.
    {
      account: 'stripe_billing',
      present: !applicationRowFound ? null : !!stripeBillingProductId,
      detail: !applicationRowFound
        ? 'no applications row found via venture_id -- ambiguous (the FK is nullable and often unpopulated), not a confirmed gap, just unchecked'
        : stripeBillingProductId ? `billing_product_id=${stripeBillingProductId}` : 'applications.metadata.billing_product_id not set',
    },
    {
      account: 'cloudflare_deploy_target',
      present: !!cloudflareConnectionProvider,
      // R2 (independent post-ship sweep): dropped the "(schema_created step has not routed this
      // venture yet)" parenthetical -- that was an unmeasured inference about WHY the value is
      // absent (never ran vs. ran-and-failed vs. mid-retry), sourced from nothing this function
      // actually reads. The non-parenthetical half is what was actually measured.
      detail: cloudflareConnectionProvider ? `routed provider=${cloudflareConnectionProvider}` : 'ventures.stack_descriptor.connection not set',
    },
    {
      account: 'sentry_monitoring',
      present: !!sentryDsn,
      detail: sentryDsn ? 'DSN present' : 'ventures.metadata.sentry.dsn not set',
    },
    {
      account: 'cloudflare_d1_real_id',
      present: wranglerD1DatabaseId === null ? null : wranglerD1DatabaseId !== PLACEHOLDER_D1_ID,
      detail: wranglerD1DatabaseId === null
        ? 'no local clone / wrangler.toml found -- cannot check (not a confirmed gap, just unchecked)'
        : wranglerD1DatabaseId === PLACEHOLDER_D1_ID
          ? `wrangler.toml still carries the scaffold placeholder database_id (${PLACEHOLDER_D1_ID}) -- the exact AltifyAI incident this class originates from`
          : `real database_id present (${wranglerD1DatabaseId})`,
    },
    // Independent post-ship sweep: was hardcoded present:null / "NOT CHECKED" -- now a genuine
    // 3-state check, mirroring cloudflare_d1_real_id, for the LOCAL-scaffold-placeholder half of
    // this (the same category of check as the D1 one, not the live-provider-validation half,
    // which remains out of scope and is still named as such below).
    {
      account: 'clerk_auth_keys',
      present: clerkPublishableKeyValue === null ? null : !isPlaceholderValue(CLERK_KEY_TOML_KEY, clerkPublishableKeyValue),
      detail: clerkPublishableKeyValue === null
        ? `${CLERK_KEY_TOML_KEY} not found in a local wrangler.toml (no local clone, the file is absent, or the key lives elsewhere -- Cloudflare Pages dashboard vars, a 'wrangler secret put', or a venture's own GitHub Actions secrets, none of which this checklist can read) -- not a confirmed gap, just unchecked.`
        : isPlaceholderValue(CLERK_KEY_TOML_KEY, clerkPublishableKeyValue)
          ? `wrangler.toml still carries an unfilled Clerk publishable key placeholder (${clerkPublishableKeyValue}) -- the exact AltifyAI incident this class originates from (module header)`
          : 'a non-placeholder-shaped Clerk publishable key is present in wrangler.toml -- live validity against Clerk\'s own API not checked (requires live provider API access, out of this SD\'s scope).',
    },
  ];
}

/**
 * Resolve the real, DB/filesystem-observable indicators for a venture (the I/O side, kept
 * separate from buildAccountPrerequisiteChecklist's pure logic per CLAUDE_EXEC's
 * testability-aware-implementation guidance).
 * @param {object} supabase
 * @param {string} ventureId
 * @param {string|null} [localClonePath] - venture's local clone path, if known (for the
 *   wrangler.toml placeholder check; null skips that check rather than guessing a path)
 * @returns {Promise<{stripeBillingProductId, applicationRowFound, cloudflareConnectionProvider, sentryDsn, wranglerD1DatabaseId, clerkPublishableKeyValue}>}
 */
export async function resolveAccountPrerequisiteIndicators(supabase, ventureId, localClonePath = null) {
  // ALWAYS BIND error (project DB convention -- independent sweep finding): silently
  // discarding it here previously meant an RLS denial or transient network failure resolved
  // to venture=null exactly like a genuinely-missing row, which buildAccountPrerequisiteChecklist
  // then reported as present:false ("confirmed missing") instead of "unknown, could not check" --
  // fabricating certainty about data that was never successfully read.
  const { data: venture, error: ventureError } = await supabase
    .from('ventures')
    .select('name, metadata, stack_descriptor')
    .eq('id', ventureId)
    .maybeSingle();
  if (ventureError) throw new Error(`ventures fetch failed: ${ventureError.message}`);

  // Join by the venture_id FK (lib/adam/scope-registry.js's applications.venture_id, the
  // same column used elsewhere in this codebase), never by free-text venture name --
  // adversarial review finding (/ship Deep-tier gate): this SD's own
  // scripts/eva/retroactive-pbn-score.mjs already documents two live ventures sharing the
  // name "MarketLens", so a name-based join here could silently attribute one venture's
  // billing_product_id to the other.
  const { data: application, error: applicationError } = await supabase
    .from('applications')
    .select('metadata')
    .eq('venture_id', ventureId)
    .maybeSingle();
  if (applicationError) throw new Error(`applications fetch failed: ${applicationError.message}`);

  let wranglerD1DatabaseId = null;
  let clerkPublishableKeyValue = null;
  if (localClonePath && existsSync(join(localClonePath, 'wrangler.toml'))) {
    try {
      const toml = readFileSync(join(localClonePath, 'wrangler.toml'), 'utf8');
      const findings = scanTomlForPlaceholders(toml);
      const dbIdFinding = findings.find((f) => f.key === 'database_id');
      if (dbIdFinding) wranglerD1DatabaseId = dbIdFinding.value;
      const clerkFinding = findings.find((f) => f.key === CLERK_KEY_TOML_KEY);
      if (clerkFinding) clerkPublishableKeyValue = clerkFinding.value;
    } catch { /* unreadable -- leave both null, not a confirmed gap */ }
  }

  return {
    stripeBillingProductId: application?.metadata?.billing_product_id || null,
    applicationRowFound: application !== null,
    cloudflareConnectionProvider: venture?.stack_descriptor?.connection?.provider || null,
    sentryDsn: venture?.metadata?.sentry?.dsn || null,
    wranglerD1DatabaseId,
    clerkPublishableKeyValue,
  };
}
