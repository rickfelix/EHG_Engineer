/**
 * SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 FR-4 — orchestration-quality of the venture SD tree.
 *
 * Systemic gaps the CronGenius E2E surfaced in convertSprintToSDs (now fixed):
 *   1. children had no build-order dependencies → arbitrary/parallel dispatch (landing page before API)
 *   2. orchestrator priority was hardcoded 'medium' (below critical/high children)
 *   3. key/title doubled "Sprint" ("Sprint: Sprint 2026-05-26", …SPRINT-SPRINT-…)
 */
import { describe, it, expect } from 'vitest';
import {
  aggregateOrchestratorPriority,
  sprintItemLayerRank,
  deriveChildBuildOrder,
  normalizeSprintLabel,
} from '../../lib/eva/lifecycle-sd-bridge.js';

describe('FR-4 #3: normalizeSprintLabel de-dupes the Sprint prefix', () => {
  it('strips a leading "Sprint"', () => {
    expect(normalizeSprintLabel('Sprint 2026-05-26')).toBe('2026-05-26');
    expect(normalizeSprintLabel('Sprint: 2026-05-26')).toBe('2026-05-26');
    expect(normalizeSprintLabel('sprint-7')).toBe('7');
  });
  it('leaves a non-prefixed name unchanged + falls back safely', () => {
    expect(normalizeSprintLabel('2026-05-26')).toBe('2026-05-26');
    expect(normalizeSprintLabel('')).toBe('sprint');
  });
});

describe('FR-4 #2: aggregateOrchestratorPriority = max child priority', () => {
  it('picks the highest child priority', () => {
    expect(aggregateOrchestratorPriority([{ priority: 'high' }, { priority: 'critical' }, { priority: 'low' }])).toBe('critical');
    expect(aggregateOrchestratorPriority([{ priority: 'high' }, { priority: 'medium' }])).toBe('high');
  });
  it('defaults to high when no child carries a priority (never below its work)', () => {
    expect(aggregateOrchestratorPriority([{}, {}])).toBe('high');
    expect(aggregateOrchestratorPriority([])).toBe('high');
  });
});

describe('FR-4 #1: layer rank + build-order dependencies', () => {
  it('ranks by scope (the sprint planner field): backend < integration < frontend', () => {
    expect(sprintItemLayerRank({ scope: 'backend' })).toBe(0);
    expect(sprintItemLayerRank({ scope: 'integration' })).toBe(2);
    expect(sprintItemLayerRank({ scope: 'frontend' })).toBe(3);
    expect(sprintItemLayerRank({ architecture_layer: 'api' })).toBe(1);
    expect(sprintItemLayerRank({ type: 'feature' })).toBe(2); // unknown → middle
  });

  it('CronGenius shape: backend builds first, integration next, frontend last', () => {
    // A=backend, B=integration, C=frontend, D=integration, E=backend (the real sprint plan)
    const payloads = [
      { scope: 'backend' }, { scope: 'integration' }, { scope: 'frontend' }, { scope: 'integration' }, { scope: 'backend' },
    ];
    const keys = ['K-A', 'K-B', 'K-C', 'K-D', 'K-E'];
    const ranks = payloads.map(sprintItemLayerRank); // [0,2,3,2,0]
    const deps = deriveChildBuildOrder(keys, ranks);
    expect(deps[0]).toEqual([]);                     // A backend → no deps
    expect(deps[4]).toEqual([]);                     // E backend → no deps
    expect(deps[1].sort()).toEqual(['K-A', 'K-E']);  // B integration → after both backends
    expect(deps[3].sort()).toEqual(['K-A', 'K-E']);  // D integration → after both backends
    expect(deps[2].sort()).toEqual(['K-A', 'K-B', 'K-D', 'K-E']); // C frontend → after backend + integration
  });

  it('no cycles + deps only point to strictly-earlier layers', () => {
    const keys = ['a', 'b', 'c'];
    const ranks = [0, 1, 2];
    const deps = deriveChildBuildOrder(keys, ranks);
    expect(deps).toEqual([[], ['a'], ['a', 'b']]);
    // a child never depends on itself or a same/later-rank child
    deps.forEach((d, i) => expect(d).not.toContain(keys[i]));
  });
});
