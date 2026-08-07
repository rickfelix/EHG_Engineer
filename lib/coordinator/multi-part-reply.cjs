/**
 * Multi-part Solomon reply grouping — SD-LEO-FIX-SOLOMON-MULTI-PART-001.
 *
 * CURRENT CONVENTION: ordered parts of one logical reply SHARE a single
 * payload.correlation_id, and carry first-class payload.part_index /
 * payload.part_total. Read readExplicitPartMarker() below — that is the path
 * live senders take today.
 *
 * ── HISTORICAL, retained because it is why the fallback exists ──────────────
 * The paragraph below described the state on 2026-07-17 and was accurate then.
 * It is NOT the current contract; it was superseded when the send-path dedup
 * became discriminator-aware (SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-C).
 * It is flagged rather than deleted because rows written under it still exist
 * and still need the subject-regex fallback to group correctly.
 *
 *   Ground-truthed against live session_coordination rows (2026-07-17): a split
 *   Solomon reply did NOT share payload.correlation_id across parts — Solomon's
 *   own body text on a live part-2 row explains why: "the send-path dedup blocks
 *   a second row on the same correlation, so the contract-documented ordered-
 *   parts mechanism cannot deliver -- part 2 rides clean" (a fresh, unrelated
 *   correlation_id). The only signal both parts reliably carried was the subject-
 *   line "N/M" marker plus the leading title text before it (e.g. a subject
 *   "[SOLOMON_ORACLE] [oracle] COMMISSION VERDICT 1/2 -- ..." and a sibling
 *   "... COMMISSION VERDICT 2/2 -- ..." share the "COMMISSION VERDICT" prefix
 *   even though their trailing text diverges completely).
 *
 * Two conventions genuinely coexist in the DATA; only one is correct for new
 * sends. Stating the current one first is the whole point of this edit — the
 * stale paragraph led the reading of this module for months.
 *
 * Pure, no I/O.
 */
'use strict';

/**
 * Ceiling on ordered parts per reply. The part dimension deliberately relaxes the "one answer per
 * correlation" invariant (that is the point), but an UNBOUNDED relaxation is not a narrowing at all:
 * a sender could post arbitrarily many rows on one correlation just by incrementing part_index.
 * MAX_PARTS keeps the relaxed bound finite and small.
 *
 * Lives HERE, in the module that owns the part concept, rather than in either sender. It began as a
 * local const in solomon-advisory.cjs; giving Adam the same capability by copying the literal would
 * have created two constants that must agree and no mechanism making them agree — which is the exact
 * defect class SD-LEO-INFRA-CONSULT-CORRELATION-CONVENTIONS-001 exists to close.
 */
const MAX_PARTS = 20;

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

/**
 * SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-C (FR-3): read a FIRST-CLASS part marker from the
 * payload. Since the send-path dedup became discriminator-aware (lib/coordinator/reply-class.cjs
 * alreadyAnswered), ordered parts may legitimately share ONE correlation_id, so a series no longer
 * has to be inferred from subject text. The series prefix is keyed on correlation_id, which is what
 * the header above says was impossible before — the subject-regex path below is now a FALLBACK for
 * legacy rows written while parts still had to mint a fresh correlation each.
 *
 * Returns the same shape as parsePartMarker so the grouping logic is shared verbatim.
 * @returns {{prefix: string, index: number, total: number} | null}
 */
function readExplicitPartMarker(row) {
  const p = row && row.payload;
  if (!p) return null;
  const index = Number(p.part_index);
  const total = Number(p.part_total);
  // Both halves required — a part index with no total is unorderable, so fall back to the subject.
  if (!Number.isFinite(index) || !Number.isFinite(total)) return null;
  if (index < 1 || total < 1 || index > total) return null;
  return { prefix: `corr:${p.correlation_id || ''}`, index, total };
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
    // FR-3: prefer the explicit payload marker; fall back to the subject regex for legacy rows.
    const marker = (row && readExplicitPartMarker(row)) || (row && parsePartMarker(row.subject));
    if (!marker) { if (row) singles.push(row); continue; }
    const key = [row.target_session, row.sender_session, marker.prefix, marker.total].join('::');
    if (!seriesMap.has(key)) seriesMap.set(key, { total: marker.total, parts: new Map() });
    const seriesParts = seriesMap.get(key).parts;
    // Adversarial-review fix (PR #6191, round 3): a second row landing on an
    // already-occupied index (e.g. a retried/duplicate send -- no unique
    // constraint prevents this) must never silently vanish. Route it to its own
    // visible singleton instead of overwriting the first row in the Map.
    if (seriesParts.has(marker.index)) { singles.push(row); continue; }
    seriesParts.set(marker.index, row);
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

module.exports = { MAX_PARTS, parsePartMarker, readExplicitPartMarker, groupMultiPartAdvisories, reassembleGroupBody };
