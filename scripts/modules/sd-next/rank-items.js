/**
 * Rank Items - Pure Ranking Function for SD Queue
 * Part of SD-LEO-INFRA-UNIFY-QUICK-FIX-001
 *
 * Single source of truth for queue ranking logic. Called by both the
 * baseline-active path (SDNextSelector.js) and the no-baseline fallback
 * path (display/fallback-queue.js) so that /leo next queue ordering is
 * deterministic regardless of baseline presence.
 *
 * Phase 1 (this file): Extracts the baseline-path ranking stack from
 * SDNextSelector.js. Accepts SDs only.
 *
 * Phase 3 (future, per PRD): Extended to also accept Quick Fixes with
 * severity-derived sequence_rank, age-weighted urgency band, and
 * type-inferred track.
 *
 * PURE FUNCTION CONTRACT
 * ----------------------
 * No Supabase calls. No filesystem IO. No network.  All external data
 * (baseline, OKR scores, policy boosts, dependency resolution) must be
 * pre-computed by the caller and passed via the context object or
 * pre-set on the items themselves.
 */

import { scoreToBand, bandToNumeric } from '../auto-proceed/urgency-scorer.js';
import { scanMetadataForMisplacedDependencies } from './dependency-resolver.js';

/**
 * @typedef {Object} RankContext
 * @property {Map<string, Object>} [baselineItemsMap] sd_id (key or uuid) -> baseline item { sequence_rank, track, ... }
 * @property {Map<string, number>} [okrScoreMap]      SD uuid -> OKR impact score (0-90)
 * @property {Map<string, number>} [okrBoostMap]      SD uuid -> rank multiplier (1.0 = neutral, <1 = boost)
 * @property {number}              [okrBlendWeight]   Multiplier for OKR score subtraction (default 0.30)
 * @property {Map<string, number>} [policyBoostMap]   venture_id -> rank multiplier
 * @property {Object}              [actuals]          baseline actuals keyed by sd_key/id
 */

/**
 * @typedef {Object} RankedTracks
 * @property {Array<Object>} A           Infrastructure / Safety
 * @property {Array<Object>} B           Feature / Stages
 * @property {Array<Object>} C           Quality
 * @property {Array<Object>} STANDALONE  No explicit track
 */

/**
 * @typedef {Object} RankResult
 * @property {RankedTracks} tracks
 * @property {Array<{sd_key: string, findings: Array}>} misplacedDeps  SDs with dependency info in metadata but empty dependencies column
 * @property {Array<{sd_key: string}>}                  orphanBaseline SDs not found in baseline (informational)
 */

/**
 * Rank a list of SDs and group them into tracks.
 *
 * @param {Array<Object>} items Strategic Directives (may include pre-computed deps_resolved / childDepStatus fields)
 * @param {RankContext}   context
 * @returns {RankResult}
 */
