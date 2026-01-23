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
 * - Templates: Track-specific task templates
 */

export * from './track-selector.js';
export * from './task-hydrator.js';
export * from './wall-manager.js';
export * from './wall-enforcement.js';

// Re-export main classes for convenience
import { TaskHydrator, createTaskHydrator } from './task-hydrator.js';
import {
  selectTrack,
  getSubAgentRequirements,
  validateTrackSelection,
  TRACK_MAP,
  TRACK_CONFIG
} from './track-selector.js';
import { WallManager, WALL_STATUS, GATE_RESULT } from './wall-manager.js';
import { WallEnforcement } from './wall-enforcement.js';

export {
  TaskHydrator,
  createTaskHydrator,
  selectTrack,
  getSubAgentRequirements,
  validateTrackSelection,
  TRACK_MAP,
  TRACK_CONFIG,
  WallManager,
  WallEnforcement,
  WALL_STATUS,
  GATE_RESULT
};

export default {
  TaskHydrator,
  createTaskHydrator,
  selectTrack,
  getSubAgentRequirements,
  validateTrackSelection,
  TRACK_MAP,
  TRACK_CONFIG,
  WallManager,
  WallEnforcement,
  WALL_STATUS,
  GATE_RESULT
};
