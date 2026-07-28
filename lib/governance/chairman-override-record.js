/**
 * The durable record of a chairman override that CROSSED A HARD BOUNDARY.
 * SD-LEO-INFRA-ROLE-SESSION-SELF-001 FR-4.
 *
 * WHAT HAPPENED, AND WHY THERE IS NOTHING TO POINT AT. Solomon proposed an instrument, designed its
 * fences, wrote the verification plan, deployed it, then verified its own deployment — proposer,
 * executor and verifier in one agent, which is exactly what CONST-002 separates. The chairman
 * directed it and holds override authority, and Solomon named the boundary BEFORE complying and
 * disclosed it in-band. The compliance was not the defect. The defect is that nothing anywhere
 * specifies what an agent does with such a directive, so a correct improvisation became the de
 * facto standard with nothing behind it — and the next one may improvise differently.
 *
 * WHY NOT chairman_overrides. That table is VENTURE-SCOPED: recordOverride() hard-rejects any call
 * without ventureId + component, and it models system_score vs override_score — a numeric
 * disagreement about a venture, not a constitutional boundary crossing. No table anywhere carries
 * "what boundary was crossed". Rather than widen a venture table into a governance one, this uses
 * the category-scoped `feedback` + metadata pattern both role adherence scripts already use.
 *
 * WHAT IT REFUSES TO PRETEND. `directed_by` is very often unknowable: chairman direction arrives
 * verbally, and chairman_decisions.decided_by_user_id is ~97% NULL with its population mechanism
 * still an OPEN question. So an unattributable override records the TYPED marker
 * DIRECTED_BY_UNATTRIBUTED — never NULL, never ''. A null would be indistinguishable from "nobody
 * filled this in", which is precisely the ambiguity this SD exists to remove.
 */
'use strict';

export const OVERRIDE_CATEGORY = 'chairman_override';

/** Scope of the override — instance-only, or a precedent future agents may rely on. */
export const OVERRIDE_SCOPE = Object.freeze({ INSTANCE: 'instance', PRECEDENT: 'precedent' });

/**
 * Typed stand-in for an attribution we genuinely could not capture.
 * A marker, NOT an empty value: "we know we don't know" must be distinguishable from "unfilled".
 */
export const DIRECTED_BY_UNATTRIBUTED = 'unattributed:verbal_direction';

const SCOPES = Object.freeze(new Set(Object.values(OVERRIDE_SCOPE)));

/**
 * Stable identity for ONE override event, so a retried tick cannot manufacture a second record of
 * the same crossing — and, equally, so two genuinely different crossings never collapse into one.
 * Both halves matter: a degenerate constant key would satisfy "exactly one row" while erasing every
 * event after the first.
 */
export function overrideKey({ boundary, directedAt, sessionId }) {
  return [String(boundary || '').trim().toLowerCase().replace(/\s+/g, '_'),
    String(directedAt || '').slice(0, 19),
    String(sessionId || 'unknown')].join('|');
}

/**
 * Validate and shape one override record. Pure — so the contract is testable without a database,
 * which is the only way to assert the negatives cheaply and on every run.
 *
 * THROWS on a missing boundary or an unrecognised scope. A boundary-crossing record that cannot say
 * WHICH boundary was crossed is the thing this FR exists to prevent, and silently defaulting the
 * scope would let an instance-only override be read later as precedent — the most consequential
 * thing an agent could get wrong from this record.
 */
