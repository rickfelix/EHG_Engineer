#!/usr/bin/env node
/**
 * canary-trigger-sweep — deterministic coordinator-cadence trigger for Adam canary-support.
 * SD-LEO-INFRA-CANARY-SUPPORT-TRIGGER-RELIABILITY-001 (FR-1/FR-2/FR-3).
 *
 *   node scripts/canary-trigger-sweep.mjs              # enqueue canary_request for eligible SDs (idempotent)
 *   node scripts/canary-trigger-sweep.mjs --coverage   # ALSO list un-actioned (pending) canary requests
 *   node scripts/canary-trigger-sweep.mjs --dry-run     # report eligible SDs, enqueue nothing
 *
 * ADVISORY (FR-4): enqueue is fire-and-forget (never throws/blocks). This sweep is augmentation;
 * the coordinator stays 100% accountable and the fleet runs fully without Adam.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  isCanaryEligible,
  enqueueCanaryRequest,
  findUnactionedCanaryRequests,
  CANARY_ELIGIBLE_PHASES,
} = require('../lib/coordinator/canary-trigger.cjs');

const DRY_RUN = process.argv.includes('--dry-run');
const COVERAGE = process.argv.includes('--coverage');
const STALE_MS = 6 * 60 * 60 * 1000; // 6h: a canary request un-actioned this long is "coverage-pending"

// The canary_request is a trigger->coordinator message. Target the live coordinator
// session_id when resolvable, else the documented worker->coordinator sentinel
// 'broadcast-coordinator' (valid_target CHECK accepts it; re-targeted by the next
// /coordinator start). NEVER null — null violates the valid_target constraint.
async function resolveCoordinatorTarget(supabase) {
  try {
    const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');
    const id = await getActiveCoordinatorId(supabase);
    return id || 'broadcast-coordinator';
  } catch { return 'broadcast-coordinator'; }
}

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);

  console.log(`=== canary-trigger sweep (${DRY_RUN ? 'DRY-RUN' : 'ENQUEUE'}${COVERAGE ? ' +coverage' : ''}) ===`);

  // Eligible candidates: active (non-terminal) SDs that have reached EXEC (pre-merge window).
  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, sd_type, status, current_phase')
    .in('status', ['in_progress', 'pending_approval'])
    .in('current_phase', [...CANARY_ELIGIBLE_PHASES])
    .limit(200);
  if (error) { console.error('[canary-sweep] candidate query failed:', error.message); process.exit(0); } // FR-4: never hard-fail

  const eligible = (sds || []).filter(isCanaryEligible);
  const target = await resolveCoordinatorTarget(supabase);

  let enqueued = 0, skipped = 0, failed = 0;
  for (const sd of eligible) {
    if (DRY_RUN) { console.log(`   would request: ${sd.sd_key} (${sd.current_phase})`); skipped++; continue; }
    const r = await enqueueCanaryRequest(supabase, sd, { nowIso, senderSession: 'canary-trigger-sweep', targetSession: target });
    if (r.inserted) { enqueued++; console.log(`   ✓ enqueued canary_request: ${sd.sd_key}`); }
    else if (r.skipped) skipped++;
    else { failed++; console.warn(`   ⚠ enqueue failed (non-blocking): ${sd.sd_key} — ${r.error}`); }
  }
  console.log(`\n   eligible: ${eligible.length} | enqueued: ${enqueued} | skipped(dup/dry): ${skipped} | failed: ${failed}`);

  if (COVERAGE) {
    const pending = await findUnactionedCanaryRequests(supabase, { olderThanMs: STALE_MS, nowMs });
    console.log(`\n--- coverage: ${pending.length} un-actioned canary request(s) older than ${STALE_MS / 3.6e6}h ---`);
    for (const p of pending) {
      const ageH = p.age_ms != null ? (p.age_ms / 3.6e6).toFixed(1) + 'h' : '?';
      console.log(`   PENDING ${p.sd_id || '(no sd_id)'} — age ${ageH} (id ${p.id})`);
    }
    if (!pending.length) console.log('   (none — no missed canary requests)');
  }
}

main().catch((e) => { console.error('[canary-sweep] unexpected (non-blocking):', e.message); process.exit(0); });
