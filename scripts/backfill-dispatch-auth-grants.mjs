#!/usr/bin/env node
/**
 * Dispatch-authorization grant backfill + pre-flip verification.
 * SD-ARCH-HOTSPOT-SD-START-001 FR-8 — ships INERT (dry-run default, never auto-runs).
 *
 * PURPOSE: before the born-un-authorized polarity may flip to ENFORCE
 * (dispatch_auth_born_denied_enforce flag), every currently belt-claimable SD
 * must hold a dispatch_auth disposition grant — otherwise the flip freezes the
 * whole belt (the exact risk SD-LEO-INFRA-HANDOFF-DISPATCH-AUTHORIZATION-001's
 * LEAD deferred the flip over). This tool:
 *   1. Enumerates the claimable set — the same status surface worker-checkin
 *      claims from: draft / active / planning / ready / in_progress /
 *      pending_approval (terminal statuses excluded).
 *   2. Reports which already hold a grant (idempotent: recordDisposition
 *      dedups on the content-derived question key, 23505-race safe).
 *   3. DRY-RUN (default): prints the enumeration + the PRE-FLIP VERIFICATION
 *      (un-granted claimable count — must be ZERO before enforce) and writes
 *      NOTHING.
 *   4. --apply: writes one grant per un-granted claimable via recordDisposition
 *      (authority='backfill-cutover', on the gate's allowlist), then re-runs
 *      the verification.
 *
 * Usage:
 *   node scripts/backfill-dispatch-auth-grants.mjs            # dry-run (default)
 *   node scripts/backfill-dispatch-auth-grants.mjs --apply    # write grants
 *
 * The enforce flip itself is NOT this tool's job — it is a later coordinated
 * cutover (chairman/coordinator) gated on this tool's verification reading 0.
 */

import 'dotenv/config';
import { createSupabaseServiceClient } from './lib/supabase-connection.js';
import { recordDisposition, getDispositionBySubject } from '../lib/decision-binding/disposition.js';
import { DISPATCH_AUTH_AUTHORITY_ALLOWLIST } from '../lib/claim/gates/dispatch-authorization.cjs';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — the claimable-status enumeration
// below drives a pre-enforce-flip verification, so a capped read would silently under-count the
// claimable belt surface and could pass the "must be 0 un-granted" check while un-enumerated
// SDs remain un-granted. strategic_directives_v2 is a growing table.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

/** The worker-checkin claimable status surface (terminal statuses excluded). */
export const CLAIMABLE_STATUSES = ['draft', 'active', 'planning', 'ready', 'in_progress', 'pending_approval'];
const BACKFILL_AUTHORITY = 'backfill-cutover';

export async function enumerateClaimables(supabase) {
  try {
    return await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, status')
      .in('status', CLAIMABLE_STATUSES)
      .not('sd_key', 'is', null)
      .order('id', { ascending: true }));
  } catch (e) {
    throw new Error(`claimable enumeration failed: ${e.message}`);
  }
}

/** Partition claimables into granted / unGranted by live disposition reads. */
export async function verifyGrantCoverage(supabase, claimables) {
  const granted = [];
  const unGranted = [];
  for (const sd of claimables) {
    const row = await getDispositionBySubject(supabase, 'dispatch_auth', { subject_id: sd.sd_key, gate_type: 'dispatch' });
    const p = row && row.payload;
    const ok = p && (p.status === 'dispositioned' || p.status === 'consumed')
      && DISPATCH_AUTH_AUTHORITY_ALLOWLIST.includes(p.authority);
    (ok ? granted : unGranted).push(sd);
  }
  return { granted, unGranted };
}

export async function applyGrants(supabase, unGranted) {
  const results = { created: 0, reused: 0, failed: [] };
  for (const sd of unGranted) {
    try {
      const { created } = await recordDisposition(supabase, {
        decisionType: 'dispatch_auth',
        subject: { subject_id: sd.sd_key, gate_type: 'dispatch' },
        decisionKey: 'backfill-cutover-grant',
        authority: BACKFILL_AUTHORITY,
        status: 'dispositioned',
        answerPayload: {
          granted_by: 'backfill-dispatch-auth-grants.mjs',
          reason: 'pre-enforce cutover backfill (SD-ARCH-HOTSPOT-SD-START-001 FR-8)',
          sd_status_at_grant: sd.status,
        },
      });
      if (created) results.created += 1; else results.reused += 1;
    } catch (e) {
      results.failed.push({ sd_key: sd.sd_key, error: e.message });
    }
  }
  return results;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const supabase = createSupabaseServiceClient();

  console.log(`dispatch-auth grant backfill — mode: ${apply ? 'APPLY' : 'DRY-RUN (pass --apply to write)'}`);
  const claimables = await enumerateClaimables(supabase);
  console.log(`claimable belt surface (${CLAIMABLE_STATUSES.join('/')}): ${claimables.length} SD(s)`);

  const before = await verifyGrantCoverage(supabase, claimables);
  console.log(`already granted: ${before.granted.length} | un-granted: ${before.unGranted.length}`);

  if (!apply) {
    for (const sd of before.unGranted.slice(0, 25)) console.log(`  would grant: ${sd.sd_key} (${sd.status})`);
    if (before.unGranted.length > 25) console.log(`  … and ${before.unGranted.length - 25} more`);
    console.log(`\nPRE-FLIP VERIFICATION: ${before.unGranted.length} claimable SD(s) lack a grant — must be 0 before dispatch_auth_born_denied_enforce may be enabled.`);
    console.log('DRY-RUN complete — nothing written.');
    return;
  }

  const results = await applyGrants(supabase, before.unGranted);
  console.log(`grants written: ${results.created} created, ${results.reused} reused (idempotent), ${results.failed.length} failed`);
  for (const f of results.failed) console.log(`  FAILED ${f.sd_key}: ${f.error}`);

  const after = await verifyGrantCoverage(supabase, claimables);
  console.log(`\nPRE-FLIP VERIFICATION (post-apply): ${after.unGranted.length} claimable SD(s) lack a grant — must be 0 before the enforce flip.`);
  process.exitCode = after.unGranted.length === 0 && results.failed.length === 0 ? 0 : 1;
}

// Only run as a CLI (the exported helpers are unit-tested directly).
if (process.argv[1] && process.argv[1].endsWith('backfill-dispatch-auth-grants.mjs')) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
