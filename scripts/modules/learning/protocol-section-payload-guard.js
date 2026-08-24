/**
 * SD-LEO-INFRA-IMPROVEMENT-APPLIER-UPSERTS-001 — THE DATA/INSTRUCTION BOUNDARY FOR
 * leo_protocol_sections.
 *
 * WHAT WAS WRONG. improvement-appliers.js applyProtocolSectionChange passed a model-authored
 * payload straight into .upsert() with no column allowlist, no shape transform and no insert-only
 * constraint. A payload carrying an 'id' REPLACED an existing governing section — and the learning
 * loop auto-approves at threshold 50 with no human review on every SD completion, fleet-wide
 * (scripts/modules/learning/index.js:110, whose own comment at :156 reads "so auto-approve all").
 *
 * WHY THAT IS CONSTITUTIONAL RATHER THAN AN ORDINARY UNVALIDATED-INPUT BUG. The reachable rows
 * include the Adam role contract (section_type=adam_role_contract) and the phase files — the
 * documents that tell every future session what it is and how to behave. AN INJECTED INSTRUCTION
 * LASTS ONE CONTEXT; AN OVERWRITTEN PROTOCOL SECTION IS READ AS AUTHORITATIVE BY EVERY FUTURE
 * SESSION, INCLUDING THE ONES AUDITING FOR INJECTION. It is self-concealing by construction.
 * CONST-001 (AI scores inform but never decide) and CONST-002 (the system that proposes cannot
 * approve its own proposals) both sit in the top band, above System Integrity.
 *
 * MEASURED BEFORE BUILDING — THE DOOR IS OPEN AND NOTHING HAS WALKED THROUGH IT. All 69
 * protocol_improvement_queue rows targeting this table were read as a full population (count
 * matched fetched): ZERO carry payload.id, and 68 are already status=APPLIED. So this is
 * CLOSE-BEFORE-USE, not incident response — no section has been overwritten and no rollback is in
 * scope. That does not lower the priority, because a successful exploit would have erased its own
 * trace, but it does mean no forensic effort belongs here.
 *
 * THE CASE THAT WOULD HAVE SHIPPED BROKEN. That same population scan returned payload keys 0..607
 * — the Object.keys() signature of a STRING. Some stored payloads are not objects. A naive
 * pick(payload, ALLOWED) returns {} for those and silently converts a working append into a no-op
 * or a malformed write, which every well-formed-object fixture would miss. Hence sanitize()
 * REFUSES a non-object loudly instead of degrading to an empty write.
 *
 * PROVENANCE OF THE CHANNEL IS NOT PROVENANCE OF THE PAYLOAD: the queue is internal, but its
 * CONTENT is model-authored from observed material. That distinction is the whole reason this guard
 * exists.
 */

/**
 * Real leo_protocol_sections columns a model-authored improvement may write.
 *
 * DERIVED FROM THE TABLE'S COLUMN SET, NOT FROM A SAMPLE OF CURRENT PAYLOADS. Encoding today's
 * observed keys would look like a boundary while actually being a snapshot — it would break the
 * next legitimate field and quietly narrow over time.
 *
 * DELIBERATELY EXCLUDED and why:
 *   id                  — the overwrite vector; an insert must never carry a caller-supplied id
 *   protocol_id         — row ownership; a payload must not re-parent a section
 *   scoring_*           — computed by the scoring pipeline, never authored
 *   context_tier,
 *   target_file, priority — routing/authority fields that decide WHERE a section governs
 */
export const ALLOWED_SECTION_COLUMNS = Object.freeze([
  'section_type',
  'title',
  'content',
  'order_index',
  'metadata',
  'skill_key',
  'anchor_topic',
]);

/** Columns whose presence means the payload is trying to REPLACE rather than append. */
export const OVERWRITE_KEYS = Object.freeze(['id']);

export class PayloadRefused extends Error {
  constructor(reason, detail) {
    super(`protocol-section payload refused: ${reason}${detail ? ` (${detail})` : ''}`);
    this.name = 'PayloadRefused';
    this.reason = reason;
    this.detail = detail;
  }
}

