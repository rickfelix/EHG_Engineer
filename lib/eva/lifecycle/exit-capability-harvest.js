/**
 * Capability-harvest interface stub — SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-H FR-3.
 *
 * Stable interface for depositing a harvested-capability record at venture exit
 * certification, targeting sibling Child E's venture-scoped `venture_capability_ledger`
 * table (in PLAN_PRD as of this SD's build, not yet landed — coordinated via /signal
 * ddab108e, not blocked on). This is deliberately an interface/stub, not a new table
 * (TR-2): once Child E ships the real table, only WRITE_TARGET below needs updating.
 *
 * Does NOT write to the existing sd_capabilities table (lib/capabilities/) — that is
 * a different, already-shipped SD-scoped ledger, not the venture-scoped one this
 * harvest step targets (RISK sub-agent, row a08f9f05).
 */

/** Flip to 'venture_capability_ledger' once Child E ships the real table. */
export const WRITE_TARGET = null;

export class CapabilityHarvestNotReadyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CapabilityHarvestNotReadyError';
  }
}

/**
 * @param {{ ventureId: string, capability: string, evidence: string, sourceDecisionId: string }} input
 * @returns {{ accepted: boolean, ventureId: string, capability: string, reason?: string }}
 */
export function harvestCapabilityAtExit({ ventureId, capability, evidence, sourceDecisionId }) {
  if (!ventureId || !capability || !evidence || !sourceDecisionId) {
    throw new Error('harvestCapabilityAtExit requires ventureId, capability, evidence, and sourceDecisionId');
  }

  // Interface proven now; the real persistent writer is intentionally deferred until
  // Child E's venture_capability_ledger lands (WRITE_TARGET above documents the seam).
  if (!WRITE_TARGET) {
    return {
      accepted: false,
      ventureId,
      capability,
      reason: 'venture_capability_ledger not yet landed (Child E, PLAN_PRD) — interface proven, write deferred',
    };
  }

  throw new CapabilityHarvestNotReadyError(
    `WRITE_TARGET is set to '${WRITE_TARGET}' but the real writer has not been implemented yet`,
  );
}
