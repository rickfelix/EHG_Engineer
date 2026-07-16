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
 */

const OPEN_DISPOSITIONS_EXCLUDE = ['promoted', 'dropped'];
const FORWARD_LIST_SOURCE_REF_PREFIX = 'plan-check-forward-list-';

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

/**
 * @param {object} supabase injected Supabase client (service role — RLS silently returns zero
 *   rows with no error under the anon/authenticated role; always use the service-role client)
 * @param {{windowHours?: number}} [opts]
 * @returns {Promise<{slipped: object[], done: object[], next: object[], committing: object[]}>}
 */
export async function computePlanCheckStatus(supabase, { windowHours = 48 } = {}) {
  const [wavesRes, itemsRes, forwardListRes] = await Promise.all([
    supabase.from('roadmap_waves').select('id, title, sequence_rank, status, progress_pct').order('sequence_rank', { ascending: true }),
    supabase.from('roadmap_wave_items').select('id, wave_id, title, promoted_to_sd_key, item_disposition, priority_rank'),
    supabase.from('adam_task_ledger').select('id, title, source_ref').ilike('source_ref', `${FORWARD_LIST_SOURCE_REF_PREFIX}%`).order('created_at', { ascending: false }).limit(1),
  ]);

  if (wavesRes.error) throw new Error(`plan-check-status: roadmap_waves query failed: ${wavesRes.error.message}`);
  if (itemsRes.error) throw new Error(`plan-check-status: roadmap_wave_items query failed: ${itemsRes.error.message}`);

  const waves = wavesRes.data || [];
  const items = itemsRes.data || [];
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

  const cutoff = hoursAgo(windowHours);
  const done = [];
  const openItems = [];

  for (const item of items) {
    const linkedSd = item.promoted_to_sd_key ? sdByKey.get(item.promoted_to_sd_key) : null;
    const isDone = !!(linkedSd && linkedSd.status === 'completed');
    if (isDone) {
      const withinWindow = linkedSd.completion_date ? linkedSd.completion_date >= cutoff : false;
      if (withinWindow) {
        done.push({
          item_id: item.id,
          title: item.title,
          wave: waveById.get(item.wave_id)?.title || null,
          sd_key: item.promoted_to_sd_key,
          completed_at: linkedSd.completion_date,
        });
      }
    } else if (!OPEN_DISPOSITIONS_EXCLUDE.includes(item.item_disposition)) {
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

  return { slipped, done, next, committing };
}
