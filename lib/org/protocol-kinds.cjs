/**
 * Org protocol kinds — SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-B FR-7.
 *
 * The typed message-kind + disposition contract satellites (Children C-H) use to talk
 * to the spine core. Same doctrine as the fleet coordination layer's typed kinds
 * (ADAM_INBOX_KINDS convention): senders MUST use a registered kind — free-text kinds
 * are how buried directives get classifier-hidden; receivers triage BOTH lanes
 * (kind + payload.signal_type) and disposition PER ITEM, never bulk-ack.
 *
 * Consumers: evidence fabric writers (via the writer-auth gate), objective/guard
 * registry mutations, chairman-surface attention items.
 *
 * @module lib/org/protocol-kinds
 */
'use strict';

/** Satellite -> spine message kinds (closed set; extend by PR, never inline strings). */
const ORG_SPINE_KINDS = Object.freeze({
  /** A satellite submits provenance-typed evidence for the fabric (FR-5). */
  EVIDENCE_SUBMIT: 'org_evidence_submit',
  /** Propose a new/changed venture-org objective (FR-4) — requires disposition. */
  OBJECTIVE_PROPOSAL: 'org_objective_proposal',
  /** An anti-Goodhart guard fired (FR-4) — advisory or blocking per registry mode. */
  GUARD_TRIP: 'org_guard_trip',
  /** Surface an item for the chairman meeting brief / attention list (FR-6). */
  ATTENTION_ITEM: 'org_attention_item',
  /** Calibration engine reports a per-ROLE earned-autonomy change proposal (FR-2). */
  CALIBRATION_REPORT: 'org_calibration_report',
  /** Request a writer_auth grant for (identity, surface) — chairman/coordinator disposition. */
  WRITER_AUTH_REQUEST: 'org_writer_auth_request',
});

/** Per-item dispositions (never bulk-ack; absence of a disposition never authorizes). */
const ORG_SPINE_DISPOSITIONS = Object.freeze(['accepted', 'rejected', 'deferred', 'superseded']);

/** Kinds whose acceptance REQUIRES an allowlisted authority (mirror of the write gates). */
const AUTHORITY_GATED_KINDS = Object.freeze([
  ORG_SPINE_KINDS.OBJECTIVE_PROPOSAL,
  ORG_SPINE_KINDS.WRITER_AUTH_REQUEST,
  ORG_SPINE_KINDS.CALIBRATION_REPORT,
]);

/** @param {string} kind @returns {boolean} */
function isOrgSpineKind(kind) {
  return Object.values(ORG_SPINE_KINDS).includes(kind);
}

/** @param {string} disposition @returns {boolean} */
function isValidDisposition(disposition) {
  return ORG_SPINE_DISPOSITIONS.includes(disposition);
}

module.exports = { ORG_SPINE_KINDS, ORG_SPINE_DISPOSITIONS, AUTHORITY_GATED_KINDS, isOrgSpineKind, isValidDisposition };
