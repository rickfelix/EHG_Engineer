import 'dotenv/config';
import { createFlag } from '../../lib/feature-flags/registry.js';

// SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 FR-1: create the flag DISABLED. Enabling it
// (the actual arming step) is gated on resolving/waiving the SD-LEO-INFRA-STAGE-GATE-
// PREDICATE-001 atomic obligation (FR-7) -- see that FR in the PRD for detail.
const flag = await createFlag({
  flagKey: 'STAGE_GATE_PREDICATE_ARMED',
  displayName: 'Stage-Gate Predicate Armed',
  description: 'Arms lib/governance/stage-gate-predicate.js: when enabled, shouldEnforceBlock() actually enforces the go-live stage gate (checkStageGate\'s verdict) at every wired call site instead of running in shadow/audit-only mode. Building/wiring is safe with this disabled; enabling it is a governed step gated on the SD-LEO-INFRA-STAGE-GATE-PREDICATE-001 atomic obligation (HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED / LEO_HIGH_CONSEQUENCE_GATES_ENABLED).',
  isEnabled: false,
  changedBy: 'Alpha-2 (EXEC phase, SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 FR-1)',
  ownerType: 'team',
  ownerId: 'leo-infrastructure',
  riskTier: 'high',
});
console.log('Flag created:', JSON.stringify(flag, null, 2));
