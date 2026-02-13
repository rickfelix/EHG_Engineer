/**
 * EVA Build Loop Templates (Stages 17-22) - Unit Tests
 * Part of SD-EVA-FEAT-TEMPLATES-BUILDLOOP-001
 *
 * Tests:
 * - Passive container validation and computeDerived for stages 17-22
 * - v2.0 promotion gate with decision objects
 * - Backward-compatible promotion gate with legacy booleans
 * - Analysis step output normalization (mocked LLM)
 * - Index registry for stages 17-22
 */

import { describe, test, expect, vi } from 'vitest';

// Passive containers
import stage17, { CHECKLIST_CATEGORIES, ITEM_STATUSES } from '../../lib/eva/stage-templates/stage-17.js';
import stage18, { PRIORITY_VALUES, SD_TYPES } from '../../lib/eva/stage-templates/stage-18.js';
import stage19, { TASK_STATUSES } from '../../lib/eva/stage-templates/stage-19.js';
import stage20, { MIN_TEST_SUITES, MIN_COVERAGE_PCT } from '../../lib/eva/stage-templates/stage-20.js';
import stage21, { INTEGRATION_STATUSES } from '../../lib/eva/stage-templates/stage-21.js';
import stage22, { evaluatePromotionGate, APPROVAL_STATUSES } from '../../lib/eva/stage-templates/stage-22.js';

// ── Stage 17: Pre-Build Checklist ───────────────────────────

describe('Stage 17 - Pre-Build Checklist', () => {
  test('version is 2.0.0', () => {
    expect(stage17.version).toBe('2.0.0');
  });

  test('has analysisStep attached', () => {
    expect(typeof stage17.analysisStep).toBe('function');
  });

  test('exports all checklist categories', () => {
    expect(CHECKLIST_CATEGORIES).toEqual([
      'architecture', 'team_readiness', 'tooling', 'environment', 'dependencies',
    ]);
  });

  test('validates valid data', () => {
    const data = {
      checklist: Object.fromEntries(CHECKLIST_CATEGORIES.map(cat => [cat, [
        { name: `${cat} item`, status: 'complete', owner: 'Dev', notes: '' },
      ]])),
      blockers: [],
    };
    const result = stage17.validate(data);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('rejects missing checklist', () => {
    const result = stage17.validate({});
    expect(result.valid).toBe(false);
  });

  test('rejects invalid item status', () => {
    const data = {
      checklist: Object.fromEntries(CHECKLIST_CATEGORIES.map(cat => [cat, [
        { name: 'item', status: 'invalid_status' },
      ]])),
    };
    const result = stage17.validate(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('status'))).toBe(true);
  });

  test('computeDerived calculates readiness correctly', () => {
    const data = {
      checklist: {
        architecture: [{ name: 'A', status: 'complete' }],
        team_readiness: [{ name: 'B', status: 'complete' }],
        tooling: [{ name: 'C', status: 'in_progress' }],
        environment: [{ name: 'D', status: 'not_started' }],
        dependencies: [{ name: 'E', status: 'complete' }],
      },
      blockers: [{ description: 'issue', severity: 'high', mitigation: 'fix' }],
    };
    const result = stage17.computeDerived(data);
    expect(result.total_items).toBe(5);
    expect(result.completed_items).toBe(3);
    expect(result.readiness_pct).toBe(60);
    expect(result.all_categories_present).toBe(true);
    expect(result.blocker_count).toBe(1);
  });
});

// ── Stage 18: Sprint Planning ───────────────────────────────

describe('Stage 18 - Sprint Planning', () => {
  test('version is 2.0.0', () => {
    expect(stage18.version).toBe('2.0.0');
  });

  test('has analysisStep attached', () => {
    expect(typeof stage18.analysisStep).toBe('function');
  });

  test('validates valid sprint data', () => {
    const data = {
      sprint_name: 'Sprint 1',
      sprint_duration_days: 14,
      sprint_goal: 'Complete MVP features for launch',
      items: [{
        title: 'Build auth',
        description: 'Authentication system',
        priority: 'high',
        type: 'feature',
        scope: 'Backend API',
        success_criteria: 'Users can log in',
        target_application: 'EHG',
        story_points: 5,
      }],
    };
    const result = stage18.validate(data);
    expect(result.valid).toBe(true);
  });

  test('rejects sprint goal too short', () => {
    const data = {
      sprint_name: 'Sprint 1',
      sprint_duration_days: 14,
      sprint_goal: 'short',
      items: [{
        title: 'Task', description: 'desc', priority: 'high',
        type: 'feature', scope: 'all', success_criteria: 'done',
        target_application: 'EHG',
      }],
    };
    const result = stage18.validate(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('sprint_goal'))).toBe(true);
  });

  test('computeDerived generates SD bridge payloads', () => {
    const data = {
      items: [
        { title: 'A', description: 'desc', priority: 'high', type: 'feature', scope: 's', success_criteria: 'c', target_application: 'EHG', story_points: 3 },
        { title: 'B', description: 'desc', priority: 'low', type: 'bugfix', scope: 's', success_criteria: 'c', target_application: 'EHG', story_points: 2 },
      ],
    };
    const result = stage18.computeDerived(data);
    expect(result.total_items).toBe(2);
    expect(result.total_story_points).toBe(5);
    expect(result.sd_bridge_payloads).toHaveLength(2);
    expect(result.sd_bridge_payloads[0].title).toBe('A');
  });
});

