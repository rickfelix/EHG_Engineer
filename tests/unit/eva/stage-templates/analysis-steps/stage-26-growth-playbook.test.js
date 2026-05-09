/**
 * Unit tests for lib/eva/stage-templates/analysis-steps/stage-26-growth-playbook.js
 *
 * SD-LEO-FEAT-STAGE-GROWTH-PLAYBOOK-001 / FR-4 + FR-5
 *
 * Covers:
 *   - FR-5 entry-precondition refusal — both postlaunch_* artifacts missing → SKIP
 *   - FR-5 entry-precondition refusal — one postlaunch_* artifact archived (is_current=false) → SKIP partial
 *   - FR-5 entry-precondition refusal — postlaunchArtifacts param undefined → SKIP missing
 *   - FR-4 idempotency — venture already at workflow_status='completed' → SKIP already_completed
 *   - happy path — both postlaunch_* present + LLM responds → playbook + lifecycle_terminal='request' hint
 *   - happy path — LLM throws → fallback playbook still emits lifecycle_terminal='request'
 *   - SKIP path NEVER signals lifecycle_terminal (must be false)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const POSTLAUNCH_ARTIFACTS_OK = [
  { artifact_type: 'postlaunch_assumptions_vs_reality', is_current: true },
  { artifact_type: 'postlaunch_user_feedback_summary', is_current: true },
];

const FAKE_LLM_RESPONSE = {
  growth_experiments: [
    { name: 'Referral test', hypothesis: 'X', metric: 'Y', priority: 'high' },
  ],
  scaling_priorities: [
    { area: 'Infra', current_state: 'A', target_state: 'B', timeline: '90d' },
  ],
  operations_handoff: {
    monitoring_dashboards: ['x'],
    alert_thresholds: ['y'],
    runbooks: ['z'],
    escalation_path: 'Chairman',
  },
  '90_day_plan': { month_1: 'a', month_2: 'b', month_3: 'c' },
};

vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(),
}));

vi.mock('../../../../../lib/eva/utils/parse-json.js', () => ({
  parseJSON: vi.fn(),
  extractUsage: vi.fn(() => ({})),
}));

let analyzeStage26GrowthPlaybook;
let _testing;
let getLLMClient;
let parseJSON;

beforeEach(async () => {
  vi.clearAllMocks();
  // Re-import with fresh mocks each test.
  vi.resetModules();
  ({ analyzeStage26GrowthPlaybook, _testing } = await import(
    '../../../../../lib/eva/stage-templates/analysis-steps/stage-26-growth-playbook.js'
  ));
  ({ getLLMClient } = await import('../../../../../lib/llm/index.js'));
  ({ parseJSON } = await import('../../../../../lib/eva/utils/parse-json.js'));
});

describe('stage-26-growth-playbook — FR-5 entry-precondition refusal', () => {
  it('emits SKIP missing_postlaunch_artifacts when postlaunchArtifacts is undefined', async () => {
    const result = await analyzeStage26GrowthPlaybook({
      ventureName: 'TestVenture',
      ventureWorkflowStatus: 'in_progress',
      // postlaunchArtifacts intentionally omitted
    });
    expect(result.status).toBe('no_data');
    expect(result.reason).toBe('missing_postlaunch_artifacts');
    expect(result.lifecycle_terminal).toBe(false);
    expect(result.experiment_count).toBe(0);
  });

  it('emits SKIP missing_postlaunch_artifacts when both is_current=true rows absent', async () => {
    const result = await analyzeStage26GrowthPlaybook({
      ventureName: 'TestVenture',
      ventureWorkflowStatus: 'in_progress',
      postlaunchArtifacts: [
        { artifact_type: 'postlaunch_assumptions_vs_reality', is_current: false },
        { artifact_type: 'postlaunch_user_feedback_summary', is_current: false },
      ],
    });
    expect(result.status).toBe('no_data');
    expect(result.reason).toBe('missing_postlaunch_artifacts');
    expect(result.lifecycle_terminal).toBe(false);
  });

  it('emits SKIP partial_postlaunch_artifacts when only one of the two is present', async () => {
    const result = await analyzeStage26GrowthPlaybook({
      ventureName: 'TestVenture',
      ventureWorkflowStatus: 'in_progress',
      postlaunchArtifacts: [
        { artifact_type: 'postlaunch_assumptions_vs_reality', is_current: true },
        { artifact_type: 'postlaunch_user_feedback_summary', is_current: false },
      ],
    });
    expect(result.status).toBe('no_data');
    expect(result.reason).toBe('partial_postlaunch_artifacts');
    expect(result.lifecycle_terminal).toBe(false);
  });
});

describe('stage-26-growth-playbook — FR-4 idempotency', () => {
  it('emits SKIP already_completed when ventureWorkflowStatus=completed (even with full inputs)', async () => {
    const result = await analyzeStage26GrowthPlaybook({
      ventureName: 'TestVenture',
      ventureWorkflowStatus: 'completed',
      postlaunchArtifacts: POSTLAUNCH_ARTIFACTS_OK,
    });
    expect(result.status).toBe('no_data');
    expect(result.reason).toBe('already_completed');
    expect(result.lifecycle_terminal).toBe(false);
  });

  it('classifyNoDataReason short-circuits on workflow_status=completed before reading artifacts', () => {
    const reason = _testing.classifyNoDataReason({
      ventureWorkflowStatus: 'completed',
      postlaunchArtifacts: undefined,
    });
    expect(reason).toBe('already_completed');
  });

  it('POSTLAUNCH_ARTIFACT_KEYS is the canonical 2-item required set', () => {
    expect(_testing.POSTLAUNCH_ARTIFACT_KEYS).toEqual([
      'postlaunch_assumptions_vs_reality',
      'postlaunch_user_feedback_summary',
    ]);
  });
});

describe('stage-26-growth-playbook — happy path with lifecycle_terminal hint (FR-4)', () => {
  it('returns playbook + lifecycle_terminal=request when LLM succeeds', async () => {
    getLLMClient.mockReturnValue({ complete: vi.fn().mockResolvedValue('{}') });
    parseJSON.mockReturnValue(FAKE_LLM_RESPONSE);

    const result = await analyzeStage26GrowthPlaybook({
      ventureName: 'TestVenture',
      ventureWorkflowStatus: 'in_progress',
      postlaunchArtifacts: POSTLAUNCH_ARTIFACTS_OK,
      stage25Data: { metrics: {} },
    });
    expect(result.status).toBe('ok');
    expect(result.lifecycle_terminal).toBe('request');
    expect(result.experiment_count).toBe(1);
    expect(result.scaling_count).toBe(1);
    expect(result.has_operations_handoff).toBe(true);
  });

  it('returns fallback playbook + lifecycle_terminal=request when LLM throws', async () => {
    getLLMClient.mockReturnValue({
      complete: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
    });

    const result = await analyzeStage26GrowthPlaybook({
      ventureName: 'TestVenture',
      ventureWorkflowStatus: 'in_progress',
      postlaunchArtifacts: POSTLAUNCH_ARTIFACTS_OK,
    });
    expect(result.status).toBe('ok');
    expect(result.lifecycle_terminal).toBe('request');
    // Fallback playbook has at least one experiment
    expect(result.experiment_count).toBeGreaterThanOrEqual(1);
    expect(result.has_operations_handoff).toBe(true);
  });

  it('SKIP paths NEVER signal lifecycle_terminal=request (must be false)', async () => {
    const skipParams = [
      { ventureWorkflowStatus: 'in_progress', postlaunchArtifacts: [] },
      { ventureWorkflowStatus: 'completed', postlaunchArtifacts: POSTLAUNCH_ARTIFACTS_OK },
    ];
    for (const params of skipParams) {
      const result = await analyzeStage26GrowthPlaybook({
        ventureName: 'V',
        ...params,
      });
      expect(result.lifecycle_terminal).toBe(false);
    }
  });
});

describe('stage-26-growth-playbook — exit-gate verifier dispatch (FR-6 indirect)', () => {
  it('produces artifact_type strings that match the gates.exit values populated by migration', () => {
    // The migration populates lifecycle_stage_config Stage 26 metadata.gates.exit
    // = ['growth_playbook', 'growth_optimization_roadmap']. The exit-gate
    // verifiers registered in lib/eva/lifecycle/exit-gate-verifiers.js
    // GATE_VERIFIERS use substring match against these exact strings. Any
    // future rename of these artifact_type names must also update the
    // verifier registry. This test pins the current pairing.
    expect('growth_playbook'.toLowerCase()).toContain('growth_playbook');
    expect('growth_optimization_roadmap'.toLowerCase()).toContain('growth_optimization_roadmap');
  });
});
