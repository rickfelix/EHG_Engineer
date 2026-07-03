// QF-20260703-758: a stale checkout (running an old copy of the gate script itself)
// bypasses any gate fix merged upstream since it last synced. checkClaimGateFreshness
// refuses the claim when origin/main has commits touching a gate file that HEAD lacks.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const execFileSyncMock = vi.fn();
vi.mock('child_process', () => ({ execFileSync: (...args) => execFileSyncMock(...args) }));

const { checkClaimGateFreshness } = await import('../../lib/claim/gate-freshness-check.mjs');

describe('checkClaimGateFreshness (QF-20260703-758)', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
  });

  it('is NOT stale when origin/main has no commits missing from HEAD for the gate file', () => {
    execFileSyncMock.mockImplementation((cmd, args) => {
      if (args[0] === 'fetch') return '';
      if (args[0] === 'log') return '';
      throw new Error(`unexpected call: ${cmd} ${args.join(' ')}`);
    });
    const result = checkClaimGateFreshness('/repo', ['scripts/sd-start.js']);
    expect(result).toEqual({ stale: false });
  });

  it('is stale when origin/main has commits touching the gate file that HEAD is missing', () => {
    execFileSyncMock.mockImplementation((cmd, args) => {
      if (args[0] === 'fetch') return '';
      if (args[0] === 'log') return 'abc1234 fix(QF-X): close a claim-gate hole\ndef5678 fix(QF-Y): another fix\n';
      throw new Error(`unexpected call: ${cmd} ${args.join(' ')}`);
    });
    const result = checkClaimGateFreshness('/repo', ['scripts/sd-start.js']);
    expect(result).toEqual({ stale: true, file: 'scripts/sd-start.js', missingCommitCount: 2 });
  });

  it('checks multiple gate files and stops at the first stale one', () => {
    execFileSyncMock.mockImplementation((cmd, args) => {
      if (args[0] === 'fetch') return '';
      if (args.includes('lib/claim-guard.mjs')) return 'abc1234 fix\n';
      if (args.includes('scripts/sd-start.js')) return '';
      throw new Error(`unexpected call: ${cmd} ${args.join(' ')}`);
    });
    const result = checkClaimGateFreshness('/repo', ['scripts/sd-start.js', 'lib/claim-guard.mjs']);
    expect(result).toEqual({ stale: true, file: 'lib/claim-guard.mjs', missingCommitCount: 1 });
  });

  it('fails open (not stale) when the fetch itself errors — never blocks on a tooling failure', () => {
    execFileSyncMock.mockImplementation((cmd, args) => {
      if (args[0] === 'fetch') throw new Error('network unreachable');
      throw new Error(`unexpected call: ${cmd} ${args.join(' ')}`);
    });
    const result = checkClaimGateFreshness('/repo', ['scripts/sd-start.js']);
    expect(result.stale).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it('fails open per-file when a git log call errors for one file', () => {
    execFileSyncMock.mockImplementation((cmd, args) => {
      if (args[0] === 'fetch') return '';
      if (args.includes('scripts/sd-start.js')) throw new Error('bad path spec');
      throw new Error(`unexpected call: ${cmd} ${args.join(' ')}`);
    });
    const result = checkClaimGateFreshness('/repo', ['scripts/sd-start.js']);
    expect(result).toEqual({ stale: false });
  });

  it('passes the pathspec as a separate argv entry, never shell-interpolated', () => {
    execFileSyncMock.mockImplementation((cmd, args) => {
      if (args[0] === 'fetch') return '';
      expect(cmd).toBe('git');
      expect(args).toEqual(['log', '--oneline', 'HEAD..origin/main', '--', 'scripts/sd-start.js; rm -rf /']);
      return '';
    });
    const result = checkClaimGateFreshness('/repo', ['scripts/sd-start.js; rm -rf /']);
    expect(result).toEqual({ stale: false });
  });
});