/**
 * Filter a model-authored payload down to the allowlist, refusing anything that could overwrite.
 *
 * FAIL-CLOSED ON THE WRITE, FAIL-LOUD ON THE REPORT — the inverse of the old behaviour, where an
 * unfiltered write succeeded silently.
 *
 * @param {unknown} payload         the raw improvement payload
 * @param {{queueRowId?: string, assignedSdId?: string, sourceRetroId?: string}} [ctx] for
 *   attributable refusals (queueRowId) and derived provenance (assignedSdId/sourceRetroId --
 *   FR-2, SD-LEO-INFRA-PROTOCOL-GOVERNANCE-PACKAGE-001)
 * @returns {{clean: object, dropped: string[]}}
 * @throws {PayloadRefused} on a non-object payload, an overwrite attempt, or an empty result
 */
export function sanitizeProtocolSectionPayload(payload, ctx = {}) {
  const where = ctx.queueRowId ? `queue row ${ctx.queueRowId}` : 'unknown queue row';

  // MEASURED CASE, NOT DEFENSIVE BOILERPLATE: string payloads exist in the live queue. Refusing
  // loudly is the point — a silent {} here is how this fix would ship looking correct.
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new PayloadRefused('payload is not an object', `${where}, got ${Array.isArray(payload) ? 'array' : typeof payload}`);
  }

  const present = OVERWRITE_KEYS.filter((k) => payload[k] !== undefined);
  if (present.length) {
    // The vulnerability itself. An id-bearing payload is never an append.
    throw new PayloadRefused('payload carries an overwrite key', `${where}, keys: ${present.join(', ')}`);
  }

  const clean = {};
  const dropped = [];
  for (const [k, v] of Object.entries(payload)) {
    if (ALLOWED_SECTION_COLUMNS.includes(k)) clean[k] = v;
    else dropped.push(k);
  }

  // SD-LEO-INFRA-PROTOCOL-GOVERNANCE-PACKAGE-001 (FR-2): metadata has no sub-key filtering above,
  // so a caller (including a model-authored payload) could set metadata.provenance directly and
  // have it trusted as-is -- self-attested provenance, the same blind-guard shape as an actor-role
  // GUC no caller can be prevented from setting. Strip any caller-supplied provenance and derive it
  // server-side from ctx, which the caller (improvement-appliers.js) populates from columns on the
  // protocol_improvement_queue row it already holds -- data the model itself never authors.
  const existingMetadata = (clean.metadata && typeof clean.metadata === 'object' && !Array.isArray(clean.metadata)) ? clean.metadata : {};
  const { provenance: _droppedProvenance, ...restMetadata } = existingMetadata;
  const derivedProvenance = ctx.assignedSdId
    ? { sd_key: ctx.assignedSdId, actor_type: 'sd', actor_id: ctx.assignedSdId }
    : ctx.sourceRetroId
      ? { sd_key: null, actor_type: 'retrospective', actor_id: ctx.sourceRetroId }
      : null; // neither present -- omit provenance entirely; the FR-1 trigger records PROVENANCE_MISSING

  if (derivedProvenance) {
    clean.metadata = { ...restMetadata, provenance: derivedProvenance };
  } else if (Object.keys(restMetadata).length > 0) {
    clean.metadata = restMetadata;
  } else if ('metadata' in clean) {
    delete clean.metadata;
  }

  // MUST run AFTER provenance stripping, not before (regression-agent finding, PLAN_VERIFICATION):
  // a payload whose only allowlisted content is metadata.provenance (self-attested, no real
  // ctx.assignedSdId/sourceRetroId) collapses clean.metadata away above, so checking emptiness
  // beforehand let {metadata:{provenance:{...}}} slip through as clean={} -- silently defeating
  // this file's own fail-loud contract instead of refusing at the sanitizer boundary.
  if (Object.keys(clean).length === 0) {
    throw new PayloadRefused('no writable columns after allowlist', `${where}, dropped: ${dropped.join(', ') || 'nothing'}`);
  }

  return { clean, dropped };
}

export default { sanitizeProtocolSectionPayload, ALLOWED_SECTION_COLUMNS, OVERWRITE_KEYS, PayloadRefused };
