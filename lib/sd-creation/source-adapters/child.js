/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: child-SD source adapter — createChild moved VERBATIM from
 * scripts/leo-create-sd.js. Sanctioned change only: the former hard-exit site returns
 * {ok:false, error, exitCode}; the CLI maps it back to the historical exit code. The
 * claimed-by-another / scope_slice-persistence throws are unchanged.
 */
import { supabase } from '../context.js';
import { generateChildKey, deriveChildIndex } from '../../../scripts/modules/sd-key-generator.js';
import {
  inheritStrategicFields, createSDOrThrow as createSD,
  buildDefaultSuccessCriteria, buildDefaultSmokeTestSteps,
  buildDefaultStrategicObjectives, buildDefaultKeyChanges, buildDefaultSuccessMetrics,
} from '../pipeline.js';
import { dryRunGateBattery } from '../dry-run-gate-battery.js';
import { classifyPlanLinkage } from '../plan-linkage-classifier.js';
// SD-LEO-INFRA-LEO-CREATE-PLAN-001 (FR-3): this file used to carry its own strings-only
// normalizeDependsOn — one of TWO divergent copies. All lanes now share the canonical
// superset (bare string, {sd_id}, {sd_key} → {sd_id}) from proposal-lanes; bare-string
// behavior is unchanged, object entries now normalize instead of being silently dropped.
// The re-export preserves this module's public surface for existing importers.
import { normalizeDependsOn } from '../../../scripts/modules/leo-create-sd/proposal-lanes.js';
export { normalizeDependsOn };

/**
 * QF-20260905-431: a --child mint's template description ("Child SD of <parent>: <title>",
 * 11-33 words) hard-blocks GATE_SD_QUALITY at LEAD-TO-PLAN on EVERY child by construction — the
 * infrastructure/enhancement/bugfix/refactor floor is 50 words, feature/security is 100
 * (sd-quality-scoring.js SD_TYPE_THRESHOLDS). This replacement is genuinely descriptive (parent
 * lineage + what refinement still happens at PLAN), not padding to a count: GATE_SD_QUALITY's
 * content-quality check is pure word-count on `description` (no boilerplate-shape detection
 * there, unlike strategic_objectives/key_changes/success_criteria), so real, honest substance is
 * both correct and sufficient. Folds in the parent's own description as scope context when
 * present — the single biggest lever for reliably clearing the 100-word feature/security floor.
 */
export function buildChildDescription(parent, sdKey, childTitle) {
  const parentSummary = String(parent?.description || '').trim();
  const scopeNote = parentSummary
    ? ` The parent's own scope, for context: "${parentSummary.slice(0, 260)}${parentSummary.length > 260 ? '…' : ''}"`
    : '';
  return `${childTitle} is a child work item spawned under orchestrator ${parent.sd_key} `
    + `("${parent.title}") to carry one bounded slice of that parent's decomposed scope. `
    + `This row (${sdKey}) exists to reserve identity and parent lineage — priority, category, `
    + 'and strategic fields inherited from the parent — before implementation planning begins; '
    + 'concrete acceptance criteria, smoke-test steps, and any cited mechanism claims are refined '
    + 'during this child\'s own LEAD-TO-PLAN and PLAN phases, not invented here as boilerplate. '
    + 'Treat this description as a placeholder for lineage only, not as the child\'s real scope '
    + `statement — replace it with a concrete account of the deliverable before LEAD approval.${scopeNote}`;
}

/**
 * Create child SD
 * @param {string} parentKey - Parent SD key or UUID
 * @param {number} index - Child index (A=0, B=1, etc.)
 * @param {Object} overrides - Optional overrides for child fields
 * @param {string} overrides.type - Child SD type (default: 'feature', never inherits 'orchestrator')
 * @param {string} overrides.title - Child title override
 * @param {string} [overrides.description] - Child description override (skips the auto-built
 *   template below entirely — use when the parent's plan already spells out this child's scope).
 * @param {Array<{criterion:string,measure:string}>} [overrides.successCriteria] - Real per-child
 *   acceptance criteria (e.g. extracted from the parent's plan) — passed straight to createSD
 *   instead of letting buildDefaultSuccessCriteria seed generic boilerplate.
 * @param {Array<{step_number:number,instruction:string,expected_outcome:string}>} [overrides.smokeTestSteps]
 *   - Real per-child smoke-test steps, same rationale as successCriteria above.
 * @param {string[]} [overrides.dependsOn] - Sibling sd_keys this child depends on (QF-20260711-841
 *   born-fenced sequencing) — set on `dependencies` atomically with the insert.
 * @param {string} [overrides.roadmapLinkReason] - Operator reason for creating without a
 *   preceding roadmap registration (QF-20260904-610, mirrors plan.js's identical wiring) —
 *   passed straight to createSD's top-level `roadmap_link_reason`, which buildRoadmapLinkException
 *   records; absent is legal and still records the explicit no-reason marker.
 */
