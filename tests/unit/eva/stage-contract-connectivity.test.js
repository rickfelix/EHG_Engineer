/**
 * Unit tests for the stage-contract connectivity solver (pure checks).
 * SD-LEO-INFRA-STAGE-CONTRACT-REGISTRY-001 FR-3.
 *
 * Each check is exercised with a passing fixture AND a failing fixture.
 * Network-free: only the exported pure functions are imported; main() guards
 * on direct execution.
 */

import { describe, it, expect } from 'vitest';
import {
  CHECK_IDS,
  CROSS_CUTTING_TYPES,
  levenshtein,
  nearestType,
  producibleAtOrBefore,
  checkRequiredHasProducer,
  checkBoundaryCoherence,
  checkConsumesSatisfiable,
  checkRenameAtomicity,
  checkLegacyParity,
  checkObservedProducer,
  checkContractMapLint,
  runAllChecks,
} from '../../../scripts/validate-stage-contract-connectivity.mjs';
import { ARTIFACT_TYPE_BY_STAGE } from '../../../lib/eva/artifact-types.js';

const ATBS_FIXTURE = {
  1: ['truth_idea_brief'],
  2: ['truth_ai_critique'],
  3: ['truth_validation_decision'],
};

describe('levenshtein / nearestType', () => {
  it('computes exact distances', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('abc', 'abd')).toBe(1);
    expect(levenshtein('', 'ab')).toBe(2);
    expect(levenshtein('launch_uat_report', 'launch_test_plan')).toBeGreaterThan(0);
  });

  it('nearestType picks the closest candidate and skips identity', () => {
    const n = nearestType('truth_idea_brie', ['truth_idea_brief', 'truth_ai_critique']);
    expect(n.match).toBe('truth_idea_brief');
    expect(n.distance).toBe(1);
    expect(nearestType('x', [])).toBeNull();
  });
});

describe('producibleAtOrBefore', () => {
  it('unions declared types up to and including the stage', () => {
    const set = producibleAtOrBefore(2, ATBS_FIXTURE);
    expect(set.has('truth_idea_brief')).toBe(true);
    expect(set.has('truth_ai_critique')).toBe(true);
    expect(set.has('truth_validation_decision')).toBe(false);
  });

  it('folds in extraByStage rows (venture_stages requirement side)', () => {
    const set = producibleAtOrBefore(2, ATBS_FIXTURE, [
      { stage_number: 1, required_artifacts: ['extra_type'] },
      { stage_number: 5, required_artifacts: ['too_late'] },
    ]);
    expect(set.has('extra_type')).toBe(true);
    expect(set.has('too_late')).toBe(false);
  });
});

describe('C1 REQUIRED_HAS_PRODUCER', () => {
  it('passes when every required type has a producer at stage <= N', () => {
    const vs = [
      { stage_number: 1, required_artifacts: ['truth_idea_brief'] },
      { stage_number: 3, required_artifacts: ['truth_idea_brief', 'truth_validation_decision'] },
    ];
    expect(checkRequiredHasProducer(vs, ATBS_FIXTURE)).toEqual([]);
  });

  it('passes for cross-cutting gate artifacts at any stage', () => {
    const vs = [{ stage_number: 17, required_artifacts: ['system_devils_advocate_review'] }];
    expect(checkRequiredHasProducer(vs, ATBS_FIXTURE)).toEqual([]);
  });

  it('fails with later-stage-only and no-producer diagnostics + nearest match', () => {
    const vs = [
      { stage_number: 1, required_artifacts: ['truth_validation_decision'] }, // declared at 3 (later)
      { stage_number: 2, required_artifacts: ['totally_unknown_type'] },
    ];
    const failures = checkRequiredHasProducer(vs, ATBS_FIXTURE);
    expect(failures).toHaveLength(2);
    expect(failures[0]).toMatchObject({
      check: CHECK_IDS.C1,
      stage: 1,
      artifact_type: 'truth_validation_decision',
      got: 'declared only at a LATER stage',
    });
    expect(failures[1].got).toBe('no declared producer at any stage');
    expect(failures[1].nearest_match).toBeTruthy();
  });

  it('REGRESSION (live shape): post-FR-1 ARTIFACT_TYPE_BY_STAGE covers the SSOT S20-S26 requirements', () => {
    const vs = [
      { stage_number: 20, required_artifacts: ['code_quality_report'] },
      { stage_number: 21, required_artifacts: ['distribution_channel_config', 'distribution_ad_copy'] },
      { stage_number: 22, required_artifacts: ['visual_device_screenshots', 'visual_social_graphics'] },
      { stage_number: 23, required_artifacts: ['launch_readiness_checklist'] },
      { stage_number: 24, required_artifacts: ['launch_metrics'] },
      { stage_number: 25, required_artifacts: ['postlaunch_assumptions_vs_reality', 'postlaunch_user_feedback_summary'] },
      { stage_number: 26, required_artifacts: ['growth_playbook', 'growth_optimization_roadmap'] },
    ];
    expect(checkRequiredHasProducer(vs, ARTIFACT_TYPE_BY_STAGE)).toEqual([]);
  });
});