export function buildOverrideRecord({
  boundary, rationale, directedBy, directedAt, sessionId, scope, namedBeforeComplying, disclosedInBand,
} = {}) {
  const b = String(boundary || '').trim();
  if (!b) {
    throw new Error('[chairman-override] a record must name the BOUNDARY that was crossed — '
      + 'an override nobody can identify later is not a record, it is a rumour.');
  }
  if (!SCOPES.has(scope)) {
    throw new Error(`[chairman-override] scope must be one of ${[...SCOPES].join('|')} (got `
      + `${JSON.stringify(scope)}). An override left unscoped can be read later as precedent, `
      + 'which is the most consequential thing to get wrong about it.');
  }
  const at = directedAt || new Date().toISOString();
  return {
    category: OVERRIDE_CATEGORY,
    type: 'issue',
    // source_application / source_type / severity are NOT NULL with NO DEFAULT on `feedback`.
    // Omitting them fails 23502 on every live call — and this exact bug is already documented in
    // role-self-score.cjs buildFeedbackInsertRow, which was centralised precisely because a
    // hand-rolled insert "silently never succeeded ... found live-testing this SD". Hand-rolling it
    // again one commit later re-introduced it. Kept explicit here rather than reusing that builder
    // because its metadata shape is score-specific, but the NOT-NULL set is copied deliberately.
    source_application: 'EHG_Engineer',
    source_type: 'auto_capture',
    severity: 'high',
    status: 'new',
    title: `Chairman override — boundary crossed: ${b}`.slice(0, 200),
    description: String(rationale || '').slice(0, 4000),
    metadata: {
      override_key: overrideKey({ boundary: b, directedAt: at, sessionId }),
      boundary_crossed: b,
      // Typed marker rather than NULL when direction was verbal and cannot be attributed.
      directed_by: directedBy ? String(directedBy) : DIRECTED_BY_UNATTRIBUTED,
      directed_at: at,
      session_id: sessionId || null,
      scope,
      // The two behaviours Solomon improvised correctly, recorded so they are auditable rather
      // than remembered: was the boundary named BEFORE complying, and was it disclosed in-band?
      named_before_complying: namedBeforeComplying === true,
      disclosed_in_band: disclosedInBand === true,
      sd_key: 'SD-LEO-INFRA-ROLE-SESSION-SELF-001',
    },
  };
}

/**
 * Persist one override record. THE single named writer — not a convention each agent re-implements.
 *
 * IDEMPOTENCY, and its honest limit. This checks for an existing override_key before inserting, so a
 * retried tick is a no-op. That is check-then-insert, which is NOT race-safe on its own: two truly
 * concurrent writers could both miss and both insert. The accompanying staged migration adds a
 * partial UNIQUE INDEX on (category, metadata->>'override_key') — following the live precedent at
 * 20260711b_feedback_telemetry_scope_narrow.sql — which closes that window. Until that migration is
 * applied, concurrent double-writes remain possible; stated here rather than implied to be solved.
 *
 * Never throws on a transport failure: a governance record that took down its caller would
 * discourage recording, which is worse than a missed row that reports itself.
 *
 * @returns {Promise<{written:boolean, deduped:boolean, id:string|null, error:string|null}>}
 */
export async function recordChairmanOverride(supabase, input, { logger = console } = {}) {
  const row = buildOverrideRecord(input);   // throws on an unusable record — deliberately, see above
  if (!supabase || typeof supabase.from !== 'function') {
    return { written: false, deduped: false, id: null, error: 'no supabase client supplied' };
  }
  const key = row.metadata.override_key;
  try {
    const { data: existing } = await supabase
      .from('feedback').select('id').eq('category', OVERRIDE_CATEGORY)
      .eq('metadata->>override_key', key).limit(1);
    if (Array.isArray(existing) && existing.length > 0) {
      return { written: false, deduped: true, id: existing[0].id, error: null };
    }
    const { data, error } = await supabase.from('feedback').insert(row).select('id').single();
    if (error) throw error;
    return { written: true, deduped: false, id: data?.id ?? null, error: null };
  } catch (err) {
    const msg = err?.message || String(err);
    logger?.warn?.(JSON.stringify({ event: 'chairman_override.record_failed', boundary: row.metadata.boundary_crossed, error: msg.slice(0, 200) }));
    return { written: false, deduped: false, id: null, error: msg };
  }
}
