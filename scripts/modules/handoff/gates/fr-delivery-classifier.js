/**
 * FR Delivery Classifier — shared per-FR delivery status for completion gates.
 * SD-LEO-INFRA-HARDEN-LEO-COMPLETION-001, repaired by SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001.
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
 *   - UNVERIFIABLE: the FR-reference convention is not in use for THIS SD at all, so no
 *                 instrument here could have observed delivery either way. Decided PER-SD,
 *                 never per-FR — see below.
 *   - UNDELIVERED: the convention IS in use for this SD and this FR still has no reference.
 *
 * WHY UNVERIFIABLE EXISTS (SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001, "green-where-blind").
 * Measured on 60 recent completed SDs (55 with FRs): 45 classified at 0% satisfied and only
 * 4 at 100%, because the healthy story-generation path never writes an FR id into story text
 * (it lands in ~a fifth of rows only via a degenerate fallback branch). Collapsing that into
 * UNDELIVERED asserts "we looked and it is absent" when the truth is "no instrument here could
 * have seen it" — and the old warn-only projection then reported score 100 anyway, so the
 * blindness was invisible. Separating the two states is what makes an UNDELIVERED verdict mean
 * something: it is only reachable when this SD demonstrably uses the convention.
 *
 * REJECTED ALTERNATIVE — positional story_key linkage. story_key is minted as SDKEY:US-NNN by
 * every generator iterating functional_requirements in array order, and the correspondence is
 * real (49/49 SDs-with-stories have contiguous 1..N ordinals). It must NOT be used as a delivery
 * signal: executed against the specimen it returns 6/6 DELIVERED, including the two FRs that
 * SD's own metadata.scope_completion_annotation records as not delivered, and population-wide it
 * flips 45/55 SDs from 0% to 100%. Its only live discriminant is whether the generator minted a
 * story at that ordinal — decided at PLAN time, before any code exists — so it measures generator
 * output completeness and reports it as delivery. It converts a false 0 into a false 100.
 *
 * Enforcement is gated by LEO_FR_TRACEABILITY_ENFORCE (default OFF = warn-only). The flag governs
 * BLOCKING ONLY (passed / required) — it never changes the REPORTED SCORE. A gate that reports a
 * number it did not measure is the defect this module was repaired to remove.
 */

/** True when strict FR-delivery enforcement is turned on. Default OFF (warn-only). */
export function isFrTraceabilityEnforced(env = process.env) {
  const v = env.LEO_FR_TRACEABILITY_ENFORCE;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'on' || s === 'yes';
}

/**
 * Ceiling on the UNVERIFIABLE state, as a fraction (0..1) of an SD's FRs.
 *
 * Shipped on day one deliberately. The precedent is the WAIT verdict, which needed
 * WAIT_MAX_ATTEMPTS and a 24h wall clock retrofitted (ValidationOrchestrator.js) after an
 * open-ended non-failing state had already become a permanent escape hatch. An uncapped
 * UNVERIFIABLE would just be warn-only under a new name.
 *
 * Default 1.0 = a fully-unverifiable SD is tolerated but always reported as such and always
 * scored honestly. Lowering it (e.g. 0.5) is how the fleet ratchets the unmeasurable population
 * down once story->FR linkage is actually recorded.
 */
export function frUnverifiableCeiling(env = process.env) {
  const raw = env.LEO_FR_UNVERIFIABLE_CEILING;
  if (raw == null || String(raw).trim() === '') return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return 1;
  return n;
}

/**
 * The score a gate reports when it could not measure delivery at all (no PRD, no FRs, an
 * orchestrator parent delegating to children, or a validator that threw). NOT 100: a
 * non-measurement must never be arithmetically indistinguishable from a verified full delivery,
 * because the composite handoff score is an unweighted mean that cannot tell them apart.
 */
export const NOT_MEASURED_SCORE = 75;

/**
 * The score a gate reports when its own validator THREW and the failure was swallowed to stay
 * non-blocking in warn-only mode. Distinct from — and lower than — NOT_MEASURED_SCORE: "there
 * was nothing to measure" and "the instrument broke" are different conditions and must not
 * share a number. Previously both of these, and a verified full delivery, all reported 100.
 */
