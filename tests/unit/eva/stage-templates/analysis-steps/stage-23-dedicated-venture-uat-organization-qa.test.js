// SD-LEO-INFRA-VENTURE-WORKFLOW-CREATES-001: organization-creation-and-QA/QC step wired
// into stage-23-dedicated-venture-uat.js (live DB stage 23). Covers TS-1 (org created),
// TS-2 (idempotent), TS-6 (never throws out of the stage).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const instantiateVentureMock = vi.fn();
vi.mock('../../../../../lib/agents/venture-ceo-factory.js', () => ({
  VentureFactory: class {
    instantiateVenture(...args) {
      return instantiateVentureMock(...args);
    }
  },
}));

const runSuiteMock = vi.fn();
vi.mock('../../../../../lib/org/acceptance-suite/run-suite.mjs', () => ({
  runSuite: (...args) => runSuiteMock(...args),
}));

vi.mock('../../../../../lib/org/acceptance-suite/checks/mast/index.mjs', () => ({
  MAST_CHECKS: [{ id: 'fake-check', check: () => ({ passed: true }) }],
}));

import { analyzeStage23DedicatedVentureUat } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-23-dedicated-venture-uat.js';
import { ARTIFACT_TYPES } from '../../../../../lib/eva/artifact-types.js';

/** @param {{existingAgents?: Array, throwOnAgentRegistry?: boolean}} opts */
function fakeSupabase({ existingAgents = [], throwOnAgentRegistry = false } = {}) {
  let agentRegistryCallCount = 0;
  return {
    from(table) {
      if (table === 'venture_stages') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { metadata: {} }, error: null }) }) }) };
      }
      if (table === 'agent_registry') {
        agentRegistryCallCount += 1;
        if (throwOnAgentRegistry) {
          return { select: () => { throw new Error('agent_registry unavailable'); } };
        }
        // 1st call: existence check (.select().eq().limit(1)).
        // 2nd call: full read post-creation (.select().eq(), no .limit() -- awaited directly).
        const isFirstCall = agentRegistryCallCount === 1;
        return {
          select: () => ({
            eq: () => (
              isFirstCall
                ? { limit: async () => ({ data: existingAgents, error: null }) }
                : Promise.resolve({ data: existingAgents, error: null })
            ),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    _agentRegistryCallCount: () => agentRegistryCallCount,
  };
}

beforeEach(() => {
  instantiateVentureMock.mockReset();
  runSuiteMock.mockReset();
});

describe('stage-23 organization creation and QA/QC (FR-1, FR-2)', () => {
  it('TS-1: creates an organization for a venture with none, and records an ORGANIZATION_QA_RESULT artifact', async () => {
    instantiateVentureMock.mockResolvedValue({ ceo_agent_id: 'ceo-1', total_agents_created: 6 });
    runSuiteMock.mockResolvedValue({ suite_version: '1.0.0', run_id: 'run-1', content_hash: 'abc', pass_rate: 1, catch_rate: null, findings: [] });

    const supabase = fakeSupabase({ existingAgents: [] });
    const result = await analyzeStage23DedicatedVentureUat({ supabase, ventureId: 'v-1', ventureName: 'Test Venture' });

    expect(instantiateVentureMock).toHaveBeenCalledTimes(1);
    expect(instantiateVentureMock).toHaveBeenCalledWith({ ventureName: 'Test Venture', ventureId: 'v-1' });
    expect(runSuiteMock).toHaveBeenCalledTimes(1);

    const orgArtifact = result.artifacts.find((a) => a.artifactType === ARTIFACT_TYPES.ORGANIZATION_QA_RESULT);
    expect(orgArtifact).toBeDefined();
    expect(orgArtifact.payload.ok).toBe(true);
    expect(orgArtifact.payload.created).toBe(true);
    expect(orgArtifact.payload.suite_result.pass_rate).toBe(1);
  });

  it('TS-2: does not create a duplicate organization when one already exists (idempotent)', async () => {
    runSuiteMock.mockResolvedValue({ suite_version: '1.0.0', run_id: 'run-2', content_hash: 'def', pass_rate: 1, catch_rate: null, findings: [] });

    const supabase = fakeSupabase({ existingAgents: [{ id: 'agent-1' }] });
    const result = await analyzeStage23DedicatedVentureUat({ supabase, ventureId: 'v-1', ventureName: 'Test Venture' });

    expect(instantiateVentureMock).not.toHaveBeenCalled();
    const orgArtifact = result.artifacts.find((a) => a.artifactType === ARTIFACT_TYPES.ORGANIZATION_QA_RESULT);
    expect(orgArtifact.payload.created).toBe(false);
    expect(orgArtifact.payload.ok).toBe(true);
  });

  it('TS-6: organization creation/QA-QC never throws out of the stage-23 step', async () => {
    instantiateVentureMock.mockRejectedValue(new Error('venture factory exploded'));

    const supabase = fakeSupabase({ existingAgents: [] });
    const logger = { info: vi.fn(), warn: vi.fn() };

    const result = await analyzeStage23DedicatedVentureUat({ supabase, ventureId: 'v-1', ventureName: 'Test Venture', logger });
    const orgArtifact = result.artifacts.find((a) => a.artifactType === ARTIFACT_TYPES.ORGANIZATION_QA_RESULT);
    expect(orgArtifact.payload.ok).toBe(false);
    expect(orgArtifact.payload.error).toMatch(/venture factory exploded/);
    expect(logger.warn).toHaveBeenCalled();
    // The UAT gate's own result is untouched by the organization step throwing.
    expect(result.applies).toBe(false);
    expect(result.satisfied).toBe(true);
  });

  it('a thrown agent_registry read error is caught, never propagating out of the stage', async () => {
    const supabase = fakeSupabase({ throwOnAgentRegistry: true });
    const logger = { info: vi.fn(), warn: vi.fn() };

    const result = await analyzeStage23DedicatedVentureUat({ supabase, ventureId: 'v-1', ventureName: 'Test Venture', logger });
    const orgArtifact = result.artifacts.find((a) => a.artifactType === ARTIFACT_TYPES.ORGANIZATION_QA_RESULT);
    expect(orgArtifact.payload.ok).toBe(false);
    expect(instantiateVentureMock).not.toHaveBeenCalled();
  });
});

// FR-4: nothing about the created organization runs/activates before go-live. Structural
// regression guard (AC-2): this file's own diff touches no publisher/outreach/communication-
// dispatch module -- instantiateVenture() only writes registry/identity rows (confirmed by
// direct code reading during PLAN-phase Explore), so the guarantee holds as long as this file
// never imports one of those modules.
describe('FR-4: nothing created here is switched on before go-live', () => {
  it('this file imports no publisher/outreach/communication-dispatch module', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../../../lib/eva/stage-templates/analysis-steps/stage-23-dedicated-venture-uat.js'),
      'utf8'
    );
    const forbidden = /publisher|outreach|dispatch-comm|send-email|send-sms|resend|twilio/i;
    const importLines = src.split('\n').filter((line) => /^\s*import\b/.test(line));
    const violating = importLines.filter((line) => forbidden.test(line));
    expect(violating).toEqual([]);
  });
});
