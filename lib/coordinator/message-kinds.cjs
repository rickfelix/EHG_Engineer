/**
 * SD-LEO-INFRA-CONSULT-CORRELATION-CONVENTIONS-001 / FR-2 — message_kind vocabulary.
 *
 * Shared because two modules now read it: solomon-advisory.cjs validates --message-kind against it,
 * and dispatch.cjs's disposition lock decides exemptions from it. Two copies would be a drift pair,
 * which is the defect class this SD closes.
 *
 * ── THE TRAP THIS FILE EXISTS TO PREVENT ───────────────────────────────────────────────────────
 * CORRECTION_KINDS and MESSAGE_KINDS are deliberately DIFFERENT sets, and the disposition lock's
 * exemption must be keyed on CORRECTION_KINDS.
 *
 * Before this FR, MESSAGE_KINDS was exactly ['retraction','amend','supersede'] — identical to the
 * correction set. Adding 'disposition' to it makes them diverge for the first time. If a later edit
 * derives the lock's exemption from MESSAGE_KINDS instead (an easy and natural-looking
 * simplification, since they were the same list for the module's whole history), then 'disposition'
 * exempts ITSELF, the lock never fires on the thing it exists to lock, and every test asserting that
 * corrections stay possible keeps passing. That failure is silent and total.
 *
 * The two sets are therefore defined independently, and MESSAGE_KINDS is composed FROM
 * CORRECTION_KINDS rather than the reverse, so the composition direction makes the wrong
 * simplification harder to write than the right one.
 */
'use strict';

/**
 * Kinds that RETRACT or REVISE an earlier message. Exempt from the disposition lock — otherwise a
 * wrong disposition could never be taken back, the exact defect closed by
 * SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-C.
 */
const CORRECTION_KINDS = Object.freeze(['retraction', 'amend', 'supersede']);
const CORRECTION_KIND_SET = new Set(CORRECTION_KINDS);

/** The terminal verdict kind. NOT a correction, and never exempt from its own lock. */
const DISPOSITION_KIND = 'disposition';

/** Everything --message-kind accepts. Composed from the correction set; never the source of it. */
const MESSAGE_KINDS = Object.freeze([...CORRECTION_KINDS, DISPOSITION_KIND]);
const MESSAGE_KIND_SET = new Set(MESSAGE_KINDS);

module.exports = { CORRECTION_KINDS, CORRECTION_KIND_SET, DISPOSITION_KIND, MESSAGE_KINDS, MESSAGE_KIND_SET };
