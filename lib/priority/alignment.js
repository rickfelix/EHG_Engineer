// lib/priority/alignment.js — ALIGNMENT reader for Child B's comparator.
// SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-D FR-4.
//
// There is no alignment scorer today. Child B (lib/priority/comparator.js, EXEC) reads alignment
// from an inputs bag; this module IS that input, mirroring the exact linkage rule
// lib/roadmap/wave-linkage-coverage.js already applies (direct promoted_to_sd_key OR
// metadata.wave_disposition, else via the orchestrator parent) so the two readers can never
// disagree about what counts as linked.
//
// UNSCORED, NEVER 0: an SD with no wave link anywhere returns the string sentinel 'UNSCORED' —
// never 0, never null, never a fabricated default. A string (not a Symbol, per adherence-scorer.js's
// precedent) because this value is stamped into claude_sessions.metadata by Child E and must
// survive JSON serialization intact.
import { computeWaveLinkageCoverage, ERR_NO_CANONICAL_ROADMAP } from '../roadmap/wave-linkage-coverage.js';
import { resolveCanonicalWaveIds } from '../roadmap/canonical-roadmap.js';
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { TEST_FIXTURE_KEY_RE } = require('../fleet/claim-eligibility.cjs');
const { UAT_FIXTURE_KEY_RE } = require('../governance/fixture-exclusion.mjs');

export const UNSCORED = 'UNSCORED';

const CLOSED_STATUSES = ['completed', 'cancelled', 'archived', 'superseded', 'deferred'];

/**
 * Pure: is this row directly linked, and through which field? Mirrors
 * wave-linkage-coverage.js:69-77's directlyLinked rule exactly (promoted_to_sd_key OR
 * ANY truthy wave_disposition), so the two readers cannot diverge.
 */
function directLinkSource(sd, promotedKeys) {
  if (sd && promotedKeys.has(sd.sd_key)) return 'promoted_to_sd_key';
  if (sd && sd.metadata && sd.metadata.wave_disposition) return 'wave_disposition';
  return null;
}

/**
 * Read one SD's wave-link alignment. Pure, no IO.
 *
 * @param {object} sd - {sd_key, parent_sd_id, metadata}
 * @param {{promotedKeys: Set<string>, byId: Map<any, object>}} ctx - promotedKeys is the set of
 *   sd_key values from roadmap_wave_items.promoted_to_sd_key WITHIN THE CANONICAL ROADMAP ONLY
 *   (never an archived one — see wave-linkage-coverage.js's FR-4 note); byId maps internal SD id
 *   -> SD row, used to resolve sd.parent_sd_id for the orchestrator-parent fallback.
 * @returns {{alignment: 1 | 'UNSCORED', via: 'direct'|'parent'|null, source: 'promoted_to_sd_key'|'wave_disposition'|null}}
 */
export function readWaveLinkAlignment(sd, { promotedKeys, byId } = {}) {
  const pk = promotedKeys instanceof Set ? promotedKeys : new Set(promotedKeys || []);

  const directSource = directLinkSource(sd, pk);
  if (directSource) return { alignment: 1, via: 'direct', source: directSource };

  const parent = sd && sd.parent_sd_id && byId ? byId.get(sd.parent_sd_id) : null;
  const parentSource = parent ? directLinkSource(parent, pk) : null;
  if (parentSource) return { alignment: 1, via: 'parent', source: parentSource };

  return { alignment: UNSCORED, via: null, source: null };
}

const isFixtureKey = (sdKey) =>
  typeof sdKey === 'string' && (TEST_FIXTURE_KEY_RE.test(sdKey) || UAT_FIXTURE_KEY_RE.test(sdKey));

/**
 * Coverage wrapper. Reuses computeWaveLinkageCoverage for {coverage, linked, total, starved} —
 * NEVER re-derives that denominator or its linkage rule. Additionally reports
 * strict_promoted_only: the same total (base.total, not independently recomputed), with an
 * independently-read numerator counting ONLY direct promoted_to_sd_key linkage (no
 * wave_disposition, no orchestrator-parent fallback) — the strict figure the LEAD investigation
 * measured at 3 of 47 non-terminal SDs, far below the wave_disposition-inclusive gauge.
 *
 * Names 'no_canonical_roadmap' as a REPORTABLE state (never a throw reaching a caller that isn't
 * expecting one) when ERR_NO_CANONICAL_ROADMAP is raised — every OTHER error is rethrown unchanged.
 *
 * @param {object} supabase - service-role client
 */
export async function computeAlignmentCoverage(supabase) {
  let base;
  try {
    base = await computeWaveLinkageCoverage(supabase);
  } catch (err) {
    if (err && err.code === ERR_NO_CANONICAL_ROADMAP) {
      return {
        status: 'no_canonical_roadmap', coverage: null, linked: 0, total: 0, starved: false,
        strict_promoted_only: { linked: 0, total: 0, coverage: null },
      };
    }
    throw err;
  }

  if (base.coverage === null) {
    return {
      status: 'unmeasurable_until_linkage', coverage: null, linked: base.linked, total: base.total, starved: false,
      strict_promoted_only: { linked: 0, total: base.total, coverage: null },
    };
  }

  let canonicalWaveIds;
  try {
    canonicalWaveIds = await resolveCanonicalWaveIds(supabase);
  } catch (e) {
    throw new Error(`compute-alignment-coverage: canonical roadmap unresolvable: ${e.message}`);
  }
  if (canonicalWaveIds === null) {
    return {
      status: 'no_canonical_roadmap', coverage: null, linked: 0, total: 0, starved: false,
      strict_promoted_only: { linked: 0, total: 0, coverage: null },
    };
  }

  let sds;
  let items;
  try {
    sds = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, sd_type, status')
      .not('status', 'in', `(${CLOSED_STATUSES.join(',')})`)
      .order('id', { ascending: true }));
    items = await fetchAllPaginated(() => supabase
      .from('roadmap_wave_items')
      .select('promoted_to_sd_key')
      .in('wave_id', canonicalWaveIds)
      .not('promoted_to_sd_key', 'is', null)
      .order('id', { ascending: true }));
  } catch (e) {
    throw new Error(`compute-alignment-coverage: query failed: ${e.message}`);
  }

  const promotedKeys = new Set(items.map((i) => i.promoted_to_sd_key));
  const leaves = sds.filter((s) => s.sd_type !== 'orchestrator' && !isFixtureKey(s.sd_key));
  const strictLinked = leaves.filter((s) => promotedKeys.has(s.sd_key)).length;

  return {
    status: 'measured',
    coverage: base.coverage, linked: base.linked, total: base.total, starved: base.starved,
    strict_promoted_only: {
      linked: strictLinked, total: base.total,
      coverage: base.total === 0 ? null : strictLinked / base.total,
    },
  };
}

export default { UNSCORED, readWaveLinkAlignment, computeAlignmentCoverage };
