#!/usr/bin/env node
/**
 * Release an oracle_read_pending hold (SD or QF) — SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 (FR-5).
 *
 * Citation-based release: the elapsed wait is recomputed from the consult row's own created_at
 * (looked up here from session_coordination), never from a self-supplied timestamp — so a third
 * party can recompute "was the bounded wait actually elapsed" from stored rows alone.
 *
 * Usage:
 *   node scripts/release-oracle-hold.js --sd SD-KEY --consult-row <uuid> --by solomon
 *   node scripts/release-oracle-hold.js --qf QF-ID
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { releaseSdOracleHold, releaseQfOracleHold, isBoundedWaitElapsed, BOUNDED_WAIT_MS } from '../lib/fleet/hold-writer.js';

dotenv.config();

export function parseReleaseOracleArgs(argv) {
  const out = { sdKey: null, qfId: null, consultRowId: null, releasedBy: null, force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sd') out.sdKey = argv[++i];
    else if (argv[i] === '--qf') out.qfId = argv[++i];
    else if (argv[i] === '--consult-row') out.consultRowId = argv[++i];
    else if (argv[i] === '--by') out.releasedBy = argv[++i];
    else if (argv[i] === '--force') out.force = true;
  }
  return out;
}

async function lookupConsultRowCreatedAt(supabase, consultRowId) {
  if (!consultRowId) return null;
  const { data, error } = await supabase
    .from('session_coordination')
    .select('created_at')
    .eq('id', consultRowId)
    .maybeSingle();
  if (error || !data) return null;
  return data.created_at;
}

export async function releaseOracleHold({ sdKey, qfId, consultRowId, releasedBy = 'system', force = false, supabaseClient, nowMs = Date.now() }) {
  if (!sdKey && !qfId) throw new Error('one of --sd or --qf is required');
  const consultRowCreatedAt = await lookupConsultRowCreatedAt(supabaseClient, consultRowId);
  if (consultRowId && !consultRowCreatedAt) {
    console.error(`[release-oracle-hold] WARNING: consult row ${consultRowId} not found — releasing without elapsed-wait provenance`);
  } else if (consultRowCreatedAt) {
    const elapsed = isBoundedWaitElapsed(consultRowCreatedAt, nowMs);
    console.log(`[release-oracle-hold] consult row ${consultRowId} created ${consultRowCreatedAt} — bounded wait elapsed: ${elapsed}`);
    // TESTING finding D-5: the bounded wait was computed and printed but never enforced — a
    // release at t=1min logged "elapsed: false" and released anyway. Now a genuine GATE: a cited
    // consult row that has NOT yet cleared the bounded wait refuses the release unless --force is
    // passed (the explicit human/Solomon override for a verdict that arrived early).
    if (!elapsed && !force) {
      return {
        merged: false, cause: 'bounded_wait_not_elapsed',
        error: `consult row ${consultRowId} has not yet reached the ${BOUNDED_WAIT_MS / 60000}min bounded wait — pass --force to override with a cited verdict`,
      };
    }
  }

  if (sdKey) {
    // releaseSdOracleHold goes through safe-metadata-merge.mjs's own raw-pg connection, independent
    // of the supabase-js client used to look up the consult row above.
    return releaseSdOracleHold(sdKey, { consultRowId, consultRowCreatedAt, releasedBy });
  }
  return releaseQfOracleHold(supabaseClient, qfId);
}

async function main() {
  const parsed = parseReleaseOracleArgs(process.argv.slice(2));
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  try {
    const result = await releaseOracleHold({ ...parsed, releasedBy: parsed.releasedBy || process.env.CLAUDE_SESSION_ID || 'system', supabaseClient: supabase, nowMs: Date.now() });
    if (!result.merged) {
      console.error(`[release-oracle-hold] FAILED (${result.cause}): ${result.error || 'no rows matched'}`);
      process.exit(1);
    }
    console.log(`[release-oracle-hold] released (${result.cause})`);
  } catch (e) {
    console.error('[release-oracle-hold] ERROR:', e.message);
    process.exit(1);
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