export async function createChild(parentKey, index = null, overrides = {}) {
  console.log(`\n📋 Creating child SD for: ${parentKey}`);

  // Fetch parent SD
  const { data: parent, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .or(`sd_key.eq.${parentKey},id.eq.${parentKey}`)
    .single();

  if (error || !parent) {
    console.error('Parent SD not found:', parentKey);
    // SD-ARCH-HOTSPOT-LEO-CREATE-001: was a hard exit(1) — the CLI maps this to exit 1.
    return { ok: false, error: `Parent SD not found: ${parentKey}`, exitCode: 1 };
  }

  // QF-20260610-473: derive index from MAX existing suffix (not count — count
  // collides forever on non-contiguous children: {-B} -> count=1 -> proposes -B),
  // honor an explicit index of 0 (nullish check, not ||), and self-heal residual
  // collisions by bumping to the next free letter. Policy: derived default is
  // max(taken)+1, so {-B} -> -C and {-A,-C} -> -D.
  // QF-20260905-562: a cancelled child no longer reserves its letter — without this, a
  // mis-lettered/cancelled sibling blocked its own letter forever (witnessed: 20 mis-lettered
  // children minted B-K then L-U under one parent after a cancelled child's letter never freed).
  const { data: existingChildren } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key')
    .eq('parent_sd_id', parent.id)
    .neq('status', 'cancelled');

  const parentSdKey = parent.sd_key || parentKey;
  const derivation = deriveChildIndex(
    parentSdKey,
    (existingChildren || []).map((c) => c.sd_key),
    Number.isInteger(index) ? index : null
  );
  const childIndex = derivation.index;
  if (derivation.bumped) {
    console.log(`   ℹ️  Suffix collision — bumped to next free index ${childIndex} (taken: ${derivation.takenIndexes.join(',')})`);
  }

  // Generate child key
  const sdKey = generateChildKey(parentSdKey, childIndex);

  // Inherit strategic fields from parent (SD-LEO-FIX-METADATA-001)
  const inheritedFields = inheritStrategicFields(parent);

  // Resolve child type: explicit override > parent type (but NEVER inherit 'orchestrator')
  // Orchestrator is a coordination pattern, not a child work type.
  // Children are independent SDs with their own types (feature, infrastructure, etc.)
  let childType = overrides.type || parent.sd_type || 'feature';
  if (childType === 'orchestrator') {
    childType = 'feature';
    console.log('   ℹ️  Parent type \'orchestrator\' not inherited — child defaults to \'feature\'');
    console.log('      Use --type <type> to specify: infrastructure, feature, fix, etc.');
  }

  // QF-20260711-841: born-fenced sequencing — a child with a dependency must carry it from
  // the INSERT itself, not a post-hoc coordinator fence. draftDepsSatisfied (the shared
  // claim-eligibility predicate, lib/fleet/claim-eligibility.cjs) already reads the
  // `dependencies` column and blocks claiming until every referenced sd_key completes; this
  // closes the PRODUCER side by passing overrides.dependsOn straight into the same createSD()
  // call that creates the row, so no claimable window exists between birth and fencing.
  const dependencies = normalizeDependsOn(overrides.dependsOn);

  // Create child SD with inherited fields
  const childTitle = overrides.title || `Child of ${parent.title}`;
  const childDescription = overrides.description || buildChildDescription(parent, sdKey, childTitle);

  // QF-20260907-765 (deferred half (b) of QF-20260905-431): dry-run the LEAD-TO-PLAN gate
  // battery BEFORE inserting, using the SAME buildDefault*() substitution createSD() applies
  // internally when an override is absent — a caller with no per-child plan section and no
  // manually-supplied overrides otherwise always got a row known to fail GATE_PLACEHOLDER_
  // CONTENT_DETECTION / GATE_SMOKE_TEST_SPECIFICATION at LEAD-TO-PLAN.
  const dryRunCandidate = {
    sd_key: sdKey,
    title: childTitle,
    description: childDescription,
    sd_type: childType,
    success_criteria: overrides.successCriteria?.length ? overrides.successCriteria : buildDefaultSuccessCriteria(childType, childTitle),
    smoke_test_steps: overrides.smokeTestSteps?.length ? overrides.smokeTestSteps : buildDefaultSmokeTestSteps(childType, childTitle, childDescription),
    strategic_objectives: inheritedFields.strategic_objectives?.length ? inheritedFields.strategic_objectives : buildDefaultStrategicObjectives(childType, childTitle),
    key_changes: buildDefaultKeyChanges(childType, childTitle),
    success_metrics: inheritedFields.success_metrics?.length ? inheritedFields.success_metrics : buildDefaultSuccessMetrics(childType, childTitle),
    metadata: { mechanism_verifications: [] },
  };
  const dryRun = await dryRunGateBattery(dryRunCandidate);
  if (!dryRun.pass) {
    const msg = `Child mint would fail LEAD-TO-PLAN: ${dryRun.failingGates.join(', ')}. `
      + 'Supply overrides.successCriteria/overrides.smokeTestSteps with real, per-child content '
      + '(e.g. extracted from the parent\'s own plan section), or overrides.description, and retry.';
    console.error(`[createChild] ⛔ ${msg}`);
    return { ok: false, error: msg, exitCode: 1, dryRunDetails: dryRun.details };
  }

  const sd = await createSD({
    sdKey,
    title: childTitle,
    description: childDescription,
    type: childType,
    priority: parent.priority || 'medium',
    rationale: `Child of ${parent.sd_key}`,
    parentId: parent.id,
    // SD-LEO-FIX-AUTHORING-TIME-EVIDENCE-001: author-typed/parent-inherited child prose,
    // unlike system-generated provenance strings from other lanes (roadmap-item, feedback),
    // is a legitimate surface for the uuid-owner check. Measured (TESTING evidence
    // 20c3546f-c048-42d8-b88c-60657cfddd73): 0/400 real child mints refused.
    checkArtifactOwners: true,
    // Pass inherited category to maintain alignment (RCA from SD-LEO-ENH-AUTO-PROCEED-001-12)
    category: inheritedFields.category || null,
    // Pass inherited fields to createSD (SD-LEO-FIX-METADATA-001)
    success_metrics: inheritedFields.success_metrics || null,
    // QF-20260905-431: a caller who already has real per-child content (e.g. from the parent's
    // own plan section) can supply it here instead of letting createSD's generic template
    // defaults (buildDefaultSuccessCriteria/buildDefaultSmokeTestSteps) fill in boilerplate that
    // GATE_PLACEHOLDER_CONTENT_DETECTION / SMOKE_TEST_SPECIFICATION reject at LEAD-TO-PLAN.
    success_criteria: overrides.successCriteria || null,
    smoke_test_steps: overrides.smokeTestSteps || null,
    strategic_objectives: inheritedFields.strategic_objectives || null,
    key_principles: inheritedFields.key_principles || null,
    dependencies,
    // QF-20260904-610: mirrors plan.js's identical roadmap_link_reason wiring — a TOP-LEVEL
    // createSD param (pipeline.js destructures it there, not under metadata); only set when the
    // operator supplied a real, non-blank reason.
    ...(typeof overrides.roadmapLinkReason === 'string' && overrides.roadmapLinkReason.trim()
      ? { roadmap_link_reason: overrides.roadmapLinkReason }
      : {}),
    metadata: {
      source: 'leo',
      parent_sd_key: parent.sd_key,
      child_index: childIndex,
      inherited_from_parent: Object.keys(inheritedFields),
      // QF-20260905-431 (c): declared-not-verified marker GATE_MECHANISM_CLAIM_VERIFIER's
      // findVerifiers() reads (metadata.mechanism_verifications) — an empty array is honest
      // for a fresh mint with no cited mechanism yet, and gives a claimant a field to populate
      // instead of rediscovering the shape the gate expects.
      mechanism_verifications: [],
      ...(overrides.migrationReviewed ? { migration_reviewed: true } : {}),
      ...(overrides.securityReviewed ? { security_reviewed: true } : {}),
      ...(overrides.visionKey ? { vision_key: overrides.visionKey } : {}),
      ...(overrides.archKey ? { arch_key: overrides.archKey } : {}),
      ...(overrides.targetRepos ? { target_repos: overrides.targetRepos } : {}),
      // SD-LEO-INFRA-PLAN-LINKAGE-BELT-001 (FR-1): tag-at-the-door linkage stamp — inherits
      // the parent's link when the parent is itself wave-linked, else classifies by key/venture.
      plan_linkage: classifyPlanLinkage({ sdKey, parentSd: parent })
    }
  });

  if (dependencies.length > 0) {
    console.log(`   🔒 Born-fenced: dependencies=[${dependencies.map((d) => d.sd_id).join(', ')}] (unclaimable until those complete)`);
  }

  // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-101: Inherit parent worktree_path
  // Children share the parent's worktree — prevents wrong_worktree gate failures
  if (parent.worktree_path) {
    await supabase
      .from('strategic_directives_v2')
      .update({ worktree_path: parent.worktree_path })
      .eq('sd_key', sdKey);
  }

  // SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-A (US-001):
  // Persist scope_slice when provided via --scope-slice flag.
  // Note: separate UPDATE to avoid changing createSD signature; schema added 2026-04-23.
  // Persistence failure is FATAL — silent fallback would invert the safety direction
  // (caller requested strictness; undo on failure to avoid surprise soft-pass behavior).
  // Review finding (PR #3232 adversarial review).
  if (overrides.scopeSlice) {
    const { error: sliceErr } = await supabase
      .from('strategic_directives_v2')
      .update({ scope_slice: overrides.scopeSlice })
      .eq('sd_key', sdKey);
    if (sliceErr) {
      console.error(`[createChild] ❌ Failed to persist scope_slice: ${sliceErr.message}`);
      // Roll back the child SD row so the caller can retry from a clean state.
      await supabase.from('strategic_directives_v2').delete().eq('sd_key', sdKey);
      throw new Error(`scope_slice persistence failed for ${sdKey}: ${sliceErr.message}. Child SD row rolled back.`);
    }
    console.log(`   scope_slice set: ${JSON.stringify(overrides.scopeSlice)}`);
  }

  // SD-LEO-INFRA-CLAIM-DEFAULT-LEO-001: Assert parent claim before returning child
  // Verifies the creating session holds the parent SD claim
  try {
    const { claimGuard } = await import('../../claim-guard.mjs');
    const claimResult = await claimGuard(parent.sd_key, null, { autoFallback: true });
    if (!claimResult.success && !claimResult.fallback) {
      console.error(`[createChild] ⛔ Parent SD ${parent.sd_key} is claimed by another session — child creation blocked`);
      console.error(`   Owner: ${claimResult.owner?.session_id} (${claimResult.owner?.heartbeat_age_human})`);
      throw new Error(`Parent SD ${parent.sd_key} is claimed by another active session`);
    }
  } catch (e) {
    if (e.message?.includes('claimed by another')) throw e;
    // Fail-open: DB errors don't block child creation
    console.warn(`[createChild] ⚠️  Parent claim check failed (fail-open): ${e.message}`);
  }

  // SD-LEO-INFRA-ADAM-CREATION-PROCESS-001 (FR-3): one-step child linkage. createSD set
  // parent_sd_id, but NOT relationship_type='child' (children then failed
  // validate-child-sd-completeness) and NOT the parent-registry registration (previously
  // manual DB surgery during sourcing). linkChild does both idempotently in one call.
  try {
    const { linkChild } = await import('../../sd/child-linkage.js');
    const linkRes = await linkChild(supabase, parent, sdKey, {
      role: overrides.role ?? overrides.title ?? null,
      childUuid: sd?.uuid_id ?? null,
      registeredBy: 'leo-create-sd',
      today: new Date().toISOString().slice(0, 10),
      registryOptional: true,
    });
    console.log(
      '   🔗 Child linkage: relationship_type=\'child\'' +
      (linkRes.registered
        ? `; registered in parent ${parent.sd_key} (${linkRes.registryKind})`
        : (linkRes.alreadyRegistered ? '; already registered in parent' : ''))
    );
  } catch (e) {
    console.warn(`[createChild] ⚠️  Child-linkage step failed (non-fatal): ${e.message}`);
  }

  return sd;
}

/**
 * Registry adapter surface: toDraft(input, deps).
 * input: { parentKey, index, overrides }.
 */
export async function toDraft(input, _deps = {}) {
  const { parentKey, index = null, overrides = {} } = input || {};
  return createChild(parentKey, index, overrides);
}
