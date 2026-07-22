/**
 * Unit tests for the real-build discriminator (the stage-gauge-vs-real-build GRF instance).
 * SD-LEO-INFRA-VENTURE-REAL-DISCRIMINATOR-AND-STALL-ALARM-001-A (Part 1, FR-5).
 *
 * These pin the DERIVED rule: divergent iff a real build has NOT started AND the stage gauge is
 * past STAGE_SIMULATION_OK. They RED against a naive `stage>=N`-alone predicate (which would flag
 * the real-build-at-stage-19 case) or a `launch_mode`-alone predicate (which would flag the
 * early-stage simulated case), and GREEN only with the two-factor derived rule. No live DB —
 * plain objects only.
 */
import { describe, it, expect } from 'vitest';
import {
  isRealBuildStarted,
  assessRealBuildDivergence,
  STAGE_SIMULATION_OK,
} from '../../../lib/governance/real-build-discriminator.mjs';

describe('isRealBuildStarted — any one piece of real-build evidence => true', () => {
  it('deployment_url set (alone) => true', () => {
    expect(isRealBuildStarted({ deployment_url: 'https://x', repo_url: null, workflow_started_at: null, launch_mode: 'simulated' })).toBe(true);
  });
  it('repo_url set (alone) => true', () => {
    expect(isRealBuildStarted({ deployment_url: null, repo_url: 'https://github.com/x/y', workflow_started_at: null, launch_mode: 'simulated' })).toBe(true);
  });
  it('workflow_started_at set (alone) => true', () => {
    expect(isRealBuildStarted({ deployment_url: null, repo_url: null, workflow_started_at: '2026-07-21T00:00:00Z', launch_mode: 'simulated' })).toBe(true);
  });
  it("launch_mode==='live' (alone) => true", () => {
    expect(isRealBuildStarted({ deployment_url: null, repo_url: null, workflow_started_at: null, launch_mode: 'live' })).toBe(true);
  });
  it('all null + launch_mode simulated => false', () => {
    expect(isRealBuildStarted({ deployment_url: null, repo_url: null, workflow_started_at: null, launch_mode: 'simulated' })).toBe(false);
  });
  it('empty object => false (fail-open, no evidence)', () => {
    expect(isRealBuildStarted({})).toBe(false);
  });
});

describe('assessRealBuildDivergence — derived two-factor rule (not stage-alone, not launch_mode-alone)', () => {
  it('ApexNiche-like (stage-19, simulated, all evidence null) => divergent with a non-empty annotation', () => {
    const r = assessRealBuildDivergence({
      current_lifecycle_stage: 19,
      deployment_url: null,
      repo_url: null,
      workflow_started_at: null,
      launch_mode: 'simulated',
    });
    expect(r.divergent).toBe(true);
    expect(r.real_build_started).toBe(false);
    expect(r.stage).toBe(19);
    expect(r.annotation).toBeTruthy();
    expect(r.annotation.length).toBeGreaterThan(0);
    expect(r.annotation).toMatch(/divergence/i);
  });

  it('real-build-at-stage-19 (deployment_url set, launch_mode still simulated) => NOT divergent', () => {
    // A naive `stage>=N`-alone predicate would FALSELY flag this — the real build has started.
    const r = assessRealBuildDivergence({
      current_lifecycle_stage: 19,
      deployment_url: 'https://x',
      repo_url: null,
      workflow_started_at: null,
      launch_mode: 'simulated',
    });
    expect(r.divergent).toBe(false);
    expect(r.real_build_started).toBe(true);
  });

  it('early-stage simulated (stage <= STAGE_SIMULATION_OK, all null) => NOT divergent (no false positive)', () => {
    // A naive `launch_mode==='simulated'`-alone predicate would FALSELY flag this early venture.
    const r = assessRealBuildDivergence({
      current_lifecycle_stage: STAGE_SIMULATION_OK,
      deployment_url: null,
      repo_url: null,
      workflow_started_at: null,
      launch_mode: 'simulated',
    });
    expect(r.divergent).toBe(false);
    expect(r.real_build_started).toBe(false);
  });

  it('boundary: stage exactly at STAGE_SIMULATION_OK is benign; one past it diverges', () => {
    const base = { deployment_url: null, repo_url: null, workflow_started_at: null, launch_mode: 'simulated' };
    expect(assessRealBuildDivergence({ ...base, current_lifecycle_stage: STAGE_SIMULATION_OK }).divergent).toBe(false);
    expect(assessRealBuildDivergence({ ...base, current_lifecycle_stage: STAGE_SIMULATION_OK + 1 }).divergent).toBe(true);
  });

  it('STAGE_SIMULATION_OK is a conservative early-stage boundary that flags stage-19', () => {
    expect(STAGE_SIMULATION_OK).toBeGreaterThanOrEqual(1);
    expect(STAGE_SIMULATION_OK).toBeLessThan(19); // must flag ApexNiche at stage-19
  });
});
