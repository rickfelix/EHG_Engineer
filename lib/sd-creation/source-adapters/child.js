/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: child-SD source adapter — createChild moved VERBATIM from
 * scripts/leo-create-sd.js. Sanctioned change only: the former hard-exit site returns
 * {ok:false, error, exitCode}; the CLI maps it back to the historical exit code. The
 * claimed-by-another / scope_slice-persistence throws are unchanged.
 */
import { supabase } from '../context.js';
import { generateChildKey, deriveChildIndex } from '../../../scripts/modules/sd-key-generator.js';
import { inheritStrategicFields, createSDOrThrow as createSD } from '../pipeline.js';

/**
 * Create child SD
 * @param {string} parentKey - Parent SD key or UUID
 * @param {number} index - Child index (A=0, B=1, etc.)
 * @param {Object} overrides - Optional overrides for child fields
 * @param {string} overrides.type - Child SD type (default: 'feature', never inherits 'orchestrator')
 * @param {string} overrides.title - Child title override
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
  const { data: existingChildren } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key')
    .eq('parent_sd_id', parent.id);

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

  // Create child SD with inherited fields
  const childTitle = overrides.title || `Child of ${parent.title}`;
  const sd = await createSD({
    sdKey,
    title: childTitle,
    description: overrides.title
      ? `Child SD of ${parent.sd_key}: ${overrides.title}`
      : `Child SD of ${parent.sd_key}. Implement specific deliverable.`,
    type: childType,
    priority: parent.priority || 'medium',
    rationale: `Child of ${parent.sd_key}`,
    parentId: parent.id,
    // Pass inherited category to maintain alignment (RCA from SD-LEO-ENH-AUTO-PROCEED-001-12)
    category: inheritedFields.category || null,
    // Pass inherited fields to createSD (SD-LEO-FIX-METADATA-001)
    success_metrics: inheritedFields.success_metrics || null,
    strategic_objectives: inheritedFields.strategic_objectives || null,
    key_principles: inheritedFields.key_principles || null,
    metadata: {
      source: 'leo',
      parent_sd_key: parent.sd_key,
      child_index: childIndex,
      inherited_from_parent: Object.keys(inheritedFields),
      ...(overrides.migrationReviewed ? { migration_reviewed: true } : {}),
      ...(overrides.securityReviewed ? { security_reviewed: true } : {}),
      ...(overrides.visionKey ? { vision_key: overrides.visionKey } : {}),
      ...(overrides.archKey ? { arch_key: overrides.archKey } : {}),
      ...(overrides.targetRepos ? { target_repos: overrides.targetRepos } : {}),
    }
  });

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
