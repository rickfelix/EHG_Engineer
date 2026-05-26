/**
 * resolve-build-model (SSOT arbiter) — SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 (RCA 813d4c3d).
 * The single decision point that resolves the venture-build "model schism": explicit
 * ventures.build_model wins; legacy build_method is honored for backward-compat; unset falls
 * to the safe default (seeded_repo, gated on the venture EXEC loop).
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

  it('unset resolves to the safe default (seeded_repo, gated on the EXEC loop)', () => {
    expect(resolveBuildModel({})).toBe('seeded_repo');
    expect(resolveBuildModel()).toBe('seeded_repo');
    expect(DEFAULT_BUILD_MODEL).toBe('seeded_repo');
  });

  it('invalid ventureBuildModel falls through to legacy/default', () => {
    expect(resolveBuildModel({ ventureBuildModel: 'garbage', legacyBuildMethod: 'leo_bridge' })).toBe('leo_bridge');
    expect(resolveBuildModel({ ventureBuildModel: '' })).toBe('seeded_repo');
  });

  it('isLeoBridge / isSeededRepo helpers agree with resolveBuildModel', () => {
    expect(isLeoBridge({ ventureBuildModel: 'leo_bridge' })).toBe(true);
    expect(isSeededRepo({ ventureBuildModel: 'leo_bridge' })).toBe(false);
    expect(isSeededRepo({})).toBe(true);
    expect(BUILD_MODELS).toEqual(['leo_bridge', 'seeded_repo']);
  });
});
