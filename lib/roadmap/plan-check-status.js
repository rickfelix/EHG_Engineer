/**
 * plan-check-status — SD-LEO-INFRA-PLAN-OF-RECORD-LINKAGE-001 (FR-2)
 *
 * Derives the chairman's PLAN CHECK four sections (slipped/done/next/committing,
 * CLAUDE_ADAM.md) from the LEO Roadmap (roadmap_waves + roadmap_wave_items) — the ratified
 * plan of record — instead of the adam_task_ledger side-list. The four-section FORMAT, tone,
 * and 48h window rules are unchanged; only the underlying facts' data source changes.
 *
 * 'done' MUST be derived by JOINing to strategic_directives_v2.status='completed' — a
 * roadmap_wave_items row with promoted_to_sd_key set is NOT necessarily done (DATABASE
 * sub-agent finding, evidence 325c9993: of 341 stamped items live, 225 point to CANCELLED
 * SDs and only 101 to completed ones). Treating "stamped" as "done" would silently report
 * cancelled work as delivered.
 *
 * The section-4 forward-list persistence anchor (adam_task_ledger, source_ref
 * plan-check-forward-list-*) is READ-ONLY here and left in place — an orthogonal
 * audit-log/delta-detection concern, not the plan-of-record concern this module targets.
 *
 * SD-LEO-INFRA-DISTILL-ROADMAP-SINGLE-001 (FR-3): this query previously had NO roadmap_id
 * or status filter at all -- confirmed live to already mix rows from multiple parallel
 * distill-forked roadmaps into the chairman-facing PLAN CHECK report. Now scoped to the
 * single canonical roadmap (resolveCanonicalRoadmap -- the SAME resolver distill's write
 * path uses, so the two can never silently disagree) and to approved-or-later wave
 * statuses only, so an un-disposed distill proposal can never appear as if it were part
 * of the ratified plan.
 */
import { resolveCanonicalRoadmap } from './canonical-roadmap.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 — computeAdmissionsByLinkage
// (below) reads strategic_directives_v2 over a 48h created-OR-updated window with no other
// filter; strategic_directives_v2 is a growing table under heavy parallel-session load, so
// a capped read would silently undercount this chairman-facing PLAN CHECK admissions report.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

const FORWARD_LIST_SOURCE_REF_PREFIX = 'plan-check-forward-list-';
// SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001: narrowed from
// ['approved','active','completed'] to approved-only, matching v_plan_of_record_remainder's
// scope and the SD's "ratified plan-of-record" definition. This is a deliberate,
// chairman-visible behavior change (see PLAN-TO-LEAD handoff notes), not a regression --
// active/completed waves are no longer "remaining" plan-of-record by definition.
const RATIFIED_WAVE_STATUSES = ['approved'];
// remainder_state values that represent genuinely open (not yet done, not void, not
// satisfied by another SD) plan-of-record work. Exported so other consumers (and
// tests/unit/roadmap/plan-of-record-remainder-view.db.test.js's TS-7 parity check) share
// the exact same "open" definition rather than each re-deriving it.
export const OPEN_REMAINDER_STATES = ['promotable_now', 'gated_on_chairman', 'in_flight_or_sequence_blocked'];

function hoursAgoMs(hours) {
  return Date.now() - hours * 3_600_000;
}

function toMs(v) {
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
}

/**
 * SD-LEO-INFRA-PLAN-LINKAGE-BELT-001 (FR-2): "belt admissions this window, by plan linkage".
 * Reads metadata.plan_linkage (stamped at creation by lib/sd-creation/plan-linkage-classifier.js,
 * or at fence-lift by lib/coordinator/clear-coordinator-review.js) across SDs touched in the
 * window — never re-derives linkage itself.
 *
 * fence_lifts is best-effort: there is no dedicated fence-lift timestamp column (this SD adds
 * zero new columns), so "lifted this window" is approximated as an already-clear SD, created
 * BEFORE the window, whose updated_at falls inside it. Directional signal, not an exact log.
 */