// ── Stage 19: Build Execution ───────────────────────────────

describe('Stage 19 - Build Execution', () => {
  test('version is 2.0.0', () => {
    expect(stage19.version).toBe('2.0.0');
  });

  test('has analysisStep attached', () => {
    expect(typeof stage19.analysisStep).toBe('function');
  });

  test('validates valid task data', () => {
    const data = {
      tasks: [{ name: 'Build auth', status: 'done' }],
      issues: [],
    };
    expect(stage19.validate(data).valid).toBe(true);
  });

  test('rejects invalid task status', () => {
    const data = {
      tasks: [{ name: 'Task', status: 'invalid' }],
    };
    const result = stage19.validate(data);
    expect(result.valid).toBe(false);
  });

  test('computeDerived calculates completion', () => {
    const data = {
      tasks: [
        { name: 'A', status: 'done' },
        { name: 'B', status: 'done' },
        { name: 'C', status: 'in_progress' },
        { name: 'D', status: 'blocked' },
      ],
      issues: [],
    };
    const result = stage19.computeDerived(data);
    expect(result.total_tasks).toBe(4);
    expect(result.completed_tasks).toBe(2);
    expect(result.blocked_tasks).toBe(1);
    expect(result.completion_pct).toBe(50);
    expect(result.tasks_by_status.done).toBe(2);
    expect(result.tasks_by_status.blocked).toBe(1);
  });
});

// ── Stage 20: Quality Assurance ─────────────────────────────

describe('Stage 20 - Quality Assurance', () => {
  test('version is 2.0.0', () => {
    expect(stage20.version).toBe('2.0.0');
  });

  test('has analysisStep attached', () => {
    expect(typeof stage20.analysisStep).toBe('function');
  });

  test('validates valid test suite data', () => {
    const data = {
      test_suites: [{ name: 'Unit', total_tests: 100, passing_tests: 95, coverage_pct: 80 }],
      known_defects: [],
    };
    expect(stage20.validate(data).valid).toBe(true);
  });

  test('rejects passing > total', () => {
    const data = {
      test_suites: [{ name: 'Unit', total_tests: 10, passing_tests: 15 }],
    };
    const result = stage20.validate(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('cannot exceed'))).toBe(true);
  });

  test('computeDerived quality gate pass', () => {
    const data = {
      test_suites: [{ name: 'Unit', total_tests: 100, passing_tests: 100, coverage_pct: 80 }],
      known_defects: [],
    };
    const result = stage20.computeDerived(data);
    expect(result.quality_gate_passed).toBe(true);
    expect(result.overall_pass_rate).toBe(100);
    expect(result.coverage_pct).toBe(80);
  });

  test('computeDerived quality gate fail - low coverage', () => {
    const data = {
      test_suites: [{ name: 'Unit', total_tests: 100, passing_tests: 100, coverage_pct: 40 }],
      known_defects: [],
    };
    const result = stage20.computeDerived(data);
    expect(result.quality_gate_passed).toBe(false);
  });
});

// ── Stage 21: Integration Testing ───────────────────────────

describe('Stage 21 - Integration Testing', () => {
  test('version is 2.0.0', () => {
    expect(stage21.version).toBe('2.0.0');
  });

  test('has analysisStep attached', () => {
    expect(typeof stage21.analysisStep).toBe('function');
  });

  test('validates valid integration data', () => {
    const data = {
      environment: 'staging',
      integrations: [{
        name: 'API→DB', source: 'API', target: 'Database', status: 'pass',
      }],
    };
    expect(stage21.validate(data).valid).toBe(true);
  });

  test('computeDerived tracks failures', () => {
    const data = {
      integrations: [
        { name: 'A', source: 'X', target: 'Y', status: 'pass' },
        { name: 'B', source: 'X', target: 'Z', status: 'fail', error_message: 'timeout' },
      ],
      environment: 'staging',
    };
    const result = stage21.computeDerived(data);
    expect(result.total_integrations).toBe(2);
    expect(result.passing_integrations).toBe(1);
    expect(result.failing_integrations).toHaveLength(1);
    expect(result.all_passing).toBe(false);
    expect(result.pass_rate).toBe(50);
  });
});

