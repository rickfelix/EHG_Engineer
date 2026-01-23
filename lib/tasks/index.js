/**
 * LEO 5.0 Task System
 *
 * Hybrid Identity + Execution Model
 *
 * Components:
 * - TrackSelector: Maps SD types to execution tracks
 * - TaskHydrator: Generates tasks at phase transitions
 * - WallManager: Manages phase boundaries (walls)
 * - WallEnforcement: Enforces walls in handoff system
 * - KickbackManager: Handles failure recovery and retry logic
 * - CorrectionManager: Handles dynamic corrections and wall invalidation
 * - SubAgentOrchestrator: Manages parallel sub-agent execution
 * - Templates: Track-specific task templates
 */

export * from './track-selector.js';
export * from './task-hydrator.js';
export * from './wall-manager.js';
export * from './wall-enforcement.js';
export * from './kickback-manager.js';
export * from './correction-manager.js';
export * from './subagent-orchestrator.js';

// Re-export main classes for convenience
import { TaskHydrator, createTaskHydrator } from './task-hydrator.js';
import {
  selectTrack,
  getSubAgentRequirements,
  validateTrackSelection,
  TRACK_MAP,
  TRACK_CONFIG,
  SUBAGENT_REQUIREMENTS,
  SUBAGENT_TIMING
} from './track-selector.js';
import { WallManager, WALL_STATUS, GATE_RESULT } from './wall-manager.js';
import { WallEnforcement } from './wall-enforcement.js';
import { KickbackManager, KICKBACK_STATUS } from './kickback-manager.js';
import { CorrectionManager, TASK_STATUS, CORRECTION_TYPE } from './correction-manager.js';
import { SubAgentOrchestrator, SUBAGENT_STATUS } from './subagent-orchestrator.js';

export {
  TaskHydrator,
  createTaskHydrator,
  selectTrack,
  getSubAgentRequirements,
  validateTrackSelection,
  TRACK_MAP,
  TRACK_CONFIG,
  SUBAGENT_REQUIREMENTS,
  SUBAGENT_TIMING,
  WallManager,
  WallEnforcement,
  WALL_STATUS,
  GATE_RESULT,
  KickbackManager,
  KICKBACK_STATUS,
  CorrectionManager,
  TASK_STATUS,
  CORRECTION_TYPE,
  SubAgentOrchestrator,
  SUBAGENT_STATUS
};

export default {
  TaskHydrator,
  createTaskHydrator,
  selectTrack,
  getSubAgentRequirements,
  validateTrackSelection,
  TRACK_MAP,
  TRACK_CONFIG,
  SUBAGENT_REQUIREMENTS,
  SUBAGENT_TIMING,
  WallManager,
  WallEnforcement,
  WALL_STATUS,
  GATE_RESULT,
  KickbackManager,
  KICKBACK_STATUS,
  CorrectionManager,
  TASK_STATUS,
  CORRECTION_TYPE,
  SubAgentOrchestrator,
  SUBAGENT_STATUS
};
