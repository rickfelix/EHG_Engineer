'use strict';
/**
 * Adam PRE-SEND Solomon consult lane — SD-LEO-INFRA-SOLOMON-CONSULT-CANNOT-DELIVER-001 (FR-6/FR-1/FR-2).
 *
 * WHY THIS MODULE EXISTS (FR-6). The lane used to be ~50 inline lines inside
 * scripts/adam-advisory.cjs main() (:1085-1133). `main` is not exported and is guarded by
 * `require.main === module`, so the LIVE path had NO test seam at all: every adam-advisory test
 * imports only pure helpers. That is why the 8s bounded wait survived a 100% failure rate
 * (197/197 duty=pre_send_consult ledger rows over 30d were timeout-proceed) with a fully green
 * suite — nothing could assert on it. This module makes the lane unit-testable via injected deps,
 * honoring the doctrine already stated at should-consult-solomon.js:9-11 and adam-advisory.cjs:1081
 * (all logic in the unit-tested lib; the live path keeps a tiny diff).
 *
 * WHY IT IS NON-BLOCKING (FR-1). There is NO safe blocking value. The consult gate runs BEFORE
 * insertCoordinationRow writes the advisory, and an outer 60s execFileSync wrapper
 * (adam-github-assessment.mjs sendAdvisory) kills the process first — so a longer wait converts today's
 * degraded-proceed into TOTAL SEND LOSS, strictly worse. Meanwhile the measured MINIMUM verdict
 * latency is 135s (p50 245-324s). The wait is therefore removed, not enlarged: the lane emits a
 * durable reply-needed consult and returns immediately, and a late verdict is reconciled
 * out-of-band against the ledger row stamped with the same correlationId (FR-0/FR-3).
 */

/**
 * Run the pre-send consult lane.
 *
 * Every collaborator is injected so the lane is testable without a DB, a live Solomon, or the
 * adam-advisory script. `deps.awaitCoordinatorReply` is deliberately NOT among them: its absence
 * is the structural guarantee that this lane cannot block (TS-6 asserts the call-count is 0 by
 * construction, because there is nothing here to call).
 *
 * @param {Object} input
 * @param {string} input.subject          - advisory subject (gate input title)
 * @param {string} input.body             - advisory body (gate input body)
 * @param {string} input.senderCallsign
 * @param {string} input.sessionId        - Adam session id (sender_session)
 * @param {string} [input.repo]
 * @param {string} [input.expiresAt]
 * @param {boolean}[input.isChairmanTargeted=false]
 * @param {Object} deps
 * @param {Function} deps.evaluatePreSendConsult   - (gateInput) => { action }
 * @param {Function} deps.performBoundedConsult    - (gateInput, consultDeps) => outcome
 * @param {Function} deps.getActiveSolomonId       - async (…) => id | null
 * @param {Function} deps.buildSolomonConsultPayload
 * @param {Function} deps.buildPreSendConsultBody
 * @param {Function} deps.insertCoordinationRow
 * @param {Function} deps.recordLedger             - async (ledgerRow) => void
 * @param {Function} [deps.captureNearMiss]        - async (nearMiss) => void
 * @param {Function} [deps.randomUUID]             - () => string (injected for determinism)
 * @returns {Promise<Object>} the performBoundedConsult outcome, or { action: 'skip', reason }
 */
async function runPreSendConsultLane(input = {}, deps = {}) {
  const {
    subject = '', body = '', senderCallsign, sessionId, repo, expiresAt,
    isChairmanTargeted = false,
    // QF-20260727-709: { role, sessionId } of the party the ADVISORY is addressed to — not the
    // reviewer. Already resolved at the send call site, so this threads an existing value rather
    // than deriving a new one. Optional; omitting it reproduces the previous envelope byte-for-byte.
    addressee = null,
  } = input;
  const {
    evaluatePreSendConsult, performBoundedConsult, getActiveSolomonId,
    buildSolomonConsultPayload, buildPreSendConsultBody, insertCoordinationRow,
    recordLedger, captureNearMiss,
  } = deps;
  const randomUUID = typeof deps.randomUUID === 'function'
    ? deps.randomUUID
    : () => require('crypto').randomUUID();

  const gateInput = { title: subject, body, isChairmanTargeted };
  if (evaluatePreSendConsult(gateInput).action !== 'consult-then-send') {
    return { action: 'skip', reason: 'gate-not-triggered' };
  }

  return performBoundedConsult(gateInput, {
    // FR-1: deps.consult emits a DURABLE reply-needed consult and returns IMMEDIATELY. It returns
    // the FR-0 envelope { correlationId, pending: true } — carrying no verdict — so
    // performBoundedConsult's FR-7 gotVerdict check routes it down the proceed+ledger arm and the
    // correlationId is stamped into the ledger row as the reconciliation anchor.
    consult: async () => {
      let solomonId = null;
      try { solomonId = await getActiveSolomonId(); } catch { solomonId = null; }
      const correlationId = randomUUID();
      const cp = buildSolomonConsultPayload({
        correlationId,
        // QF-20260727-709: forward WHO the message is addressed to. Without it the reviewer reads
        // second-person prose aimed at a different party as aimed at himself. Optional and
        // undefined-safe — an omitted addressee reproduces the previous envelope exactly.
        body: buildPreSendConsultBody(body, addressee),
        senderCallsign,
        repo,
        severity: 'high',
        // FR-2: structural discriminator. Previously the ONLY thing marking a pre-send consult was
        // the literal '[PRE-SEND CONSULT]' body prefix, so any consumer had to match on prose.
        consultPurpose: 'pre_send',
        // isAwait deliberately OMITTED => reply_class 'reply-needed' + reply_expected_by (FR-1).
      });
      await insertCoordinationRow({
        sender_session: sessionId,
        sender_type: 'adam',
        target_session: solomonId || 'broadcast-solomon',
        message_type: 'INFO',
        subject: '[SOLOMON_CONSULT] pre-send',
        body: cp.body,
        payload: cp,
        expires_at: expiresAt,
      }, { targetRoleHint: 'solomon' });
      return { correlationId, pending: true };
    },
    recordLedger,
    ...(typeof captureNearMiss === 'function' ? { captureNearMiss } : {}),
  });
}

module.exports = { runPreSendConsultLane };