// ── Stage 22: Release Readiness ─────────────────────────────

describe('Stage 22 - Release Readiness', () => {
  test('version is 2.0.0', () => {
    expect(stage22.version).toBe('2.0.0');
  });

  test('has analysisStep attached', () => {
    expect(typeof stage22.analysisStep).toBe('function');
  });

  test('validates valid release data', () => {
    const data = {
      release_items: [{ name: 'Feature A', category: 'feature', status: 'approved', approver: 'PM' }],
      release_notes: 'Initial release with core features',
      target_date: '2026-03-01',
    };
    expect(stage22.validate(data).valid).toBe(true);
  });

  test('computeDerived tracks approvals', () => {
    const data = {
      release_items: [
        { name: 'A', category: 'feature', status: 'approved' },
        { name: 'B', category: 'bugfix', status: 'pending' },
      ],
      release_notes: 'Release notes here',
      target_date: '2026-03-01',
    };
    const result = stage22.computeDerived(data);
    expect(result.total_items).toBe(2);
    expect(result.approved_items).toBe(1);
    expect(result.all_approved).toBe(false);
  });
});

// ── Promotion Gate v2.0 (Decision Objects) ──────────────────

describe('Promotion Gate v2.0 - Decision Objects', () => {
  const makeV2Prerequisites = (overrides = {}) => ({
    stage17: {
      buildReadiness: { decision: 'go', rationale: 'All ready' },
      ...overrides.stage17,
    },
    stage18: {
      sprintItems: [{ title: 'Item 1' }],
      ...overrides.stage18,
    },
    stage19: {
      sprintCompletion: { decision: 'complete', readyForQa: true, rationale: 'Done' },
      ...overrides.stage19,
    },
    stage20: {
      qualityDecision: { decision: 'pass', rationale: 'All tests pass' },
      ...overrides.stage20,
    },
    stage21: {
      reviewDecision: { decision: 'approve', rationale: 'Approved' },
      ...overrides.stage21,
    },
    stage22: {
      releaseDecision: { decision: 'release', rationale: 'Ready to ship' },
      ...overrides.stage22,
    },
  });

  test('PASS: all decisions positive', () => {
    const result = evaluatePromotionGate(makeV2Prerequisites());
    expect(result.pass).toBe(true);
    expect(result.blockers).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('PASS with warnings: conditional decisions', () => {
    const result = evaluatePromotionGate(makeV2Prerequisites({
      stage17: { buildReadiness: { decision: 'conditional_go', rationale: 'Missing tooling' } },
      stage20: { qualityDecision: { decision: 'conditional_pass', rationale: '94% pass rate' } },
      stage21: { reviewDecision: { decision: 'conditional', rationale: 'Minor issues' } },
    }));
    expect(result.pass).toBe(true);
    expect(result.warnings).toHaveLength(3);
    expect(result.blockers).toHaveLength(0);
    expect(result.rationale).toContain('3 advisory warning(s)');
  });

  test('FAIL: no_go readiness', () => {
    const result = evaluatePromotionGate(makeV2Prerequisites({
      stage17: { buildReadiness: { decision: 'no_go', rationale: 'Critical dependency missing' } },
    }));
    expect(result.pass).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]).toContain('no_go');
  });

  test('FAIL: sprint blocked', () => {
    const result = evaluatePromotionGate(makeV2Prerequisites({
      stage19: { sprintCompletion: { decision: 'blocked', rationale: 'External API down' } },
    }));
    expect(result.pass).toBe(false);
    expect(result.blockers.some(b => b.includes('blocked'))).toBe(true);
  });

  test('FAIL: quality fail', () => {
    const result = evaluatePromotionGate(makeV2Prerequisites({
      stage20: { qualityDecision: { decision: 'fail', rationale: '60% pass rate' } },
    }));
    expect(result.pass).toBe(false);
    expect(result.blockers.some(b => b.includes('Quality gate: fail'))).toBe(true);
  });

  test('FAIL: review reject', () => {
    const result = evaluatePromotionGate(makeV2Prerequisites({
      stage21: { reviewDecision: { decision: 'reject', rationale: 'Security issues' } },
    }));
    expect(result.pass).toBe(false);
    expect(result.blockers.some(b => b.includes('reject'))).toBe(true);
  });

  test('FAIL: release hold', () => {
    const result = evaluatePromotionGate(makeV2Prerequisites({
      stage22: { releaseDecision: { decision: 'hold', rationale: 'Waiting for legal' } },
    }));
    expect(result.pass).toBe(false);
    expect(result.blockers.some(b => b.includes('hold'))).toBe(true);
  });

  test('FAIL: release cancel', () => {
    const result = evaluatePromotionGate(makeV2Prerequisites({
      stage22: { releaseDecision: { decision: 'cancel', rationale: 'Market changed' } },
    }));
    expect(result.pass).toBe(false);
    expect(result.blockers.some(b => b.includes('cancel'))).toBe(true);
    expect(result.required_next_actions.some(a => a.includes('replanning'))).toBe(true);
  });

  test('FAIL: no sprint items', () => {
    const result = evaluatePromotionGate(makeV2Prerequisites({
      stage18: { sprintItems: [] },
    }));
    expect(result.pass).toBe(false);
    expect(result.blockers.some(b => b.includes('No sprint items'))).toBe(true);
  });

  test('sprint continue produces warning, not blocker', () => {
    const result = evaluatePromotionGate(makeV2Prerequisites({
      stage19: { sprintCompletion: { decision: 'continue', rationale: 'Work in progress' } },
    }));
    expect(result.pass).toBe(true);
    expect(result.warnings.some(w => w.includes('continue'))).toBe(true);
  });
});

