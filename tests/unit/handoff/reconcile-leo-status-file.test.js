import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({}),
}));

const { reconcileSDStateAfterHandoff } = await import('../../../scripts/modules/handoff/cli/execution-helpers.js');

function fakeSupabase(sdRow) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: sdRow, error: null }),
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  };
}

describe('reconcileSDStateAfterHandoff state-file tagging (SD-LEO-INFRA-LEO-PHASE-TAGGED-001 FR-1)', () => {
  let tmpDir;
  let originalCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-leo-status-test-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes sd_key + the handoff-expected phase on a non-terminal handoff (PLAN-TO-EXEC)', async () => {
    const sd = { id: 'uuid-1', sd_key: 'SD-X-001', status: 'in_progress', current_phase: 'PLAN_PRD' };
    await reconcileSDStateAfterHandoff('PLAN-TO-EXEC', 'SD-X-001', fakeSupabase(sd));

    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, '.leo-status.json'), 'utf8'));
    expect(written.sd_key).toBe('SD-X-001');
    expect(written.leo_phase).toBe('EXEC');
  });

  it('clears sd_key/leo_phase (does not write them) on LEAD-FINAL-APPROVAL', async () => {
    const sd = { id: 'uuid-1', sd_key: 'SD-X-001', status: 'pending_approval', current_phase: 'LEAD_FINAL' };
    // Pre-seed the file as if a prior handoff had tagged it, proving completion clears it.
    fs.writeFileSync(path.join(tmpDir, '.leo-status.json'), JSON.stringify({ sd_key: 'SD-X-001', leo_phase: 'LEAD_FINAL' }));

    await reconcileSDStateAfterHandoff('LEAD-FINAL-APPROVAL', 'SD-X-001', fakeSupabase(sd));

    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, '.leo-status.json'), 'utf8'));
    expect(written.sd_key).toBeNull();
    expect(written.leo_phase).toBeNull();
  });

  it('is case-insensitive on the LEAD-FINAL-APPROVAL branch match', async () => {
    const sd = { id: 'uuid-1', sd_key: 'SD-X-001', status: 'pending_approval', current_phase: 'LEAD_FINAL' };
    fs.writeFileSync(path.join(tmpDir, '.leo-status.json'), JSON.stringify({ sd_key: 'SD-X-001', leo_phase: 'LEAD_FINAL' }));

    await reconcileSDStateAfterHandoff('lead-final-approval', 'SD-X-001', fakeSupabase(sd));

    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, '.leo-status.json'), 'utf8'));
    expect(written.sd_key).toBeNull();
  });

  it('does nothing to the state file when the handoff type is unrecognized', async () => {
    const before = fs.existsSync(path.join(tmpDir, '.leo-status.json'));
    await reconcileSDStateAfterHandoff('NOT-A-REAL-HANDOFF', 'SD-X-001', fakeSupabase({ id: 'uuid-1', sd_key: 'SD-X-001' }));
    expect(fs.existsSync(path.join(tmpDir, '.leo-status.json'))).toBe(before);
  });
});
