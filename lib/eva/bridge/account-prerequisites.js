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
 * local clone exists, a filesystem placeholder-value check mirroring FR-5's insight. It does
 * NOT verify externally-deployed secrets (e.g. a venture's own Clerk keys, which live in that
 * venture's own GitHub Actions/Cloudflare Worker secrets, not centrally in this DB) — checking
 * those would require live per-venture GitHub/Cloudflare API calls, a materially larger scope
 * this SD does not attempt. That gap is named explicitly in the checklist output (present:null,
 * detail explains why) rather than silently omitted or falsely reported as present.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** Value patterns that mean "never actually configured", not "genuinely absent". */
const PLACEHOLDER_D1_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Pure: build the consolidated checklist from already-resolved indicators. No I/O here --
 * callers resolve indicators (DB reads, filesystem checks) and pass them in, so this function
 * is trivially unit-testable without mocking a database or filesystem.
 * @param {object} indicators
 * @param {string|null} [indicators.stripeBillingProductId]
 * @param {string|null} [indicators.cloudflareConnectionProvider] - stack_descriptor.connection.provider
 * @param {string|null} [indicators.sentryDsn]
 * @param {string|null} [indicators.wranglerD1DatabaseId] - null if no local clone / no wrangler.toml found
 * @returns {Array<{account: string, present: boolean|null, detail: string}>}
 */
export function buildAccountPrerequisiteChecklist(indicators = {}) {
  const {
    stripeBillingProductId = null,
    cloudflareConnectionProvider = null,
    sentryDsn = null,
    wranglerD1DatabaseId = null,
  } = indicators;

  return [
    {
      account: 'stripe_billing',
      present: !!stripeBillingProductId,
      detail: stripeBillingProductId ? `billing_product_id=${stripeBillingProductId}` : 'applications.metadata.billing_product_id not set',
    },
    {
      account: 'cloudflare_deploy_target',
      present: !!cloudflareConnectionProvider,
      detail: cloudflareConnectionProvider ? `routed provider=${cloudflareConnectionProvider}` : 'ventures.stack_descriptor.connection not set (schema_created step has not routed this venture yet)',
    },
    {
      account: 'sentry_monitoring',
      present: !!sentryDsn,
      detail: sentryDsn ? 'DSN present' : 'ventures.metadata.sentry.dsn not set (monitoring_baseline step has not obtained a DSN yet)',
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
    // NAMED, NOT SILENTLY OMITTED: externally-deployed secrets this checklist cannot see.
    {
      account: 'clerk_auth_keys',
      present: null,
      detail: 'NOT CHECKED by this checklist -- Clerk keys live in the venture\'s own deployed secrets (GitHub Actions / Cloudflare Worker env), not centrally observable from this DB. Requires live per-venture provider API access, out of this SD\'s scope.',
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
 * @returns {Promise<{stripeBillingProductId, cloudflareConnectionProvider, sentryDsn, wranglerD1DatabaseId}>}
 */
export async function resolveAccountPrerequisiteIndicators(supabase, ventureId, localClonePath = null) {
  const { data: venture } = await supabase
    .from('ventures')
    .select('name, metadata, stack_descriptor')
    .eq('id', ventureId)
    .maybeSingle();

  const { data: application } = await supabase
    .from('applications')
    .select('metadata')
    .eq('name', venture?.name)
    .maybeSingle();

  let wranglerD1DatabaseId = null;
  if (localClonePath && existsSync(join(localClonePath, 'wrangler.toml'))) {
    try {
      const toml = readFileSync(join(localClonePath, 'wrangler.toml'), 'utf8');
      const match = toml.match(/database_id\s*=\s*"([^"]+)"/);
      if (match) wranglerD1DatabaseId = match[1];
    } catch { /* unreadable -- leave null, not a confirmed gap */ }
  }

  return {
    stripeBillingProductId: application?.metadata?.billing_product_id || null,
    cloudflareConnectionProvider: venture?.stack_descriptor?.connection?.provider || null,
    sentryDsn: venture?.metadata?.sentry?.dsn || null,
    wranglerD1DatabaseId,
  };
}
