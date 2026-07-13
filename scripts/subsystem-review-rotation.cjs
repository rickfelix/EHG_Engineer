#!/usr/bin/env node
/**
 * Weekly subsystem-review rotation tick — SD-LEO-INFRA-CODIFY-SUBSYSTEM-REVIEW-001.
 *
 *   1. Due-gate (~6 days since the last review-supply post; --force overrides).
 *   2. Derive the rotation table from completed review-SD history (STATELESS:
 *      SDs carrying metadata.subsystem_review are the registry — no new table).
 *   3. Pick the next-due subsystem (never-reviewed first).
 *   4. Post ONE coordinator-inbox review-supply row naming the subsystem and
 *      the /review-subsystem command. NEVER auto-creates SDs.
 *
 * Scheduling: armed weekly by the coordinator (STANDARD_LOOPS, Monday 09:00).
 * Ad-hoc: npm run review:rotation [-- --force | --dry-run]
 * ALWAYS exits 0 on operational paths (supply ticks never break the host loop).
 */
'use strict';
require('dotenv').config();
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const {
  deriveRotation,
  pickNextDue,
  isRotationDue,
  readReviewHistory,
  readLastSupplyPost,
  REVIEW_SUPPLY_KIND,
} = require('../lib/coordinator/subsystem-review-rotation.cjs');

async function resolveCoordinatorId(sb) {
  try {
    const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');
    return await getActiveCoordinatorId(sb);
  } catch { return null; }
}

async function main() {
  const force = process.argv.includes('--force');
  const dryRun = process.argv.includes('--dry-run');
  const sb = createSupabaseServiceClient();

  const lastPost = await readLastSupplyPost(sb);
  if (!force && !dryRun && !isRotationDue(lastPost, Date.now())) {
    console.log(`[review-rotation] not due (last supply post ${lastPost}) — no-op`);
    return;
  }

  const history = await readReviewHistory(sb);
  const rotation = deriveRotation(history);
  const pick = pickNextDue(rotation);

  console.log('[review-rotation] rotation table:');
  for (const r of rotation) {
    console.log(`   ${r.subsystem.padEnd(16)} last_reviewed=${r.last_reviewed || 'never'}  reviews=${r.reviews}`);
  }
  if (!pick) { console.log('[review-rotation] empty rotation — no-op'); return; }
  console.log(`[review-rotation] next due: ${pick.subsystem} (last_reviewed=${pick.last_reviewed || 'never'})`);

  if (dryRun) { console.log('[review-rotation] --dry-run: not posting'); return; }

  try {
    const coordinatorId = await resolveCoordinatorId(sb);
    const { error } = await sb.from('session_coordination').insert({
      target_session: coordinatorId, // null => broadcast, still visible in inbox scans
      message_type: 'INFO',
      subject: `[REVIEW-SUPPLY] Weekly subsystem review due: ${pick.subsystem}`,
      body: `The subsystem review rotation picked '${pick.subsystem}' (last reviewed: ${pick.last_reviewed || 'never'}).\n` +
        `Assign an idle worker to run: /review-subsystem ${pick.subsystem}\n` +
        'The skill encodes the recipe (live ground-truth inventory -> code cross-reference -> hand-verified, ' +
        'evidence-cited SD filings -> coordinator/Adam notification -> chairman digest). ' +
        'Review SDs must stamp metadata.subsystem_review so the rotation advances.',
      payload: { kind: REVIEW_SUPPLY_KIND, subsystem: pick.subsystem, last_reviewed: pick.last_reviewed },
      sender_type: 'system',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (error) console.warn(`[review-rotation] supply post failed (non-fatal): ${error.message}`);
    else console.log('[review-rotation] review-supply row posted');
  } catch (e) { console.warn(`[review-rotation] supply post threw (non-fatal): ${e.message}`); }
}

if (require.main === module) {
  // Graceful bounded exit: avoid the Windows UV_HANDLE_CLOSING abort after undici
  // queries (same primitive as row-growth-snapshot.cjs).
  main()
    .then(async () => {
      // SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-3): stamp on every successful tick,
      // regardless of which internal early-return branch main() took (not-due, empty
      // rotation, or --dry-run) — reflects loop liveness.
      try {
        const { stampLastFired } = await import('../lib/periodic-liveness/stamp-last-fired.js');
        await stampLastFired(createSupabaseServiceClient(), 'standard_loop:review-rotation');
      } catch (err) {
        console.warn(`[review-rotation] stampLastFired failed (non-fatal): ${err.message}`);
      }
    })
    .catch((e) => { console.warn(`[review-rotation] unexpected error (non-fatal): ${e.message}`); })
    .finally(async () => {
      try {
        const { armCliTeardown } = await import('../lib/cli-graceful-exit.js');
        await armCliTeardown(0);
      } catch { process.exitCode = 0; }
    });
}

module.exports = { main };