describe('C2 BOUNDARY_COHERENCE', () => {
  const vs = [{ stage_number: 2, required_artifacts: ['from_vs_only'] }];

  it('passes when boundary requirements are producible upstream (ATBS or venture_stages or cross-cutting)', () => {
    const boundaries = [
      { from_stage: 3, to_stage: 4, required_artifacts: ['truth_idea_brief', 'from_vs_only', 'system_devils_advocate_review'] },
    ];
    expect(checkBoundaryCoherence(boundaries, vs, ATBS_FIXTURE)).toEqual([]);
  });

  it('fails for orphan boundary types', () => {
    const boundaries = [{ from_stage: 2, to_stage: 3, required_artifacts: ['truth_validation_decision'] }];
    const failures = checkBoundaryCoherence(boundaries, vs, ATBS_FIXTURE);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      check: CHECK_IDS.C2,
      stage: 2,
      artifact_type: 'truth_validation_decision',
    });
  });
});

describe('C3 CONSUMES_SATISFIABLE', () => {
  it('passes for an internally consistent consumes spec', () => {
    const r = checkConsumesSatisfiable({
      upstreamTypes: ['truth_idea_brief'],
      stageMap: { truth_idea_brief: 1 },
      consumerStage: 18,
      artifactTypeByStage: ATBS_FIXTURE,
      stageContracts: new Map([[2, { consumes: [{ stage: 1, fields: {} }] }]]),
      crossStageDeps: { 2: [1] },
    });
    expect(r.failures).toEqual([]);
    expect(r.advisories).toEqual([]);
  });

  it('fails hard on STAGE_MAP/UPSTREAM set mismatch and unproducible consumed types', () => {
    const r = checkConsumesSatisfiable({
      upstreamTypes: ['truth_idea_brief', 'no_map_entry'],
      stageMap: { truth_idea_brief: 1, map_only_entry: 4, unproducible: 2 },
      consumerStage: 18,
      artifactTypeByStage: ATBS_FIXTURE,
      stageContracts: new Map(),
      crossStageDeps: {},
    });
    const kinds = r.failures.map(f => `${f.artifact_type}:${f.got}`);
    expect(r.failures.length).toBeGreaterThanOrEqual(2);
    expect(kinds.some(k => k.startsWith('no_map_entry:'))).toBe(true);
    expect(kinds.some(k => k.startsWith('map_only_entry:'))).toBe(true);
  });

  it('flags non-causal consumes/deps as advisories (not hard failures)', () => {
    const r = checkConsumesSatisfiable({
      upstreamTypes: [],
      stageMap: {},
      artifactTypeByStage: ATBS_FIXTURE,
      stageContracts: new Map([[2, { consumes: [{ stage: 5, fields: {} }] }]]),
      crossStageDeps: { 3: [3] },
    });
    expect(r.failures).toEqual([]);
    expect(r.advisories).toHaveLength(2);
    expect(r.advisories.every(a => a.check === CHECK_IDS.C3)).toBe(true);
  });

  it('REGRESSION (live shape): the real S18 UPSTREAM_ARTIFACT_TYPES spec is satisfiable', () => {
    const r = checkConsumesSatisfiable({});
    expect(r.failures).toEqual([]);
  });
});

describe('C4 RENAME_ATOMICITY', () => {
  it('passes for canonical-only registries', () => {
    const failures = checkRenameAtomicity({
      registries: [
        { name: 'venture_stages.required_artifacts', entries: [{ stage: 23, types: ['launch_readiness_checklist'] }] },
      ],
    });
    expect(failures).toEqual([]);
  });

  it('flags deprecated aliases with their canonical replacement', () => {
    const failures = checkRenameAtomicity({
      registries: [
        { name: 'venture_stages.required_artifacts', entries: [{ stage: 25, types: ['launch_marketing_checklist'] }] },
      ],
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      check: CHECK_IDS.C4,
      stage: 25,
      artifact_type: 'launch_marketing_checklist',
      nearest_match: 'launch_readiness_checklist',
    });
  });

  it('flags legacy pre-rename keys (OLD_TO_NEW_MAP keys that are not canonical values)', () => {
    const failures = checkRenameAtomicity({
      registries: [
        { name: 'gate_boundary_config.required_artifacts', entries: [{ stage: 9, types: ['risk_matrix'] }] },
      ],
    });
    expect(failures).toHaveLength(1);
    expect(failures[0].nearest_match).toBe('engine_risk_matrix');
  });
});

