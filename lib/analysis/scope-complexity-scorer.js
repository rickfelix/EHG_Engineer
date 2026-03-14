/**
 * Scope Complexity Scorer
 *
 * Scores orchestrator SD structural complexity on 4 dimensions:
 * - Child count (0-25)
 * - Cross-child data dependencies (0-25)
 * - Handoff count (0-25)
 * - Capability overlap (0-25)
 *
 * Total score: 0-100 (advisory only, never blocks)
 *
 * SD: SD-MAN-ORCH-SCOPE-COMPLEXITY-ANALYSIS-001-A
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const TRACK_THRESHOLDS = {
  A: 5, // Infrastructure
  B: 4, // Features
  C: 3, // Quality
};

const CHILD_COUNT_BRACKETS = [
  { max: 0, score: 0 },
  { max: 2, score: 5 },
  { max: 4, score: 10 },
  { max: 7, score: 15 },
  { max: 10, score: 20 },
  { max: Infinity, score: 25 },
];

/**
 * Score the child count dimension (0-25).
 * @param {number} count - Number of children
 * @returns {number} Score 0-25
 */
export function scoreChildCount(count) {
  if (count == null || count < 0) return 0;
  for (const bracket of CHILD_COUNT_BRACKETS) {
    if (count <= bracket.max) return bracket.score;
  }
  return 25;
}

/**
 * Score cross-child dependency overlap (0-25).
 * Counts dependency strings shared across 2+ sibling SDs.
 * @param {Array<{dependencies: Array}>} children - Sibling SDs with dependency arrays
 * @returns {number} Score 0-25
 */
export function scoreCrossChildDeps(children) {
  if (!Array.isArray(children) || children.length < 2) return 0;

  const depMap = new Map();
  for (const child of children) {
    const deps = Array.isArray(child.dependencies) ? child.dependencies : [];
    const seen = new Set();
    for (const dep of deps) {
      const key = typeof dep === 'string' ? dep : (dep?.dependency || dep?.name || '');
      if (key && !seen.has(key)) {
        seen.add(key);
        depMap.set(key, (depMap.get(key) || 0) + 1);
      }
    }
  }

  const sharedCount = [...depMap.values()].filter(c => c >= 2).length;
  if (sharedCount === 0) return 0;
  if (sharedCount <= 1) return 5;
  if (sharedCount <= 3) return 10;
  if (sharedCount <= 5) return 15;
  if (sharedCount <= 8) return 20;
  return 25;
}

/**
 * Score handoff count across children (0-25).
 * @param {number} totalHandoffs - Total handoffs across all children
 * @returns {number} Score 0-25
 */
export function scoreHandoffCount(totalHandoffs) {
  if (totalHandoffs == null || totalHandoffs < 0) return 0;
  if (totalHandoffs <= 2) return 0;
  if (totalHandoffs <= 5) return 5;
  if (totalHandoffs <= 10) return 10;
  if (totalHandoffs <= 15) return 15;
  if (totalHandoffs <= 25) return 20;
  return 25;
}

/**
 * Score capability overlap between children (0-25).
 * Counts capability_key values that appear in 2+ children.
 * @param {Array<{delivers_capabilities: Array}>} children
 * @returns {number} Score 0-25
 */
export function scoreCapabilityOverlap(children) {
  if (!Array.isArray(children) || children.length < 2) return 0;

  const capMap = new Map();
  for (const child of children) {
    const caps = Array.isArray(child.delivers_capabilities) ? child.delivers_capabilities : [];
    const seen = new Set();
    for (const cap of caps) {
      const key = typeof cap === 'string' ? cap : (cap?.capability_key || '');
      if (key && !seen.has(key)) {
        seen.add(key);
        capMap.set(key, (capMap.get(key) || 0) + 1);
      }
    }
  }

  const overlapCount = [...capMap.values()].filter(c => c >= 2).length;
  if (overlapCount === 0) return 0;
  if (overlapCount <= 1) return 5;
  if (overlapCount <= 3) return 10;
  if (overlapCount <= 5) return 15;
  if (overlapCount <= 8) return 20;
  return 25;
}

