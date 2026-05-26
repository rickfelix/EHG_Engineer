/**
 * venture-governance-metadata.js — SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 FR-1.
 *
 * Governance metadata for the SDs the lifecycle bridge creates for a venture build
 * tree (orchestrator -> children -> grandchildren, plus post-lifecycle expansion).
 *
 * DE-BYPASS: these SDs carry NO `automation_context.bypass_governance` and NO
 * `bypass_reason`. Venture SDs are held to FULL LEO rigor — they pass the real
 * LEAD-TO-PLAN gates (the SD_TYPE_VALIDATION gate is non-blocking: a type mismatch
 * warns or auto-corrects, it never fails). The bridge previously stamped
 * bypass_governance, which made `isTypeLocked` short-circuit that validation; the
 * chairman directive is that ventures get the same bar as platform work, so the
 * bypass is removed.
 *
 * Throughput is solved by ORCHESTRATION, not bypass: `headless: true` records that
 * the tree is created + advanced by the orchestrator-child-agent (no interactive
 * protocol-read per SD), while governance still runs. `actor_role` + `created_via`
 * preserve provenance for audit.
 *
 * @module lib/eva/bridge/venture-governance-metadata
 */

/**
 * @param {'orchestrator'|'child'|'grandchild'|'expansion'} tier
 * @returns {{automation_context: {actor_role: string, created_via: string, headless: boolean, tier: string}}}
 */
export function ventureGovernanceMetadata(tier) {
  return {
    automation_context: {
      actor_role: 'LEO_ORCHESTRATOR',
      created_via: 'lifecycle-sd-bridge',
      headless: true,
      tier,
    },
  };
}

export default ventureGovernanceMetadata;
