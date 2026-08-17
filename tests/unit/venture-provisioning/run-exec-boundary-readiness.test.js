/**
 * SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-A — CLI entry point coverage.
 * See scripts/venture-provisioning/run-exec-boundary-readiness.mjs.
 */
import { describe, it, expect, vi } from 'vitest';
import { parseArgs, main } from '../../../scripts/venture-provisioning/run-exec-boundary-readiness.mjs';

// main() always receives an injected createSupabaseServiceClient fake in these tests, so the
// real client is never reached -- this mock is belt-and-suspenders (makes it unreachable even
// if a future test forgets the override) and satisfies the repo's DB-test guard.
vi.mock('../../../lib/supabase-connection.js', () => ({ createSupabaseServiceClient: vi.fn() }));

describe('parseArgs', () => {
  it('parses --venture, --deployment-url, and --dry-run', () => {
    const r = parseArgs(['--venture', 'v1', '--deployment-url', 'https://x', '--dry-run']);
    expect(r).toEqual({ ventureId: 'v1', deploymentUrl: 'https://x', dryRun: true });
  });

  it('defaults dryRun to false when the flag is absent', () => {
    const r = parseArgs(['--venture', 'v1', '--deployment-url', 'https://x']);
    expect(r.dryRun).toBe(false);
  });

  it('resolves missing flags to null rather than throwing', () => {
    const r = parseArgs([]);
    expect(r).toEqual({ ventureId: null, deploymentUrl: null, dryRun: false });
  });
});

describe('main (CLI orchestration, injected deps)', () => {
  it('returns exit code 1 and prints usage when required flags are missing', async () => {
    const error = vi.fn();
    const code = await main([], { error });
    expect(code).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
  });

  it('in --dry-run mode, builds the report but never calls recordProvisioningReadiness', async () => {
    const log = vi.fn();
    const buildProvisioningReadinessReport = vi.fn().mockResolvedValue({ deploy: { reachable: true } });
    const recordProvisioningReadiness = vi.fn();
    const createSupabaseServiceClient = vi.fn().mockResolvedValue('fake-supabase');

    const code = await main(
      ['--venture', 'v1', '--deployment-url', 'https://x', '--dry-run'],
      { log, buildProvisioningReadinessReport, recordProvisioningReadiness, createSupabaseServiceClient }
    );

    expect(code).toBe(0);
    expect(buildProvisioningReadinessReport).toHaveBeenCalledWith({ supabase: 'fake-supabase', ventureId: 'v1', deploymentUrl: 'https://x' });
    expect(recordProvisioningReadiness).not.toHaveBeenCalled();
  });

  it('without --dry-run, persists the report and returns 0 when the persist succeeds', async () => {
    const buildProvisioningReadinessReport = vi.fn().mockResolvedValue({ deploy: { reachable: true } });
    const recordProvisioningReadiness = vi.fn().mockResolvedValue({ ventureUpdated: true, artifactId: 'a1' });
    const createSupabaseServiceClient = vi.fn().mockResolvedValue('fake-supabase');

    const code = await main(
      ['--venture', 'v1', '--deployment-url', 'https://x'],
      { log: vi.fn(), buildProvisioningReadinessReport, recordProvisioningReadiness, createSupabaseServiceClient }
    );

    expect(code).toBe(0);
    expect(recordProvisioningReadiness).toHaveBeenCalledWith({ supabase: 'fake-supabase', ventureId: 'v1', report: { deploy: { reachable: true } } });
  });

  it('returns exit code 1 when the persist reports ventureUpdated:false or a missing artifactId — never silently 0', async () => {
    const buildProvisioningReadinessReport = vi.fn().mockResolvedValue({ deploy: {} });
    const recordProvisioningReadiness = vi.fn().mockResolvedValue({ ventureUpdated: false, artifactId: null });
    const createSupabaseServiceClient = vi.fn().mockResolvedValue('fake-supabase');

    const code = await main(
      ['--venture', 'v1', '--deployment-url', 'https://x'],
      { log: vi.fn(), buildProvisioningReadinessReport, recordProvisioningReadiness, createSupabaseServiceClient }
    );

    expect(code).toBe(1);
  });
});
