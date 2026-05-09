/**
 * Unit tests for lib/eva/artifact-types.js
 *
 * SD-LEO-FEAT-STAGE-GROWTH-PLAYBOOK-001 / FR-2 + FR-1
 *
 * Covers:
 *   - growth_playbook + growth_optimization_roadmap canonical constants exist
 *   - LAUNCH_POSTLAUNCH_* constants exist (consts for stage-25 raw strings)
 *   - LAUNCH_OPTIMIZATION_ROADMAP retained as deprecated alias
 *   - OLD_TO_NEW_MAP includes the launch_optimization_roadmap rename
 *   - PHASE_PREFIXES.LAUNCH retained (no new GROWTH prefix added)
 *   - ARTIFACT_TYPE_BY_STAGE 25 + 26 updated correctly
 */

import { describe, it, expect } from 'vitest';
import {
  ARTIFACT_TYPES,
  PHASE_PREFIXES,
  OLD_TO_NEW_MAP,
  ARTIFACT_TYPE_BY_STAGE,
  isValidArtifactType,
  getStageForArtifactType,
} from '../../../lib/eva/artifact-types.js';

describe('artifact-types — Stage 26 Growth Playbook constants (FR-2)', () => {
  it('exposes growth_playbook + growth_optimization_roadmap canonical strings', () => {
    expect(ARTIFACT_TYPES.GROWTH_PLAYBOOK).toBe('growth_playbook');
    expect(ARTIFACT_TYPES.GROWTH_OPTIMIZATION_ROADMAP).toBe('growth_optimization_roadmap');
  });

  it('retains LAUNCH_OPTIMIZATION_ROADMAP as a deprecated alias for one release', () => {
    expect(ARTIFACT_TYPES.LAUNCH_OPTIMIZATION_ROADMAP).toBe('launch_optimization_roadmap');
  });

  it('exposes LAUNCH_POSTLAUNCH_* constants (no longer raw strings in stage-25)', () => {
    expect(ARTIFACT_TYPES.LAUNCH_POSTLAUNCH_ASSUMPTIONS_VS_REALITY).toBe('postlaunch_assumptions_vs_reality');
    expect(ARTIFACT_TYPES.LAUNCH_POSTLAUNCH_USER_FEEDBACK_SUMMARY).toBe('postlaunch_user_feedback_summary');
    expect(ARTIFACT_TYPES.LAUNCH_POSTLAUNCH_ANALYTICS_DASHBOARD).toBe('postlaunch_analytics_dashboard');
  });

  it('keeps PHASE_PREFIXES.LAUNCH (no new GROWTH prefix)', () => {
    // Stages 22-26 share the LAUNCH phase per the existing convention.
    // Adding a GROWTH prefix would break the phase-derivation invariant.
    expect(PHASE_PREFIXES.LAUNCH).toBe('launch');
    expect(PHASE_PREFIXES.GROWTH).toBeUndefined();
  });

  it('OLD_TO_NEW_MAP routes launch_optimization_roadmap → growth_optimization_roadmap', () => {
    expect(OLD_TO_NEW_MAP.launch_optimization_roadmap).toBe('growth_optimization_roadmap');
    expect(OLD_TO_NEW_MAP.optimization_roadmap).toBe('growth_optimization_roadmap');
  });

  it('isValidArtifactType accepts both canonical and alias for the rename', () => {
    expect(isValidArtifactType('growth_playbook')).toBe(true);
    expect(isValidArtifactType('growth_optimization_roadmap')).toBe(true);
    expect(isValidArtifactType('launch_optimization_roadmap')).toBe(true); // alias retained
  });

  it('ARTIFACT_TYPE_BY_STAGE[26] includes growth_playbook + growth_optimization_roadmap', () => {
    const stage26 = ARTIFACT_TYPE_BY_STAGE[26];
    expect(stage26).toContain('growth_playbook');
    expect(stage26).toContain('growth_optimization_roadmap');
    // Legacy retained for one release (alias):
    expect(stage26).toContain('launch_optimization_roadmap');
  });

  it('ARTIFACT_TYPE_BY_STAGE[25] includes the postlaunch_* canonical artifacts', () => {
    const stage25 = ARTIFACT_TYPE_BY_STAGE[25];
    expect(stage25).toContain('postlaunch_assumptions_vs_reality');
    expect(stage25).toContain('postlaunch_user_feedback_summary');
    expect(stage25).toContain('postlaunch_analytics_dashboard');
  });

  it('reverse-lookup getStageForArtifactType resolves growth_* to 26', () => {
    expect(getStageForArtifactType('growth_playbook')).toBe(26);
    expect(getStageForArtifactType('growth_optimization_roadmap')).toBe(26);
  });

  it('reverse-lookup resolves postlaunch_* to 25', () => {
    expect(getStageForArtifactType('postlaunch_assumptions_vs_reality')).toBe(25);
    expect(getStageForArtifactType('postlaunch_user_feedback_summary')).toBe(25);
  });
});
