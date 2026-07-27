// QF-20260727-454 (a): SOURCE PINS across the audited ack surface. The incident: a chairman
// directive was acknowledged before it was read because the ack target was resolved by fetching
// "the newest unacked row" as a PROXY for "the row I am reading". These pins assert, for every
// sanctioned ack path (worker-ack-directive.cjs, coordinator-ack-adam.cjs,
// coordinator-ack-signal.cjs, ack-chairman-directive.cjs, adam-advisory.cjs/`ack`,
// solomon-advisory.cjs/`ack`):
//   (1) an explicit identifier is REQUIRED — a missing one is a loud usage refusal, never a
//       silently-resolved default; and
//   (2) none of them contain the "order by created_at DESC, gated only on acknowledged_at IS
//       NULL, feeding limit(1)" shape that would pick a target BY RECENCY rather than by id.
// This does not re-assert full runtime behavior (see ack-chairman-directive-read-coupling.test.js
// and ack-rows-exact-id-and-body-read.test.js for that) — it pins the ABSENCE of the specific
// defect shape this QF closes, across the whole surface the QF asked to be checked.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const ACK_PATHS = [
  'scripts/worker-ack-directive.cjs',
  'scripts/coordinator-ack-adam.cjs',
  'scripts/coordinator-ack-signal.cjs',
  'scripts/ack-chairman-directive.cjs',
  'scripts/adam-advisory.cjs',
  'scripts/solomon-advisory.cjs',
];

// The textual signature of "give me THE most recent unacked row" (order desc + a bare
// acknowledged_at-IS-NULL gate + limit(1)), in either filter order, within a small window.
function hasNewestUnackedTargetShape(src) {
  return /ascending:\s*false[\s\S]{0,200}is\(\s*'acknowledged_at',\s*null\)[\s\S]{0,80}limit\(1\)/.test(src)
    || /is\(\s*'acknowledged_at',\s*null\)[\s\S]{0,200}ascending:\s*false[\s\S]{0,80}limit\(1\)/.test(src);
}

describe('QF-20260727-454 (a): no ack path resolves its target via a newest-unacked scan', () => {
  for (const rel of ACK_PATHS) {
    it(`${rel} contains no newest-unacked-row-feeds-the-ack shape`, () => {
      expect(hasNewestUnackedTargetShape(read(rel))).toBe(false);
    });
  }
});

describe('QF-20260727-454 (a): each ack path REQUIRES an explicit identifier — a missing one refuses loudly', () => {
  it('worker-ack-directive.cjs requires --id', () => {
    const src = read('scripts/worker-ack-directive.cjs');
    expect(src).toContain("argVal(argv, '--id')");
    expect(src).toMatch(/if\s*\(!id\)\s*\{/);
  });

  it('ack-chairman-directive.cjs requires --id AND refuses without a fetched row (part b coupling)', () => {
    const src = read('scripts/ack-chairman-directive.cjs');
    expect(src).toContain("argVal(argv, '--id')");
    expect(src).toMatch(/if\s*\(!directiveId \|\| !role\)\s*\{/);
    expect(src).toContain('fetchDirectiveForAck');
    expect(src).toContain('refusing to ack');
  });

  it('adam-advisory.cjs and solomon-advisory.cjs `ack` mode require positional row ids', () => {
    for (const rel of ['scripts/adam-advisory.cjs', 'scripts/solomon-advisory.cjs']) {
      const src = read(rel);
      expect(src).toMatch(/if\s*\(ids\.length === 0\)\s*\{/);
    }
  });

  it('coordinator-ack-adam.cjs requires --advisory; coordinator-ack-signal.cjs requires --signal', () => {
    expect(read('scripts/coordinator-ack-adam.cjs')).toContain('if (!advisoryId)');
    expect(read('scripts/coordinator-ack-signal.cjs')).toContain('if (!signalId)');
  });
});

describe('QF-20260727-454 (b): the two batch ack lanes (adam/solomon) now read payload+body in the same UPDATE...RETURNING', () => {
  it('adam-advisory.cjs ackRows selects payload and body alongside id/read_at', () => {
    const src = read('scripts/adam-advisory.cjs');
    expect(src).toContain("q.select('id, read_at, payload, body')");
  });
  it('solomon-advisory.cjs ackRows selects payload and body alongside id/read_at', () => {
    const src = read('scripts/solomon-advisory.cjs');
    expect(src).toContain("q.select('id, read_at, payload, body')");
  });
});
