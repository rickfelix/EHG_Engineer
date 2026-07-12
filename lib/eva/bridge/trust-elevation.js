/**
 * Born-trusted trust-tier elevation for fleet-minted venture repos.
 * SD-LEO-INFRA-VENTURE-REPO-TRUST-001
 *
 * Venture `applications` rows are born trust_tier='external' at their insert sites
 * (scripts/reroute-venture-to-bridge.mjs, lib/sd-creation/pipeline.js). The VB-2
 * human-merge gate (lib/ship/venture-trust-gate.mjs) refuses auto-merge for external
 * repos — so the factory's OWN merge-ready output was being blocked, requiring a
 * per-venture hand elevation. This module elevates external->trusted ONLY when the
 * fleet genuinely mints the repo AND the venture carries chairman ratification.
 *
 * SECURITY (why this is safe):
 *  - The LOAD-BEARING discriminator is `repoWasMinted` — true ONLY on the venture
 *    provisioner's genuine-mint path (repoExists===false -> `gh repo create`).
 *    Imported/linked/external repos already exist on GitHub, so they never enter
 *    that branch and can never be elevated here.
 *  - `chairman_approved` (eva_architecture_plans OR eva_vision_documents for the
 *    venture_id) is a secondary AND-guard. It alone is NOT sufficient: CronGenius /
 *    DataDistill have chairman-approved arch plans yet are imported external repos,
 *    so they never mint and never elevate.
 *  - FAIL-CLOSED: any missing signal, unresolved venture_id, or query error yields
 *    elevate=false. Trust is only ever granted on a positive, ratified, fleet mint.
 *  - VB-2 keeps full teeth: it requires trust_tier==='trusted' AND an independent
 *    per-PR witness pass, so 'trusted' grants nothing by itself.
 *
 * The elevation predicate is a PURE function of injectable inputs (no `gh`, no
 * side-effect writes) so the negative pin is unit-testable without a repo or a merge.
 */

import { createSupabaseServiceClient } from '../../supabase-client.js';
import { normalizeAppName } from '../../repo-paths.js';

/**
 * Decide whether a venture repo may be born trusted. Pure w.r.t. side effects — it
 * performs read-only queries via the injected supabase client and NEVER writes or
 * shells out to `gh`. Fail-closed on every uncertain branch.
 *
 * @param {object} args
 * @param {string} args.ventureId
 * @param {boolean} args.repoWasMinted - true ONLY on the genuine-mint path (repoExists===false)
 * @param {import('@supabase/supabase-js').SupabaseClient} [args.supabase]
 * @returns {Promise<{elevate:boolean, reason:string, basis?:string, provenance?:object}>}
 */
export async function resolveTrustElevation({ ventureId, repoWasMinted, supabase } = {}) {
  // FR-2: the mint gate is load-bearing — imported/external repos never reach here.
  if (repoWasMinted !== true) return { elevate: false, reason: 'not_fleet_minted' };
  if (!ventureId) return { elevate: false, reason: 'venture_id_unresolved' };

  const sb = supabase || createSupabaseServiceClient();

  // Chairman ratification: a chairman_approved arch plan OR (vision-alone counts —
  // MarketLens has a chairman_approved vision and no arch plan).
  let archApproved = false;
  let visionApproved = false;
  try {
    const { data: arch, error } = await sb
      .from('eva_architecture_plans')
      .select('id')
      .eq('venture_id', ventureId)
      .eq('chairman_approved', true)
      .limit(1);
    if (error) throw error;
    archApproved = Array.isArray(arch) && arch.length > 0;
  } catch {
    // fail-closed: an unreadable ratification signal is treated as NOT approved.
    archApproved = false;
  }
  if (!archApproved) {
    try {
      const { data: vis, error } = await sb
        .from('eva_vision_documents')
        .select('id')
        .eq('venture_id', ventureId)
        .eq('chairman_approved', true)
        .limit(1);
      if (error) throw error;
      visionApproved = Array.isArray(vis) && vis.length > 0;
    } catch {
      visionApproved = false;
    }
  }

  if (!archApproved && !visionApproved) {
    return { elevate: false, reason: 'no_chairman_approval' };
  }

  const approvedVia = archApproved ? 'architecture plan' : 'vision document';
  const basis = `fleet_created_ratified_program: repo minted by fleet provisioner; chairman_approved ${approvedVia} for venture ${ventureId}`;
  return {
    elevate: true,
    reason: 'ratified_fleet_mint',
    basis,
    provenance: {
      to: 'trusted',
      from: 'external',
      basis,
      approved_via: approvedVia,
      venture_id: ventureId,
      policy: 'fleet_created_ratified_program',
      decided_by: 'venture_provisioner_born_trusted_policy',
    },
  };
}

