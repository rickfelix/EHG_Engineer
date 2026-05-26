/**
 * resolve-build-model (SSOT arbiter) — SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 (RCA 813d4c3d).
 * The single decision point that resolves the venture-build "model schism": explicit
 * ventures.build_model wins; legacy build_method is honored for backward-compat; unset falls
 * to leo_bridge — SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 FR-5 flipped the default once the EXEC
 * loop shipped + was pilot-proven on CronLinter. seeded_repo is now an explicit, logged opt-out.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveBuildModel, isLeoBridge, isSeededRepo, DEFAULT_BUILD_MODEL, BUILD_MODELS,
} from '../../../../lib/eva/bridge/resolve-build-model.js';

describe('resolveBuildModel', () => {
  it('explicit ventures.build_model wins over legacy build_method', () => {
    expect(resolveBuildModel({ ventureBuildModel: 'leo_bridge', legacyBuildMethod: 'replit_agent' })).toBe('leo_bridge');
    expect(resolveBuildModel({ ventureBuildModel: 'seeded_repo', legacyBuildMethod: 'leo_bridge' })).toBe('seeded_repo');
  });

  it('legacy build_method=replit_agent => seeded_repo (backward-compat for in-flight ventures)', () => {
    expect(resolveBuildModel({ legacyBuildMethod: 'replit_agent' })).toBe('seeded_repo');
  });

  it('legacy build_method=leo_bridge => leo_bridge', () => {
    expect(resolveBuildModel({ legacyBuildMethod: 'leo_bridge' })).toBe('leo_bridge');
  });

  it('unset resolves to leo_bridge (default flipped once the EXEC loop shipped — FR-5)', () => {
    expect(resolveBuildModel({})).toBe('leo_bridge');
    expect(resolveBuildModel()).toBe('leo_bridge');
    expect(DEFAULT_BUILD_MODEL).toBe('leo_bridge');
  });

  it('seeded_repo survives ONLY as an explicit opt-out (demoted, not deleted; never silent)', () => {
    expect(resolveBuildModel({ ventureBuildModel: 'seeded_repo' })).toBe('seeded_repo');
    expect(resolveBuildModel({ legacyBuildMethod: 'replit_agent' })).toBe('seeded_repo');
    expect(resolveBuildModel({})).not.toBe('seeded_repo'); // never silently when build_model unset
  });

  it('invalid ventureBuildModel falls through to legacy/default', () => {
    expect(resolveBuildModel({ ventureBuildModel: 'garbage', legacyBuildMethod: 'leo_bridge' })).toBe('leo_bridge');
    expect(resolveBuildModel({ ventureBuildModel: '' })).toBe('leo_bridge');
  });

  it('isLeoBridge / isSeededRepo helpers agree with resolveBuildModel', () => {
    expect(isLeoBridge({ ventureBuildModel: 'leo_bridge' })).toBe(true);
    expect(isSeededRepo({ ventureBuildModel: 'leo_bridge' })).toBe(false);
    expect(isLeoBridge({})).toBe(true); // default is leo_bridge (FR-5)
    expect(isSeededRepo({})).toBe(false);
    expect(BUILD_MODELS).toEqual(['leo_bridge', 'seeded_repo']);
  });
});
