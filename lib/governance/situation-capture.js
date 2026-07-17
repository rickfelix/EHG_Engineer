/**
 * Governance-situation capture — the situation ledger RIDES issue_patterns.
 * SD-LEO-INFRA-GOVERNANCE-SITUATION-CONTINUOUS-001 (FR-1).
 *
 * Chairman constraint (2026-07-16): COMPOSE, don't greenfield — no new ledger
 * table. A captured situation is an issue_patterns row carrying the metadata
 * convention {class, catch_layer, hardening_ref, situation_ref}. Recurrence
 * semantics mirror scripts/rca-learning-ingestion.js updateIssuePatterns:
 * occurrence_count increments, and a new occurrence of a resolved/obsolete
 * pattern AUTO-REOPENS it (the prior hardening did not hold), clearing the
 * stale SD attribution and stamping metadata.reopened_at/reopen_count.
 * Closure stays exclusively behind lib/governance/pattern-closure.js.
 */
import crypto from 'node:crypto';

export const SITUATION_CLASSES = Object.freeze([
  'chairman_correction', 'near_miss', 'adherence_drift', 'decision_retro',
]);
export const CATCH_LAYERS = Object.freeze(['chairman', 'solomon', 'probe']);

/** Deterministic ledger key: same class + normalized summary => same row. */
export function situationFingerprint(situationClass, summary) {
  const norm = String(summary == null ? '' : summary).replace(/\s+/g, ' ').trim().toLowerCase();
  const hash = crypto.createHash('sha256').update(`${situationClass}:${norm}`).digest('hex').slice(0, 12);
  return `GOV-${situationClass}-${hash}`;
}

/**
 * Capture (or re-observe) a governance situation.
 * @param {Object} supabase - service-role client
 * @param {Object} s
 * @param {string} s.situationClass - one of SITUATION_CLASSES
 * @param {string} s.summary - what happened (fingerprint input)
 * @param {string} s.catchLayer - which layer caught it (chairman|solomon|probe)
 * @param {string} [s.hardeningRef] - the durable hardening (probe row / rule / SD) once adjudicated
 * @param {string} [s.situationRef] - provenance pointer (decision id, feedback id, retro id, signal id)
 * @param {string} [s.severity='medium']
 * @returns {Promise<{captured:boolean, id?:string, reopened?:boolean, occurrenceCount?:number, error?:string}>}
 */
export async function captureGovernanceSituation(supabase, {
  situationClass, summary, catchLayer, hardeningRef = null, situationRef = null, severity = 'medium',
} = {}) {
  if (!supabase) return { captured: false, error: 'supabase client is required' };
  if (!SITUATION_CLASSES.includes(situationClass)) {
    return { captured: false, error: `situationClass must be one of ${SITUATION_CLASSES.join('|')}` };
  }
  if (!CATCH_LAYERS.includes(catchLayer)) {
    return { captured: false, error: `catchLayer must be one of ${CATCH_LAYERS.join('|')}` };
  }
  if (!summary || !String(summary).trim()) return { captured: false, error: 'summary is required' };

  const id = situationFingerprint(situationClass, summary);
  const nowIso = new Date().toISOString();

  const { data: existing, error: fetchErr } = await supabase
    .from('issue_patterns')
    .select('id, occurrence_count, status, metadata')
    .eq('pattern_id', id)
    .maybeSingle();
  if (fetchErr) return { captured: false, error: `fetch failed: ${fetchErr.message}` };

  if (existing) {
    const wasClosed = existing.status === 'resolved' || existing.status === 'obsolete';
    const prev = existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};
    const update = {
      occurrence_count: (existing.occurrence_count || 0) + 1,
      metadata: { ...prev, last_seen_at: nowIso, catch_layer: catchLayer, ...(hardeningRef ? { hardening_ref: hardeningRef } : {}) },
    };
    if (wasClosed) {
      const reopenHistory = Array.isArray(prev.reopen_history) ? prev.reopen_history : [];
      update.status = 'active';
      // The prior hardening did not hold — clear stale SD attribution so a later
      // completion sweep cannot silently re-close it without a fresh prevention check.
      update.assigned_sd_id = null;
      update.assignment_date = null;
      update.metadata = {
        ...update.metadata,
        reopened_at: nowIso,
        reopen_count: (prev.reopen_count || 0) + 1,
        reopen_history: [...reopenHistory.slice(-9), { at: nowIso, previous_status: existing.status }],
      };
    }
    const { error } = await supabase.from('issue_patterns').update(update).eq('pattern_id', id);
    if (error) return { captured: false, error: `update failed: ${error.message}` };
    return { captured: true, id, reopened: wasClosed, occurrenceCount: update.occurrence_count };
  }

  // pattern_name/first_seen/last_seen are PHANTOM columns — timestamps live in metadata
  // (SD-LEO-FIX-FIX-PHANTOM-COLUMN-001, same real shape rca-learning-ingestion writes).
  // issue_patterns.id is a uuid (DB default) — the GOV-* fingerprint lives in pattern_id (text).
  const { error: insErr } = await supabase.from('issue_patterns').insert({
    pattern_id: id,
    issue_summary: String(summary).trim(),
    category: 'governance_situation',
    severity,
    status: 'active',
    occurrence_count: 1,
    metadata: {
      class: situationClass,
      catch_layer: catchLayer,
      hardening_ref: hardeningRef,
      situation_ref: situationRef,
      source: 'governance-situation-loop',
      first_seen_at: nowIso,
      last_seen_at: nowIso,
    },
  });
  if (insErr) return { captured: false, error: `insert failed: ${insErr.message}` };
  return { captured: true, id, reopened: false, occurrenceCount: 1 };
}
