/**
 * SD-LEO-INFRA-OPEN-COMMITMENTS-RECONCILED-001 / FR-3 — commitment-writer hook.
 *
 * A verbal/role-message commitment ("I will do X by Y") is not backed by a queryable
 * session_coordination row the same way a relay/decision/review request is -- there is no
 * dedicated payload.kind for it. This module gives senders an explicit, opt-in declaration
 * syntax (a `[COMMIT: <subject>]` tag, optionally followed by `by <ISO-8601 date>`) rather
 * than trying to infer intent from free text, which would risk exactly the ~2081-row
 * false-positive class VALIDATION measured for the naive session_coordination join this SD
 * replaces. A row whose reply_class is 'fire-and-forget' (coordinator-reply.cjs's replies,
 * by construction) is NEVER a commitment, matching TS-1's fixture.
 *
 * @module lib/coordinator/commitment-writer
 */

'use strict';

const COMMIT_TAG_RE = /\[COMMIT:\s*([^\]]+)\]/i;
const DUE_BY_RE = /\bby\s+(\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?)/i;

/**
 * Pure: does this row's body declare a commitment, and if so what's the subject/due_by?
 * @param {object} row - a session_coordination row about to be (or just) inserted.
 * @returns {{subject:string, dueBy:string|null}|null}
 */
function detectCommitment(row) {
  if (!row) return null;
  if (row.payload && row.payload.reply_class === 'fire-and-forget') return null;
  const body = row.body || (row.payload && row.payload.body) || '';
  if (typeof body !== 'string' || body.length === 0) return null;
  const match = COMMIT_TAG_RE.exec(body);
  if (!match) return null;
  const subject = match[1].trim();
  if (!subject) return null;
  const dueMatch = DUE_BY_RE.exec(body);
  const dueBy = dueMatch ? dueMatch[1] : null;
  return { subject, dueBy };
}

/**
 * IO: write a detected commitment. FAIL-SOFT -- never throws, so a commitment-write fault
 * can never block the underlying session_coordination send it rides alongside.
 * @param {object} supabase
 * @param {object} row - the inserted session_coordination row (sender_session/target_session).
 * @param {object} [logger]
 * @returns {Promise<void>}
 */
async function writeCommitmentIfDeclared(supabase, row, logger = console) {
  try {
    const commitment = detectCommitment(row);
    if (!commitment) return;
    const { error } = await supabase.from('commitments').insert({
      owner_session: row.sender_session || null,
      counterparty_session: row.target_session || null,
      subject: commitment.subject,
      due_by: commitment.dueBy,
    });
    // SECURITY finding SEC-3 (EXEC-phase review): supabase-js RESOLVES with {error} on a
    // DB-side rejection (missing table, RLS denial, invalid due_by) rather than throwing —
    // the try/catch below only ever caught a transport-level throw, so a rejected insert was
    // silently discarded with no log line at all, contradicting this function's own
    // fail-SOFT-not-fail-SILENT contract.
    if (error) {
      logger && logger.warn && logger.warn(`[commitment-writer] insert rejected: ${error.message || error}`);
    }
  } catch (e) {
    logger && logger.warn && logger.warn(`[commitment-writer] write skipped (fail-open): ${e && e.message}`);
  }
}

module.exports = { detectCommitment, writeCommitmentIfDeclared };
