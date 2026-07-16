/**
 * SD-FDBK-ENH-LLM-SUB-AGENT-001 — executeSecurityAnalysis repo threading.
 *
 * executeSecurityAnalysis invoked executeSubAgent('SECURITY', sdId, { timeout }) and dropped
 * sdData.target_application — so SECURITY's resolveSubAgentRepo received undefined and
 * applySubAgentRepoVerdict stamped metadata.repo_path=null (an explicit_null), which the
 * SUB_AGENT_REPO_RESOLUTION gate hard-blocked for intra-repo SDs. It must now thread
 * target_application (mirroring executeDesignAnalysis / FR-2).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeSubAgentMock = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/sub-agent-executor.js', () => ({
  executeSubAgent: executeSubAgentMock,
}));

vi.mock('../../../lib/repo-paths.js', () => ({
  resolveRepoPathDbFirst: vi.fn(),
}));

vi.mock('../../../scripts/lib/supabase-connection.js', () => ({
  createSupabaseServiceClient: vi.fn(async () => ({ __client: true })),
}));

vi.mock('../../../scripts/prd/formatters.js', () => ({
  formatObjectives: vi.fn(),
  formatArrayField: vi.fn(),
  formatRisks: vi.fn(),
  formatMetadata: vi.fn(),
}));

const { executeSecurityAnalysis } = await import('../../../scripts/prd/sub-agent-orchestrator.js');

describe('SD-FDBK-ENH-LLM-SUB-AGENT-001 — executeSecurityAnalysis repo threading (FR-2)', () => {
  beforeEach(() => {
    executeSubAgentMock.mockReset();
  });

  it('threads sdData.target_application into executeSubAgent (SECURITY, intra-repo)', async () => {
    executeSubAgentMock.mockResolvedValue({ verdict: 'PASS', confidence: 100 });

    await executeSecurityAnalysis('SD-X', {
      sd_type: 'security',
      scope: 'security review of the auth surface',
      target_application: 'EHG_Engineer',
    });

    expect(executeSubAgentMock).toHaveBeenCalledTimes(1);
    const [code, sdId, opts] = executeSubAgentMock.mock.calls[0];
    expect(code).toBe('SECURITY');
    expect(sdId).toBe('SD-X');
    expect(opts.target_application).toBe('EHG_Engineer'); // the fix: no longer dropped → resolves, not explicit_null
    expect(opts.timeout).toBe(120000);
  });

  it('threads target_application for an auth-scoped SD (needsSecurity via scope keyword)', async () => {
    executeSubAgentMock.mockResolvedValue({ verdict: 'PASS' });

    await executeSecurityAnalysis('SD-Y', {
      sd_type: 'feature',
      scope: 'add an auth flow',
      target_application: 'EHG',
    });

    expect(executeSubAgentMock).toHaveBeenCalledTimes(1);
    expect(executeSubAgentMock.mock.calls[0][2].target_application).toBe('EHG');
  });

  it('skips SECURITY (returns null, no invocation) when no security signals are present', async () => {
    const out = await executeSecurityAnalysis('SD-Z', {
      sd_type: 'infrastructure',
      scope: 'gate validator refactor',
      description: 'classifier tweak',
      target_application: 'EHG_Engineer',
    });

    expect(out).toBeNull();
    expect(executeSubAgentMock).not.toHaveBeenCalled();
  });
});
