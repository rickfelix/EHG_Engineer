/**
 * QF-20260727-713 — the QA ORPHAN check resolved a session's claim key ONLY against
 * strategic_directives_v2. Quick-fix ids live in quick_fixes and NEVER in strategic_directives_v2,
 * so every worker holding a QF claim was reported "SD not found in DB".
 *
 * Measured 2026-07-27: all 4 flagged keys (QF-20260727-088, -154, -397/-663, -978) were present in
 * quick_fixes with the correct claiming_session_id, and 0 of 4 were in strategic_directives_v2.
 *
 * The damage is not the noise — it is that a false positive is indistinguishable from a real
 * orphan, so a genuine orphan becomes undetectable. That makes the second half of this suite the
 * important half: a fix that merely silences ORPHAN would be worse than the bug, so these tests
 * pin that unresolvable keys STILL report.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { printQA } = require('../../../scripts/fleet-dashboard.cjs');

let logSpy;
beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { logSpy.mockRestore(); });
const output = () => logSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');

// A live-looking claim: heartbeat inside the 10-minute recency window printQA filters on.
const claim = (tty, sd_key) => ({
  tty, sd_key, status: 'active', heartbeat_at: new Date().toISOString(),
});

// printQA reads several optional collections; supply the minimum plus whatever the case needs.
const data = ({ rawSessions = [], sdStatusMap = {}, qfStatusMap = {} } = {}) => ({
  rawSessions, sdStatusMap, qfStatusMap, bareShellSDs: [],
});

describe('QA ORPHAN — quick-fix claim keys resolve against quick_fixes (QF-20260727-713)', () => {
  it('does NOT flag a worker holding a QF that exists in quick_fixes', () => {
    printQA(data({
      rawSessions: [claim('win-6712', 'QF-20260727-713')],
      qfStatusMap: { 'QF-20260727-713': { id: 'QF-20260727-713', title: 'x', status: 'in_progress' } },
    }));
    expect(output()).not.toContain('ORPHAN');
  });

  it('reproduces the measured incident: 4 QF claims, 0 orphans, checks PASS', () => {
    const keys = ['QF-20260727-088', 'QF-20260727-154', 'QF-20260727-663', 'QF-20260727-978'];
    printQA(data({
      rawSessions: keys.map((k, i) => claim(`win-${i}`, k)),
      sdStatusMap: {}, // none of them are in strategic_directives_v2 — that is the whole point
      qfStatusMap: Object.fromEntries(keys.map(k => [k, { id: k, status: 'in_progress' }])),
    }));
    const out = output();
    expect(out).not.toContain('ORPHAN');
    expect(out).toContain('QA CHECKS [PASS]');
  });

  it('resolves a QF in a terminal state — completed/closed/cancelled is not an orphan', () => {
    for (const status of ['completed', 'closed', 'cancelled']) {
      logSpy.mockClear();
      printQA(data({
        rawSessions: [claim('win-1', 'QF-20260727-999')],
        qfStatusMap: { 'QF-20260727-999': { id: 'QF-20260727-999', status } },
      }));
      expect(output(), `status=${status}`).not.toContain('ORPHAN');
    }
  });

  it('still resolves ordinary SD claims through strategic_directives_v2', () => {
    printQA(data({
      rawSessions: [claim('win-2', 'SD-LEO-INFRA-REAL-001')],
      sdStatusMap: { 'SD-LEO-INFRA-REAL-001': { sd_key: 'SD-LEO-INFRA-REAL-001', status: 'active' } },
    }));
    expect(output()).not.toContain('ORPHAN');
  });
});

// The fix must NARROW the false positives, not disable the check.
describe('QA ORPHAN — a genuine orphan is still detected (QF-20260727-713)', () => {
  it('flags an SD-shaped key present in NEITHER table', () => {
    printQA(data({ rawSessions: [claim('win-3', 'SD-LEO-INFRA-GHOST-404')] }));
    const out = output();
    expect(out).toContain('ORPHAN');
    expect(out).toContain('win-3');
  });

  it('flags a QF-shaped key that is absent from quick_fixes (deleted/typo id)', () => {
    printQA(data({
      rawSessions: [claim('win-4', 'QF-20260727-000')],
      qfStatusMap: {}, // lookup ran and found nothing — a real orphan, not a table-blindness artifact
    }));
    expect(output()).toContain('ORPHAN');
  });

  it('separates a real orphan from valid QF claims in the same fleet', () => {
    printQA(data({
      rawSessions: [claim('win-good', 'QF-20260727-713'), claim('win-bad', 'QF-20260727-000')],
      qfStatusMap: { 'QF-20260727-713': { id: 'QF-20260727-713', status: 'in_progress' } },
    }));
    const out = output();
    expect(out).toContain('win-bad');
    expect(out).not.toContain('win-good'); // the signal is no longer buried in false positives
  });

  it('degrades to the pre-fix behaviour when qfStatusMap is absent (query failed)', () => {
    // loadData's lookup is wrapped in try/catch; on failure qfStatusMap is missing/empty and an
    // unresolved key must still surface rather than silently vanish.
    printQA({ rawSessions: [claim('win-5', 'QF-20260727-713')], sdStatusMap: {}, bareShellSDs: [] });
    expect(output()).toContain('ORPHAN');
  });
});
