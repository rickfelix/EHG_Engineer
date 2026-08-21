/**
 * Adam task-board REHYDRATION — reconstruct open threads from the live sources on a cold /adam start.
 * SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-A (Child A / FR-3).
 *
 * The harness TaskCreate list is session-ephemeral; a restarted / compacted Adam otherwise loses its
 * open items. rehydrateBoard() UPSERTs durable board nodes (via FR-2's createOrUpsertNode, keyed on
 * UNIQUE(source_kind, source_ref)) from three live sources, so a thread already on the board is
 * DEDUPED, not duplicated:
 *   (a) advisory_thread — OPEN Adam advisory threads: session_coordination rows sent by Adam
 *       (sender_type='adam') carrying a correlation_id (or reply_requested) that have NO reply row
 *       (a row whose payload.reply_to matches the correlation_id). source_ref = correlation_id.
 *       A thread whose payload.reply_class='fire-and-forget' (one-way broadcasts — belt-countdowns,
 *       status relays) mirrors with status='done' instead of open (QF-20260703-070).
 *   (b) sourced_sd     — Adam-sourced SDs still open: strategic_directives_v2 where
 *       metadata.sourced_by='adam' AND status IN ('draft','in_progress'). source_ref = sd_key.
 *   (c) awaited_reply  — the awaited-reply markers for the open threads that explicitly requested a
 *       reply (payload.reply_requested truthy). source_ref = correlation_id.
 *
 * Every write goes through the idempotent upsert, so re-running is a safe no-op (dedup). Each source
 * block is wrapped fail-soft: a failing source logs a warning and contributes nothing, so a partial
 * outage still rehydrates the healthy sources (the /adam startup hook is additionally fail-soft).
 *
 * QF-20260802-139: (a)/(c) above only ever OPEN a node — nothing ever closed one, so a resolved or
 * abandoned consult sat 'open' forever (~120 rows, oldest 8+ days, +21/day). closeResolvedAndExpired()
 * sweeps EXISTING open advisory_thread/awaited_reply rows on every tick (this runs from
 * adam-quiet-tick.mjs, not just cold start): close-on-verdict when the row's correlation now has a
 * reply, else expire past a TTL so abandonment is visible instead of immortal. Because this walks the
 * full existing open population, the first run after deploy also backfills the pre-existing backlog —
 * no separate one-time sweep script needed.
 */

import { createOrUpsertNode, TABLE as LEDGER_TABLE } from './task-ledger.js';

const COORDINATION_TABLE = 'session_coordination';
const SD_TABLE = 'strategic_directives_v2';
const OPEN_SD_STATUSES = new Set(['draft', 'in_progress']);
const OPEN_LEDGER_STATUSES = new Set(['open', 'in_progress', 'blocked']);
// Solomon's measured verdict latency is minutes (p50 245-324s, lib/adam/presend-consult-lane.cjs) —
// 48h generously bounds "abandoned" without racing a legitimately slow reply.
const CONSULT_EXPIRY_MS = 48 * 60 * 60 * 1000;

const truthy = (v) => v === true || v === 'true';
const corrId = (row) => (row && row.payload && row.payload.correlation_id) || null;
const replyTo = (row) => (row && row.payload && row.payload.reply_to) || null;
// QF-20260703-070: a one-way broadcast (reply_class='fire-and-forget' — the reply-class SSOT's
// default for `send` mode, lib/coordinator/reply-class.cjs) is terminal at send time and expects
// no reply; mirroring it as an open thread let it age into the stall detector's window (a
// countdown line was flagged "stalled" an hour after it was sent). Rows without a stamped
// reply_class (legacy, pre-SSOT) fall through to the existing open-mirror behavior.
const isFireAndForget = (row) => !!(row && row.payload && row.payload.reply_class === 'fire-and-forget');

/** A short human title for a thread node (subject/body-derived, bounded). */
function threadTitle(row) {
  const p = (row && row.payload) || {};
  const t = p.subject || row.subject || p.body || row.body || `thread ${corrId(row)}`;
  return String(t).replace(/\s+/g, ' ').trim().slice(0, 160) || `thread ${corrId(row)}`;
}

/**
 * QF-20260802-139: close-on-verdict + expiry sweep over EXISTING open advisory_thread/awaited_reply
 * ledger rows (a's/c's node ALREADY on the board from a prior tick — the population this fix bounds).
 * `repliedCorr` is the same resolved-correlation set rehydrateBoard already computed for (a)/(c), so a
 * verdict that landed after the row was opened closes it here. An unanswered row past CONSULT_EXPIRY_MS
 * is 'cancelled' with a blocker note instead of left 'open' forever. Fail-soft, mirrors the SD source's
 * JS-side re-filter convention (stub .in() is a no-op in tests; the live query mirrors this).
 * @param {object} supabase @param {Set<string>} repliedCorr
 * @returns {Promise<{closed:number, expired:number, errors:string[]}>}
 */