export const ERRORED_SCORE = 50;

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
  // QF-20260816-923: requesterSessionId was null on every production handoff (BaseExecutor's
  // validationContext never set it), so the self-approval check below never even ran — a
  // worker could descope an FR "approved" by itself with no guard firing at all. Now that
  // sessionId is threaded through, warn loudly on the identity-unknown case rather than
  // silently trusting it, so a caller that still can't identify itself is visible in logs.
  if (!requesterSessionId) {
    console.warn('[fr-delivery-classifier] descopeFor: requesterSessionId is unknown — the self-approval guard cannot run for this check');
  }
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
export async function classifyFrDelivery(supabase, { sdId, directiveId = null, sdMetadata = {}, functionalRequirements = null, requesterSessionId = null } = {}) {
  let frs = functionalRequirements;
  if (!Array.isArray(frs)) {
    // product_requirements_v2.directive_id stores the SD KEY (e.g. SD-FOO-001), not the UUID.
    // Callers that only have the UUID must pass directiveId=sd_key; fall back to sdId otherwise.
    const lookupKey = directiveId || sdId;
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('functional_requirements')
      .eq('directive_id', lookupKey)
      .maybeSingle();
    frs = (prd && prd.functional_requirements) || [];
  }

  // NOTE: user_stories has NO `description` column — selecting it errors the whole query
  // (data -> null -> every FR wrongly flagged undelivered). Stick to real columns.
  const { data: stories } = await supabase
    .from('user_stories')
    .select('id, title, user_want, acceptance_criteria, technical_notes, status, validation_status')
    .eq('sd_id', sdId);
  const validated = (stories || []).filter(isValidatedStory);

  // PASS 1 — resolve the two positive signals per FR without deciding the negative case yet.
  // The negative case (undelivered vs unverifiable) cannot be decided per-FR: it depends on
  // whether THIS SD uses the FR-reference convention at all, which is only knowable after
  // every FR has been examined.
  const resolved = [];
  for (let i = 0; i < frs.length; i++) {
    const fr = frs[i];
    const id = frIdOf(fr, i);
    const desc = (fr && (fr.requirement || fr.description || fr.title)) || '';
    const deliveredBy = validated.find((s) => frReferencesId(s, id));
    const descope = deliveredBy ? null : descopeFor(sdMetadata, id, requesterSessionId);
    resolved.push({ id, desc, deliveredBy, descope });
  }

  // PASS 2 — is the FR-reference convention in use for this SD? One genuine reference is
  // enough to prove the instrument works here, which is what makes a missing reference on a
  // sibling FR real evidence of non-delivery rather than an artifact of an unused convention.
  const conventionInUse = resolved.some((r) => r.deliveredBy);

  // ...but UNVERIFIABLE requires that there was something we could have read. With ZERO
  // validated stories there is no work product at all, so "the convention is not in use here"
  // is not an available excuse — nothing exists that could have carried a reference. That is a
  // genuinely suspicious state (FRs declared, nothing built or validated against them) and it
  // stays UNDELIVERED rather than being laundered into blindness. Surfaced by an existing
  // hard-fail test in fr-delivery-traceability-gate.test.js, which was right to object.
  const hasWorkProduct = validated.length > 0;
  const unmeasurable = !conventionInUse && hasWorkProduct;

  const out = resolved.map(({ id, desc, deliveredBy, descope }) => {
    if (deliveredBy) {
      return { id, description: desc, status: 'delivered', evidence: `Validated story ${deliveredBy.id} references ${id}` };
    }
    if (descope) {
      return { id, description: desc, status: 'descoped', evidence: `Descoped by ${descope.approved_by}${descope.reason ? `: ${descope.reason}` : ''}` };
    }
    if (unmeasurable) {
      return {
        id,
        description: desc,
        status: 'unverifiable',
        evidence: `No FR of this SD is referenced by any of its ${validated.length} validated story/stories, so the FR-reference convention is not in use here — delivery of this FR was not observable either way`,
      };
    }
    const why = hasWorkProduct
      ? 'No validated story references this FR id and no approver-gated descope, while sibling FRs of this SD ARE referenced'
      : 'No validated story exists for this SD at all and no approver-gated descope — nothing was built or validated against this FR';
    return { id, description: desc, status: 'undelivered', evidence: why };
  });

  const count = (status) => out.filter((f) => f.status === status).length;
  const total = out.length;
  const unverifiable = count('unverifiable');
  return {
    frs: out,
    total,
    delivered: count('delivered'),
    descoped: count('descoped'),
    undelivered: count('undelivered'),
    unverifiable,
    convention_in_use: conventionInUse,
    has_work_product: hasWorkProduct,
    validated_story_count: validated.length,
    unverifiable_ratio: total === 0 ? 0 : unverifiable / total,
  };
}

