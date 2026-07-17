/**
 * fanout.mjs — cost-bounded cheap-model fan-out over codebase regions.
 * SD-LEO-INFRA-FABLE-SUITABILITY-MAP-001-C (FR-1).
 *
 * Runs child B's scorers over BATCHED regions and persists each via child A's writer. The cost bound
 * (RISK R5) is STRUCTURAL, not advisory — three mechanisms make cost a function of CHANGED regions,
 * not total regions:
 *   1. maxBatch — a hard ceiling on regions scored per invocation.
 *   2. input-hash cache — a region whose input-hash matches the cache is SKIPPED (no re-score); only
 *      the hash is compared. Full cold-start fan-out is rare.
 *   3. incremental — with a prior cache, only regions whose input-hash changed are scored.
 *
 * The reasoning-depth model client is INJECTED and must be Sonnet-floor (NEVER Fable — Fable is
 * parked and is the expensive tier this whole map exists to protect). Persist is CEREMONY_PENDING-
 * aware: while child A's table is still STAGED, each persist returns CEREMONY_PENDING without aborting
 * the run, so a ranked artifact is still produced (inert-but-reachable).
 */
import { scoreRegion } from './score-region.mjs';

/**
 * Deterministic content hash of a region's scoring inputs. Two identical input sets -> identical
 * hash -> cache hit -> skip. Pure (no crypto dependency needed for a cache key).
 */
export function hashRegionInputs(region, signals) {
  const canonical = JSON.stringify({ r: region.region_key, repo: region.repo, s: signals });
  let h = 5381;
  for (let i = 0; i < canonical.length; i++) h = ((h << 5) + h + canonical.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(36)}`;
}

/**
 * @param {object} args
 * @param {Array<{region:object, signals:object, dutyCluster:string}>} args.regions
 * @param {object} args.client         injected Sonnet-floor reasoning-depth client (scoreStructured)
 * @param {(row:object)=>Promise<{status:string}>} args.persist  child A upsertRegionScore bound to a supabase client
 * @param {Map<string,string>} [args.cache]  region_key -> last input-hash (mutated in place)
 * @param {number} [args.maxBatch]     hard ceiling on regions scored this invocation
 * @param {boolean} [args.incremental] when true (default), skip regions whose hash is unchanged
 * @param {number} [args.scoreVersion] the score_version to stamp on newly-scored rows (default 1;
 *                                     living-update re-floats bump this via evaluateRefloat). Child B's
 *                                     scoreRegion intentionally omits score_version — versioning is a
 *                                     fan-out/cadence concern, so the fan-out layer assigns it here.
 * @returns {Promise<{scored:object[], skipped:string[], ceremonyPending:number, persisted:number, batchTruncated:boolean}>}
 */
export async function runFanout({ regions = [], client, persist, cache = new Map(), maxBatch = 25, incremental = true, scoreVersion = 1 }) {
  if (typeof persist !== 'function') throw new Error('runFanout: persist(row) is required');

  const scored = [];
  const skipped = [];
  let ceremonyPending = 0;
  let persisted = 0;
  let batchTruncated = false;

  for (const item of regions) {
    const { region, signals, dutyCluster } = item;
    const key = region.region_key;
    const hash = hashRegionInputs(region, signals);

    // Cache/incremental: unchanged region -> skip (no model call, no persist).
    if (incremental && cache.get(key) === hash) {
      skipped.push(key);
      continue;
    }

    // Cost bound: never score more than maxBatch per invocation.
    if (scored.length >= maxBatch) {
      batchTruncated = true;
      break;
    }

    const { row } = await scoreRegion(region, signals, { dutyCluster, client });
    row.score_version = row.score_version ?? scoreVersion; // fan-out assigns the version child B omits
    scored.push(row);
    cache.set(key, hash);

    const result = await persist(row);
    if (result?.status === 'CEREMONY_PENDING') ceremonyPending += 1;
    else if (result?.status === 'ok') persisted += 1;
  }

  return { scored, skipped, ceremonyPending, persisted, batchTruncated };
}
