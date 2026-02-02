/**
 * Self-Audit Module
 * SD-LEO-SELF-IMPROVE-002B: Phase 2 - Self-Discovery Infrastructure
 *
 * Main entry point for the self-audit discovery system.
 */

export {
  validateEvidencePack,
  createEvidenceItem,
  EVIDENCE_TYPES,
  EVIDENCE_PRIORITY
} from './validateEvidencePack.js';

export {
  DiscoveryRoutine,
  routineRegistry,
  runDiscoveryRoutines,
  getGitInfo,
  DISCOVERY_MODES,
  SEVERITY_LEVELS,
  FINDING_STATUS
} from './routineFramework.js';

// Import routines to register them
import './routines/specDrift.js';
import './routines/orphanRules.js';

export default {
  validateEvidencePack,
  runDiscoveryRoutines,
  routineRegistry,
  getGitInfo
};
