/**
 * lib/chairman/decision-layman.mjs — turn chairman_pending_decisions rows into
 * plain, copy-paste-ready action lines for the chairman exec email.
 *
 * Chairman directive (2026-06-14): the hourly exec email must be a single block the chairman
 * SELECTS, COPIES, and PASTES back into Claude Code to action the items.
 *
 * DESIGN (no LLM — chairman 2026-06-14 "just take the text as we receive it"):
 *  - Structured decision types (chairman_approval, gate_decision, flag_enablement,
 *    okr_acceptance) render from their structured columns (stage / venture_name / period) —
 *    these carry no free text and read cleanly with no translation.
 *  - Free-text types (flag_review, escalation) are shown AS RECEIVED (the raw title), wrapped
 *    in a short action verb. No paraphrase, so nothing is invented or lost.
 *  - Repetitive types (Stage approvals, gate decisions) are GROUPED into one line so the list
 *    stays short, but the decision COUNT still reflects every underlying row.
 *  - Every line ends with the REAL decision reference `decision_type:id` (the same handle the
 *    chairman-decisions CLI uses) so a pasted instruction resolves to the exact row for sure.
 *
 * PURE: no IO, no DB, no LLM — fully unit-testable.
 */

import { formatAge, sortPending } from './decision-queue.mjs';

/** Decision types collapsed into a single grouped line when more than one is pending. */
export const GROUPABLE_TYPES = new Set(['chairman_approval', 'gate_decision']);

// SD-LEO-INFRA-FIX-CHAIRMAN-HOURLY-001 (FR-4): venture statuses that make a pending
// chairman_approval STALE (the view does not join venture status, so a cancelled venture's
// approval lingers forever). Such approvals are dropped from the chairman's action list.
export const DEAD_VENTURE_STATUSES = new Set(['cancelled', 'canceled', 'killed', 'archived']);

/**
 * FR-4: is this row an AUTO-GENERATED "Corrective: … Vision/Architecture Gap …" finding (safe to
 * collapse)? Requires BOTH the "Corrective:" prefix AND the generator's "Vision Gap"/"Architecture
 * Gap" signature, so a hand-written urgent item like "Corrective: SEV1 — payments down" is NOT
 * swallowed into the advisory line — it stays its own actionable decision.
 */
export function isCorrectiveFlag(row) {
  if (row?.decision_type !== 'flag_review') return false;
  const title = String(row?.title || '');
  return /^\s*corrective\s*:/i.test(title) && /(vision|architecture)\s+gap/i.test(title);
}

/**
 * FR-4 — PURE freshness pass for the chairman action list. Two cleanups, both fail-soft:
 *   1. DROP chairman_approval rows whose venture is dead (cancelled/killed/archived) — the view
 *      keeps them because it never joins venture status.
 *   2. MARK the auto-generated "Corrective: …" flag_reviews (row._corrective=true) so they collapse
 *      into ONE line (buildDecisionItems) instead of clogging the list — refs are preserved so the
 *      chairman can still resolve every underlying finding.
 * Returns NEW row objects (no mutation of the inputs).
 * @param {object[]} rows
 * @param {{deadVentureIds?: Set<string>}} [opts]
 * @returns {object[]}
 */
export function prepareDecisions(rows, { deadVentureIds = new Set() } = {}) {
  const out = [];
  for (const row of (Array.isArray(rows) ? rows : [])) {
    if (!row) continue;
    if (row.decision_type === 'chairman_approval' && row.venture_id && deadVentureIds.has(row.venture_id)) continue; // stale: dead venture
    out.push(isCorrectiveFlag(row) ? { ...row, _corrective: true } : row);
  }
  return out;
}

/** details is jsonb (object) from the view, but tolerate a stringified value. */
function detailsOf(row) {
  const d = row?.details;
  if (!d) return {};
  if (typeof d === 'string') { try { return JSON.parse(d) || {}; } catch { return {}; } }
  return typeof d === 'object' ? d : {};
}

/** Collapse whitespace + truncate on a word boundary with an ellipsis. */
export function cleanText(s, max = 180) {
  let out = String(s || '').replace(/\s+/g, ' ').trim();
  if (out.length > max) out = out.slice(0, max).replace(/\s+\S*$/, '').replace(/[\s,.:;—-]+$/, '') + '…';
  return out;
}

/**
 * Group sorted rows into ordered render items. Each item anchors at the position of
 * its first member (so overall priority/age ordering is preserved). Groupable types
 * collapse into one item; everything else is one item per row.
 * @returns {Array<{type:string, kind:'group'|'single', rows:object[]}>}
 */
