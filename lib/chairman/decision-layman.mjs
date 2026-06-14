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
  const anchor = {}; // decision_type -> index in items
  for (const row of (sortedRows || [])) {
    const dt = row?.decision_type;
    if (GROUPABLE_TYPES.has(dt)) {
      if (anchor[dt] == null) { anchor[dt] = items.length; items.push({ type: dt, kind: 'group', rows: [row] }); }
      else items[anchor[dt]].rows.push(row);
    } else {
      items.push({ type: dt, kind: 'single', rows: [row] });
    }
  }
  return items;
}

/** Total number of decisions an item set represents (groups count every member). */
export function decisionCount(items) {
  return (items || []).reduce((n, it) => n + it.rows.length, 0);
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
 * Render ONE item into a plain action line. The free-text types show the title AS RECEIVED.
 * @param {object} item - from buildDecisionItems
 * @param {Date} now
 * @returns {string}
 */
export function renderItem(item, now = new Date()) {
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

/** Full render: rows -> { count, lines }. Sorts (priority/age), groups, and renders each item. */
export function renderDecisionLines(rows, now = new Date()) {
  const items = buildDecisionItems(sortPending(rows, now));
  return {
    count: decisionCount(items),
    lines: items.map((it) => renderItem(it, now)),
  };
}
