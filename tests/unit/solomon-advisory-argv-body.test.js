/**
 * SD-LEO-INFRA-CONSULT-CORRELATION-CONVENTIONS-001 / FR-1 / TS-1 — the ARGV path.
 *
 * WHY THIS FILE EXISTS. --part and --message-kind were parsed but never excluded from the message
 * body, so `send --part 2/3 --message-kind amend "real body"` shipped
 *   body === "--part 2/3 --message-kind amend real body"
 * on the LIVE Solomon path. Zero tests caught it, because every existing part/message-kind assertion
 * calls buildAdvisoryPayload with NAMED ARGS and never crosses argv — the flags were verified in the
 * shape they are CONSUMED, never in the shape a human types them.
 *
 * TESTING flagged at PLAN that mirroring that index list onto Adam would propagate the leak to a
 * second sender. So the hand-maintained index list is gone: exclusions are derived from the flag
 * NAMES, and these tests pin the argv surface that had no coverage at all.
 */
import { describe, it, expect } from 'vitest';
import { parsedFlags } from './helpers/parsed-flags.js';
import { fileURLToPath } from 'node:url';
// CJS interop: module.exports arrives as the default export.
import solomonAdvisory from '../../scripts/solomon-advisory.cjs';

const { sendBodyFromArgv, VALUE_FLAGS, BOOL_FLAGS, STATUS_VALUE_FLAGS } = solomonAdvisory;
// ESM has no __dirname — resolving from import.meta.url instead. (Referencing __dirname here would
// throw at collection time, which is the same ESM trap that bit the FR-3 wiring on a prior SD.)
const SRC = fileURLToPath(new URL('../../scripts/solomon-advisory.cjs', import.meta.url));

describe('FR-1: flag values never leak into the message body', () => {
  it('strips --part and --message-kind — the exact live defect', () => {
    // The regression case, verbatim. Before the fix this returned the whole string.
    expect(sendBodyFromArgv(['send', '--part', '2/3', '--message-kind', 'amend', 'real', 'body', 'here']))
      .toBe('real body here');
  });

  it('strips every value flag the sender actually parses', () => {
    for (const flag of VALUE_FLAGS) {
      expect(sendBodyFromArgv(['send', flag, 'VALUE', 'the', 'body'])).toBe('the body');
    }
  });

  it('strips a boolean flag without eating the word after it', () => {
    // --direct takes no value; consuming the next token would silently truncate the message.
    expect(sendBodyFromArgv(['send', '--direct', 'the', 'body'])).toBe('the body');
  });

  it('strips a flag token wherever it sits — exclusion is SYMMETRIC with the parse', () => {
    // I first wrote this expecting 'use when splitting' — that a bare word matching a flag name
    // mid-body should survive. That expectation was wrong, and asserting it would have RE-OPENED the
    // defect. The parse is positional-agnostic: `argv.indexOf('--part')` (:882) matches wherever the
    // token appears, so the parse consumes it no matter where it sits. The body MUST exclude exactly
    // what the parse consumes; any divergence is the leak in one direction or a truncated body in the
    // other. Symmetry is the invariant, not "leave mid-body words alone".
    expect(sendBodyFromArgv(['send', 'use', '--part', 'when', 'splitting'])).toBe('use splitting');
    // Not silent, either: a value-shaped flag with a non-conforming value exits 2 at :888 before any
    // body is built, so this argv never ships a short body in production — it fails loudly instead.
  });

  it('leaves flag-like text that is not its own argv token intact', () => {
    // The genuine no-substring-matching case: only whole argv tokens are stripped.
    expect(sendBodyFromArgv(['send', 'pass', '--part-less', 'bodies', 'through'])).toBe('pass --part-less bodies through');
  });

  it('handles flags in any order and interleaved with body words', () => {
    expect(sendBodyFromArgv(['send', 'lead', '--to', 'adam', 'middle', '--part', '1/2', 'tail']))
      .toBe('lead middle tail');
  });
});

describe('FR-1: the exclusion list cannot silently drift from the parse', () => {
  it('every flag parsed in the file appears in VALUE_FLAGS or BOOL_FLAGS', () => {
    // THE DRIFT GUARD. The original defect was a flag added to the parse and forgotten in the
    // exclusion list. My own first draft of VALUE_FLAGS guessed '--ref' and '--reply-window'
    // (neither exists) and omitted --framing-class and --timeout — re-creating the same leak for
    // different flags. This makes that omission fail loudly instead of shipping quietly.
    // The UNION across every path's list — the send path and the status path each carry their own,
    // deliberately, so that neither strips the other's flags out of a body. Coverage is still
    // all-or-nothing: a parsed flag absent from every list is the leak, whichever path added it.
    const covered = new Set([...VALUE_FLAGS, ...BOOL_FLAGS, ...STATUS_VALUE_FLAGS]);
    // --working is printStatus's own sub-command marker (the body FOLLOWS it there), not a send-path
    // flag, so it is deliberately out of scope for the send body.
    const uncovered = [...parsedFlags(SRC)].filter((f) => !covered.has(f) && f !== '--working');
    expect(uncovered).toEqual([]);
  });

  it('VALUE_FLAGS contains no flag the file does not actually parse', () => {
    // The other direction: a stale entry would strip a token that is really body text.
    const parsed = parsedFlags(SRC);
    expect(VALUE_FLAGS.filter((f) => !parsed.has(f))).toEqual([]);
  });

  it('the guard can actually SEE the parse — negative control', () => {
    // Without this, both assertions above pass just as happily against an empty set: a regex that
    // silently stopped matching (renamed helper, reformatted call, over-eager comment stripper)
    // would read as "no drift" forever. Pin that the enumeration is non-empty and contains the two
    // flags whose omission was the live defect.
    const parsed = parsedFlags(SRC);
    expect(parsed.size).toBeGreaterThan(5);
    expect(parsed.has('--part')).toBe(true);
    expect(parsed.has('--message-kind')).toBe(true);
  });
});
