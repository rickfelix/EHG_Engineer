/**
 * Clean-clone launch prereq verifier — SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001-B / FR-1
 *
 * The clean-clone launch must not seed a fresh venture until the FR-2 grounding
 * prereqs are actually MERGED (status='completed'). This module is the fail-loud
 * gate: it reads the live status of each prereq SD and reports which (if any) are
 * not yet merged. house-tech-stack is enforced in-lib (lib/eva/config/house-tech-stack.js)
 * and has no SD gate, so it is intentionally not in this list.
 *
 * @module lib/eva/clean-clone/prereq-verifier
 */

/** The grounding prereqs that must be MERGED before a clean clone may be seeded. */
export const PREREQ_SD_KEYS = Object.freeze([
  'SD-LEO-INFRA-VENTURE-CLOUDFLARE-DEFAULT-001',
  'SD-LEO-INFRA-VENTURE-CLOUDFLARE-DEFAULT-001-A',
  'SD-LEO-INFRA-VENTURE-CLOUDFLARE-DEFAULT-001-B',
  'SD-LEO-INFRA-VENTURE-CLOUDFLARE-DEFAULT-001-C',
  'SD-LEO-INFRA-VENTURE-CLOUDFLARE-DEFAULT-001-D',
  'SD-LEO-INFRA-CHAIRMAN-DECISION-HEALTH-PROVENANCE-001',
]);

/** A prereq SD counts as merged only when its lifecycle status is 'completed'. */
export const MERGED_STATUS = 'completed';

/**
 * Verify every prereq SD is merged (status='completed').
 *
 * @param {Object} supabase - Supabase client
 * @param {string[]} [prereqKeys=PREREQ_SD_KEYS]
 * @returns {Promise<{ok: boolean, statuses: Object<string,string|null>, missing: string[]}>}
 *   ok=true only when ALL prereqs are completed. `statuses` maps each key to its
 *   live status (null if the SD row is absent). `missing` lists keys that are not
 *   completed (including absent ones).
 */
export async function verifyPrereqsMerged(supabase, prereqKeys = PREREQ_SD_KEYS) {
  if (!supabase) throw new Error('supabase client is required');
  const keys = Array.isArray(prereqKeys) && prereqKeys.length ? prereqKeys : PREREQ_SD_KEYS;

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, status')
    .in('sd_key', keys);
  if (error) throw new Error(`prereq verification query failed: ${error.message}`);

  const byKey = new Map((data || []).map((r) => [r.sd_key, r.status]));
  const statuses = {};
  const missing = [];
  for (const key of keys) {
    const status = byKey.has(key) ? byKey.get(key) : null;
    statuses[key] = status;
    if (status !== MERGED_STATUS) missing.push(key);
  }
  return { ok: missing.length === 0, statuses, missing };
}
