// QF-20260525-701: topStartableQF must only auto-start status='open' QFs.
// Loaders fetch [open, in_progress]; an orphaned in_progress QF (dead holder => null claim,
// no PR) previously slipped into topStartableQF (=> AUTO_PROCEED_ACTION:qf_start) because the
// predicate did not check status and _verifyFirst only flags 'open' rows.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyQuickFixes } from '../../../scripts/modules/sd-next/display/quick-fixes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../scripts/modules/sd-next/display/quick-fixes.js');

const nowIso = () => new Date().toISOString();

describe('QF-20260525-701: topStartableQF excludes in_progress', () => {
  it('does NOT auto-start an orphaned in_progress QF (null claim, no PR)', () => {
    const qfs = [
      { id: 'QF-A', status: 'in_progress', claiming_session_id: null, pr_url: null, commit_sha: null, severity: 'medium', created_at: nowIso() },
    ];
    const { summary } = classifyQuickFixes(qfs);
    expect(summary.topStartableQF).toBeNull();
  });

  it('DOES auto-start a fresh, open, unclaimed QF', () => {
    const qfs = [
      { id: 'QF-OPEN', status: 'open', claiming_session_id: null, pr_url: null, commit_sha: null, severity: 'medium', created_at: nowIso() },
    ];
    const { summary } = classifyQuickFixes(qfs);
    expect(summary.topStartableQF?.id).toBe('QF-OPEN');
  });

  it('prefers the open QF over an in_progress one in the same set', () => {
    const qfs = [
      { id: 'QF-WIP', status: 'in_progress', claiming_session_id: null, pr_url: null, commit_sha: null, severity: 'critical', created_at: nowIso() },
      { id: 'QF-OPEN', status: 'open', claiming_session_id: null, pr_url: null, commit_sha: null, severity: 'low', created_at: nowIso() },
    ];
    const { summary } = classifyQuickFixes(qfs);
    // even though QF-WIP sorts first (critical), it is not auto-startable
    expect(summary.topStartableQF?.id).toBe('QF-OPEN');
  });

  it('source predicate requires status === \'open\'', () => {
    const src = readFileSync(SRC, 'utf8');
    expect(src).toMatch(/topStartableQF\s*=\s*classified\.find\(qf =>\s*qf\.status === ['"]open['"]/);
  });
});
