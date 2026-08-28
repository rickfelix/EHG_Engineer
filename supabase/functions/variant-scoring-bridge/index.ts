// Variant Scoring Bridge Edge Function
// SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-D (FR-5 / US-006)
//
// EHG-callable service-role surface for VideoVariantTesting.tsx (ehg app repo). Both repos
// share this Supabase project, so this function lives alongside lib/creative/
// variant-scoring-bridge.js (the child-C seam it wraps) rather than being duplicated in the
// ehg repo's supabase/functions/ tree.
//
// Normalizes across two incompatible RLS ownership models (creative_assets /
// creative_asset_variant_scores scope via user_company_access; marketing_content_variants
// scopes via ventures.created_by, NULL on every live venture) by resolving access
// server-side via user_company_access -- never a client-side .from() call, per TR-1.
//
// SECURITY review db9a6d11-acd9-4ee3-8f33-99bbe50f1816 (SEC-3): service_role is used ONLY for
// the 'read' action's creative_asset_variant_scores join (the genuine RLS-model mismatch this
// bridge exists to work around) and for resolveVentureCompanyAccess's own resolution query
// (which must see across the tenancy boundary to decide it). The 'list' and 'write' actions
// run under a CALLER-scoped client (the verified user's own JWT, via createCallerClient()) --
// creative_assets already has a working `creative_assets_venture_access` RLS policy scoped
// through the SAME user_company_access predicate this function checks in application code, so
// using the caller's own token gives that SQL policy as a second, independent layer: a bug in
// resolveVentureCompanyAccess becomes RLS-denied, not unmitigated cross-tenant access.
//
// ============================================================================================
// DENO-BUNDLE SAFETY (verified 2026-08-28 with the standalone `deno` CLI, `deno check`):
// ============================================================================================
// This function does NOT import lib/creative/variant-scoring-bridge.js's `selectAssetVariant`
// or `bridgeReadForCaller`/`bridgeWriteVariant` (which would pull in the full chain
// asset-view-gate.js -> governance/stage-gate-predicate.js -> feature-flags/evaluator.js).
// That chain is confirmed Deno-INCOMPATIBLE:
//   `deno check supabase/functions/variant-scoring-bridge/index.ts` (with the full-chain
//   import) fails with:
//     error: Relative import path "crypto" not prefixed with / or ./ or ../
//       hint: If you want to use a built-in Node module, add a "node:" prefix.
//       at file:///.../lib/feature-flags/evaluator.js:12:20
//   evaluator.js also bare-imports `@supabase/supabase-js` (no `npm:`/`https://esm.sh/`
//   prefix), a second, independent Deno-incompatibility beyond the crypto one. Fixing either
//   in isolation would not make the chain deployable; both would need fixing, and the
//   dependency graph is not otherwise audited beyond this first failure point
//   (chairman-decision-watcher.js / record-pending-decision.mjs / sd-id-resolver.js /
//   post-build-convergence-gate.js / stage-governance.js were never reached).
//
// Instead, this function imports ONLY the two pure, dependency-free modules that make up the
// ACTUAL scoring computation (verified Deno-clean with `deno check`, zero imports beyond JS):
//   - lib/marketing/ai/thompson-sampler.js       (createSampler / the SOLE canonical sampler)
//   - lib/marketing/ai/variant-outcome-derivation.js (deriveVariantOutcomes)
//   - lib/creative/venture-company-access.js     (resolveVentureCompanyAccess, dependency-free
//                                                  by design -- see that file's own docblock)
// and re-implements the DB-query plumbing of selectAssetVariant() (the creative_asset_variant_
// scores + daily_rollups queries) inline below -- this is I/O glue, not scoring logic; the
// actual Thompson-sampler algorithm and outcome derivation are the real, single, reused
// implementation (TR-4: never lib/eva/experiments/experiment-assignment.js's unrelated
// sampler -- this function never imports that module at all).
//
// KNOWN, DELIBERATE GAP: selectAssetVariant()'s S23/S24 taste-gate check
// (checkAssetViewAuthorized, in asset-view-gate.js) is NOT enforced by this Edge Function,
// because that check's dependency chain is the Deno-incompatible one above. Reads/writes here
// are gated ONLY by resolveVentureCompanyAccess (company-access tenancy), not by the S23
// chairman-product-review-approved / S24 lifecycle-stage>=24 predicate that Node-side callers
// of selectAssetVariant() still get. This is a real behavioral difference from the Node path,
// not an oversight -- follow-up options: (a) add `node:` prefixes + an npm:/esm.sh-safe
// specifier to feature-flags/evaluator.js so the whole chain becomes Deno-portable, or (b)
// port checkAssetViewAuthorized's two-leg check natively into Deno here. Neither was in scope
// for SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-D FR-5.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { verifyJWT, getCorsHeaders, createAdminClient, createCallerClient } from '../_shared/auth.ts';
// Plain ESM .js imports -- Deno resolves and type-checks these fine (implicit `any`, no local
// .d.ts needed); no @ts-ignore/@ts-expect-error required (deno check errors on an UNUSED
// expect-error directive, so a stale suppression comment here would itself fail the check).
import { createSampler } from '../../../lib/marketing/ai/thompson-sampler.js';
import { deriveVariantOutcomes } from '../../../lib/marketing/ai/variant-outcome-derivation.js';
import { resolveVentureCompanyAccess } from '../../../lib/creative/venture-company-access.js';
// SECURITY review db9a6d11 (SEC-1): shared allow-list, ONE representation imported by both this
// Edge Function and the sibling Node-side lib/creative/variant-scoring-bridge.js#bridgeWriteVariant()
// -- previously the allow-list was defined twice (once here, once nowhere on the Node side,
// which still spread caller input unfiltered).
import { pickAllowedAssetFields } from '../../../lib/creative/asset-write-fields.js';

