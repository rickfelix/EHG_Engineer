/**
 * FR-5 — Portfolio evidence fabric (SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-B).
 *
 * ONE provenance-typed evidence store consumed by multiple satellite writers/readers — the
 * vigilance loop (Child F) and learning-and-capability loop (Child E) first. Modeled on the
 * guardrail-registry event-emission conventions (a small provenance-tagged record + injected
 * service-role client), writing to the additive substrate table portfolio_evidence created by
 * 20260712_spine_core_identity_registry_fabric.sql:
 *   portfolio_evidence (venture_id, evidence_kind, provenance, source_identity, source_module,
 *                       subject_type, subject_id, payload, observed_at, ...)
 *
 * Provenance taxonomy follows the G3 activation doctrine: a replayed_fixture is NEVER a
 * real_event. This module enforces the taxonomy in code (invalid provenance throws) rather than
 * relying on the DB CHECK alone, so a mislabeled write fails at the call site with a clear error
 * instead of a raw Postgres constraint violation. Every writer must DECLARE provenance
 * explicitly — there is no default — so a caller cannot silently upgrade fixture data to a
 * real event.
 *
 * House convention (mirrors lib/org/chairman-surface.mjs): `supabase` is dependency-injected;
 * this module never constructs a client. The table is RLS-locked to service_role
 * (20260712_spine_core_rls.sql).
 */

export const PROVENANCE_KINDS = Object.freeze(['real_event', 'replayed_fixture', 'synthetic', 'attested', 'derived']);

/**
 * Throw unless `provenance` is one of the taxonomy values. Enforces the G3 doctrine at the
 * call site (a replayed_fixture cannot be smuggled in as a real_event via a typo/omission).
 */
export function assertProvenance(provenance) {
  if (!PROVENANCE_KINDS.includes(provenance)) {
    throw new Error(`invalid provenance '${provenance}' — must be one of: ${PROVENANCE_KINDS.join(', ')}`);
  }
}

/**
 * Write one provenance-typed evidence record. Every writer supplies its own source_module (and
 * optionally source_identity, an org_agent_identities id) so the fabric can carry writes from
 * multiple distinct writer types into ONE store.
 *
 * @param {object} supabase - injected service-role client
 * @param {object} rec
 * @param {string} rec.evidenceKind        - required; the kind of evidence (e.g. 'anomaly', 'kpi_snapshot')
 * @param {string} rec.provenance          - required; one of PROVENANCE_KINDS
 * @param {string|null} [rec.ventureId]
 * @param {string|null} [rec.sourceIdentity] - org_agent_identities.id of the writer, if any
 * @param {string|null} [rec.sourceModule]   - the writing module/satellite (e.g. 'vigilance_loop')
 * @param {string|null} [rec.subjectType]
 * @param {string|null} [rec.subjectId]
 * @param {object} [rec.payload]
 * @param {string|null} [rec.observedAt]    - ISO timestamp the evidence was observed
 * @returns {Promise<object>} the inserted row
 */
export async function writeEvidence(supabase, { evidenceKind, provenance, ventureId = null, sourceIdentity = null, sourceModule = null, subjectType = null, subjectId = null, payload = {}, observedAt = null } = {}) {
  if (!evidenceKind) throw new Error('writeEvidence requires evidenceKind');
  assertProvenance(provenance);
  const row = {
    venture_id: ventureId,
    evidence_kind: evidenceKind,
    provenance,
    source_identity: sourceIdentity,
    source_module: sourceModule,
    subject_type: subjectType,
    subject_id: subjectId,
    payload: payload ?? {},
    observed_at: observedAt,
  };
  const { data, error } = await supabase.from('portfolio_evidence').insert(row).select().maybeSingle();
  if (error) throw new Error(`writeEvidence failed: ${error.message}`);
  return data;
}

/**
 * Read evidence with optional filters. Any provided filter narrows the result; provenance, if
 * given, is taxonomy-validated first.
 *
 * @param {object} supabase - injected service-role client
 * @param {object} [filters]
 * @returns {Promise<Array>} matching rows, newest first
 */
export async function readEvidence(supabase, { ventureId = null, evidenceKind = null, subjectType = null, subjectId = null, provenance = null, sourceModule = null, limit = 100 } = {}) {
  let q = supabase.from('portfolio_evidence').select('*');
  if (ventureId) q = q.eq('venture_id', ventureId);
  if (evidenceKind) q = q.eq('evidence_kind', evidenceKind);
  if (subjectType) q = q.eq('subject_type', subjectType);
  if (subjectId) q = q.eq('subject_id', subjectId);
  if (sourceModule) q = q.eq('source_module', sourceModule);
  if (provenance) { assertProvenance(provenance); q = q.eq('provenance', provenance); }
  q = q.order('created_at', { ascending: false }).limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(`readEvidence failed: ${error.message}`);
  return data || [];
}
