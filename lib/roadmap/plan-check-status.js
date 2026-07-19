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

const FORWARD_LIST_SOURCE_REF_PREFIX = 'plan-check-forward-list-';
// SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001: narrowed from
// ['approved','active','completed'] to approved-only, matching v_plan_of_record_remainder's
// scope and the SD's "ratified plan-of-record" definition. This is a deliberate,
// chairman-visible behavior change (see PLAN-TO-LEAD handoff notes), not a regression --
// active/completed waves are no longer "remaining" plan-of-record by definition.
const RATIFIED_WAVE_STATUSES = ['approved'];
// remainder_state values that represent genuinely open (not yet done, not void, not
// satisfied by another SD) plan-of-record work.
const OPEN_REMAINDER_STATES = ['promotable_now', 'gated_on_chairman', 'in_flight_or_sequence_blocked'];

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
  const { data: rows, error } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, metadata, created_at, updated_at')
    .or(`created_at.gte.${cutoffIso},updated_at.gte.${cutoffIso}`);
  if (error) throw new Error(`plan-check-status: admissions_by_linkage query failed: ${error.message}`);

  const byWaveMap = new Map();
  const unlinkedMap = new Map();
  const fenceLifts = [];

  for (const sd of rows || []) {
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

/**
 * @param {object} supabase injected Supabase client (service role — RLS silently returns zero
 *   rows with no error under the anon/authenticated role; always use the service-role client)
 * @param {{windowHours?: number}} [opts]
 * @returns {Promise<{slipped: object[], done: object[], next: object[], committing: object[]}>}
 */
export async function computePlanCheckStatus(supabase, { windowHours = 48 } = {}) {
  const canonicalRoadmap = await resolveCanonicalRoadmap(supabase);
  if (!canonicalRoadmap) {
    throw new Error('plan-check-status: no active (canonical) roadmap found — cannot compute PLAN CHECK');
  }

  const [wavesRes, forwardListRes] = await Promise.all([
    supabase.from('roadmap_waves')
      .select('id, title, sequence_rank, status, progress_pct')
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
    const { data: itemsData, error: itemsErr } = await supabase
      .from('v_plan_of_record_remainder')
      .select('id, wave_id, title, promoted_to_sd_key, item_disposition, priority_rank, remainder_state')
      .in('wave_id', waveIds);
    if (itemsErr) throw new Error(`plan-check-status: v_plan_of_record_remainder query failed: ${itemsErr.message}`);
    items = itemsData || [];
  }

  const waveById = new Map(waves.map((w) => [w.id, w]));

  const linkedSdKeys = [...new Set(items.filter((i) => i.promoted_to_sd_key).map((i) => i.promoted_to_sd_key))];
  let sdByKey = new Map();
  if (linkedSdKeys.length) {
    const { data: sds, error: sdErr } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, status, completion_date')
      .in('sd_key', linkedSdKeys);
    if (sdErr) throw new Error(`plan-check-status: strategic_directives_v2 query failed: ${sdErr.message}`);
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

  const next = openItems.slice(0, 10).map((item) => ({
    item_id: item.id,
    title: item.title,
    wave: waveById.get(item.wave_id)?.title || null,
    disposition: item.item_disposition,
  }));
  const committing = openItems.slice(0, 5).map((item) => ({
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

  return { slipped, done, next, committing, admissions_by_linkage: admissionsByLinkage };
}
