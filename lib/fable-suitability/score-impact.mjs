/**
 * score-impact.mjs — DETERMINISTIC impact axis (1-5). NEVER calls a model.
 * SD-LEO-INFRA-FABLE-SUITABILITY-MAP-001-B (FR-1).
 *
 * Impact = "how much of the system leans on this region". It is computed ONLY from structural
 * signals — an LLM-judged impact would be unfalsifiable and gameable (RISK R1, the central
 * garbage-ranking risk). The signals:
 *   - centrality (consumer in-degree): how many distinct files import this region's exports
 *     (from lib/static-analysis buildConsumerIndex).
 *   - fanOut (call-graph out-degree): how many other regions this region reaches
 *     (from lib/static-analysis buildCallGraph).
 *   - crossRepo: whether the region is reached from more than one application (applications.local_path
 *     TRACKED_SCOPE) — a cross-repo region is higher-blast-radius.
 *
 * scoreImpact is a PURE band-mapper over already-extracted numeric signals (testable with fixtures);
 * extractImpactSignals is the thin adapter that derives those signals from static-analysis outputs,
 * so child C can feed real data without the scorer knowing about ASTs.
 */
import { getFamily } from './cluster-families.mjs';

// Documented thresholds mapping a blended structural score into a 1-5 band.
// Bands are on the WEIGHTED blend of normalized signals, not any single raw count.
const BAND_THRESHOLDS = [
  { min: 0.8, score: 5 },
  { min: 0.6, score: 4 },
  { min: 0.4, score: 3 },
  { min: 0.2, score: 2 },
  { min: 0.0, score: 1 },
];

// Saturating normalizers: raw counts -> [0,1]. Documented, deterministic, no magic per-run tuning.
const norm = (value, saturateAt) => Math.min(1, Math.max(0, (Number(value) || 0) / saturateAt));

function bandFor(blend) {
  for (const b of BAND_THRESHOLDS) if (blend >= b.min) return b.score;
  return 1;
}

/**
 * @param {{centrality:number, fanOut:number, crossRepoCount:number}} signals raw structural counts
 * @param {string} dutyCluster
 * @returns {{score:number, inputs:object, rationale:string}}
 */
export function scoreImpact(signals = {}, dutyCluster) {
  const w = getFamily(dutyCluster).impact;
  const nCentrality = norm(signals.centrality, 20);      // 20+ consumers saturates centrality
  const nFanOut = norm(signals.fanOut, 15);              // 15+ outbound edges saturates fan-out
  // Cross-repo reach is a BONUS over the single-repo baseline: 1 repo -> 0, 2+ repos -> saturated.
  const nCrossRepo = norm((Number(signals.crossRepoCount) || 1) - 1, 1);

  const blend = w.centrality * nCentrality + w.fanOut * nFanOut + w.crossRepo * nCrossRepo;
  const score = bandFor(blend);

  return {
    score,
    inputs: {
      centrality: Number(signals.centrality) || 0,
      fanOut: Number(signals.fanOut) || 0,
      crossRepoCount: Number(signals.crossRepoCount) || 0,
      normalized: { centrality: nCentrality, fanOut: nFanOut, crossRepo: nCrossRepo },
      blend: Number(blend.toFixed(4)),
      weights: w,
    },
    rationale: `impact ${score}/5 — centrality=${signals.centrality || 0} in-degree, fanOut=${signals.fanOut || 0} out-degree, crossRepo=${signals.crossRepoCount || 0} repo(s), ${dutyCluster}-weighted blend=${blend.toFixed(2)}`,
  };
}

/**
 * Derive raw impact signals for a region from static-analysis outputs. Thin, deterministic adapter.
 * @param {object} args
 * @param {object} args.consumerIndex  result of buildConsumerIndex ({named, wholeModule} Maps)
 * @param {object} args.callGraph      result of buildCallGraph (adjacency)
 * @param {string} args.region         the region_key
 * @param {(file:string)=>string} args.regionOf  maps a defining file to its region_key
 * @param {Set<string>} [args.crossRepoRegions]  region_keys observed in >1 repo
 * @returns {{centrality:number, fanOut:number, crossRepoCount:number}}
 */
export function extractImpactSignals({ consumerIndex, callGraph, region, regionOf, crossRepoRegions = new Set() }) {
  let centrality = 0;
  let fanOut = 0;

  // Centrality: count distinct consumer files whose imported defining-file belongs to `region`.
  if (consumerIndex) {
    const consumers = new Set();
    const collect = (map) => {
      for (const [definingFile, entry] of map.entries()) {
        if (regionOf(definingFile) !== region) continue;
        const lists = entry instanceof Map ? [...entry.values()] : [entry];
        for (const list of lists) for (const c of list) consumers.add(c.file);
      }
    };
    if (consumerIndex.named) collect(consumerIndex.named);
    if (consumerIndex.wholeModule) collect(consumerIndex.wholeModule);
    centrality = consumers.size;
  }

  // Fan-out: distinct OTHER regions this region's files reach in the call graph.
  if (callGraph && typeof callGraph === 'object') {
    const reached = new Set();
    const edges = callGraph.edges || callGraph.adjacency || callGraph;
    const iter = edges instanceof Map ? edges.entries() : Object.entries(edges);
    for (const [fromFile, tos] of iter) {
      if (regionOf(fromFile) !== region) continue;
      for (const to of tos || []) {
        const toFile = typeof to === 'string' ? to : to.file;
        const toRegion = regionOf(toFile);
        if (toRegion && toRegion !== region) reached.add(toRegion);
      }
    }
    fanOut = reached.size;
  }

  return { centrality, fanOut, crossRepoCount: crossRepoRegions.has(region) ? 2 : 1 };
}