export function rankItems(items, context = {}) {
  const {
    baselineItemsMap = new Map(),
    okrScoreMap      = new Map(),
    okrBoostMap      = new Map(),
    okrBlendWeight   = 0.30,
    policyBoostMap   = new Map(),
    actuals          = {},
  } = context;

  const tracks = { A: [], B: [], C: [], STANDALONE: [] };
  const misplacedDeps = [];
  const orphanBaseline = [];

  for (const sd of items) {
    if (sd.status === 'completed' || sd.status === 'cancelled') continue;

    // Governance: deferred SDs skip recommendation pipeline but stay in display.
    const isDeferred = sd.metadata?.do_not_advance_without_trigger === true;

    // QA: dependency info in metadata with empty dependencies column is a data-quality smell.
    const depsEmpty = !sd.dependencies || (Array.isArray(sd.dependencies) && sd.dependencies.length === 0);
    if (depsEmpty && sd.metadata) {
      const scan = scanMetadataForMisplacedDependencies(sd.metadata);
      if (scan.hasMisplacedDeps) {
        misplacedDeps.push({ sd_key: sd.sd_key || sd.id, findings: scan.findings });
      }
    }

    const baselineItem = baselineItemsMap.get(sd.sd_key) || baselineItemsMap.get(sd.id);

    // Track derivation: baseline > metadata > category > STANDALONE
    let trackKey;
    if (baselineItem?.track) {
      trackKey = baselineItem.track;
    } else if (sd.metadata?.execution_track) {
      const track = sd.metadata.execution_track;
      trackKey = track === 'Infrastructure' || track === 'Safety' ? 'A' :
                 track === 'Feature' ? 'B' :
                 track === 'Quality' ? 'C' : 'STANDALONE';
    } else if (sd.category) {
      const cat = sd.category.toLowerCase();
      trackKey = cat === 'infrastructure' || cat === 'platform' ? 'A' :
                 cat === 'quality' || cat === 'testing' || cat === 'qa' ? 'C' : 'B';
    } else {
      trackKey = 'STANDALONE';
    }

    if (!baselineItem && sd.status !== 'draft') {
      orphanBaseline.push({ sd_key: sd.sd_key || sd.id });
    }

    if (!tracks[trackKey]) trackKey = 'STANDALONE';

    // Vision-score-weighted priority (SD-MAN-INFRA-PRIORITY-QUEUE-ROUTING-001)
    const sequenceRank = baselineItem?.sequence_rank || 9999;
    const hasVisionOrigin = !!sd.vision_origin_score_id;
    const visionScoreVal = sd.vision_score ?? null;
    const gapWeight = (hasVisionOrigin && visionScoreVal !== null)
      ? (100 - Math.max(0, Math.min(100, visionScoreVal))) / 100
      : 0;
    let compositeRank = gapWeight > 0 ? sequenceRank / (1 + gapWeight) : sequenceRank;

    // OKR impact scoring (SD-LEO-INFRA-OKR-PIPELINE-AUTOMATION-001)
    const okrScore = okrScoreMap.get(sd.id) || 0;
    const okrBoost = okrBoostMap.get(sd.id) || 1.0;
    compositeRank = (compositeRank * okrBoost) - (okrScore * okrBlendWeight);

    // Glide-path policy boost (SD-LEO-INFRA-EHG-PORTFOLIO-ALLOCATION-001)
    const policyBoost = policyBoostMap.get(sd.venture_id) ?? 1.0;
    if (policyBoost !== 1.0) {
      compositeRank = compositeRank * policyBoost;
    }

    // Urgency from metadata (SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-A)
    const urgencyScore = sd.metadata?.urgency_score ?? null;
    const urgencyBand = sd.metadata?.urgency_band ?? (urgencyScore !== null ? scoreToBand(urgencyScore) : 'P3');
    const urgencyNumeric = bandToNumeric(urgencyBand);

    tracks[trackKey].push({
      ...(baselineItem || {}),
      ...sd,
      sd_id: sd.sd_key || sd.id,
      sequence_rank: sequenceRank,
      gap_weight: gapWeight,
      composite_rank: compositeRank,
      okr_boost: okrBoost < 1.0 ? okrBoost : null,
      okr_score: okrScore > 0 ? okrScore : null,
      policy_boost: policyBoost !== 1.0 ? policyBoost : null,
      urgency_score: urgencyScore,
      urgency_band: urgencyBand,
      urgency_numeric: urgencyNumeric,
      is_deferred: isDeferred,
      actual: actuals[sd.sd_key] || actuals[sd.id]
    });
  }

  // Sort within each track: urgency band (P0 first) → urgency score (desc) → composite_rank
  for (const trackKey of Object.keys(tracks)) {
    tracks[trackKey].sort((a, b) => {
      const bandDiff = (a.urgency_numeric ?? 3) - (b.urgency_numeric ?? 3);
      if (bandDiff !== 0) return bandDiff;
      const scoreDiff = (b.urgency_score ?? 0) - (a.urgency_score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return (a.composite_rank ?? a.sequence_rank ?? 9999) - (b.composite_rank ?? b.sequence_rank ?? 9999);
    });
  }

  return { tracks, misplacedDeps, orphanBaseline };
}
