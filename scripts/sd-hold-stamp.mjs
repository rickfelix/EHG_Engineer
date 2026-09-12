#!/usr/bin/env node
/**
 * scripts/sd-hold-stamp.mjs — QF-20260912-219.
 *
 * lib/oversight/coordinator-health-sharpenings.mjs's STALE_HOLD_UNREVIEWED detector reads
 * metadata.<hold_key>_review_at for every HOLD_KEYS entry and, absent it, treats a hold as an
 * ageless mute (falling back to a fixed ceiling). The sanctioned writers that exist
 * (setHold()/releaseHold() for requires_human_action, sd-park.js for not_before,
 * exec-boundary-hold-writer.js for exec_boundary_hold) either don't write a review date at
 * all or write one under a different key name -- so needs_coordinator_review and lead_blocker
 * in particular have NO review_at writer anywhere, and the coordinator cannot silence a
 * legitimate, dated hold without a hand edit to the DB (which it correctly declines to do).
 *
 * This CLI stamps exactly the field the detector reads -- <key>_review_at -- for the three
 * hold keys actually exercised by a live coordinator decision (requires_human_action,
 * needs_coordinator_review, lead_blocker), plus a reason and a set_by/set_at provenance pair,
 * via the SAME atomic per-key JSONB merge every other sanctioned writer in this file uses
 * (mergeMetadataKeys / releaseHold / clearCoordinatorReview) -- never a read-spread-write of
 * the whole metadata blob.
 *
 * Usage:
 *   node scripts/sd-hold-stamp.mjs <SD-KEY> --key <requires_human_action|needs_coordinator_review|lead_blocker> \
 *     --reason "<text>" --review-at <ISO-date> [--actor <role:session>]
 *   node scripts/sd-hold-stamp.mjs <SD-KEY> --key <requires_human_action|needs_coordinator_review> --clear --reason "<text>" [--actor <role:session>]
 *
 * Deliberately NOT covered (out of scope for this QF -- see its PR for why): not_before,
 * exec_boundary_hold, and release_request already have (or are documented as having) their
 * own review-date writers under a different key-name convention; unifying all six onto one
 * CLI is a separate, larger follow-up. --clear is only wired for requires_human_action and
 * needs_coordinator_review, the two keys the coordinator's first-run decisions actually clear.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { releaseHold } from '../lib/fleet/claim-eligibility.cjs';
import { mergeMetadataKeys } from '../lib/coordinator/safe-metadata-merge.mjs';
import { clearCoordinatorReview } from '../lib/coordinator/clear-coordinator-review.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

const SUPPORTED_KEYS = ['requires_human_action', 'needs_coordinator_review', 'lead_blocker'];
// requires_human_action already has an established by/at convention (setHold/releaseHold);
// every other key gets the set_by/set_at naming the QF itself specifies, so this CLI never
// writes a second, competing provenance pair onto a key that already has one.
const PROVENANCE_FIELD_NAMES = {
  requires_human_action: { by: 'requires_human_action_by', at: 'requires_human_action_at' },
};

export function parseArgs(argv) {
  const sdKey = argv[0];
  const opts = { clear: false };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--clear') opts.clear = true;
    else if (a === '--key') opts.key = argv[++i];
    else if (a === '--reason') opts.reason = argv[++i];
    else if (a === '--review-at') opts.reviewAt = argv[++i];
    else if (a === '--actor') opts.actor = argv[++i];
  }
  return { sdKey, opts };
}

async function main() {
  const { sdKey, opts } = parseArgs(process.argv.slice(2));
  if (!sdKey || !opts.key) {
    console.error(
      'Usage: node scripts/sd-hold-stamp.mjs <SD-KEY> --key <' + SUPPORTED_KEYS.join('|') + '> ' +
      '--reason "<text>" [--review-at <ISO-date>] [--clear] [--actor <role:session>]'
    );
    process.exit(1);
  }
  if (!SUPPORTED_KEYS.includes(opts.key)) {
    console.error(`❌ --key must be one of: ${SUPPORTED_KEYS.join(', ')} (see this script's header for why the other three HOLD_KEYS are deliberately not wired here yet).`);
    process.exit(1);
  }
  const reason = typeof opts.reason === 'string' ? opts.reason.trim() : '';
  if (!reason) {
    console.error('❌ --reason is required (a stamp must say why, same discipline setHold/releaseHold already enforce).');
    process.exit(1);
  }
  const actor = (typeof opts.actor === 'string' && opts.actor.trim()) || process.env.CLAUDE_SESSION_ID || 'unknown';
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  if (opts.clear) {
    if (opts.key === 'requires_human_action') {
      const result = await releaseHold(supabase, sdKey, { releaser: actor, reason });
      if (!result.released) { console.error(`❌ ${sdKey}: not cleared (${result.error})`); process.exit(1); }
      console.log(`✅ ${sdKey}: requires_human_action released (${actor}: ${reason}).`);
      return;
    }
    if (opts.key === 'needs_coordinator_review') {
      const result = await clearCoordinatorReview(sdKey);
      if (!result.cleared) { console.error(`❌ ${sdKey}: not cleared (${result.error})`); process.exit(1); }
      console.log(`✅ ${sdKey}: needs_coordinator_review cleared (${actor}: ${reason}).`);
      return;
    }
    console.error(`❌ --clear is not wired for --key ${opts.key} yet (only requires_human_action and needs_coordinator_review).`);
    process.exit(1);
  }

  if (!opts.reviewAt || Number.isNaN(Date.parse(opts.reviewAt))) {
    console.error('❌ --review-at <ISO-date> is required and must parse (this is the exact field the detector reads).');
    process.exit(1);
  }

  const prov = PROVENANCE_FIELD_NAMES[opts.key] || { by: `${opts.key}_set_by`, at: `${opts.key}_set_at` };
  const { data: row, error: readError } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', sdKey)
    .maybeSingle();
  if (readError || !row) {
    console.error(`❌ ${sdKey}: could not read current metadata (${readError?.message || 'no matching row'}).`);
    process.exit(1);
  }
  const md = row.metadata || {};
  if (!md[opts.key]) {
    console.error(`❌ ${sdKey}: metadata.${opts.key} is not currently active -- this CLI stamps review metadata onto an EXISTING hold, it does not create one.`);
    process.exit(1);
  }
  const nowIso = new Date().toISOString();
  const patch = {
    [`${opts.key}_reason`]: reason,
    [`${opts.key}_review_at`]: opts.reviewAt,
    // Preserve an existing set_by/set_at rather than overwrite who originally set the hold.
    ...(md[prov.by] ? {} : { [prov.by]: actor }),
    ...(md[prov.at] ? {} : { [prov.at]: nowIso }),
  };
  const merge = await mergeMetadataKeys(sdKey, patch, { writer: 'sd-hold-stamp', reason });
  if (!merge.merged) {
    console.error(`❌ ${sdKey}: stamp failed (${merge.error}).`);
    process.exit(1);
  }
  console.log(`✅ ${sdKey}: ${opts.key}_review_at=${opts.reviewAt} reason="${reason}" (${actor}).`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('❌ sd-hold-stamp.mjs threw unexpectedly:', err?.message || err);
    process.exit(1);
  });
}