/**
 * Project a classification into a gate result.
 *
 * THE SCORE IS ALWAYS THE TRUE satisfied/total RATIO, in BOTH modes. The enforcement flag
 * governs only `passed` and `required` — i.e. whether the gate BLOCKS — never what it REPORTS.
 *
 * The previous implementation pinned the warn-only score at 100 and hid the real number in
 * details.raw_score, on the reasoning that a sub-100 score could soft-block a borderline SD.
 * That bought "zero blast radius" by making the gate structurally unable to lower a score:
 * measured on the specimen, 0 of 6 FRs satisfied still reported 100, so the composite could
 * not distinguish six-of-six from zero-of-six. Honest reporting is the whole point of a gate.
 * Measured cost of telling the truth, across 62 handoffs carrying an FR gate: mean composite
 * delta -2.26 points, worst -10.0 on a small roster, and exactly 2 handoffs newly crossing
 * below their type threshold. Small, bounded, and enumerable — not zero, and stated as such.
 */
export function projectGateResult(classification, {
  enforced = isFrTraceabilityEnforced(),
  gateName = 'FR_DELIVERY',
  ceiling = frUnverifiableCeiling(),
} = {}) {
  const { frs, total, delivered, descoped, undelivered, unverifiable = 0 } = classification;
  const satisfied = delivered + descoped;
  const score = total === 0 ? NOT_MEASURED_SCORE : Math.round((satisfied / total) * 100);
  const listOf = (status, label) => frs
    .filter((f) => f.status === status)
    .map((f) => `  ${label}: ${`${f.id}: ${f.description}`.trim()}`);
  const undeliveredList = listOf('undelivered', 'Undelivered');
  const unverifiableList = listOf('unverifiable', 'Unverifiable');
  const ratio = total === 0 ? 0 : unverifiable / total;
  const overCeiling = total > 0 && ratio > ceiling;
  const details = { ...classification, ceiling, over_ceiling: overCeiling };

  if (total === 0) {
    // No FRs to measure. Reported as a NON-MEASUREMENT, not as a delivery.
    return {
      passed: true, score: NOT_MEASURED_SCORE, max_score: 100, issues: [], required: false,
      warnings: [`${gateName}: no functional requirements in PRD — delivery NOT verified (score ${NOT_MEASURED_SCORE} denotes not-measured, not delivered)`],
      details,
    };
  }

  const issues = [];
  const warnings = [];

  if (undelivered > 0) {
    const line = `${gateName}: ${undelivered}/${total} FR(s) UNDELIVERED — this SD does use the FR-reference convention (sibling FRs are referenced), so these are genuinely missing`;
    (enforced ? issues : warnings).push(line, ...undeliveredList);
  }

  if (unverifiable > 0) {
    // Never silent, in either mode: an unmeasurable completion is the condition this gate was
    // repaired to surface, so it is always stated even when it does not block.
    warnings.push(
      `${gateName}: ${unverifiable}/${total} FR(s) UNVERIFIABLE — no FR of this SD is referenced by any validated story, so delivery was not observable. This is BLINDNESS, not evidence of absence, and the score below reflects VERIFIED delivery only.`,
      ...unverifiableList,
    );
  }

  if (overCeiling) {
    const line = `${gateName}: unverifiable ratio ${(ratio * 100).toFixed(0)}% exceeds the ceiling of ${(ceiling * 100).toFixed(0)}% (LEO_FR_UNVERIFIABLE_CEILING) — an SD may not complete this blind`;
    (enforced ? issues : warnings).push(line);
  }

  if (!enforced && (undelivered > 0 || unverifiable > 0)) {
    warnings.push(`${gateName} is warn-only (set LEO_FR_TRACEABILITY_ENFORCE to block); the score is the true verified-delivery ratio either way.`);
  }

  const blocking = enforced && (undelivered > 0 || overCeiling);
  return {
    passed: !blocking,
    score,
    max_score: 100,
    required: blocking ? true : enforced,
    issues,
    warnings,
    details,
  };
}
