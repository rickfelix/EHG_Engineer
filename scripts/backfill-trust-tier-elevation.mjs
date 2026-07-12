#!/usr/bin/env node
/**
 * Backfill applications.metadata.trust_tier_elevation provenance for the venture repos
 * that were hand-elevated to trust_tier='trusted' BEFORE the born-trusted policy shipped.
 * SD-LEO-INFRA-VENTURE-REPO-TRUST-001 (FR-4).
 *
 * These rows are ALREADY trust_tier='trusted' (the hand elevations that motivated this SD);
 * the backfill normalizes their audit metadata to the canonical policy shape produced by
 * resolveTrustElevation(), so future audits read one schema. It does NOT flip any tier.
 *
 * SAFETY:
 *  - Targets are ENUMERATED BY ID, never a heuristic sweep (a `WHERE trust_tier='external'
 *    AND kind='venture'` sweep would misclassify imported venture repos as fleet-created).
 *  - --dry-run is the DEFAULT. Writing requires the explicit --apply flag.
 *  - Idempotent: a row that already carries metadata.trust_tier_elevation is a no-op.
 *  - Fail-closed: a target whose venture lacks chairman ratification (resolveTrustElevation
 *    returns elevate=false) is SKIPPED, not fabricated — we never invent provenance.
 *
 * Usage:
 *   node scripts/backfill-trust-tier-elevation.mjs            # dry-run (default)
 *   node scripts/backfill-trust-tier-elevation.mjs --apply    # write
 */
import { pathToFileURL } from 'url';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { resolveTrustElevation } from '../lib/eva/bridge/trust-elevation.js';

// Enumerated targets — the two repos hand-elevated before this policy (validation-agent
// 2026-07-12). MarketLens is trusted-but-unattributed; ApexNiche already carries canonical
// provenance (will no-op).
export const BACKFILL_TARGET_IDS = [
  '6823cd37-552e-486d-99f3-98db739c9095', // MarketLens
  '3c8efc56-ab13-49a6-bce5-2072d0c15ee7', // ApexNiche AI
];

/**
 * Compute the backfill plan for one already-fetched applications row. Pure — no writes.
 * @param {{id:string,name:string,trust_tier:string,venture_id:string,metadata:object}} row
 * @param {{elevate:boolean, provenance?:object}} decision - resolveTrustElevation output
 * @param {string} stampedAt
 * @returns {{action:'write'|'skip', reason:string, nextMetadata?:object}}
 */
export function planBackfillForRow(row, decision, stampedAt) {
  if (!row) return { action: 'skip', reason: 'row_not_found' };
  if (row.metadata && row.metadata.trust_tier_elevation) {
    return { action: 'skip', reason: 'already_has_provenance' };
  }
  if (!decision || !decision.elevate) {
    return { action: 'skip', reason: `not_ratified (${decision ? decision.reason : 'no_decision'})` };
  }
  const provenance = { at: stampedAt, ...decision.provenance, backfilled: true };
  const nextMetadata = { ...(row.metadata || {}), trust_tier_elevation: provenance };
  return { action: 'write', reason: 'normalize_provenance', nextMetadata };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const mode = apply ? 'APPLY' : 'DRY-RUN (default — pass --apply to write)';
  console.log(`\nbackfill-trust-tier-elevation — ${mode}`);
  console.log('='.repeat(60));

  const sb = createSupabaseServiceClient();
  const stampedAt = new Date().toISOString();
  let writes = 0;
  let skips = 0;

  for (const id of BACKFILL_TARGET_IDS) {
    const { data: row, error } = await sb
      .from('applications')
      .select('id, name, trust_tier, venture_id, metadata')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.log(`  ! ${id} — fetch error: ${error.message} (skipped)`);
      skips++;
      continue;
    }
    if (!row) {
      console.log(`  ! ${id} — not found (skipped)`);
      skips++;
      continue;
    }

    // Only compute a ratification decision when the row actually needs provenance —
    // this avoids a needless query for the already-canonical row.
    let decision = { elevate: false, reason: 'not_evaluated' };
    if (!(row.metadata && row.metadata.trust_tier_elevation)) {
      decision = await resolveTrustElevation({ ventureId: row.venture_id, repoWasMinted: true, supabase: sb });
    }
    const plan = planBackfillForRow(row, decision, stampedAt);

    if (plan.action === 'skip') {
      console.log(`  · ${row.name} (${id}) — skip: ${plan.reason}`);
      skips++;
      continue;
    }

    console.log(`  → ${row.name} (${id}) — write trust_tier_elevation:`);
    console.log(`      basis: ${plan.nextMetadata.trust_tier_elevation.basis}`);
    if (apply) {
      // Guard on the row STILL lacking provenance is implicit (we re-read is not done here,
      // but the metadata merge is idempotent and a second run no-ops via already_has_provenance).
      const { error: upErr } = await sb
        .from('applications')
        .update({ metadata: plan.nextMetadata })
        .eq('id', id);
      if (upErr) {
        console.log(`      ! write failed: ${upErr.message}`);
        skips++;
        continue;
      }
      console.log('      ✓ written');
      writes++;
    } else {
      console.log('      (dry-run — not written)');
      writes++;
    }
  }

  console.log('='.repeat(60));
  console.log(`  ${apply ? 'wrote' : 'would write'}: ${writes} | skipped: ${skips}`);
  if (!apply && writes > 0) console.log('  Re-run with --apply to persist.');
}

// Only run main() when invoked directly (guard keeps the pure exports import-safe for tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