// ── Promotion Gate Backward Compatibility (Legacy Booleans) ─

describe('Promotion Gate - Legacy Backward Compatibility', () => {
  test('PASS with legacy boolean fields', () => {
    const result = evaluatePromotionGate({
      stage17: {
        checklist: Object.fromEntries(CHECKLIST_CATEGORIES.map(c => [c, [{ name: 'item', status: 'complete' }]])),
        readiness_pct: 100,
      },
      stage18: { items: [{ title: 'Sprint item' }] },
      stage19: { completion_pct: 100, blocked_tasks: 0 },
      stage20: { quality_gate_passed: true },
      stage21: { all_passing: true },
      stage22: { release_items: [{ name: 'A', status: 'approved' }] },
    });
    expect(result.pass).toBe(true);
  });

  test('FAIL with legacy: low readiness', () => {
    const result = evaluatePromotionGate({
      stage17: { checklist: {}, readiness_pct: 50 },
      stage18: { items: [{ title: 'item' }] },
      stage19: { completion_pct: 100, blocked_tasks: 0 },
      stage20: { quality_gate_passed: true },
      stage21: { all_passing: true },
      stage22: { release_items: [{ name: 'A', status: 'approved' }] },
    });
    expect(result.pass).toBe(false);
  });

  test('FAIL with legacy: quality gate not passed', () => {
    const result = evaluatePromotionGate({
      stage17: {
        checklist: Object.fromEntries(CHECKLIST_CATEGORIES.map(c => [c, [{ name: 'item', status: 'complete' }]])),
        readiness_pct: 100,
      },
      stage18: { items: [{ title: 'item' }] },
      stage19: { completion_pct: 100, blocked_tasks: 0 },
      stage20: { quality_gate_passed: false, overall_pass_rate: 80, coverage_pct: 40 },
      stage21: { all_passing: true },
      stage22: { release_items: [{ name: 'A', status: 'approved' }] },
    });
    expect(result.pass).toBe(false);
    expect(result.blockers.some(b => b.includes('pass rate'))).toBe(true);
    expect(result.blockers.some(b => b.includes('coverage'))).toBe(true);
  });

  test('v2 decision objects take precedence over legacy booleans', () => {
    const result = evaluatePromotionGate({
      stage17: { buildReadiness: { decision: 'go' }, checklist: {}, readiness_pct: 10 },
      stage18: { sprintItems: [{ title: 'item' }], items: [] },
      stage19: { sprintCompletion: { decision: 'complete' }, completion_pct: 0 },
      stage20: { qualityDecision: { decision: 'pass' }, quality_gate_passed: false },
      stage21: { reviewDecision: { decision: 'approve' }, all_passing: false },
      stage22: { releaseDecision: { decision: 'release' }, release_items: [] },
    });
    // v2 decisions say all good, legacy says all bad — v2 should win
    expect(result.pass).toBe(true);
  });
});

// ── Index Registry ──────────────────────────────────────────

describe('Analysis Steps Index Registry', () => {
  test('getAnalysisStep returns functions for stages 17-22', async () => {
    const { getAnalysisStep } = await import('../../lib/eva/stage-templates/analysis-steps/index.js');
    for (const num of [17, 18, 19, 20, 21, 22]) {
      const fn = await getAnalysisStep(num);
      expect(typeof fn).toBe('function');
    }
  });

  test('getAnalysisStep returns null for invalid stage', async () => {
    const { getAnalysisStep } = await import('../../lib/eva/stage-templates/analysis-steps/index.js');
    const fn = await getAnalysisStep(99);
    expect(fn).toBeNull();
  });
});
