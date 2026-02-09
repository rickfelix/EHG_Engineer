/**
 * Orchestrator Module - Public Exports
 * SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-B
 *
 * Provides dependency DAG analysis and parallel coordination
 * for orchestrator child SD execution.
 */

export {
  buildDependencyDAG,
  detectCycles,
  computeRunnableSet,
  validateDependencies
} from './dependency-dag.js';

export {
  ParallelCoordinator,
  createCoordinator
} from './parallel-coordinator.js';
