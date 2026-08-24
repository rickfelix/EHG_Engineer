/**
 * claimable-leaves.mjs — the client-free SSOT for the dispatchable-leaf belt.
 * SD-LEO-INFRA-CAPACITY-FORECASTER-BELT-001.
 *
 * WHY THIS MODULE EXISTS: the ranker (coordinator-backlog-rank.mjs) and the capacity forecaster
 * (capacity-inputs.mjs) must agree on "how deep is the DISPATCHABLE belt". These three functions
 * were defined inside coordinator-backlog-rank.mjs, but importing them from there constructs a
 * Supabase client at module scope (that file's CLI entry) and throws at import wherever
 * SUPABASE_URL is absent — taking the forecaster's unit tests with it. Holding them here, with the
 * client PASSED IN (never constructed), lets both consumers share ONE representation of the leaf
 * predicate. coordinator-backlog-rank.mjs re-exports these (barrel) so its existing importers are
 * unchanged; the forecaster consumes the PURE predicates in-memory (no duplicate DB reads).
 *
 * The pure DB-free predicates (blockerKeysFor, claimableDbFreeReason) are the shared
 * representation; computeClaimableLeaves is the async ranker wrapper. The forecaster does NOT call
 * computeClaimableLeaves — it applies the pure predicates to rows it already fetched (see
 * capacity-inputs.mjs) to avoid a second SD-table pagination + per-child parent fetches.
 */

import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
import { isFixtureSd, isStartedSd, isUnactionableRemediationSd } from '../../lib/coordinator/sd-exclusion.mjs';
import { parseSdDependencies } from '../../lib/utils/parse-sd-dependencies.cjs';
import { parentLeadPending, classifyDispatchIneligibility, resolveHoldProvenance, formatHoldProvenance } from '../../lib/fleet/claim-eligibility.cjs';
import { checkMetadataDependency } from '../modules/sd-next/dependency-resolver.js';

// Collect every blocker sd_key for an SD: the `dependencies` column PLUS the canonical
// metadata.blocked_by_sd_key. ONE predicate, shared by depKeys collection and the unmet check.
export function blockerKeysFor(d) {
  const keys = parseSdDependencies(d.dependencies);
  const { blockerSdKey } = checkMetadataDependency(d.metadata);
  if (blockerSdKey) keys.push(blockerSdKey);
  return keys;
}

/**
 * SD-LEO-INFRA-BACKLOG-RANK-CLAIMABLE-ELIGIBILITY-ALIGN-001: the DB-FREE claimable gate for the ranker,
 * composed so the ranked belt matches the actually-claimable set the worker resolver enforces. Returns
 * null when the SD passes every DB-free claimable axis, or a reason string when it must be excluded:
 *   - 'claimed'  — a live session already holds it (claiming_session_id set)
 *   - 'in_flight' — started/mid-build past LEAD draft (resumed via resume_orphan, never fresh-ranked)
 *   - 'fixture'  — backlog-rank's BROADER fixture detection (epoch TEST-E2E keys / metadata.is_fixture)
 *   - 'unactionable_venture_remediation' — auto-filed SD-LEO-FIX-REMEDIATION-* targeting a venture repo
 *   - else the SHARED claim-eligibility reason: 'orchestrator_parent' | 'human_action_required' |
 *     'co_author_pending' | 'sd_deferred' | 'sd_terminal' | 'test_fixture_key' | 'test_clone_build_tree'.
 * The shared predicate (classifyDispatchIneligibility) is the SSOT — re-implementing it is exactly how
 * the requires_human_action skip drifted out of the ranker. Pure; the DB-backed axes (dependency/metadata
 * blockers, parent-LEAD-pending) remain in the async claim loop / the consumer. Exported for unit testing.
 * @param {object} d - an SD row (sd_key, sd_type, status, current_phase, claiming_session_id, metadata)
 * @returns {null|string}
 */
export function claimableDbFreeReason(d) {
  if (!d) return 'missing';
  if (d.claiming_session_id) return 'claimed';
  if (isStartedSd(d)) return 'in_flight';
  if (isFixtureSd(d.sd_key, d.metadata)) return 'fixture';
  if (isUnactionableRemediationSd(d)) return 'unactionable_venture_remediation';
  // SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001 FR-5 (deliberate, LEAD-approved deferral, NOT
  // a gap): called with no ctx, so classifyDispatchIneligibility's ctx-dependent tier axes can
  // never fire here -- whether the fleet-wide belt should be tier-FILTERED (not just
  // tier-displayed) is a separate architectural decision with fleet-wide blast radius, out of
  // scope for this SD.
  return classifyDispatchIneligibility(d); // null => eligible on the DB-free axes
}

