/**
 * Multi-part Solomon reply grouping — SD-LEO-FIX-SOLOMON-MULTI-PART-001.
 *
 * Ground-truthed against live session_coordination rows (2026-07-17): a split
 * Solomon reply does NOT share payload.correlation_id across parts — Solomon's
 * own body text on a live part-2 row explains why: "the send-path dedup blocks
 * a second row on the same correlation, so the contract-documented ordered-
 * parts mechanism cannot deliver -- part 2 rides clean" (a fresh, unrelated
 * correlation_id). The only signal both parts reliably carry is the subject-
 * line "N/M" marker plus the leading title text before it (e.g. a subject
 * "[SOLOMON_ORACLE] [oracle] COMMISSION VERDICT 1/2 -- ..." and a sibling
 * "... COMMISSION VERDICT 2/2 -- ..." share the "COMMISSION VERDICT" prefix
 * even though their trailing text diverges completely).
 *
 * Pure, no I/O.
 */
'use strict';

const BRACKET_TAG_RE = /^(\s*\[[^\]]+\]\s*)+/;
const PART_MARKER_RE = /^(.*?)\s*(\d+)\s*\/\s*(\d+)\b/;

/**
 * Parse a "part N/M" series marker out of a subject line. Strips known leading
 * bracket tags (e.g. "[SOLOMON_ORACLE] [oracle] ") before matching.
 * @param {string} subject
 * @returns {{prefix: string, index: number, total: number} | null}
 */
function parsePartMarker(subject) {
  const stripped = String(subject || '').replace(BRACKET_TAG_RE, '').trim();
  const m = PART_MARKER_RE.exec(stripped);
  if (!m) return null;
  const index = Number(m[2]);
  const total = Number(m[3]);
  if (!Number.isFinite(index) || !Number.isFinite(total) || index < 1 || total < 1 || index > total) return null;
  return { prefix: m[1].trim().toLowerCase(), index, total };
}

/** Read a row's body: payload.body first (canonical for adam_advisory rows), then the body column. */
function readBody(row) {
  return row?.payload?.body || row?.body || '';
}

/** Join a series' parts, in index order, into one logical reply body. */
function reassembleGroupBody(orderedRows) {
  return orderedRows
    .map((r) => String(readBody(r)).trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Group a batch of advisory-shaped rows into logical replies. Rows sharing the
 * same series -- (target_session, sender_session, subject prefix, total) --
 * collapse into one group, ordered by parsed part index (NOT created_at, so
 * out-of-order arrival still reassembles correctly). A row with no parseable
 * marker is its own singleton group (byte-identical single-part behavior).
 * @param {Array<object>} rows - each with {id, subject, target_session, sender_session, body, payload, created_at}
 * @returns {Array<{id: string, memberIds: string[], rows: object[], isMultiPart: boolean, isComplete: boolean, total: number, body: string}>}
 */
function groupMultiPartAdvisories(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const seriesMap = new Map(); // key -> { total, parts: Map(index -> row) }
  const singles = [];

  for (const row of list) {
    const marker = row && parsePartMarker(row.subject);
    if (!marker) { if (row) singles.push(row); continue; }
    const key = [row.target_session, row.sender_session, marker.prefix, marker.total].join('::');
    if (!seriesMap.has(key)) seriesMap.set(key, { total: marker.total, parts: new Map() });
    seriesMap.get(key).parts.set(marker.index, row);
  }

  const groups = [];
  for (const { total, parts } of seriesMap.values()) {
    const orderedRows = [...parts.keys()].sort((a, b) => a - b).map((i) => parts.get(i));
    const lastRow = orderedRows[orderedRows.length - 1];
    groups.push({
      id: lastRow.id,
      memberIds: orderedRows.map((r) => r.id),
      rows: orderedRows,
      isMultiPart: true,
      isComplete: parts.size === total,
      total,
      presentIndices: [...parts.keys()].sort((a, b) => a - b),
      body: reassembleGroupBody(orderedRows),
    });
  }
  for (const row of singles) {
    groups.push({
      id: row.id,
      memberIds: [row.id],
      rows: [row],
      isMultiPart: false,
      isComplete: true,
      total: 1,
      body: readBody(row),
    });
  }
  return groups;
}

module.exports = { parsePartMarker, groupMultiPartAdvisories, reassembleGroupBody };