export async function computeAdmissionsByLinkage(supabase, { cutoffMs }) {
  const cutoffIso = new Date(cutoffMs).toISOString();
  let rows;
  try {
    rows = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, metadata, created_at, updated_at')
      .or(`created_at.gte.${cutoffIso},updated_at.gte.${cutoffIso}`)
      .order('sd_key', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
  } catch (error) {
    throw new Error(`plan-check-status: admissions_by_linkage query failed: ${error.message}`);
  }

  const byWaveMap = new Map();
  const unlinkedMap = new Map();
  const fenceLifts = [];

  for (const sd of rows) {
    const pl = sd.metadata?.plan_linkage;
    if (!pl) continue; // no stamp yet -- pre-existing record this SD hasn't touched
    const isFenced = sd.metadata?.needs_coordinator_review === true;
    const createdMs = toMs(sd.created_at);
    const updatedMs = toMs(sd.updated_at);
    const admittedThisWindow = createdMs !== null && createdMs >= cutoffMs && !isFenced;
    const liftedThisWindow = createdMs !== null && createdMs < cutoffMs && !isFenced
      && updatedMs !== null && updatedMs >= cutoffMs;

    if (admittedThisWindow) {
      if (pl.linked) {
        const key = pl.wave_id || 'unknown-wave';
        const entry = byWaveMap.get(key) || { wave_id: pl.wave_id, wave_title: pl.wave_title, count: 0 };
        entry.count += 1;
        byWaveMap.set(key, entry);
      } else {
        const reason = pl.unlinked_reason || 'emergent-fix';
        unlinkedMap.set(reason, (unlinkedMap.get(reason) || 0) + 1);
      }
    }
    if (liftedThisWindow) {
      fenceLifts.push({
        sd_key: sd.sd_key,
        reason: pl.linked ? 'plan-linked' : (pl.unlinked_reason || 'emergent-fix'),
        lifted_at: sd.updated_at,
      });
    }
  }

  return {
    by_wave: [...byWaveMap.values()],
    unlinked: [...unlinkedMap.entries()].map(([reason, count]) => ({ reason, count })),
    fence_lifts: fenceLifts,
  };
}

/** How many open items `next` and `committing` expose. Named, because the numbers
 *  were previously bare slice() literals that a caller had no way to learn. */
export const NEXT_LIMIT = 10;
export const COMMITTING_LIMIT = 5;

/**
 * @param {object} supabase injected Supabase client (service role — RLS silently returns zero
 *   rows with no error under the anon/authenticated role; always use the service-role client)
 * @param {{windowHours?: number}} [opts]
 * @returns {Promise<{slipped: object[], done: object[], next: object[], committing: object[],
 *   open_total: number, next_truncated: boolean, committing_truncated: boolean}>}
 *
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B (FR-1): `next` and `committing` have always been
 * capped, and the return carried no total and no truncation flag — so a caller could not
 * distinguish "there are 10 open items" from "there are 300 and you were handed 10". For a
 * consumer asking for the wave REMAINDER that is a wrong number, not a short list.
 *
 * The caps are DELIBERATELY PRESERVED. Uncapping them would silently turn the chairman-facing
 * `plan-check-status.mjs` human report from ~10 lines into one line per open item — a
 * behaviour change to an existing surface, delivered as a side effect of a Drive Report
 * enrichment, which is worse than the defect being fixed. Measured before choosing: that CLI
 * is the ONE runtime caller (it reads named properties only, never enumerates or spreads), and
 * the unit suite asserts with toHaveProperty and toEqual-on-mapped-arrays, never
 * toStrictEqual — so ADDING fields is safe while changing existing ones is not.
 */
export async function computePlanCheckStatus(supabase, { windowHours = 48 } = {}) {
  const canonicalRoadmap = await resolveCanonicalRoadmap(supabase);
  if (!canonicalRoadmap) {
    throw new Error('plan-check-status: no active (canonical) roadmap found — cannot compute PLAN CHECK');
  }

  const [wavesRes, forwardListRes] = await Promise.all([
    supabase.from('roadmap_waves')
      // SD-LEO-INFRA-ROADMAP-WAVES-PROGRESS-001 (FR-4): progress_pct dropped from the select. It
      // was fetched and never read — a dead fetch, and a loaded gun for the next reader of this
      // query, in the very surface the SD records as having misreported wave bookkeeping.
      .select('id, title, sequence_rank, status')
      .eq('roadmap_id', canonicalRoadmap.id)
      .in('status', RATIFIED_WAVE_STATUSES)
      .order('sequence_rank', { ascending: true }),
    supabase.from('adam_task_ledger').select('id, title, source_ref').ilike('source_ref', `${FORWARD_LIST_SOURCE_REF_PREFIX}%`).order('created_at', { ascending: false }).limit(1),
  ]);

  if (wavesRes.error) throw new Error(`plan-check-status: roadmap_waves query failed: ${wavesRes.error.message}`);
  if (forwardListRes.error) throw new Error(`plan-check-status: adam_task_ledger forward-list query failed: ${forwardListRes.error.message}`);

  const waves = wavesRes.data || [];
  const waveIds = waves.map((w) => w.id);

  let items = [];
  if (waveIds.length > 0) {
    // SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001: repointed from roadmap_wave_items to
    // v_plan_of_record_remainder (approved-wave-only, stamped remainder_state). Consistent
    // with the wavesRes query above, which is now approved-only too.
    // SD-LEO-INFRA-UNCAPPED-ROADMAP-ITEMS-001 FR-1: PAGINATED TO COMPLETION. This fetch was a
    // bare .select().in() and would silently stop at PostgREST's 1000-row page cap — and
    // open_total, computed from it below, is exactly the "true count" this function promises.
    // A capped fetch here does not shorten a list, it reports a WRONG TOTAL.
    //
    // This query was NOT in the SD's original "extend :184-227" citation, which named only the
    // strategic_directives_v2 lookup. Paginating only that one would have left every test green
    // against today's sub-cap population while completeness stayed capped — a precise-looking
    // line citation is not a scope statement.
    items = await fetchAllPaginated(() => supabase
      .from('v_plan_of_record_remainder') // schema-lint-disable-line: pre-existing view reference, unrelated to pagination edits in this file
      .select('id, wave_id, title, promoted_to_sd_key, item_disposition, priority_rank, remainder_state')
      .in('wave_id', waveIds)
      .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries
  }

  const waveById = new Map(waves.map((w) => [w.id, w]));

  const linkedSdKeys = [...new Set(items.filter((i) => i.promoted_to_sd_key).map((i) => i.promoted_to_sd_key))];
  let sdByKey = new Map();
  if (linkedSdKeys.length) {
    // SD-LEO-INFRA-UNCAPPED-ROADMAP-ITEMS-001 FR-1: paginated for the same reason as the items
    // fetch above. claiming_session_id is ADDED for the drive-loop consumers (additive select).
    //
    // DELIBERATELY NOT SELECTED: unmet_dependencies, blocked_on_decision, owner_lane. The
    // drive-loop sections read all three off item.sd, but MEASURED 2026-08-07 they exist
    // NOWHERE — not as columns on strategic_directives_v2 (all three return 42703
    // undefined_column) and not as metadata keys (sampled 60 rows carrying metadata; zero
    // occurrences). Selecting a phantom column poisons the WHOLE projection, so naming them
    // here would have turned a working join into an empty one.
    const sds = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, status, completion_date, claiming_session_id')
      .in('sd_key', linkedSdKeys)
      .order('sd_key', { ascending: true })); // unique tiebreaker: stable page boundaries
    sdByKey = new Map((sds || []).map((s) => [s.sd_key, s]));
  }

  const cutoffMs = hoursAgoMs(windowHours);
  const done = [];
  const openItems = [];

  for (const item of items) {
    const linkedSd = item.promoted_to_sd_key ? sdByKey.get(item.promoted_to_sd_key) : null;
    const isDone = !!(linkedSd && linkedSd.status === 'completed');
    if (isDone) {
      // Parse to a real Date instead of comparing raw ISO strings -- completion_date is a
      // TIMESTAMP column (no tz suffix on the wire) while our cutoff is a 'Z'-suffixed
      // toISOString() value; string comparison of the two shapes is only accidentally
      // correct and can misorder right at the window boundary.
      const completedAtMs = linkedSd.completion_date ? new Date(linkedSd.completion_date).getTime() : NaN;
      const withinWindow = Number.isFinite(completedAtMs) && completedAtMs >= cutoffMs;
      if (withinWindow) {
        done.push({
          item_id: item.id,
          title: item.title,
          wave: waveById.get(item.wave_id)?.title || null,
          sd_key: item.promoted_to_sd_key,
          completed_at: linkedSd.completion_date,
        });
      }
    } else if (OPEN_REMAINDER_STATES.includes(item.remainder_state)) {
      // SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001: the prior item_disposition-based
      // exclude (['promoted','dropped']) missed the W5 incident class -- an item promoted to
      // a since-CANCELLED SD kept item_disposition='pending' (206 items, 2026-06-20..24),
      // so it fell through to openItems and surfaced as "next"/"committing" plan-of-record
      // work for ~4 weeks. remainder_state is stamped (trigger-maintained, re-stamped when
      // the linked SD's status changes), so a cancelled-SD promotion is void here immediately.
      openItems.push(item);
    }
  }

  openItems.sort((a, b) => {
    const waveA = waveById.get(a.wave_id)?.sequence_rank ?? Number.MAX_SAFE_INTEGER;
    const waveB = waveById.get(b.wave_id)?.sequence_rank ?? Number.MAX_SAFE_INTEGER;
    if (waveA !== waveB) return waveA - waveB;
    return (a.priority_rank ?? Number.MAX_SAFE_INTEGER) - (b.priority_rank ?? Number.MAX_SAFE_INTEGER);
  });

  const next = openItems.slice(0, NEXT_LIMIT).map((item) => ({
    item_id: item.id,
    title: item.title,
    wave: waveById.get(item.wave_id)?.title || null,
    disposition: item.item_disposition,
  }));
  const committing = openItems.slice(0, COMMITTING_LIMIT).map((item) => ({
    item_id: item.id,
    title: item.title,
    wave: waveById.get(item.wave_id)?.title || null,
  }));

  // slipped: items on the persisted forward list still not done.
  const forwardListRow = (forwardListRes.data && forwardListRes.data[0]) || null;
  const doneItemIds = new Set(done.map((d) => d.item_id));
  const slipped = [];
  if (forwardListRow) {
    const forwardTitles = new Set((forwardListRow.title || '').split('\n').map((t) => t.trim()).filter(Boolean));
    for (const item of openItems) {
      if (forwardTitles.has(item.title) && !doneItemIds.has(item.id)) {
        slipped.push({ item_id: item.id, title: item.title, reason: 'not yet closed from prior forward list' });
      }
    }
  }

  const admissionsByLinkage = await computeAdmissionsByLinkage(supabase, { cutoffMs });

  return {
    slipped,
    done,
    next,
    committing,
    admissions_by_linkage: admissionsByLinkage,
    // Additive only — see the docblock. `open_total` is the TRUE count of open items;
    // the flags say plainly that what you were handed is not all of it.
    open_total: openItems.length,
    next_truncated: openItems.length > NEXT_LIMIT,
    committing_truncated: openItems.length > COMMITTING_LIMIT,
    // SD-LEO-INFRA-UNCAPPED-ROADMAP-ITEMS-001 FR-1: the UNCAPPED item set, added as a NEW field
    // rather than by lifting the caps above. The docblock settles this: the caps are deliberate,
    // the sole runtime caller reads named properties only, and the suite never uses
    // toStrictEqual — so ADDING a field is safe where changing `next`/`committing` is not.
    // Capacity is added for the new drive-loop consumers; the chairman-facing human report is
    // untouched.
    //
    // KNOWN-BLIND BRANCHES, recorded rather than hidden: the drive-loop sections also read
    // sd.unmet_dependencies, sd.owner_lane and sd.blocked_on_decision. All three exist NOWHERE
    // (42703 as columns; absent from metadata across a 60-row sample), and every section guards
    // them with Array.isArray()/optional-chaining/ternary — so those branches will never fire
    // and the sections are silently blind to blocked-by-dependency, owner_lane resolution and
    // AWAIT_DECISION. A guard that tolerates an absent input makes the absence invisible. This
    // join supplies every field that actually exists; the three that do not need a producer,
    // which is out of this SD's scope and filed as its remainder.
    // FR-3: chain_to_gate needs the WAVES as well as the items — buildChainToGate takes
    // ({ waves, items }), and its current "unavailable" reason says plainly that roadmap waves
    // are not queried by that job. They ARE queried here, so exposing them additively is what
    // keeps chain_to_gate on this single representation instead of spawning a second wave read.
    waves,
    open_items_all: openItems.map((item) => ({
      item_id: item.id,
      title: item.title,
      wave: waveById.get(item.wave_id)?.title || null,
      disposition: item.item_disposition,
      sd_key: item.promoted_to_sd_key || null,
      sd: item.promoted_to_sd_key ? (sdByKey.get(item.promoted_to_sd_key) || null) : null,
    })),
  };
}