/**
 * The SSOT claimable-leaf computation the ranker (dispatch_rank) relies on. Async: it reads
 * strategic_directives_v2 itself and resolves parent-LEAD per candidate. The forecaster does NOT
 * call this (it would duplicate the SD read + add per-child fetches) — it reuses the pure
 * predicates above on its already-fetched rows. This wrapper is unchanged behaviourally from its
 * former home in coordinator-backlog-rank.mjs.
 * @returns {Promise<{ error?: object, sds: object[], byKey: Map, depStatus: object, claimable: object[], humanActionHolds: Array<{sd_key: string, provenance: object|null}> }>}
 */
export async function computeClaimableLeaves(sb, opts = {}) {
  const log = opts.quiet ? () => {} : console.log;
  let sds;
  try {
    sds = await fetchAllPaginated(() => sb.from('strategic_directives_v2')
      .select('sd_key, title, description, status, sd_type, priority, created_at, current_phase, claiming_session_id, dependencies, metadata, parent_sd_id')
      .not('status', 'in', '("completed","cancelled","deferred")')
      .order('sd_key', { ascending: true }));
  } catch (error) {
    console.error('[BACKLOG-RANK] load failed:', error.message);
    return { error, sds: [], byKey: new Map(), depStatus: {}, claimable: [], humanActionHolds: [] };
  }

  const byKey = new Map((sds || []).map(d => [d.sd_key, d]));
  const depKeys = new Set();
  (sds || []).forEach(d => blockerKeysFor(d).forEach(k => depKeys.add(k)));
  let depStatus = {};
  if (depKeys.size) {
    const { data: deps } = await sb.from('strategic_directives_v2').select('sd_key,status').in('sd_key', Array.from(depKeys));
    (deps || []).forEach(d => { depStatus[d.sd_key] = d.status; });
  }

  const claimable = [];
  const humanActionHolds = [];
  let fixtureSkips = 0;
  let inFlightSkips = 0;
  let awaitingConvergenceSkips = 0;
  let humanActionSkips = 0;
  let ineligibleSkips = 0;
  let depBlockedSkips = 0;
  for (const d of (sds || [])) {
    const dbFreeSkip = claimableDbFreeReason(d);
    if (dbFreeSkip) {
      switch (dbFreeSkip) {
        case 'claimed': break;
        case 'in_flight':
          inFlightSkips++;
          log(`  [skip] in-flight (${d.current_phase}) excluded from fresh ranking: ${d.sd_key}`);
          break;
        case 'fixture':
          fixtureSkips++;
          log(`  [skip] fixture excluded from ranking: ${d.sd_key}`);
          break;
        case 'co_author_pending':
          awaitingConvergenceSkips++;
          log(`  [skip] awaiting co-author convergence (not idle-belt depth): ${d.sd_key}`);
          break;
        case 'human_action_required': {
          humanActionSkips++;
          const prov = resolveHoldProvenance(d.metadata);
          humanActionHolds.push({ sd_key: d.sd_key, provenance: prov });
          log(`  [skip] requires human action — not worker-claimable (not idle-belt depth): ${d.sd_key} [${formatHoldProvenance(prov)}]`);
          break;
        }
        default:
          ineligibleSkips++;
          log(`  [skip] dispatch-ineligible (${dbFreeSkip}): ${d.sd_key}`);
      }
      continue;
    }
    const unmet = blockerKeysFor(d)
      .filter(k => (byKey.has(k) ? byKey.get(k).status !== 'completed' : depStatus[k] !== 'completed'));
    if (unmet.length) {
      depBlockedSkips++;
      log(`  [skip] dependency-blocked (${unmet.join(', ')}): ${d.sd_key}`);
      continue;
    }
    if (await parentLeadPending(sb, d)) {
      log(`  [skip] parent not past LEAD — child not yet dispatchable: ${d.sd_key}`);
      continue;
    }
    claimable.push(d);
  }
  if (fixtureSkips) log(`[BACKLOG-RANK] ${fixtureSkips} fixture SD(s) excluded from ranking`);
  if (inFlightSkips) log(`[BACKLOG-RANK] ${inFlightSkips} in-flight SD(s) excluded from fresh ranking`);
  if (awaitingConvergenceSkips) log(`[BACKLOG-RANK] ${awaitingConvergenceSkips} SD(s) awaiting co-author convergence (excluded from claimable depth)`);
  if (humanActionSkips) log(`[BACKLOG-RANK] ${humanActionSkips} SD(s) requiring human action excluded from claimable depth (not worker-claimable)`);
  if (ineligibleSkips) log(`[BACKLOG-RANK] ${ineligibleSkips} SD(s) dispatch-ineligible (orchestrator-parent / deferred / terminal) excluded from claimable depth`);
  if (depBlockedSkips) log(`[BACKLOG-RANK] ${depBlockedSkips} SD(s) dependency-blocked excluded from claimable depth`);
  humanActionHolds.sort((a, b) => a.sd_key.localeCompare(b.sd_key));
  return { sds, byKey, depStatus, claimable, humanActionHolds };
}
