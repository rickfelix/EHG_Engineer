#!/usr/bin/env node
/**
 * SD-LEO-INFRA-WORKER-REVIVAL-GOLIVE-READINESS-001-D (CHILD C / FR-3)
 *
 * Single-purpose operator runbook step: supersede EXPIRED-but-pending
 * worker_spawn_requests (flip status pending -> expired) so the
 * partial-unique-index `idx_wsr_unique_pending_callsign` (UNIQUE per callsign
 * WHERE status='pending') stops blocking a fresh revival re-file.
 *
 * This is a thin, idempotent wrapper around the EXISTING canonical reaper
 * `reapExpiredPendingRequests` (scripts/coordinator-revive.cjs, shipped by
 * SD-REFILL-00H0UNO7) — it adds NO new DB logic, only an ops entrypoint the
 * runbook can call directly. There is NO always-on DB-side sweeper (per the
 * SD-LEO-INFRA-WORKER-EXTERNAL-REVIVAL-001 contract); this is operator-run.
 *
 * Idempotent: the reaper filters status='pending' AND expires_at<=now(), so a
 * live pending row (expires_at in the future) is never touched, and a second
 * run reaps 0 rows. Fail-soft: a reaper warning never throws here.
 *
 * Usage:  node scripts/fleet/supersede-expired-spawn-requests.mjs
 *         npm run fleet:supersede-expired-spawns
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { reapExpiredPendingRequests } = require('../coordinator-revive.cjs');
const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');

async function main() {
  const sb = createSupabaseServiceClient();
  const before = await sb
    .from('worker_spawn_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .lte('expires_at', new Date().toISOString());
  const candidates = before.count ?? 0;
  const reaped = await reapExpiredPendingRequests(sb);
  const n = Array.isArray(reaped) ? reaped.length : (reaped ?? 0);
  console.log(`[supersede-expired-spawns] expired-pending candidates: ${candidates}; superseded: ${n} (idempotent — a re-run supersedes 0).`);
}

main().catch((e) => {
  console.error(`[supersede-expired-spawns] failed: ${e.message}`);
  process.exit(1);
});