/**
 * Elevate the venture's `applications` row external->trusted when
 * {@link resolveTrustElevation} approves it. Idempotent + concurrency-safe: the UPDATE
 * is guarded on `trust_tier='external'`, so a row already trusted is a no-op and the
 * elevation can be safely re-attempted (which is exactly what a partial-mint retry
 * does — FR-3). NON-FATAL: any failure logs and returns without throwing, so trust
 * elevation never breaks provisioning.
 *
 * @param {object} args
 * @param {string} args.ventureId
 * @param {string} args.ventureName - matched against applications.name (normalizeAppName)
 * @param {boolean} args.repoWasMinted
 * @param {import('@supabase/supabase-js').SupabaseClient} [args.supabase]
 * @param {(msg:string)=>void} [args.log]
 * @param {string} [args.stampedAt] - ISO timestamp for the elevation record (injectable for tests)
 * @returns {Promise<{elevated:boolean, reason:string, applicationId?:string}>}
 */
export async function elevateVentureRepoTrust({ ventureId, ventureName, repoWasMinted, supabase, log = () => {}, stampedAt } = {}) {
  const sb = supabase || createSupabaseServiceClient();
  const decision = await resolveTrustElevation({ ventureId, repoWasMinted, supabase: sb });
  if (!decision.elevate) {
    log(`[trust-elevation] not elevating (${decision.reason})`);
    return { elevated: false, reason: decision.reason };
  }

  try {
    const { data: appRows, error: selErr } = await sb
      .from('applications')
      .select('id, name, trust_tier, metadata')
      .eq('status', 'active');
    if (selErr) throw selErr;

    const needle = normalizeAppName(ventureName);
    const match = (appRows || []).find((a) => normalizeAppName(a.name) === needle);
    if (!match) {
      log(`[trust-elevation] no active applications row matches "${ventureName}" — skipped`);
      return { elevated: false, reason: 'no_app_row' };
    }
    if (match.trust_tier !== 'external') {
      log(`[trust-elevation] applications ${match.id} already trust_tier=${match.trust_tier} — no-op`);
      return { elevated: false, reason: `already_${match.trust_tier}`, applicationId: match.id };
    }

    const provenance = { at: stampedAt || new Date().toISOString(), ...decision.provenance };
    const nextMetadata = { ...(match.metadata || {}), trust_tier_elevation: provenance };

    // Concurrency-safe idempotency: only flip a row that is STILL external.
    const { error: upErr } = await sb
      .from('applications')
      .update({ trust_tier: 'trusted', metadata: nextMetadata })
      .eq('id', match.id)
      .eq('trust_tier', 'external');
    if (upErr) throw upErr;

    log(`[trust-elevation] applications ${match.id} ("${ventureName}") elevated external->trusted (${decision.basis})`);
    return { elevated: true, reason: 'elevated', applicationId: match.id };
  } catch (err) {
    log(`[trust-elevation] WARN non-fatal: ${err.message}`);
    return { elevated: false, reason: 'error' };
  }
}
