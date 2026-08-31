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
import {
  releaseSdOracleHold, releaseQfOracleHold, isBoundedWaitElapsed, BOUNDED_WAIT_MS,
  extractConsultRowIdFromQfCondition,
} from '../lib/fleet/hold-writer.js';

dotenv.config();

export function parseReleaseOracleArgs(argv) {
  const out = { sdKey: null, qfId: null, consultRowId: null, releasedBy: null, force: false, reason: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sd') out.sdKey = argv[++i];
    else if (argv[i] === '--qf') out.qfId = argv[++i];
    else if (argv[i] === '--consult-row') out.consultRowId = argv[++i];
    else if (argv[i] === '--by') out.releasedBy = argv[++i];
    else if (argv[i] === '--force') out.force = true;
    else if (argv[i] === '--reason') out.reason = argv[++i];
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

/**
 * VALIDATION finding V-2: auto-resolve the consult row a QF's OWN oracle-hold marker cites
 * (embedded by batch-mint-sweep.mjs's writeQfOracleHold call) — an operator releasing a
 * batch-detected hold should not have to separately hunt down the id.
 */
async function lookupQfOwnConsultRowId(supabase, qfId) {
  const { data, error } = await supabase.from('quick_fixes').select('release_condition').eq('id', qfId).maybeSingle();
  if (error || !data) return null;
  return extractConsultRowIdFromQfCondition(data.release_condition);
}

export async function releaseOracleHold({ sdKey, qfId, consultRowId, releasedBy = 'system', force = false, reason = null, supabaseClient, nowMs = Date.now() }) {
  if (!sdKey && !qfId) throw new Error('one of --sd or --qf is required');
  // SECURITY finding S-4: --force with no audit trail. Mirrors scripts/release-chairman-gated-qf.js's
  // own refusal ("the release stamp is the audit trail") — a forced release must name WHY.
  if (force && (!reason || !String(reason).trim())) {
    throw new Error('--force requires --reason "<why this override is safe>" — the release stamp is the audit trail');
  }
  if (!consultRowId && qfId) {
    consultRowId = await lookupQfOwnConsultRowId(supabaseClient, qfId);
    if (consultRowId) console.log(`[release-oracle-hold] auto-resolved consult row ${consultRowId} from ${qfId}'s own oracle-hold marker`);
  }
  const consultRowCreatedAt = consultRowId ? await lookupConsultRowCreatedAt(supabaseClient, consultRowId) : null;

  // SECURITY findings S-2: the prior gate only fired when a consult row was BOTH cited AND
  // found — omitting --consult-row entirely, or citing a nonexistent id, released unconditionally
  // with no gate at all (the two cheaper bypasses of the D-5 fix). This is now a fail-CLOSED
  // default: release requires EITHER a cited, found, bounded-wait-elapsed consult row, OR an
  // explicit --force (a deliberate, logged human/Solomon override — never a silent default).
  if (!force) {
    if (!consultRowId) {
      return { merged: false, cause: 'no_consult_row_cited', error: 'no --consult-row cited — pass one, or --force for an explicit override' };
    }
    if (!consultRowCreatedAt) {
      return { merged: false, cause: 'consult_row_not_found', error: `consult row ${consultRowId} not found — pass a valid row, or --force for an explicit override` };
    }
    const elapsed = isBoundedWaitElapsed(consultRowCreatedAt, nowMs);
    console.log(`[release-oracle-hold] consult row ${consultRowId} created ${consultRowCreatedAt} — bounded wait elapsed: ${elapsed}`);
    if (!elapsed) {
      return {
        merged: false, cause: 'bounded_wait_not_elapsed',
        error: `consult row ${consultRowId} has not yet reached the ${BOUNDED_WAIT_MS / 60000}min bounded wait — pass --force to override with a cited verdict`,
      };
    }
  } else if (consultRowId) {
    console.log(`[release-oracle-hold] --force: consult row ${consultRowId} created ${consultRowCreatedAt || '(not found)'} — bound not enforced`);
  } else {
    console.error('[release-oracle-hold] WARNING: --force with no consult row cited — releasing with no elapsed-wait provenance at all');
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
    if (parsed.force) console.log(`[release-oracle-hold] --force reason: ${parsed.reason}`);
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