/**
 * Get track threshold for a given track.
 * @param {string} track - Track letter (A, B, C)
 * @returns {{track: string, value: number}} Threshold info
 */
export function getTrackThreshold(track) {
  const normalized = (track || '').toUpperCase().charAt(0);
  const value = TRACK_THRESHOLDS[normalized];
  return { track: normalized, value: value ?? TRACK_THRESHOLDS.B };
}

/**
 * Score orchestrator SD complexity.
 * Returns null for non-orchestrator SDs.
 *
 * @param {string} sdKey - The SD key to score
 * @param {object} [options] - Optional config
 * @param {object} [options.supabase] - Supabase client (for testing)
 * @returns {Promise<null|{score: number, dimensions: object, threshold: object}>}
 */
export async function scoreComplexity(sdKey, options = {}) {
  const supabase = options.supabase || createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Get the SD
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, uuid_id, sd_key, sd_type, metadata, track')
    .eq('sd_key', sdKey)
    .limit(1);

  if (sdErr || !sd || sd.length === 0) return null;

  const parentSd = sd[0];
  const isOrchestrator = parentSd.sd_type === 'orchestrator' ||
    parentSd.metadata?.is_orchestrator === true ||
    parentSd.metadata?.pattern_type === 'orchestrator';

  if (!isOrchestrator) return null;

  // Get children
  const { data: children } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, dependencies, delivers_capabilities')
    .eq('parent_sd_id', parentSd.id);

  const childList = children || [];

  // Get total handoffs across children
  const childKeys = childList.map(c => c.sd_key);
  let totalHandoffs = 0;
  if (childKeys.length > 0) {
    const { count } = await supabase
      .from('sd_phase_handoffs')
      .select('id', { count: 'exact', head: true })
      .in('sd_id', childKeys);
    totalHandoffs = count || 0;
  }

  // Score each dimension
  const dimensions = {
    child_count: scoreChildCount(childList.length),
    cross_child_deps: scoreCrossChildDeps(childList),
    handoff_count: scoreHandoffCount(totalHandoffs),
    capability_overlap: scoreCapabilityOverlap(childList),
  };

  const totalScore = dimensions.child_count +
    dimensions.cross_child_deps +
    dimensions.handoff_count +
    dimensions.capability_overlap;

  // Track threshold
  const track = parentSd.track || parentSd.metadata?.track || 'B';
  const threshold = getTrackThreshold(track);

  return {
    score: totalScore,
    dimensions,
    threshold: {
      ...threshold,
      exceeded: totalScore > (threshold.value * 20), // Scale threshold to 0-100 range
    },
  };
}

/**
 * Format advisory output for display.
 * @param {object|null} result - scoreComplexity result
 * @returns {string} Formatted advisory text
 */
export function formatAdvisory(result) {
  if (!result) return '';

  const { score, dimensions, threshold } = result;
  const lines = [
    '\n📊 SCOPE COMPLEXITY ADVISORY',
    `   Total Score: ${score}/100`,
    `   ├─ Child Count:      ${dimensions.child_count}/25`,
    `   ├─ Cross-Child Deps: ${dimensions.cross_child_deps}/25`,
    `   ├─ Handoff Count:    ${dimensions.handoff_count}/25`,
    `   └─ Capability Overlap: ${dimensions.capability_overlap}/25`,
    `   Track: ${threshold.track} (threshold: ${threshold.value * 20}/100)`,
  ];

  if (threshold.exceeded) {
    lines.push('   ⚠️  Score exceeds track threshold — consider additional decomposition');
  } else {
    lines.push('   ✅ Within track threshold');
  }

  return lines.join('\n');
}