export function buildDecisionItems(sortedRows) {
  const items = [];
  const anchor = {}; // grouping key -> index in items
  for (const row of (sortedRows || [])) {
    const dt = row?.decision_type;
    // FR-4: auto-generated "Corrective:" findings collapse into ONE group regardless of their
    // (shared) decision_type, so the chairman sees a single advisory line, not 6 noise items.
    const groupKey = row?._corrective ? 'corrective' : (GROUPABLE_TYPES.has(dt) ? dt : null);
    if (groupKey) {
      if (anchor[groupKey] == null) { anchor[groupKey] = items.length; items.push({ type: row?._corrective ? 'corrective' : dt, kind: 'group', rows: [row] }); }
      else items[anchor[groupKey]].rows.push(row);
    } else {
      items.push({ type: dt, kind: 'single', rows: [row] });
    }
  }
  return items;
}

/**
 * Total number of decisions an item set represents. Groups of real decisions (stage approvals,
 * gate calls) count EVERY member (each needs a call). FR-4: the collapsed "corrective" group is a
 * SINGLE advisory action ("skim them in the dashboard"), so it counts as 1 — keeping the chairman's
 * action count honest rather than inflated by auto-generated noise.
 */
export function decisionCount(items) {
  return (items || []).reduce((n, it) => n + (it.type === 'corrective' ? 1 : it.rows.length), 0);
}

/**
 * The real, resolvable reference(s) for an item: each token is a full `decision_type:id`
 * (the exact handle the chairman-decisions CLI parses), so a pasted grouped line resolves to
 * every underlying row — not a corrupt concatenated id.
 */
export function refTag(rows) {
  return `[ref${rows.length > 1 ? 's' : ''} ${rows.map((r) => `${r.decision_type}:${r.id}`).join(', ')}]`;
}

function stageRange(rows) {
  const stages = rows.map((r) => r.stage).filter((s) => s != null);
  if (!stages.length) return 'their current stage';
  const lo = Math.min(...stages), hi = Math.max(...stages);
  return lo === hi ? `Stage ${lo}` : `Stage ${lo}–${hi}`;
}

function ageRange(rows, now) {
  if (rows.length === 1) return formatAge(rows[0].created_at, now);
  const ts = (r) => new Date(r.created_at || now).getTime();
  const oldest = formatAge(rows.reduce((a, b) => (ts(a) <= ts(b) ? a : b)).created_at, now); // smallest ts = oldest
  const newest = formatAge(rows.reduce((a, b) => (ts(a) >= ts(b) ? a : b)).created_at, now); // largest ts = newest
  return newest === oldest ? oldest : `${newest}–${oldest}`;
}

function ventureName(row) {
  return row?.venture_name ? `venture “${row.venture_name}”` : 'the venture';
}

/**
 * Render ONE item's BODY (no triage note) into a plain action line. The free-text types show
 * the title AS RECEIVED. Wrapped by renderItem(), which appends the triage rationale before the
 * trailing ref token. Kept as the unmodified base so the per-type lines + ref contract are stable.
 * @param {object} item - from buildDecisionItems
 * @param {Date} now
 * @returns {string}
 */
function renderItemBase(item, now = new Date()) {
  const rows = item.rows;
  const ref = refTag(rows);

  if (item.type === 'chairman_approval') {
    if (rows.length === 1) {
      return `Approve ${ventureName(rows[0])} to move past ${stageRange(rows)} (waiting ${ageRange(rows, now)}). ` +
        `It can't move forward until you sign off — show it to me and walk me through approving it. ${ref}`;
    }
    return `Approve the ${rows.length} ventures waiting for your sign-off (${stageRange(rows)}, waiting ${ageRange(rows, now)}). ` +
      `They can't move forward until you approve — show me each one and walk me through approving them. ${ref}`;
  }

  if (item.type === 'gate_decision') {
    if (rows.length === 1) {
      const r = rows[0];
      const blocking = r.blocking ? ' (this gate is blocking the venture)' : '';
      const rec = r.recommendation ? ` The system recommends: ${cleanText(r.recommendation, 80)}.` : '';
      return `Decide whether ${ventureName(r)} passes its ${stageRange(rows)} gate${blocking} (waiting ${ageRange(rows, now)}).${rec} ` +
        `Show it to me and walk me through the call. ${ref}`;
    }
    const nBlocking = rows.filter((r) => r.blocking).length;
    const blockingNote = nBlocking ? ` ${nBlocking} of these ${nBlocking === 1 ? 'is' : 'are'} blocking a venture.` : '';
    return `Make ${rows.length} venture stage-gate calls (${stageRange(rows)}, waiting ${ageRange(rows, now)}).${blockingNote} ` +
      `Show me each one with its recommendation and walk me through them. ${ref}`;
  }

  // FR-4: collapsed auto-generated corrective findings — one advisory line, all refs preserved.
  if (item.type === 'corrective') {
    return `Review ${rows.length} auto-flagged vision/architecture-gap finding${rows.length === 1 ? '' : 's'} ` +
      `(advisory, ${ageRange(rows, now)}) — these are generated by the system; skim them in the dashboard when you have time. ${ref}`;
  }

  // singles
  const row = rows[0];
  const age = formatAge(row.created_at, now);
  const prio = row.priority || 'high';

  if (item.type === 'flag_review') {
    return `Review and decide on this ${prio}-priority flagged issue (flagged ${age}): ` +
      `“${cleanText(row.title, 200)}” ${ref}`;
  }

  if (item.type === 'escalation') {
    const who = row.requestor_name ? ` from ${row.requestor_name}` : '';
    const body = cleanText(detailsOf(row).body || row.title, 200);
    return `Respond to an escalated question${who} (${age}): “${body}” ${ref}`;
  }

  if (item.type === 'flag_enablement') {
    const d = detailsOf(row);
    const name = d.display_name || d.flag_key || String(row.title || '').replace(/^Feature flag:\s*/i, '') || 'a draft feature';
    return `Decide whether to turn on or drop the draft feature “${cleanText(name, 60)}” (idle ${age}). ${ref}`;
  }

  if (item.type === 'okr_acceptance') {
    const period = detailsOf(row).period || '';
    return `Review and accept (or reject) the ${period ? period + ' ' : ''}goals Adam generated (${age} old). ${ref}`;
  }

  // unknown type — present the title as received.
  return `${cleanText(row.title, 200)} (${age}). ${ref}`;
}

