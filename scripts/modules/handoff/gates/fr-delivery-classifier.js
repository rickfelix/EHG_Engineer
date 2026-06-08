/**
 * FR Delivery Classifier — shared per-FR delivery status for completion gates.
 * SD-LEO-INFRA-HARDEN-LEO-COMPLETION-001.
 *
 * Single source of truth used by BOTH the LEAD-FINAL FR_DELIVERY_VERIFICATION gate
 * and the EXEC-TO-PLAN FR_DELIVERY_TRACEABILITY gate. Reads the AUTHORITATIVE FR list
 * (product_requirements_v2.functional_requirements) and classifies each FR:
 *   - DELIVERED : a validated/completed user_story REFERENCES the FR id (title / user_want /
 *                 acceptance_criteria / technical_notes). This is real per-FR mapping, NOT the
 *                 prior any-completed-story-marks-all-FRs proxy.
 *   - DESCOPED  : the SD has an APPROVER-GATED descope record for the FR
 *                 (strategic_directives_v2.metadata.descoped_frs[].approved_by non-empty and
 *                 != the requester).
 *   - UNDELIVERED: neither of the above.
 *
 * Enforcement is gated by LEO_FR_TRACEABILITY_ENFORCE (default OFF = warn-only). The
 * classifier ALWAYS runs; the gate wrappers project status -> {passed, required} per the flag.
 */

/** True when strict FR-delivery enforcement is turned on. Default OFF (warn-only). */
export function isFrTraceabilityEnforced(env = process.env) {
  const v = env.LEO_FR_TRACEABILITY_ENFORCE;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'on' || s === 'yes';
}

/** Stable FR id for an FR entry (falls back to FR-<n> by 1-based index). */
export function frIdOf(fr, index) {
  return (fr && (fr.id || fr.fr_id)) || `FR-${index + 1}`;
}

/**
 * Pure: does this user story reference the given FR id in any of its text fields?
 * Uses a word-boundary match on the exact FR id (e.g. "FR-004") so "FR-04" / "FR-0040"
 * do not false-match.
 */
export function frReferencesId(story, frId) {
  if (!story || !frId) return false;
  const esc = String(frId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^\\w-])${esc}([^\\w-]|$)`, 'i');
  const fields = [];
  const push = (v) => { if (v == null) return; fields.push(typeof v === 'string' ? v : JSON.stringify(v)); };
  push(story.title);
  push(story.user_want);
  push(story.acceptance_criteria);
  push(story.technical_notes);
  push(story.description);
  return fields.some((f) => re.test(f));
}

/** A story counts as a delivery signal only when it is validated/completed. */
export function isValidatedStory(story) {
  const s = (story && story.status) || '';
  const vs = (story && story.validation_status) || '';
  return s === 'completed' || s === 'done' || s === 'validated' || vs === 'validated';
}

/** Approver-gated descope lookup for an FR id. requesterSessionId is excluded as a self-approver. */
export function descopeFor(sdMetadata, frId, requesterSessionId = null) {
  const list = (sdMetadata && Array.isArray(sdMetadata.descoped_frs)) ? sdMetadata.descoped_frs : [];
  return list.find((d) => {
    if (!d || (d.fr_id !== frId && d.id !== frId)) return false;
    const approver = typeof d.approved_by === 'string' ? d.approved_by.trim() : '';
    if (!approver) return false;                        // descope without a named approver is ignored
    if (requesterSessionId && approver === requesterSessionId) return false; // no self-approval
    return true;
  }) || null;
}

/**
 * Classify every FR for an SD. Injectable supabase for testing.
 * @returns {Promise<{frs: Array<{id,description,status:'delivered'|'descoped'|'undelivered',evidence}>,
 *   total:number, delivered:number, descoped:number, undelivered:number}>}
 */
export async function classifyFrDelivery(supabase, { sdId, sdMetadata = {}, functionalRequirements = null, requesterSessionId = null } = {}) {
  let frs = functionalRequirements;
  if (!Array.isArray(frs)) {
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('functional_requirements')
      .eq('directive_id', sdId)
      .maybeSingle();
    frs = (prd && prd.functional_requirements) || [];
  }

  const { data: stories } = await supabase
    .from('user_stories')
    .select('id, title, user_want, acceptance_criteria, technical_notes, description, status, validation_status')
    .eq('sd_id', sdId);
  const validated = (stories || []).filter(isValidatedStory);

  const out = [];
  for (let i = 0; i < frs.length; i++) {
    const fr = frs[i];
    const id = frIdOf(fr, i);
    const desc = (fr && (fr.requirement || fr.description || fr.title)) || '';
    const deliveredBy = validated.find((s) => frReferencesId(s, id));
    if (deliveredBy) {
      out.push({ id, description: desc, status: 'delivered', evidence: `Validated story ${deliveredBy.id} references ${id}` });
      continue;
    }
    const descope = descopeFor(sdMetadata, id, requesterSessionId);
    if (descope) {
      out.push({ id, description: desc, status: 'descoped', evidence: `Descoped by ${descope.approved_by}${descope.reason ? `: ${descope.reason}` : ''}` });
      continue;
    }
    out.push({ id, description: desc, status: 'undelivered', evidence: 'No validated story references this FR id and no approver-gated descope' });
  }

  return {
    frs: out,
    total: out.length,
    delivered: out.filter((f) => f.status === 'delivered').length,
    descoped: out.filter((f) => f.status === 'descoped').length,
    undelivered: out.filter((f) => f.status === 'undelivered').length,
  };
}

/**
 * Project a classification into a gate result, honoring the enforcement flag.
 * OFF (default): passed:true / required:false, undelivered FRs surface as WARNINGS only
 * (byte-identical pass outcome regardless of undelivered count -> zero blast radius).
 * ON: passed:false / required:true on any undelivered FR (hard-fails via gate.required!==false).
 */
export function projectGateResult(classification, { enforced = isFrTraceabilityEnforced(), gateName = 'FR_DELIVERY' } = {}) {
  const { frs, total, delivered, descoped, undelivered } = classification;
  const satisfied = delivered + descoped;
  const score = total === 0 ? 100 : Math.round((satisfied / total) * 100);
  const undeliveredList = frs.filter((f) => f.status === 'undelivered').map((f) => `${f.id}: ${f.description}`.trim());

  if (total === 0) {
    return { passed: true, score: 100, max_score: 100, issues: [], warnings: ['No functional requirements in PRD'], required: false, details: classification };
  }
  if (undelivered === 0) {
    return { passed: true, score, max_score: 100, issues: [], warnings: [], required: enforced, details: classification };
  }
  // There ARE undelivered FRs.
  if (enforced) {
    return {
      passed: false, score, max_score: 100, required: true,
      issues: [`${gateName}: ${undelivered}/${total} FR(s) undelivered (no validated story reference and no approver-gated descope)`, ...undeliveredList.map((u) => `  Undelivered: ${u}`)],
      warnings: [], details: classification,
    };
  }
  // OFF = warn-only: pass with FULL score (100) so the averaged handoff normalizedScore is NOT
  // diluted — a sub-100 score here could soft-block a borderline SD, which would break the
  // promised zero-blast-radius. Undelivered detail lives only in warnings + details.raw_score.
  return {
    passed: true, score: 100, max_score: 100, required: false,
    issues: [],
    warnings: [`${gateName} (warn-only; set LEO_FR_TRACEABILITY_ENFORCE to enforce): ${undelivered}/${total} FR(s) lack a validated story reference or approver-gated descope`, ...undeliveredList.map((u) => `  Undelivered: ${u}`)],
    details: { ...classification, raw_score: score },
  };
}
