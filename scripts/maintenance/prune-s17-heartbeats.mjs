#!/usr/bin/env node
/**
 * Prune expired Stage 17 heartbeats.
 *
 * Deletes `s17_heartbeat` venture_artifacts whose `metadata.ttlExpiresAt`
 * is in the past. The heartbeat-writer (ARM E) embeds the TTL on every
 * write, so this cron-style script is the only counterparty needed —
 * no DB-side trigger, no pg_cron job, no schema migration.
 *
 * SD-LEO-INFRA-STAGE-ARCHETYPE-GENERATION-001 ARM F (TR-2)
 *
 * Usage:
 *   node scripts/maintenance/prune-s17-heartbeats.mjs           # prune
 *   node scripts/maintenance/prune-s17-heartbeats.mjs --dry-run # report only
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Delete expired s17_heartbeat rows.
 *
 * @param {object} supabase Supabase client
 * @param {object} [options]
 * @param {boolean} [options.dryRun=false] If true, count without deleting
 * @param {() => Date} [options.now=() => new Date()] Injection seam for tests
 * @returns {Promise<{pruned:number, ids:string[]}>}
 */
export async function pruneExpiredHeartbeats(supabase, options = {}) {
  const dryRun = options.dryRun ?? false;
  const now = (options.now ?? (() => new Date()))().toISOString();

  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('id, metadata')
    .eq('artifact_type', 's17_heartbeat')
    .lt('metadata->>ttlExpiresAt', now);

  if (error) throw error;
  if (!data || data.length === 0) return { pruned: 0, ids: [] };

  const ids = data.map((r) => r.id);

  if (dryRun) return { pruned: 0, ids, dryRun: true };

  const { error: delError } = await supabase
    .from('venture_artifacts')
    .delete()
    .in('id', ids);
  if (delError) throw delError;

  return { pruned: ids.length, ids };
}

// CLI entry — only when invoked directly, not when imported by tests.
const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('prune-s17-heartbeats.mjs');

if (isDirectInvocation) {
  const dryRun = process.argv.includes('--dry-run');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[prune-s17-heartbeats] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }
  const supabase = createClient(url, key);
  pruneExpiredHeartbeats(supabase, { dryRun })
    .then((r) => {
      const verb = r.dryRun ? 'would prune' : 'pruned';
      console.log(`[prune-s17-heartbeats] ${verb} ${r.dryRun ? r.ids.length : r.pruned} expired heartbeat(s)`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[prune-s17-heartbeats]', err.message);
      process.exit(1);
    });
}
