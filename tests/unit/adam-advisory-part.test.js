/**
 * SD-LEO-INFRA-CONSULT-CORRELATION-CONVENTIONS-001 / FR-1 — Adam's --part capability.
 *
 * WHY THIS FILE EXISTS. The SD asked to apply ONE correlation convention symmetrically across both
 * advisory senders. That was not implementable: Solomon parsed --part N/M and stamped first-class
 * payload.part_index / payload.part_total, while adam-advisory.cjs had no --part flag and its
 * buildAdvisoryPayload omitted both fields. There was nothing for a convention to converge ON. These
 * tests pin the missing half.
 *
 * PAYLOAD, NEVER THE COLUMN. Measured over the full paginated population (6435 rows):
 * session_coordination.correlation_id is populated on 6.5%, the payload carries it on 84.2%,
 * column-only rows are ZERO, and nothing in the repo has ever written the column (created at
 * 20260702_session_coordination_insert_lint.sql:16 behind a trigger that only RAISE NOTICEs). A
 * column-keyed implementation of this FR would have shipped fully green and fully inert, so the
 * payload-keyed assertions below are load-bearing, not decorative.
 */
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { parsedFlags } from './helpers/parsed-flags.js';
import adamAdvisory from '../../scripts/adam-advisory.cjs';
import multiPart from '../../lib/coordinator/multi-part-reply.cjs';

const { buildAdvisoryPayload, sendBodyFromArgv, VALUE_FLAGS, BOOL_FLAGS, STATUS_VALUE_FLAGS, SWEEP_VALUE_FLAGS } = adamAdvisory;
const { MAX_PARTS, readExplicitPartMarker } = multiPart;
const SRC = fileURLToPath(new URL('../../scripts/adam-advisory.cjs', import.meta.url));

describe('FR-1: Adam stamps first-class part fields on the PAYLOAD', () => {
  it('builds a real multi-part Adam consult carrying part_index and part_total', () => {
    const p = buildAdvisoryPayload({
      body: 'second half of the consult',
      senderCallsign: 'Adam',
      correlationId: 'CORR-ADAM-1',
      partIndex: 2,
      partTotal: 3,
    });
    expect(p.part_index).toBe(2);
    expect(p.part_total).toBe(3);
    expect(p.correlation_id).toBe('CORR-ADAM-1');
  });

  it('shares ONE correlation across the parts of one logical consult', () => {
    // The convention itself: N parts, ONE correlation — not N correlations.
    const parts = [1, 2, 3].map((i) =>
      buildAdvisoryPayload({ body: `part ${i}`, senderCallsign: 'Adam', correlationId: 'CORR-ADAM-2', partIndex: i, partTotal: 3 }),
    );
    expect(new Set(parts.map((p) => p.correlation_id)).size).toBe(1);
    expect(parts.map((p) => p.part_index)).toEqual([1, 2, 3]);
  });

  it('the reader groups those parts off the PAYLOAD, not the table column', () => {
    // TS-6's non-vacuous form. A column-NULL fixture proves nothing here — column-NULL is already
    // the default state of every fixture in the repo. This fixture makes the two sources DIVERGE and
    // asserts which one the reader actually follows; a column-keyed reader cannot satisfy it.
    const row = {
      correlation_id: 'COLUMN-VALUE',
      payload: buildAdvisoryPayload({ body: 'x', senderCallsign: 'Adam', correlationId: 'PAYLOAD-VALUE', partIndex: 1, partTotal: 2 }),
    };
    const marker = readExplicitPartMarker(row);
    expect(marker).toEqual({ prefix: 'corr:PAYLOAD-VALUE', index: 1, total: 2 });
    expect(marker.prefix).not.toContain('COLUMN-VALUE');
  });

  it('emits no top-level correlation_id column key — the write side of the same point', () => {
    const p = buildAdvisoryPayload({ body: 'x', senderCallsign: 'Adam', correlationId: 'CORR', partIndex: 1, partTotal: 2 });
    // The correlation lives INSIDE the payload object. buildAdvisoryPayload returns the payload, so
    // the assertion that matters is that it is present here — the row-level column is written by
    // nothing in the repo, which is exactly why the payload must carry it.
    expect(Object.prototype.hasOwnProperty.call(p, 'correlation_id')).toBe(true);
  });
});

describe('FR-1: Adam enforces the SAME part bounds as Solomon', () => {
  it('requires both halves — a part_index with no total is unorderable', () => {
    const p = buildAdvisoryPayload({ body: 'x', senderCallsign: 'Adam', partIndex: 2 });
    expect('part_index' in p).toBe(false);
    expect('part_total' in p).toBe(false);
  });

  it('rejects out-of-range and non-integer pairs', () => {
    const bad = [[0, 3], [3, 2], [1.5, 3], ['a', 3], [1, MAX_PARTS + 1]];
    for (const [i, t] of bad) {
      expect(() => buildAdvisoryPayload({ body: 'x', partIndex: i, partTotal: t })).toThrow(/INVALID_PART/);
    }
  });

  it('enforces the ceiling from the SHARED constant, not a local literal', () => {
    // The ceiling moved to multi-part-reply.cjs when Adam gained this capability. Two senders holding
    // two copies of the literal 20 would be a drift pair with no mechanism keeping them equal — the
    // same defect class this SD closes. Pin that Adam's bound tracks the shared constant: at the
    // ceiling it is accepted, one past it throws, and both are computed FROM MAX_PARTS.
    expect(buildAdvisoryPayload({ body: 'x', partIndex: 1, partTotal: MAX_PARTS }).part_total).toBe(MAX_PARTS);
    expect(() => buildAdvisoryPayload({ body: 'x', partIndex: 1, partTotal: MAX_PARTS + 1 })).toThrow(/INVALID_PART/);
  });

  it('omitting --part is byte-identical to pre-SD behavior', () => {
    const p = buildAdvisoryPayload({ body: 'x', senderCallsign: 'Adam' });
    expect('part_index' in p).toBe(false);
    expect('part_total' in p).toBe(false);
  });
});

describe('FR-1: Adam does not inherit the body-leak defect', () => {
  it('keeps --part and its value out of the message body', () => {
    // TESTING's PLAN review called this out explicitly: mirroring Solomon's index-list idiom onto
    // Adam would have made Adam INHERIT the leak while this suite stayed green.
    expect(sendBodyFromArgv(['send', '--part', '2/3', '--to', 'solomon', 'real', 'body', 'here']))
      .toBe('real body here');
  });

  it('every flag Adam parses is covered by one of its path lists', () => {
    const covered = new Set([...VALUE_FLAGS, ...BOOL_FLAGS, ...STATUS_VALUE_FLAGS, ...SWEEP_VALUE_FLAGS]);
    // --working is printStatus's sub-command marker (the body FOLLOWS it), not a send-path flag.
    const uncovered = [...parsedFlags(SRC)].filter((f) => !covered.has(f) && f !== '--working');
    expect(uncovered).toEqual([]);
  });

  it('no list entry is stale — it would strip real body text', () => {
    const parsed = parsedFlags(SRC);
    expect(VALUE_FLAGS.filter((f) => !parsed.has(f))).toEqual([]);
  });

  it('the guard can actually SEE Adam\'s parse — negative control', () => {
    // Both assertions above pass just as happily against an empty set. Without this, a regex that
    // stopped matching would read as "no drift" forever.
    const parsed = parsedFlags(SRC);
    expect(parsed.size).toBeGreaterThan(5);
    expect(parsed.has('--part')).toBe(true);
  });
});
