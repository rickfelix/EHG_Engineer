/**
 * FR-3 — Venture capability extraction + reuse tracking (SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-E).
 *
 * PLAN-TO-EXEC CORRECTION: extends the EXISTING venture_capabilities table (built by
 * SD-STAGE0-ENVELOPE-REGISTRATION-001, feeds the Stage-0 R6 capability envelope) rather
 * than creating a new venture_capability_ledger table -- see
 * 20260712_venture_capabilities_reuse_tracking.sql. capability=name,
 * source_venture=origin_venture_id, extraction_evidence=evidence (all pre-existing
 * columns); this module adds the reuse-count/decay tracking behavior + the extraction
 * checklist evaluator.
 *
 * Reuse tracking mirrors fn_record_capability_reuse()'s shape on the ENGINEERING-capability
 * fabric (sd_capabilities/capability_reuse_log) -- reuse_count + last_reused_at,
 * decay-by-recency (no separate stored decay column) -- but idempotency is tracked via the
 * EXISTING `consumers` jsonb array column directly, rather than a companion log table,
 * keeping this fully additive-column-only (no new table, no new RLS surface).
 *
 * Extraction-honesty guard: a capability with reuse_count === 0 (never actually reused by
 * a second venture) reports maturity as 'reference', regardless of the stored
 * maturity_level -- "no trophy shelf": a capability doesn't earn 'proven'/'asset' status
 * just by being extracted once. This is a simplification of the PRD's "no second consumer
 * within N ventures decays to reference" framing -- there is no clean signal today for
 * "N ventures have elapsed" independent of actual reuse, so the guard keys on the directly
 * measurable fact (has it EVER been reused) rather than inventing an unverifiable
 * elapsed-venture-count window.
 */

/**
 * Record that `consumingVentureId` reused `capabilityId`. Idempotent: a venture already
 * present in `consumers` is not double-counted.
 *
 * @param {object} supabase - injected client
 * @param {{ capabilityId: string, consumingVentureId: string }} params
 * @returns {Promise<{ recorded: boolean, reason?: string, reuseCount?: number }>}
 */
export async function recordCapabilityReuse(supabase, { capabilityId, consumingVentureId }) {
  if (!capabilityId || !consumingVentureId) {
    throw new Error('recordCapabilityReuse requires capabilityId and consumingVentureId');
  }

  const { data: current, error: readError } = await supabase
    .from('venture_capabilities')
    .select('id, consumers, reuse_count')
    .eq('id', capabilityId)
    .maybeSingle();
  if (readError) throw new Error(`recordCapabilityReuse read failed: ${readError.message}`);
  if (!current) throw new Error(`capability ${capabilityId} not found`);

  const consumers = Array.isArray(current.consumers) ? current.consumers : [];
  if (consumers.includes(consumingVentureId)) {
    return { recorded: false, reason: 'already_recorded', reuseCount: current.reuse_count };
  }

  const nextReuseCount = (current.reuse_count || 0) + 1;
  const { error: updateError } = await supabase
    .from('venture_capabilities')
    .update({
      consumers: [...consumers, consumingVentureId],
      reuse_count: nextReuseCount,
      last_reused_at: new Date().toISOString(),
    })
    .eq('id', capabilityId);
  if (updateError) throw new Error(`recordCapabilityReuse update failed: ${updateError.message}`);

  return { recorded: true, reuseCount: nextReuseCount };
}

/**
 * Evaluate the extraction checklist at traversal completion / kill-exit: upsert each
 * candidate capability into venture_capabilities (feeding the Stage-0 R6 envelope). Reuses
 * the (name, origin_venture_id) UNIQUE constraint as the conflict target -- re-evaluating
 * the checklist for the same venture is idempotent per capability name.
 *
 * @param {object} supabase - injected client
 * @param {{ ventureId: string, sdKey?: string|null, capabilities: Array<{
 *   name: string, capabilityType: string, evidence?: object,
 *   integrationDependencies?: string[], revenueLeverageScore?: number
 * }> }} params
 * @returns {Promise<{ upserted: number, results: Array<object> }>}
 */
export async function evaluateExtractionChecklist(supabase, { ventureId, sdKey = null, capabilities }) {
  if (!ventureId || !Array.isArray(capabilities)) {
    throw new Error('evaluateExtractionChecklist requires ventureId and a capabilities array');
  }

  const results = [];
  for (const cap of capabilities) {
    if (!cap.name || !cap.capabilityType) {
      results.push({ name: cap.name, upserted: false, reason: 'missing name/capabilityType' });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from('venture_capabilities')
      .upsert(
        {
          name: cap.name,
          origin_venture_id: ventureId,
          origin_sd_key: sdKey,
          capability_type: cap.capabilityType,
          evidence: cap.evidence ?? null,
          integration_dependencies: cap.integrationDependencies ?? [],
          revenue_leverage_score: cap.revenueLeverageScore ?? 5,
        },
        { onConflict: 'name,origin_venture_id' }
      )
      .select('id')
      .maybeSingle();
    if (error) {
      results.push({ name: cap.name, upserted: false, reason: error.message });
      continue;
    }
    results.push({ name: cap.name, upserted: true, id: data?.id });
  }

  return { upserted: results.filter((r) => r.upserted).length, results };
}

/**
 * Extraction-honesty guard: report a capability's ACTUAL maturity, correcting for the
 * "no trophy shelf" rule -- a capability with reuse_count === 0 is reported as 'reference'
 * (raw, unproven) regardless of its stored maturity_level.
 *
 * @param {{ reuse_count?: number, maturity_level?: string }} capabilityRow
 * @returns {string} 'reference' | the stored maturity_level
 */
export function evaluateCapabilityMaturity(capabilityRow) {
  const reuseCount = capabilityRow?.reuse_count ?? 0;
  if (reuseCount === 0) return 'reference';
  return capabilityRow?.maturity_level || 'experimental';
}
