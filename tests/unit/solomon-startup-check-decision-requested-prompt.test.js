/**
 * SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001 (FR-1a) — Solomon's advisory-send conduct is
 * governed by agent-prompt cron ticks (scripts/solomon-startup-check.mjs), not a code module —
 * there is no caller to unit-test, so the instruction is source-pinned instead, mirroring the
 * existing tests/unit/solomon-prompt-no-false-assurance.test.js precedent for this same file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STARTUP_CHECK = fileURLToPath(new URL('../../scripts/solomon-startup-check.mjs', import.meta.url));
const CLAUDE_SOLOMON = fileURLToPath(new URL('../../CLAUDE_SOLOMON.md', import.meta.url));

describe('Solomon tick prompts carry --informational classification guidance', () => {
  const source = readFileSync(STARTUP_CHECK, 'utf8');

  it('the deep-sweep tick prompt explains when to pass --informational', () => {
    expect(/DECISION_REQUESTED.*--informational/s.test(source)).toBe(true);
    expect(/omit --informational \(the default\) when you are asking the recipient to actually decide something|OMIT --informational \(the default\) when you are asking/i.test(source)).toBe(true);
  });

  it('the weekly-program tick sends its P3 budget line with --informational (a status report, not a decision request)', () => {
    expect(/solomon-advisory\.cjs send --informational "<budget line>"/.test(source)).toBe(true);
  });

  it('names the originating SD, so the instruction cannot silently drift from its rationale', () => {
    expect(/SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001/.test(source)).toBe(true);
  });
});

describe('CLAUDE_SOLOMON.md carries the durable decision_requested conduct clause', () => {
  const doc = readFileSync(CLAUDE_SOLOMON, 'utf8');

  it('documents the --informational discipline in a durable (non-tick-prompt) location', () => {
    expect(/DECISION_REQUESTED DISCIPLINE/.test(doc)).toBe(true);
    expect(/--informational/.test(doc)).toBe(true);
  });
});