async function closeResolvedAndExpired(supabase, repliedCorr) {
  const out = { closed: 0, expired: 0, errors: [] };
  try {
    const { data, error } = await supabase
      .from(LEDGER_TABLE)
      .select('id, source_kind, source_ref, status, created_at');
    if (error) throw new Error(error.message);
    const openRows = (Array.isArray(data) ? data : []).filter(
      (r) => r && ['advisory_thread', 'awaited_reply'].includes(r.source_kind) && OPEN_LEDGER_STATUSES.has(r.status)
    );
    const now = Date.now();
    for (const row of openRows) {
      try {
        if (repliedCorr.has(row.source_ref)) {
          await supabase.from(LEDGER_TABLE).update({ status: 'done' }).eq('id', row.id);
          out.closed += 1;
        } else if (now - new Date(row.created_at).getTime() > CONSULT_EXPIRY_MS) {
          await supabase.from(LEDGER_TABLE)
            .update({ status: 'cancelled', blocker: `expired: no reply within ${CONSULT_EXPIRY_MS / 3600000}h of consult` })
            .eq('id', row.id);
          out.expired += 1;
        }
      } catch (e) {
        out.errors.push(`sweep row ${row.id} failed: ${e?.message ?? e}`);
      }
    }
  } catch (e) {
    out.errors.push(`sweep query failed: ${e?.message ?? e}`);
  }
  return out;
}

/**
 * Rehydrate the durable Adam task board from the three live sources. Idempotent (upsert on
 * (source_kind, source_ref)). Never throws — each source is fail-soft.
 * @param {object} supabase - a supabase client
 * @returns {Promise<{threads:number, parents:number, sds:number, awaited:number, closed:number, expired:number, errors:string[]}>}
 */
export async function rehydrateBoard(supabase) {
  const summary = { threads: 0, parents: 0, sds: 0, awaited: 0, closed: 0, expired: 0, errors: [] };
  if (!supabase || typeof supabase.from !== 'function') {
    summary.errors.push('no supabase client supplied');
    return summary;
  }

  // ── (a)+(c) advisory threads / awaited replies ─────────────────────────────
  // One fetch of the coordination lane; classify open threads + replies in JS (so the reply rows,
  // which are NOT sent by Adam, are visible in the same result set).
  let rows = [];
  try {
    const { data, error } = await supabase
      .from(COORDINATION_TABLE)
      .select('id, sender_type, subject, body, payload, created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    rows = Array.isArray(data) ? data : [];
  } catch (e) {
    summary.errors.push(`advisory-thread source failed: ${e?.message ?? e}`);
    rows = [];
  }

  // Every correlation_id that already has a reply → that thread is resolved (closed).
  const repliedCorr = new Set(rows.map(replyTo).filter(Boolean));
  // Candidate Adam-sent threads that carry a correlation_id and are still open.
  const openThreads = rows.filter(
    (r) => r && r.sender_type === 'adam' && corrId(r) && !repliedCorr.has(corrId(r))
  );

  for (const t of openThreads) {
    const ref = corrId(t);
    const title = threadTitle(t);
    const fireAndForget = isFireAndForget(t);
    // (a) the thread/topic node — a fire-and-forget broadcast mirrors DONE (terminal at send
    // time), not open, so it never matures into a false stall.
    try {
      await createOrUpsertNode(supabase, {
        source_kind: 'advisory_thread',
        source_ref: ref,
        tier: 'parent',
        title,
        ...(fireAndForget ? { status: 'done' } : {}),
      });
      summary.threads += 1;
      summary.parents += 1;
    } catch (e) {
      summary.errors.push(`advisory_thread upsert failed (${ref}): ${e?.message ?? e}`);
    }
    // (c) the awaited-reply marker for threads that explicitly requested a reply — never for a
    // fire-and-forget broadcast (a one-way send never awaits anything, by definition).
    if (!fireAndForget && truthy(t.payload && t.payload.reply_requested)) {
      try {
        await createOrUpsertNode(supabase, {
          source_kind: 'awaited_reply',
          source_ref: ref,
          tier: 'parent',
          title: `awaiting reply: ${title}`,
          blocker: `awaiting reply on ${ref}`,
        });
        summary.awaited += 1;
        summary.parents += 1;
      } catch (e) {
        summary.errors.push(`awaited_reply upsert failed (${ref}): ${e?.message ?? e}`);
      }
    }
  }

  // QF-20260802-139: close-on-verdict + expiry sweep over the EXISTING open population (not just
  // the threads discovered above), using the same repliedCorr resolved-correlation set.
  const sweep = await closeResolvedAndExpired(supabase, repliedCorr);
  summary.closed += sweep.closed;
  summary.expired += sweep.expired;
  summary.errors.push(...sweep.errors);

  // ── (b) Adam-sourced open SDs ──────────────────────────────────────────────
  let sds = [];
  try {
    const { data, error } = await supabase
      .from(SD_TABLE)
      .select('sd_key, title, status, metadata')
      .eq('metadata->>sourced_by', 'adam')
      .in('status', ['draft', 'in_progress']);
    if (error) throw new Error(error.message);
    sds = Array.isArray(data) ? data : [];
  } catch (e) {
    summary.errors.push(`sourced_sd source failed: ${e?.message ?? e}`);
    sds = [];
  }

  // Authoritative JS-side filter (the stub's server filters are no-ops; the live query mirrors this).
  const openSds = sds.filter(
    (s) => s && s.metadata && s.metadata.sourced_by === 'adam' && s.sd_key && OPEN_SD_STATUSES.has(s.status)
  );
  for (const sd of openSds) {
    try {
      await createOrUpsertNode(supabase, {
        source_kind: 'sourced_sd',
        source_ref: sd.sd_key,
        tier: 'parent',
        title: sd.title ? String(sd.title).slice(0, 160) : sd.sd_key,
      });
      summary.sds += 1;
      summary.parents += 1;
    } catch (e) {
      summary.errors.push(`sourced_sd upsert failed (${sd.sd_key}): ${e?.message ?? e}`);
    }
  }

  return summary;
}

export default { rehydrateBoard };
