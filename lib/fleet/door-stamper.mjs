// Door stamper: persists classifyDoor verdicts onto SD metadata.
// SD-LEO-INFRA-TIERED-ORCHESTRATION-FABLE-001 (FR-2 / DOOR-2a).
//
// COMPOSE-NEVER-DIVERGE: a one_way stamp raises metadata.min_tier_rank to the
// ladder top IN THE SAME UPDATE, so the door stamp and the rank SSOT cannot
// disagree (the gauge-vs-action divergent-flag class). Read-modify-write
// preserves every unrelated metadata key; idempotent re-stamps update in place.

import { classifyDoor, DOORS } from './door-classifier.mjs';
import ladder from './tier-ladder.cjs';

const { ladderTopRank } = ladder;

/**
 * Classify + stamp one SD row. Returns the stamp outcome; never throws on a
 * classification result (DB errors propagate to the caller, which decides).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} sd — a strategic_directives_v2 row incl. {id, sd_key, title,
 *                      description, scope, key_changes, metadata}; caller may
 *                      also pass {files} when known (e.g. from a PR surface).
 * @param {Object} [opts] — { stampedBy = 'door-stamper' }
 * @returns {Promise<{sd_key: string, door: string, reasons: string[], rank_raised: boolean}>}
 */
export async function stampDoorClass(supabase, sd, opts = {}) {
  const stampedBy = opts.stampedBy || 'door-stamper';
  const verdict = classifyDoor(sd);

  // Fresh read narrows the concurrent-writer clobber window (accepted file-wide
  // JSONB pattern; the claim-boundary probe documents the same trade).
  const { data: fresh, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('id', sd.id)
    .maybeSingle();
  if (readErr) throw new Error('[door-stamper] fresh read failed: ' + readErr.message);

  const meta = (fresh && fresh.metadata) || {};
  const nextMeta = {
    ...meta,
    door_class: {
      door: verdict.door,
      reasons: verdict.reasons,
      stamped_at: new Date().toISOString(),
      stamped_by: stampedBy,
    },
  };

  // The composition invariant: one_way ⇒ top rank, same write.
  let rankRaised = false;
  if (verdict.door === DOORS.ONE_WAY) {
    const top = ladderTopRank();
    const current = Number(meta.min_tier_rank);
    if (!Number.isFinite(current) || current < top) {
      nextMeta.min_tier_rank = top;
      nextMeta.min_tier_rank_reason = 'one_way door (' + verdict.reasons.join(', ') + ') — Fable-exclusive per SD-LEO-INFRA-TIERED-ORCHESTRATION-FABLE-001';
      rankRaised = true;
    }
  }

  const { error: writeErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: nextMeta })
    .eq('id', sd.id);
  if (writeErr) throw new Error('[door-stamper] stamp write failed: ' + writeErr.message);

  return { sd_key: sd.sd_key, door: verdict.door, reasons: verdict.reasons, rank_raised: rankRaised };
}

export default { stampDoorClass };
