/**
 * SD-LEO-INFRA-CROSS-REPO-AWARE-001 — FR-1 orchestrator threading.
 *
 * executeDesignAnalysis used to invoke executeSubAgent('DESIGN', sdId, { timeout })
 * and drop sdData.target_application entirely. It must now resolve the UI repo DB-first
 * and pass repo_path + target_application through to the DESIGN sub-agent.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeSubAgentMock = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/sub-agent-executor.js', () => ({
  executeSubAgent: executeSubAgentMock,
}));

const resolveRepoPathDbFirstMock = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/repo-paths.js', () => ({
  resolveRepoPathDbFirst: resolveRepoPathDbFirstMock,
}));

vi.mock('../../../scripts/lib/supabase-connection.js', () => ({
  createSupabaseServiceClient: vi.fn(async () => ({ __client: true })),
}));

// Formatters are imported at module top but not exercised by these assertions.
vi.mock('../../../scripts/prd/formatters.js', () => ({
  formatObjectives: vi.fn(),
  formatArrayField: vi.fn(),
  formatRisks: vi.fn(),
  formatMetadata: vi.fn(),
}));

const { executeDesignAnalysis } = await import('../../../scripts/prd/sub-agent-orchestrator.js');

describe('SD-LEO-INFRA-CROSS-REPO-AWARE-001 — FR-1 executeDesignAnalysis repo threading', () => {
  beforeEach(() => {
    executeSubAgentMock.mockReset();
    resolveRepoPathDbFirstMock.mockReset();
  });

  it('TS-A: threads a target_application-resolved repo_path into executeSubAgent', async () => {
    resolveRepoPathDbFirstMock.mockResolvedValue('C:/x/ehg');
    executeSubAgentMock.mockResolvedValue({ verdict: 'PASS', confidence: 100 });

    await executeDesignAnalysis('SD-X', { sd_type: 'feature', target_application: 'EHG' });

    expect(resolveRepoPathDbFirstMock).toHaveBeenCalledWith('EHG', expect.anything());
    expect(executeSubAgentMock).toHaveBeenCalledTimes(1);
    const [code, sdId, opts] = executeSubAgentMock.mock.calls[0];
    expect(code).toBe('DESIGN');
    expect(sdId).toBe('SD-X');
    expect(opts.repo_path).toBe('C:/x/ehg');
    expect(opts.target_application).toBe('EHG');
    expect(opts.timeout).toBe(120000);
  });

  it('still passes target_application when DB-first resolution returns null (registry/DB miss)', async () => {
    resolveRepoPathDbFirstMock.mockResolvedValue(null);
    executeSubAgentMock.mockResolvedValue({ verdict: 'PASS' });

    await executeDesignAnalysis('SD-X', { sd_type: 'feature', target_application: 'CronLinter' });

    const opts = executeSubAgentMock.mock.calls[0][2];
    expect(opts.repo_path).toBeUndefined();
    expect(opts.target_application).toBe('CronLinter');
  });

  it('does not crash DESIGN when repo resolution throws — still invokes with target_application', async () => {
    resolveRepoPathDbFirstMock.mockRejectedValue(new Error('boom'));
    executeSubAgentMock.mockResolvedValue({ verdict: 'PASS' });

    await executeDesignAnalysis('SD-X', { sd_type: 'feature', target_application: 'EHG' });

    expect(executeSubAgentMock).toHaveBeenCalledTimes(1);
    expect(executeSubAgentMock.mock.calls[0][2].target_application).toBe('EHG');
  });

  it('skips DESIGN (returns null) for a non-UI infra SD with no UI keywords', async () => {
    const out = await executeDesignAnalysis('SD-X', {
      sd_type: 'infrastructure',
      target_application: 'EHG_Engineer',
      scope: 'backend script and cli tooling',
      description: 'gate validator changes',
      key_changes: [],
    });

    expect(out).toBeNull();
    expect(executeSubAgentMock).not.toHaveBeenCalled();
  });
});
