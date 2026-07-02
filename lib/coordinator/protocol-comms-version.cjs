'use strict';

// SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-C (FR-2): protocol-version-skew detection.
// Long-lived singletons (Adam/coordinator/Solomon) can run boot-time code while payload-shape
// fixes ship to origin — a stale singleton then silently misreads/drops rows as "mystery orphans"
// instead of a detectable version mismatch. Bump this only when session_coordination.payload's
// SHAPE changes in a way a stale reader could misclassify (new required discriminator field,
// changed classification semantics) — not for routine additive fields.
const PROTOCOL_COMMS_VERSION = 1;

/**
 * Returns {senderVersion, receiverVersion} when payload carries a stamped version DIFFERENT from
 * this process's own PROTOCOL_COMMS_VERSION, else null. An unstamped payload (pre-versioning
 * producer, or a row with no payload object) is NOT itself treated as skew — absence of the field
 * is not evidence of a version gap, only an explicit differing stamp is.
 */
function detectVersionSkew(payload) {
  const senderVersion = payload && payload.protocol_comms_version;
  if (senderVersion == null || senderVersion === PROTOCOL_COMMS_VERSION) return null;
  return { senderVersion, receiverVersion: PROTOCOL_COMMS_VERSION };
}

module.exports = { PROTOCOL_COMMS_VERSION, detectVersionSkew };
