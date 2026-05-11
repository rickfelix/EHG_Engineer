#!/usr/bin/env node
/**
 * SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001 FR-8 post-merge smoke runner.
 *
 * Verifies the FR-2 trigger fix is live in production DB:
 *  1. Spawns a probe claude_sessions row (synthetic session_id, status='active')
 *  2. Spawns a probe strategic_directives_v2 row (test SD with sd_key=probe-key)
 *  3. Simulates claim acquisition: UPDATE claude_sessions SET sd_key=probe-key
 *  4. Verifies SET branch fired: sd_v2.is_working_on=true
 *  5. Simulates cleanup_stale_sessions: UPDATE claude_sessions SET status='stale'
 *  6. Verifies CLEAR branch did NOT fire (FR-2 fix): sd_v2.is_working_on=true STILL
 *  7. Simulates explicit release: UPDATE claude_sessions SET status='released'
 *  8. Verifies CLEAR branch DID fire (irrevocable transition): sd_v2.is_working_on=false
 *  9. Cleanup: DELETE probe rows
 *
 * Emits audit marker:
 *   - [SD_CLAIM_COL_PRESERVATION_VERIFIED] on success
 *   - [SD_CLAIM_COL_PRESERVATION_DEGRADED]  on FR-2 not yet applied
 *   - [SD_CLAIM_COL_PRESERVATION_FAILED]    on unexpected error
 *
 * Pattern source: PR #3691 [LFA_GRACEFUL_DEGRADE_TO_ACCEPTED] graceful-degrade marker.
 *
 * Usage:
 *   node scripts/smoke/verify-claim-col-preservation.mjs
 *   (post-merge — invoked by .github/workflows/post-merge-cascade-fix-verify.yml)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PROBE_SESSION_ID = crypto.randomUUID();
const PROBE_SD_KEY = `SD-SMOKE-CASCADE-PROBE-${Date.now()}`;
const PROBE_SD_ID = crypto.randomUUID();

let probeSessionInserted = false;
let probeSdInserted = false;

async function setup() {
  // Insert probe SD with minimal valid shape (status=draft to skip handoff requirements)
  const { error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .insert({
      id: PROBE_SD_ID,
      sd_key: PROBE_SD_KEY,
      title: `[SMOKE] FR-8 probe ${PROBE_SESSION_ID.substring(0, 8)}`,
      description: 'Synthetic SD for FR-8 smoke runner verification of cascade-trigger fix. Auto-deleted in finally.',
      rationale: 'Smoke runner probe — verifies FR-2 trigger preserves claim cols on recoverable stale.',
      status: 'draft',
      sd_type: 'infrastructure',
      category: 'infrastructure',
      priority: 'low',
      target_application: 'EHG_Engineer',
      scope: 'Smoke probe — auto-cleaned',
      is_active: true
    });
  if (sdErr) throw new Error(`Probe SD insert failed: ${sdErr.message}`);
  probeSdInserted = true;

  // Insert probe claude_sessions row
  const { error: csErr } = await supabase
    .from('claude_sessions')
    .insert({
      session_id: PROBE_SESSION_ID,
      status: 'active',
      heartbeat_at: new Date().toISOString(),
      claimed_at: new Date().toISOString(),
      tty: 'smoke-probe',
      hostname: 'smoke-probe'
    });
  if (csErr) throw new Error(`Probe session insert failed: ${csErr.message}`);
  probeSessionInserted = true;
}

async function cleanup() {
  if (probeSessionInserted) {
    await supabase.from('claude_sessions').delete().eq('session_id', PROBE_SESSION_ID);
  }
  if (probeSdInserted) {
    await supabase.from('strategic_directives_v2').delete().eq('id', PROBE_SD_ID);
  }
}

async function verify() {
  // Step 3: simulate claim acquisition
  await supabase
    .from('claude_sessions')
    .update({ sd_key: PROBE_SD_KEY })
    .eq('session_id', PROBE_SESSION_ID);

  // Step 4: SET branch should have fired
  const { data: afterClaim } = await supabase
    .from('strategic_directives_v2')
    .select('is_working_on, active_session_id')
    .eq('id', PROBE_SD_ID)
    .single();

  if (!afterClaim?.is_working_on) {
    console.log('[SD_CLAIM_COL_PRESERVATION_DEGRADED] SET branch did not fire on claim acquisition');
    console.log(`  expected is_working_on=true, got ${afterClaim?.is_working_on}`);
    console.log('  This indicates the FR-2 migration broke the SET branch (PR-B regression — file follow-up SD)');
    return 'DEGRADED';
  }

  // Step 5: simulate cleanup_stale_sessions stale-flip
  await supabase
    .from('claude_sessions')
    .update({ status: 'stale', stale_reason: 'HEARTBEAT_TIMEOUT', stale_at: new Date().toISOString() })
    .eq('session_id', PROBE_SESSION_ID);

  // Step 6: CLEAR branch should NOT have fired (FR-2 fix)
  const { data: afterStale } = await supabase
    .from('strategic_directives_v2')
    .select('is_working_on, active_session_id')
    .eq('id', PROBE_SD_ID)
    .single();

  if (!afterStale?.is_working_on || afterStale?.active_session_id !== PROBE_SESSION_ID) {
    console.log('[SD_CLAIM_COL_PRESERVATION_DEGRADED] FR-2 trigger fix not yet applied to live DB');
    console.log(`  Stale-flip cleared claim cols: is_working_on=${afterStale?.is_working_on}, active_session_id=${afterStale?.active_session_id}`);
    console.log('  Expected: is_working_on=true, active_session_id=' + PROBE_SESSION_ID);
    console.log('  Recovery: re-apply migration database/migrations/20260511_sync_is_working_on_preserve_recoverable_stale.sql via Supabase Dashboard');
    console.log('  Then verify: SELECT prosrc FROM pg_proc WHERE proname = sync_is_working_on_with_session;');
    return 'DEGRADED';
  }

  // Step 7: simulate explicit release (irrevocable transition)
  await supabase
    .from('claude_sessions')
    .update({ status: 'released' })
    .eq('session_id', PROBE_SESSION_ID);

  // Step 8: CLEAR branch SHOULD have fired (irrevocable)
  const { data: afterRelease } = await supabase
    .from('strategic_directives_v2')
    .select('is_working_on, active_session_id')
    .eq('id', PROBE_SD_ID)
    .single();

  if (afterRelease?.is_working_on || afterRelease?.active_session_id !== null) {
    console.log('[SD_CLAIM_COL_PRESERVATION_FAILED] Irrevocable release did not fire CLEAR branch');
    console.log(`  is_working_on=${afterRelease?.is_working_on} (expected false), active_session_id=${afterRelease?.active_session_id} (expected null)`);
    console.log('  This indicates FR-2 migration narrowed too aggressively — irrevocable transitions should still clear');
    return 'FAILED';
  }

  console.log('[SD_CLAIM_COL_PRESERVATION_VERIFIED] FR-2 trigger fix is live + correct:');
  console.log('  ✓ SET branch fires on claim acquisition');
  console.log('  ✓ CLEAR branch SKIPS on recoverable stale (claim preserved)');
  console.log('  ✓ CLEAR branch FIRES on irrevocable release (claim cleared)');
  console.log(`  Probe SD key: ${PROBE_SD_KEY}, session: ${PROBE_SESSION_ID.substring(0, 8)}`);
  return 'VERIFIED';
}

async function main() {
  try {
    console.log(`[SMOKE] Cascade-trigger fix verification starting (probe sd_key=${PROBE_SD_KEY})`);
    await setup();
    const result = await verify();
    if (result === 'VERIFIED') {
      process.exitCode = 0;
    } else {
      process.exitCode = 1;
    }
  } catch (err) {
    console.log(`[SD_CLAIM_COL_PRESERVATION_FAILED] Smoke runner unexpected error: ${err.message}`);
    console.log(`  Stack: ${err.stack?.split('\n').slice(0, 3).join(' | ')}`);
    process.exitCode = 2;
  } finally {
    try {
      await cleanup();
      console.log('[SMOKE] Probe rows cleaned up');
    } catch (cleanupErr) {
      console.log(`[SMOKE] Cleanup failure (non-fatal): ${cleanupErr.message}`);
    }
  }
}

main();