describe('C5 LEGACY_PARITY', () => {
  const vs = [
    { stage_number: 18, required_artifacts: ['marketing_tagline', 'marketing_seo_meta'] },
    { stage_number: 23, required_artifacts: ['launch_readiness_checklist'] },
  ];

  it('passes when the legacy table mirrors the SSOT', () => {
    const legacy = [
      { stage_number: 18, artifact_type: 'marketing_tagline' },
      { stage_number: 18, artifact_type: 'marketing_seo_meta' },
      { stage_number: 23, artifact_type: 'launch_readiness_checklist' },
    ];
    expect(checkLegacyParity(legacy, vs)).toEqual([]);
  });

  it('reports both missing-from-legacy and stale-legacy rows (the S18/S23 drift class)', () => {
    const legacy = [
      { stage_number: 18, artifact_type: 'build_system_prompt' },   // stale (never produced)
      { stage_number: 23, artifact_type: 'launch_uat_report' },     // stale (renamed away)
    ];
    const failures = checkLegacyParity(legacy, vs);
    const missing = failures.filter(f => f.got === 'missing from legacy table');
    const stale = failures.filter(f => f.got === 'stale legacy row');
    expect(missing.map(f => f.artifact_type).sort()).toEqual(['launch_readiness_checklist', 'marketing_seo_meta', 'marketing_tagline']);
    expect(stale.map(f => f.artifact_type).sort()).toEqual(['build_system_prompt', 'launch_uat_report']);
    // Nearest-match guides the operator from the stale name to the canonical one.
    expect(stale.find(f => f.artifact_type === 'launch_uat_report').nearest_match).toBe('launch_readiness_checklist');
  });
});

describe('C6 OBSERVED_PRODUCER (advisory)', () => {
  const vs = [
    { stage_number: 1, required_artifacts: ['truth_idea_brief'] },
    { stage_number: 20, required_artifacts: ['code_quality_report'] },
    { stage_number: 26, required_artifacts: ['growth_playbook'] },
  ];

  it('only flags never-observed types at stages ventures have actually traversed', () => {
    const advisories = checkObservedProducer(vs, new Set(['truth_idea_brief']), 23);
    expect(advisories).toHaveLength(1);
    expect(advisories[0]).toMatchObject({
      check: CHECK_IDS.C6,
      stage: 20,
      artifact_type: 'code_quality_report',
    });
    // stage 26 > maxTraversed 23 -> not flagged; truth_idea_brief observed -> not flagged.
  });

  it('flags nothing when no venture has traversed any stage', () => {
    expect(checkObservedProducer(vs, new Set(), -1)).toEqual([]);
  });
});

describe('C7 CONTRACT_MAP_LINT', () => {
  it('passes on unique Map keys', () => {
    const src = 'const M = new Map([\n  [1, {\n  }],\n  [2, {\n  }],\n]);';
    expect(checkContractMapLint(src)).toEqual([]);
  });

  it('flags duplicate Map keys (the silent-discard bug class)', () => {
    const src = 'const M = new Map([\n  [20, {\n  }],\n  [20, {\n  }],\n  [21, {\n  }],\n]);';
    const failures = checkContractMapLint(src);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ check: CHECK_IDS.C7, stage: 20 });
  });

  it('ignores numeric arrays that are not Map entries (CROSS_STAGE_DEPS style)', () => {
    const src = 'const DEPS = {\n  14: [1, 13],\n  15: [1, 6, 10],\n};';
    expect(checkContractMapLint(src)).toEqual([]);
  });
});

describe('runAllChecks aggregation', () => {
  it('aggregates failures + advisories with a per-check summary and ok flag', () => {
    const result = runAllChecks({
      ventureStages: [{ stage_number: 18, required_artifacts: ['marketing_tagline'] }],
      boundaries: [],
      legacyRows: [{ stage_number: 18, artifact_type: 'build_system_prompt' }],
      observedTypes: new Set(['marketing_tagline']),
      maxTraversedStage: 23,
      stageContractsSource: 'new Map([\n  [20, {\n  }],\n  [20, {\n  }],\n]);',
    });
    expect(result.ok).toBe(false);
    // C5: marketing_tagline missing from legacy + build_system_prompt stale; C7: dup 20.
    expect(result.failures.filter(f => f.check === CHECK_IDS.C5)).toHaveLength(2);
    expect(result.failures.filter(f => f.check === CHECK_IDS.C7)).toHaveLength(1);
    expect(result.summary).toContain('DRIFT');
    expect(result.summary).toContain('LEGACY_PARITY');
  });

  it('reports ok with a green summary when everything lines up', () => {
    const result = runAllChecks({
      ventureStages: [{ stage_number: 18, required_artifacts: ['marketing_tagline'] }],
      boundaries: [],
      legacyRows: [{ stage_number: 18, artifact_type: 'marketing_tagline' }],
      observedTypes: new Set(['marketing_tagline']),
      maxTraversedStage: 23,
      stageContractsSource: 'new Map([\n  [20, {\n  }],\n]);',
    });
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.summary).toContain('OK');
  });
});

describe('CROSS_CUTTING_TYPES', () => {
  it('covers the gate-machinery artifacts', () => {
    expect(CROSS_CUTTING_TYPES.has('system_devils_advocate_review')).toBe(true);
    expect(CROSS_CUTTING_TYPES.has('value_multiplier_assessment')).toBe(true);
  });
});
