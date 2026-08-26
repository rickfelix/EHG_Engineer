/**
 * SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-5) — scripts/adam-chairman-decision.mjs previously
 * had NO test seam at all: enforceCliSendGuard() ran at module scope on import and process.exit()'d
 * on validation failure, so even importing the file for a unit test risked killing the test
 * process. parseDecisionArgs(argv) is the extracted, pure seam: no process.argv reads, no
 * process.exit, no I/O — just parse + validate. The live CLI-execution branch is now gated behind
 * isMainModule(import.meta.url), so importing this module for its exported function is safe.
 */
import { describe, it, expect } from 'vitest';
import { parseDecisionArgs } from '../../../scripts/adam-chairman-decision.mjs';

const VALID_UUID = '9e5aac51-0000-4000-8000-000000000001';

function baseArgs(overrides = {}) {
  const argv = [
    '--body', 'Approve the deploy?',
    '--option', 'A: approve',
    '--option', 'B: reject',
    '--no-reply-policy', 'No reply by EOD means hold.',
    '--decision-id', overrides.decisionId ?? VALID_UUID,
  ];
  if (overrides.dry) argv.push('--dry-run');
  return argv;
}

describe('parseDecisionArgs (FR-5)', () => {
  it('accepts a well-formed decision with a valid UUID decision-id', () => {
    const r = parseDecisionArgs(baseArgs());
    expect(r.ok).toBe(true);
    expect(r.message).toMatchObject({ type: 'decision', decisionId: VALID_UUID });
    expect(r.message.options).toHaveLength(2);
  });

  it('rejects a non-UUID --decision-id with exit code 1, BEFORE any downstream branch', () => {
    const r = parseDecisionArgs(baseArgs({ decisionId: 'not-a-uuid' }));
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.error).toMatch(/not a valid UUID/);
  });

  it('rejects a non-UUID --decision-id even under --dry-run — dry-run must not mask the rejection', () => {
    const r = parseDecisionArgs(baseArgs({ decisionId: 'also-not-a-uuid', dry: true }));
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
  });

  it('still exits 0 (not an error) when --decision-id is simply missing — the pre-existing "nothing to send" class', () => {
    const argv = ['--body', 'x', '--option', 'A', '--option', 'B', '--no-reply-policy', 'y'];
    const r = parseDecisionArgs(argv);
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(0);
  });

  it('honors --dry-run on an otherwise-valid input', () => {
    const r = parseDecisionArgs(baseArgs({ dry: true }));
    expect(r.ok).toBe(true);
    expect(r.dry).toBe(true);
  });
});
