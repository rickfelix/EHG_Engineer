/**
 * S19-entry deploy-target provisioning check (deploy-pipeline-architecture.md §5:
 * "Provisioning executes at S19 entry, where the spend-guardrail + stack gates
 * already live"; production deploy is an S19 exit requirement).
 *
 * SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-D (FR-6).
 *
 * DELEGATES to the registered 'deployment target provisioned' exit-gate verifier
 * (verifyDeploymentTargetProvisioned) rather than copying its predicate — the
 * S19-entry check and the S19-exit gate must be the SAME question, and a copied
 * predicate silently diverges when the provisioning record shape changes
 * (adversarial review, PR #5769). Pure read, no side effects; the stage worker
 * consumes it OBSERVE-ONLY by default (S19_DEPLOY_PROVISIONING=observe),
 * promoting to 'enforce' only after the calibration review per the
 * observe-only-first protocol default.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @returns {Promise<{provisioned: boolean, reason: string}>}
 */
import { resolveVerifier } from '../eva/lifecycle/exit-gate-verifiers.js';

export async function checkDeployTargetProvisioned(supabase, ventureId) {
  const verifier = resolveVerifier('deployment target provisioned');
  if (!verifier) {
    // Registry drift (the gate string disappeared) is a fail-closed condition —
    // an unanswerable provisioning question must never read as provisioned.
    return { provisioned: false, reason: "no verifier registered for 'deployment target provisioned' (fail-closed)" };
  }
  const result = await verifier({ supabase, ventureId });
  return { provisioned: result.satisfied === true, reason: result.reason || '' };
}

export default { checkDeployTargetProvisioned };
