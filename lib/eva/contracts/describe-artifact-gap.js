/**
 * Self-describing artifact-gap diagnostics.
 *
 * SD-LEO-INFRA-STAGE-CONTRACT-REGISTRY-001 FR-5.
 *
 * When a stage precondition / reality gate / fallback-labeling path cannot find
 * a required artifact_type, the failure historically named ONLY the missing
 * type — leaving operators to manually diff the registry against what the
 * venture actually produced (the S21/S22 incident ran 6+ days because
 * 'build_security_audit' was demanded while the venture had distribution_* /
 * visual_* artifacts). This helper turns those failures self-describing:
 *
 *   required type  +  the venture's ACTUAL artifact types at that stage
 *                  +  a nearest-match diff (rename-alias-aware first,
 *                     Levenshtein second).
 *
 * One injected query, fail-soft: any DB error returns a degraded-but-usable
 * result instead of throwing (callers are failure paths already).
 *
 * @module lib/eva/contracts/describe-artifact-gap
 */

import {
  ARTIFACT_TYPES,
  OLD_TO_NEW_MAP,
  DEPRECATED_TO_CANONICAL,
} from '../artifact-types.js';

/** Plain dynamic-programming Levenshtein distance. */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Find the closest match for `required` within `candidates`.
 *
 * Resolution order (alias maps consulted BEFORE string distance, so a
 * half-finished rename is reported as a rename, not a typo):
 *   1. required is a deprecated alias whose canonical replacement is present
 *      -> { kind: 'renamed_to' }
 *   2. required is an OLD_TO_NEW_MAP legacy key whose new name is present
 *      -> { kind: 'renamed_to' }
 *   3. some candidate is an alias/legacy key whose canonical form IS required
 *      -> { kind: 'renamed_from' }
 *   4. minimum Levenshtein distance -> { kind: 'levenshtein', distance }
 *
 * @param {string} required
 * @param {string[]} candidates
 * @returns {{ match: string, kind: string, distance: number } | null}
 */
export function nearestMatch(required, candidates) {
  if (!required || !Array.isArray(candidates) || candidates.length === 0) return null;
  const candidateSet = new Set(candidates);

  const canonicalOfRequired = DEPRECATED_TO_CANONICAL[required] ?? OLD_TO_NEW_MAP[required];
  if (canonicalOfRequired && candidateSet.has(canonicalOfRequired)) {
    return { match: canonicalOfRequired, kind: 'renamed_to', distance: 0 };
  }

  for (const c of candidates) {
    if ((DEPRECATED_TO_CANONICAL[c] ?? OLD_TO_NEW_MAP[c]) === required) {
      return { match: c, kind: 'renamed_from', distance: 0 };
    }
  }

  let best = null;
  for (const c of candidates) {
    if (c === required) continue;
    const d = levenshtein(required, c);
    if (!best || d < best.distance) best = { match: c, kind: 'levenshtein', distance: d };
  }
  return best;
}

function isArtifactTypeName(t) {
  // Resource-style requirements (e.g. 'venture_resources.deployment_url') are
  // not venture_artifacts types — exclude them from artifact diffs.
  return typeof t === 'string' && t.length > 0 && !t.includes('.');
}

/**
 * Describe the gap between required artifact types and what the venture
 * actually has.
 *
 * @param {Object} args
 * @param {Object} args.supabase - Supabase client (injected).
 * @param {string} args.ventureId
 * @param {number} args.stage - The stage whose requirement failed.
 * @param {string[]} args.requiredTypes - The missing/required artifact types.
 * @param {Object} [args.logger]
 * @returns {Promise<{
 *   stage: number,
 *   required: string[],
 *   actual_at_stage: string[],
 *   actual_by_stage: Object<string, string[]>,
 *   matches: Array<{ required: string, match: string|null, kind: string|null, distance: number|null }>,
 *   rendered: string,
 *   degraded: boolean,
 * }>}
 */
export async function describeArtifactGap({ supabase, ventureId, stage, requiredTypes = [], logger = console }) {
  const required = (requiredTypes || []).filter(isArtifactTypeName);
  const result = {
    stage,
    required,
    actual_at_stage: [],
    actual_by_stage: {},
    matches: [],
    rendered: '',
    degraded: false,
  };

  let rows = [];
  try {
    if (!supabase || !ventureId) throw new Error('supabase client and ventureId are required');
    const { data, error } = await supabase
      .from('venture_artifacts')
      .select('artifact_type, lifecycle_stage')
      .eq('venture_id', ventureId)
      .eq('is_current', true);
    if (error) throw error;
    rows = data || [];
  } catch (err) {
    result.degraded = true;
    logger?.warn?.(`[describe-artifact-gap] venture_artifacts read failed (degraded output): ${err.message}`);
  }

  const byStage = new Map();
  for (const r of rows) {
    if (!r?.artifact_type) continue;
    const s = r.lifecycle_stage;
    if (!byStage.has(s)) byStage.set(s, new Set());
    byStage.get(s).add(r.artifact_type);
  }
  for (const [s, set] of [...byStage.entries()].sort((a, b) => a[0] - b[0])) {
    result.actual_by_stage[s] = [...set].sort();
  }
  result.actual_at_stage = result.actual_by_stage[stage] || [];

  // Nearest-match candidates: everything the venture actually has, plus the
  // canonical type registry (so a stale requirement still maps to its rename
  // even when the venture produced nothing yet).
  const allActual = [...new Set(rows.map(r => r.artifact_type).filter(Boolean))];
  const candidatePool = [...new Set([...allActual, ...Object.values(ARTIFACT_TYPES)])];
  for (const t of required) {
    const m = nearestMatch(t, candidatePool);
    result.matches.push({
      required: t,
      match: m?.match ?? null,
      kind: m?.kind ?? null,
      distance: m?.distance ?? null,
    });
  }

  const lines = [];
  lines.push(`required at stage ${stage}: ${required.join(', ') || '(none)'}`);
  lines.push(
    result.actual_at_stage.length > 0
      ? `venture has at stage ${stage}: ${result.actual_at_stage.join(', ')}`
      : `venture has NO current artifacts at stage ${stage}${result.degraded ? ' (lookup degraded)' : ''}`,
  );
  for (const m of result.matches) {
    if (!m.match) continue;
    if (m.kind === 'renamed_to') {
      lines.push(`'${m.required}' was RENAMED to '${m.match}' — the requirement source is stale; check venture_stages.required_artifacts`);
    } else if (m.kind === 'renamed_from') {
      lines.push(`venture has '${m.match}', the legacy name of required '${m.required}'`);
    } else {
      lines.push(`nearest match for '${m.required}': ${m.match} (levenshtein ${m.distance})`);
    }
  }
  const stagesPresent = Object.entries(result.actual_by_stage)
    .map(([s, types]) => `${s}(${types.length})`)
    .join(', ');
  if (stagesPresent) lines.push(`artifact stages present: ${stagesPresent}`);
  result.rendered = lines.join('\n');

  return result;
}