const sampler = createSampler();

// SECURITY review db9a6d11 (SEC-2): a Vite build-time flag (VITE_ENABLE_VARIANT_PERSISTENCE_BRIDGE)
// governs the ehg-app CLIENT's decision to call this endpoint, but cannot hold a change-control
// boundary against a live, publicly-deployed HTTP endpoint -- the endpoint works the moment it's
// deployed regardless of what any particular client does. This is the SERVER-side gate: an env
// var set via Supabase secrets (NOT the VITE_ client one, which is baked into the browser
// bundle and readable by anyone). Defaults to OFF (unset/anything other than 'true') so the
// write path stays dormant until the same ceremony that applies FR-4 (the chairman-gated
// creative_asset_variant_scores RLS fix) also flips this secret.
function writePersistenceEnabled(): boolean {
  return Deno.env.get('ENABLE_VARIANT_PERSISTENCE_BRIDGE') === 'true';
}

async function selectAssetVariantForVenture(supabase: any, ventureId: string) {
  // Mirrors lib/creative/variant-scoring-bridge.js#selectAssetVariant()'s query shape
  // (minus the Deno-incompatible checkAssetViewAuthorized gate -- see module docblock).
  const { data: bridgedRows, error: bridgeError } = await supabase
    .from('creative_asset_variant_scores')
    .select('creative_asset_id, variant_id, creative_assets!inner(venture_id)')
    .eq('creative_assets.venture_id', ventureId)
    .limit(999);

  if (bridgeError) {
    return { status: 'query_error', error: bridgeError.message || String(bridgeError) };
  }
  if (!bridgedRows || bridgedRows.length === 0) {
    return { status: 'no_bridged_rows' };
  }

  const variantIds = [...new Set(bridgedRows.map((row: any) => row.variant_id))];
  const creativeAssetByVariant = new Map(bridgedRows.map((row: any) => [row.variant_id, row.creative_asset_id]));

  const { data: dailyRollupsRows, error: rollupsError } = await supabase
    .from('daily_rollups')
    .select('variant_id, impressions, conversions')
    .in('variant_id', variantIds)
    .limit(999);

  if (rollupsError) {
    return { status: 'query_error', error: rollupsError.message || String(rollupsError) };
  }

  const outcomes = deriveVariantOutcomes(dailyRollupsRows || []);
  if (outcomes.length === 0) {
    return { status: 'no_outcome_data', candidateCount: variantIds.length };
  }

  const selection = sampler.selectVariant(outcomes);
  return {
    status: 'selected',
    selection: {
      ...selection,
      creativeAssetId: creativeAssetByVariant.get(selection.variantId) || null,
    },
    candidateCount: outcomes.length,
  };
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Verify JWT before any database operations. callerUserId comes ONLY from the verified
    // token, never from the request body -- a client-supplied user id would let a caller
    // impersonate any venture's access.
    const { user, token, error: authError, status: authStatus } = await verifyJWT(req);
    if (authError || !user || !token) {
      return new Response(
        JSON.stringify({ status: 'unauthorized', reason: authError || 'invalid_token' }),
        { status: authStatus || 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { action, venture_id: ventureId } = body;

    if (!ventureId) {
      return new Response(
        JSON.stringify({ status: 'error', error: 'venture_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // resolveVentureCompanyAccess itself needs to see across the tenancy boundary to decide
    // it, so it runs under admin -- same as the 'read' action's RLS-model-mismatch join.
    const adminClient = createAdminClient();
    const access = await resolveVentureCompanyAccess({ supabase: adminClient, userId: user.id, ventureId });
    if (!access.allowed) {
      return new Response(
        JSON.stringify({ status: 'unauthorized', reason: access.reason }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'read') {
      const result = await selectAssetVariantForVenture(adminClient, ventureId);
      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SEC-3: 'list' and 'write' run under the CALLER's own JWT (RLS applies as that user,
    // via creative_assets_venture_access) rather than admin -- see module docblock.
    const callerClient = createCallerClient(token);

    // TESTING FAIL 49e5b1ef (item 2): US-004 AC-4 requires persisted variants to survive a
    // page reload. VideoVariantTesting.tsx's `campaigns` state was previously write-only (set
    // only by the generation handler) -- nothing ever read creative_assets back on mount. This
    // action is that read path, routed through the bridge (never a raw client .from() call,
    // per TR-1/FR-5), returning persisted creative_assets rows for the venture grouped by
    // campaign_id so the caller can reconstruct the same Campaign shape it renders in-session.
    if (action === 'list') {
      const { data, error } = await callerClient
        .from('creative_assets')
        .select('id, campaign_id, capability, generator, prompt, provenance, cost, created_at')
        .eq('venture_id', ventureId)
        .not('campaign_id', 'is', null)
        .order('created_at', { ascending: true });

      if (error) {
        return new Response(
          JSON.stringify({ status: 'error', error: error.message || String(error) }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ status: 'ok', rows: data || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'write') {
      // SEC-2: server-side gate, independent of the ehg-app client's
      // VITE_ENABLE_VARIANT_PERSISTENCE_BRIDGE build-time flag -- that flag can't hold a
      // change-control boundary against a live, publicly-deployed HTTP endpoint. Defaults OFF
      // until the same ceremony that applies FR-4 also sets this Supabase secret.
      if (!writePersistenceEnabled()) {
        return new Response(
          JSON.stringify({ status: 'error', error: 'variant_persistence_write_disabled' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { campaign_id: campaignId, asset } = body;
      if (!campaignId) {
        return new Response(
          JSON.stringify({ status: 'error', error: 'missing_campaign_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Explicit allow-list, never a spread of caller input (TESTING FAIL 49e5b1ef, item 4 /
      // SECURITY review SEC-1). venture_id/campaign_id are always the server-resolved values
      // below, not read from the caller's `asset` object even if a caller includes them there.
      const insertPayload = {
        ...pickAllowedAssetFields(asset),
        venture_id: ventureId,
        campaign_id: campaignId,
      };

      const { data, error } = await callerClient
        .from('creative_assets')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ status: 'error', error: error.message || String(error) }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ status: 'persisted', row: data }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ status: 'error', error: "action must be 'read', 'list', or 'write'" }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ status: 'error', error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
