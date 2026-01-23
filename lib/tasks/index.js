/**
 * LEO 5.0 Task System
 *
 * Hybrid Identity + Execution Model
 *
 * Components:
 * - TrackSelector: Maps SD types to execution tracks
 * - TaskHydrator: Generates tasks at phase transitions
 * - Templates: Track-specific task templates
 */

export * from './track-selector.js';
export * from './task-hydrator.js';

// Re-export main classes for convenience
import { TaskHydrator, createTaskHydrator } from './task-hydrator.js';
import {
  selectTrack,
  getSubAgentRequirements,
  validateTrackSelection,
  TRACK_MAP,
  TRACK_CONFIG
} from './track-selector.js';

export {
  TaskHydrator,
  createTaskHydrator,
  selectTrack,
  getSubAgentRequirements,
  validateTrackSelection,
  TRACK_MAP,
  TRACK_CONFIG
};

export default {
  TaskHydrator,
  createTaskHydrator,
  selectTrack,
  getSubAgentRequirements,
  validateTrackSelection,
  TRACK_MAP,
  TRACK_CONFIG
};
