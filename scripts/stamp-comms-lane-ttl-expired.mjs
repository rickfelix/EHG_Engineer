#!/usr/bin/env node
/**
 * FR-2 (SD-LEO-INFRA-COMMS-LANE-TTLS-001) — stamp expired-unread session_coordination rows.
 *
 * Mirrors scripts/drain-dead-letter-coordination.mjs's own wiring pattern exactly: paginated
 * fetch (ordered, past the PostgREST 1000-row cap), pure classification via
 * lib/coordination/lane-contract.cjs's isExpiredUnread/buildExpiredUnreadStampPatch, DRY-RUN
 * by default, --apply to actually write. This is the caller lib/coordination/lane-contract.cjs's
 * FR-2 functions were built for -- without it, the marker is computed but never persisted, and
 * FR-2's "durable dead-letter-state source of record" claim is dead by construction (TESTING
 * evidence a2448854, EXEC-TO-PLAN review).
 *
 * SCHEDULED by .github/workflows/comms-lane-ttl-stamp-cron.yml (hourly, dry-run by default,
 * gated behind the COMMS_LANE_TTL_STAMP_APPLY repo variable) -- a VALIDATION sub-agent at
 * PLAN_VERIFICATION (evidence f9ce429f) found an earlier version of this file existed but was
 * invoked by nothing, reproducing the exact "instrument nobody invokes" defect class this SD's
 * own sibling (SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001) already names. See
 * tests/static-guards/comms-lane-ttl-stamp-scheduled-safely.test.js for the durable pin.
 *
 * PAYLOAD-ONLY, never writes acknowledged_at/read_at (see buildExpiredUnreadStampPatch).
 *
 * Usage: node scripts/stamp-comms-lane-ttl-expired.mjs [--apply]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isExpiredUnread, buildExpiredUnreadStampPatch, resolveLaneForKind } = require('../lib/coordination/lane-contract.cjs');

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PAGE = 1000;

/** Paginated fetch, ordered by id -- unordered .range() pagination can silently drop rows
 *  across page boundaries under concurrent writes (see drain-dead-letter-coordination.mjs). */
async function fetchAllUnread() {
  let out = [], from = 0;
  for (;;) {
    const { data, error } = await db
      .from('session_coordination')
      .select('id, payload, created_at, read_at')
      .is('read_at', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`session_coordination: ${error.message}`);
    out = out.concat(data || []);
    if (!data || data.length < PAGE) return out;
    from += PAGE;
  }
}

async function main() {
  const rows = await fetchAllUnread();
  const nowMs = Date.now();

  // Already-stamped rows are idempotent no-ops (buildExpiredUnreadStampPatch would just
  // overwrite the same marker with a fresh timestamp) -- skip them to avoid pointless writes.
  const candidates = rows.filter((r) => isExpiredUnread(r, { nowMs }) && !(r.payload && r.payload.dead_letter_ttl));

  const byLane = {};
  for (const r of candidates) {
    const lane = resolveLaneForKind(r.payload && r.payload.kind);
    byLane[lane] = (byLane[lane] || 0) + 1;
  }
  console.log(`unread=${rows.length} newly-expired=${candidates.length}`);
  console.log('by lane:', JSON.stringify(byLane));

  if (!APPLY) {
    console.log('\nDRY-RUN (no writes). Re-run with --apply to execute.');
    return;
  }

  let stamped = 0;
  for (const row of candidates) {
    const patch = buildExpiredUnreadStampPatch(row, { nowMs });
    const { error } = await db.from('session_coordination').update(patch).eq('id', row.id);
    if (error) { console.log(`  stamp ERR ${row.id}: ${error.message}`); continue; }
    stamped++;
  }
  console.log(`\nAPPLIED: stamped=${stamped}`);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
