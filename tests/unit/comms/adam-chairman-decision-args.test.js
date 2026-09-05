/**
 * SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-5) — scripts/adam-chairman-decision.mjs previously
 * had NO test seam at all: enforceCliSendGuard() ran at module scope on import and process.exit()'d
 * on validation failure, so even importing the file for a unit test risked killing the test
 * process. parseDecisionArgs(argv) is the extracted, pure seam: no process.argv reads, no
 * process.exit, no I/O — just parse + validate. The live CLI-execution branch is now gated behind
 * isMainModule(import.meta.url), so importing this module for its exported function is safe.
 */
import { describe, it, expect } from 'vitest';
import { parseDecisionArgs, buildDefaultReplyInstruction } from '../../../scripts/adam-chairman-decision.mjs';

/** Mirrors rubric-engine/lint.js's reply_instruction check exactly (QF-20260905-194). */
function satisfiesRubric(replyInstruction, optionCount) {
  const numbers = replyInstruction.match(/\d+/g) || [];
  return Array.from({ length: optionCount }, (_, i) => String(i + 1)).every((n) => numbers.includes(n));
}

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

  // QF-20260905-194: rubric-engine/lint.js's reply_instruction check requires the instruction to
  // literally name EVERY 1-based option number ("Reply 1 or 2"). The old hardcoded default
  // ("Reply with the option letter, or DETAILS...") named no numbers at all, so any decision sent
  // without an explicit --reply-instruction was silently DROPPED by the rubric.
  it('the DEFAULT reply instruction (no --reply-instruction given) satisfies the rubric for a 2-option decision', () => {
    const r = parseDecisionArgs(baseArgs());
    expect(r.ok).toBe(true);
    expect(satisfiesRubric(r.message.replyInstruction, 2)).toBe(true);
  });

  it('the DEFAULT reply instruction still names every option for a 3+ option decision', () => {
    const argv = [
      '--body', 'Pick one', '--option', 'A', '--option', 'B', '--option', 'C',
      '--no-reply-policy', 'y', '--decision-id', VALID_UUID,
    ];
    const r = parseDecisionArgs(argv);
    expect(r.ok).toBe(true);
    expect(satisfiesRubric(r.message.replyInstruction, 3)).toBe(true);
    expect(r.message.replyInstruction).toContain('DETAILS');
  });

  it('an explicit --reply-instruction still overrides the generated default', () => {
    const argv = [
      ...baseArgs(),
      '--reply-instruction', 'Custom: reply 1 or 2',
    ];
    const r = parseDecisionArgs(argv);
    expect(r.ok).toBe(true);
    expect(r.message.replyInstruction).toBe('Custom: reply 1 or 2');
  });

  describe('buildDefaultReplyInstruction', () => {
    it('joins 2 options with "or"', () => {
      expect(buildDefaultReplyInstruction(2, 'ref1')).toBe('Reply 1 or 2, or DETAILS for more context (ref ref1).');
    });

    it('joins 3+ options with an oxford-comma list', () => {
      expect(buildDefaultReplyInstruction(4, 'ref2')).toBe('Reply 1, 2, 3, or 4, or DETAILS for more context (ref ref2).');
    });

    it('satisfies the rubric regex for every option count from 2 to 6', () => {
      for (let n = 2; n <= 6; n++) {
        expect(satisfiesRubric(buildDefaultReplyInstruction(n, 'x'), n)).toBe(true);
      }
    });
  });
});
