import { describe, it, expect, vi } from 'vitest';
import { enforceCliSendGuard } from '../../../lib/notifications/cli-send-guard.mjs';

function harness() {
  const exit = vi.fn();
  const log = vi.fn();
  const errorLog = vi.fn();
  return { exit, log, errorLog };
}

describe('enforceCliSendGuard', () => {
  it('QF-20260709-211: --help prints usage and exits 0 instead of falling through to send behavior', () => {
    const h = harness();
    enforceCliSendGuard({
      scriptName: 'scripts/adam-decision-email.mjs',
      flags: [{ name: '--dry-run' }, { name: '--decision', takesValue: true }],
      argv: ['--help'],
      ...h,
    });
    expect(h.exit).toHaveBeenCalledWith(0);
    expect(h.log).toHaveBeenCalledWith(expect.stringContaining('Usage: node scripts/adam-decision-email.mjs'));
    expect(h.errorLog).not.toHaveBeenCalled();
  });

  it('-h is also recognized as help', () => {
    const h = harness();
    enforceCliSendGuard({ scriptName: 'x.mjs', flags: [], argv: ['-h'], ...h });
    expect(h.exit).toHaveBeenCalledWith(0);
  });

  it('an unrecognized flag fails closed (exit 1), the root incident this QF fixes', () => {
    const h = harness();
    enforceCliSendGuard({
      scriptName: 'scripts/adam-decision-email.mjs',
      flags: [{ name: '--dry-run' }, { name: '--decision', takesValue: true }],
      argv: ['--bogus-flag'],
      ...h,
    });
    expect(h.exit).toHaveBeenCalledWith(1);
    expect(h.errorLog).toHaveBeenCalledWith(expect.stringContaining('Unknown flag: --bogus-flag'));
  });

  it('known boolean and value-taking flags pass through without exiting', () => {
    const h = harness();
    enforceCliSendGuard({
      scriptName: 'scripts/adam-decision-email.mjs',
      flags: [{ name: '--dry-run' }, { name: '--decision', takesValue: true }],
      argv: ['--decision', 'abc-123', '--dry-run'],
      ...h,
    });
    expect(h.exit).not.toHaveBeenCalled();
    expect(h.errorLog).not.toHaveBeenCalled();
  });

  it('the value following a takesValue flag is not itself checked against known flags', () => {
    const h = harness();
    enforceCliSendGuard({
      scriptName: 'x.mjs',
      flags: [{ name: '--decision', takesValue: true }],
      argv: ['--decision', '--looks-like-a-flag-but-is-a-value'],
      ...h,
    });
    expect(h.exit).not.toHaveBeenCalled();
  });

  it('an empty flags list still rejects any flag (scripts with no CLI surface)', () => {
    const h = harness();
    enforceCliSendGuard({ scriptName: 'scripts/coordinator-email-summary.mjs', flags: [], argv: ['--dry-run'], ...h });
    expect(h.exit).toHaveBeenCalledWith(1);
  });

  it('no argv at all is a no-op', () => {
    const h = harness();
    enforceCliSendGuard({ scriptName: 'x.mjs', flags: [], argv: [], ...h });
    expect(h.exit).not.toHaveBeenCalled();
    expect(h.errorLog).not.toHaveBeenCalled();
  });

  it('defaults argv to process.argv.slice(2) when not provided', () => {
    const originalArgv = process.argv;
    process.argv = ['node', 'script.mjs'];
    const h = harness();
    enforceCliSendGuard({ scriptName: 'x.mjs', flags: [], exit: h.exit, log: h.log, errorLog: h.errorLog });
    expect(h.exit).not.toHaveBeenCalled();
    process.argv = originalArgv;
  });
});