/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-DELIVERY-001 — the TRIAGE RATIONALE for a non-technical chairman.
 * The chairman_pending_decisions view silently REORDERS/ELEVATES decisions (age_escalated past 72h bumps a
 * priority class; blocking sorts first), but the email never says WHY an item jumped the queue. This PURE helper
 * renders that already-decided rationale in plain language — it does NOT re-derive the escalation rule (it only
 * reads the view's age_escalated flag + blocking). Returns '' when nothing elevated the item (no spurious note).
 *
 * Accepts a render-item ({type, rows}), an array of rows, or a single row (flexible for callers + tests).
 * @returns {string} e.g. "(moved up — waiting 9d)", "(blocking a venture)", "" — paren-wrapped or empty.
 */
export function triageNote(itemOrRows, now = new Date()) {
  const rows = Array.isArray(itemOrRows?.rows) ? itemOrRows.rows
    : Array.isArray(itemOrRows) ? itemOrRows
    : itemOrRows ? [itemOrRows] : [];
  const type = itemOrRows && !Array.isArray(itemOrRows) ? itemOrRows.type : undefined;
  const parts = [];

  // Age-escalation: reuse the view's authoritative age_escalated flag (do NOT recompute the 72h rule).
  const escalated = rows.filter((r) => r && r.age_escalated === true);
  if (escalated.length) {
    const ts = (r) => new Date(r.created_at || now).getTime();
    const oldest = escalated.reduce((a, b) => (ts(a) <= ts(b) ? a : b)); // smallest ts = oldest
    parts.push(`moved up — waiting ${formatAge(oldest.created_at, now)}`);
  }

  // Blocking: gate_decision already states blocking inline in renderItemBase, so only annotate it for
  // OTHER types (avoid a redundant double-mention on gate lines). The gate suppression keys on the render-item
  // `type`; the production caller (renderItem) always passes the full item, so a raw-row/array call (tests only)
  // would not suppress — harmless since renderItem is the sole production path.
  if (type !== 'gate_decision') {
    const nBlocking = rows.filter((r) => r && r.blocking).length;
    if (nBlocking) parts.push(nBlocking > 1 ? `${nBlocking} blocking a venture` : 'blocking a venture');
  }

  return parts.length ? `(${parts.join('; ')})` : '';
}

/**
 * Render ONE item: the base action line plus the triage rationale, INSERTED BEFORE the trailing ref token so
 * the `[ref(s) decision_type:id]` handle the chairman-decisions CLI parses stays at the end, byte-identical.
 * @param {object} item
 * @param {Date} now
 * @returns {string}
 */
export function renderItem(item, now = new Date()) {
  const line = renderItemBase(item, now);
  const note = triageNote(item, now);
  if (!note) return line;
  const ref = refTag(item.rows);
  // Keep the ref trailing: splice the note in just before it (fallback: append, never drop the note).
  return line.endsWith(ref) ? `${line.slice(0, -ref.length).trimEnd()} ${note} ${ref}` : `${line} ${note}`;
}

/** Full render: rows -> { count, lines }. Sorts (priority/age), groups, and renders each item. */
export function renderDecisionLines(rows, now = new Date()) {
  const items = buildDecisionItems(sortPending(rows, now));
  return {
    count: decisionCount(items),
    lines: items.map((it) => renderItem(it, now)),
  };
}

// ── SD-LEO-INFRA-LEAN-DECISION-EMAIL-001 ─────────────────────────────────────
// The LEAN, decision-SPECIFIC on-demand email renderer. Unlike renderDecisionLines (which reads the
// chairman_pending_decisions VIEW that HARDCODES decision_type='chairman_approval', sets
// title='Stage N Chairman Approval', and DROPS brief_data — so a session_question is mis-rendered as a
// venture sign-off), these helpers read the BASE chairman_decisions row shape: the REAL decision_type,
// `summary`, `brief_data.{title,recommendation,context}`, `lifecycle_stage`, `blocking`, `venture_id`.
// PURE — no IO/DB/LLM. The thin IO shell (scripts/adam-decision-email.mjs) reads the base rows + sends.

/** brief_data is jsonb (object) on the base table, but tolerate a stringified value. */
function briefOf(row) {
  const b = row?.brief_data;
  if (!b) return {};
  if (typeof b === 'string') { try { return JSON.parse(b) || {}; } catch { return {}; } }
  return typeof b === 'object' ? b : {};
}

/**
 * Render ONE base chairman_decisions row into a plain, decision-SPECIFIC action line, by its REAL type.
 *  - A true venture approval (chairman_approval/gate_decision/stage_gate WITH a venture_id) keeps the
 *    venture/stage framing.
 *  - Everything else (session_question / operational / governance / escalation / …) renders as its
 *    QUESTION (brief_data.title || summary) + context + the free-text recommendation — NEVER as a
 *    "venture waiting for sign-off (Stage X)". Ends with the REAL `decision_type:id` ref.
 * @param {object} baseRow - a chairman_decisions row (base table, not the view)
 * @param {Date} now
 * @returns {string}
 */
export function renderLeanDecision(baseRow, now = new Date()) {
  const r = baseRow || {};
  const bd = briefOf(r);
  const dt = r.decision_type || 'session_question';
  const id = r.id;
  const ref = `[ref ${dt}:${id}]`;
  const age = formatAge(r.created_at, now);
  const title = cleanText(bd.title || r.summary || 'a pending decision', 200);
  // The free-text recommendation lives in brief_data (the column only allows proceed/pivot/fix/kill/pause).
  const rec = bd.recommendation || (typeof r.recommendation === 'string' ? r.recommendation : '');
  const recLine = rec ? ` Recommendation: ${cleanText(rec, 160)}.` : '';

  const isVentureApproval =
    (dt === 'chairman_approval' || dt === 'gate_decision' || dt === 'stage_gate') && !!r.venture_id;

  if (isVentureApproval) {
    const stage = (r.lifecycle_stage != null) ? `Stage ${r.lifecycle_stage}` : 'its current stage';
    const blocking = r.blocking ? ' (blocking the venture)' : '';
    return `Approve the venture to move past ${stage}${blocking} (waiting ${age}): “${title}”.${recLine} ` +
      `Show it to me and walk me through the call. ${ref}`;
  }

  // Non-venture decision — render the ACTUAL question + context + recommendation.
  let ctx = bd.context;
  if (ctx && typeof ctx !== 'string') { try { ctx = JSON.stringify(ctx); } catch { ctx = ''; } }
  const ctxLine = ctx ? ` Context: ${cleanText(ctx, 220)}.` : '';
  return `Decide: “${title}” (waiting ${age}).${ctxLine}${recLine} ${ref}`;
}

/**
 * Render the LEAN on-demand decision email for a set of BASE chairman_decisions rows. The escalated
 * decision (primaryId) leads; the subject is the standout '[ACTION NEEDED - ADAM] <decision title>'.
 * Returns the pure pieces; the script assembles text/html + sends. NO status block is produced here.
 * @param {object[]} baseRows
 * @param {Date} now
 * @param {{primaryId?: string}} [opts]
 * @returns {{subject: string, lines: string[], primary: object|null}}
 */
export function renderLeanDecisionEmail(baseRows, now = new Date(), { primaryId } = {}) {
  const rows = (Array.isArray(baseRows) ? baseRows : []).filter(Boolean);
  const primary = (primaryId && rows.find((r) => r.id === primaryId)) || rows[0] || null;
  const bd = primary ? briefOf(primary) : {};
  const subjTitle = primary
    ? cleanText(bd.title || primary.summary || 'chairman decision needed', 80)
    : 'chairman decision needed';
  const extra = rows.length > 1 ? ` (+${rows.length - 1} more)` : '';
  const subject = `[ACTION NEEDED - ADAM] ${subjTitle}${extra}`;
  const ordered = primary ? [primary, ...rows.filter((r) => r !== primary)] : rows;
  const lines = ordered.map((r) => renderLeanDecision(r, now));
  return { subject, lines, primary };
}
