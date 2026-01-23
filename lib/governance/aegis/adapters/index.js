/**
 * AEGIS Adapters Index
 *
 * Adapters provide backward-compatible wrappers for existing governance
 * frameworks, routing their calls through the unified AEGIS system.
 *
 * @module aegis/adapters
 * @version 1.1.0
 */

// Phase 2: Protocol Constitution
export { ConstitutionAdapter } from './ConstitutionAdapter.js';

// Phase 3: Four Oaths
export { FourOathsAdapter } from './FourOathsAdapter.js';

// Phase 4: Doctrine & System State
export { DoctrineAdapter, DoctrineViolation, getDoctrineAdapter } from './DoctrineAdapter.js';
export { HardHaltAdapter, HardHaltViolation, getHardHaltAdapter } from './HardHaltAdapter.js';
export { ManifestoModeAdapter, ManifestoViolation, getManifestoModeAdapter } from './ManifestoModeAdapter.js';

// Phase 5: Crew Governance & Compliance
export { CrewGovernanceAdapter, CrewGovernanceViolation, getCrewGovernanceAdapter } from './CrewGovernanceAdapter.js';
export { ComplianceAdapter, ComplianceViolation, getComplianceAdapter } from './ComplianceAdapter.js';
