/**
 * SD-MAN-INFRA-COMPLETION-PROBES-CROSS-001 (FR-3, TS-6): coverage for
 * BaseExecutor.resolveTargetRepository's pre-filter relaxation. Before this SD, the
 * guard only called resolveGateRepoContext when target_application ITSELF was a
 * venture -- a platform-default target_application with a real
 * metadata.qf_target_application fallback never reached the resolver at all, making
 * FR-1's new fallback tier dead-on-arrival via this caller.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveGateRepoContextMock = vi.fn();

vi.mock('../../../lib/repo-paths.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, resolveGateRepoContext: (...args) => resolveGateRepoContextMock(...args) };
});

const { BaseExecutor } = await import('../../../scripts/modules/handoff/executors/BaseExecutor.js');

describe('BaseExecutor.resolveTargetRepository', () => {
  let executor;

  beforeEach(() => {
    resolveGateRepoContextMock.mockReset();
    executor = new BaseExecutor({ supabase: { from: vi.fn() } });
  });

  it('TS-6: platform-default target_application + venture qf_target_application fallback reaches resolveGateRepoContext', async () => {
    resolveGateRepoContextMock.mockResolvedValue({ resolved: true, isVenture: true, repoPath: '/repos/altifyai' });

    const repoPath = await executor.resolveTargetRepository({
      target_application: 'EHG_Engineer',
      metadata: { qf_target_application: 'altifyai' },
    });

    expect(resolveGateRepoContextMock).toHaveBeenCalledTimes(1);
    expect(repoPath).toBe('/repos/altifyai');
  });

  it('a genuine platform SD (no qf fallback) never reaches resolveGateRepoContext -- byte-identical, zero DB calls', async () => {
    const repoPath = await executor.resolveTargetRepository({ target_application: 'EHG_Engineer', metadata: {} });

    expect(resolveGateRepoContextMock).not.toHaveBeenCalled();
    expect(repoPath).toBe(executor.determineTargetRepository({ target_application: 'EHG_Engineer', metadata: {} }));
  });

  it('a genuine venture target_application (no qf fallback needed) still reaches resolveGateRepoContext (pre-existing behavior, unchanged)', async () => {
    resolveGateRepoContextMock.mockResolvedValue({ resolved: true, isVenture: true, repoPath: '/repos/some-venture' });

    const repoPath = await executor.resolveTargetRepository({ target_application: 'SomeVenture' });

    expect(resolveGateRepoContextMock).toHaveBeenCalledTimes(1);
    expect(repoPath).toBe('/repos/some-venture');
  });

  it('falls back to the sync heuristic when resolveGateRepoContext cannot resolve (never throws, never returns null)', async () => {
    resolveGateRepoContextMock.mockResolvedValue({ resolved: false, isVenture: true, repoPath: null });

    const repoPath = await executor.resolveTargetRepository({
      target_application: 'EHG_Engineer',
      metadata: { qf_target_application: 'zzz-nonexistent-venture' },
    });

    expect(repoPath).toBeTruthy();
    expect(repoPath).toBe(
      executor.determineTargetRepository({ target_application: 'EHG_Engineer', metadata: { qf_target_application: 'zzz-nonexistent-venture' } }),
    );
  });
});
