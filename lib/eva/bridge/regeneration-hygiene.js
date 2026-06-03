/**
 * Regeneration hygiene — idempotent, supersede-aware re-decomposition
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 5 (FR-014)
 *
 * Re-running the panel on a venture must UPDATE the existing tree in place and
 * SUPERSEDE what's no longer planned — never spawn a parallel tree. (DataDistill
 * accreted THREE regenerated trees; the duplicate had to be cancelled by hand.)
 *
 * planRegeneration is a pure diff keyed by sd_key:
 *  - desired key not in existing  -> create
 *  - desired key already exists    -> update in place (no duplicate)
 *  - existing key not desired, and NOT terminal -> supersede (cancel)
 *  - existing key not desired, terminal (cancelled/completed) -> leave (history)
 *
 * Headlessly unit-testable; the live writer applies the plan via canonical scripts.
 *
 * @module lib/eva/bridge/regeneration-hygiene
 */

const TERMINAL_STATUSES = new Set(['cancelled', 'completed']);

/**
 * @param {Array<{sd_key:string, status?:string}>} existing - current tree rows
 * @param {Array<{sd_key:string}>} desired - freshly-planned tree
 * @returns {{toCreate:string[], toUpdate:string[], toSupersede:string[]}}
 */
export function planRegeneration(existing = [], desired = []) {
  const existingByKey = new Map(
    (Array.isArray(existing) ? existing : []).filter((s) => s && s.sd_key).map((s) => [s.sd_key, s]),
  );
  const desiredList = (Array.isArray(desired) ? desired : []).filter((s) => s && s.sd_key);
  const desiredKeys = new Set(desiredList.map((s) => s.sd_key));

  const toCreate = desiredList.filter((s) => !existingByKey.has(s.sd_key)).map((s) => s.sd_key);
  const toUpdate = desiredList.filter((s) => existingByKey.has(s.sd_key)).map((s) => s.sd_key);
  const toSupersede = [...existingByKey.values()]
    .filter((s) => !desiredKeys.has(s.sd_key) && !TERMINAL_STATUSES.has(s.status))
    .map((s) => s.sd_key);

  return { toCreate, toUpdate, toSupersede };
}

/** True iff re-running produced zero NEW trees (every desired key already existed). */
export function isIdempotentRerun(existing = [], desired = []) {
  return planRegeneration(existing, desired).toCreate.length === 0;
}
