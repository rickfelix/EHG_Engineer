/**
 * S19-entry deploy-target provisioning check (deploy-pipeline-architecture.md §5:
 * "Provisioning executes at S19 entry, where the spend-guardrail + stack gates
 * already live"; production deploy is an S19 exit requirement).
 *
 * SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-D (FR-6).
 *
 * Uses the SAME predicate as verifyDeploymentTargetProvisioned (exit-gate
 * verifiers): stack_descriptor.connection carries {provider, secret_ref} — the
 * record sibling-B provisioning writes. Pure read, no side effects; the stage
 * worker consumes it OBSERVE-ONLY by default (S19_DEPLOY_PROVISIONING=observe),
 * promoting to 'enforce' only after the calibration review per the
 * observe-only-first protocol default.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @returns {Promise<{provisioned: boolean, reason: string}>}
 */
export async function checkDeployTargetProvisioned(supabase, ventureId) {
  const { data, error } = await supabase
    .from('ventures')
    .select('stack_descriptor')
    .eq('id', ventureId)
    .maybeSingle();
  if (error) {
    return { provisioned: false, reason: `ventures query failed: ${error.message} (fail-closed)` };
  }
  const conn = data?.stack_descriptor?.connection;
  if (!conn || typeof conn !== 'object' || !conn.provider || !conn.secret_ref) {
    return {
      provisioned: false,
      reason: 'stack_descriptor.connection not provisioned (missing provider/secret_ref) — run the provisioning path before S19 exit',
    };
  }
  return { provisioned: true, reason: '' };
}

export default { checkDeployTargetProvisioned };
