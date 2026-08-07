/**
 * Static guard: the dead-letter drain must never co-stamp acknowledged_at and read_at.
 * SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-1(a), AC-4.
 *
 * WHY A STATIC GUARD AND NOT ONLY A BEHAVIOURAL TEST. This SD puts the dead-letter drain on a
 * cron. Today it is manual and dry-run by default, and the source itself records (at the selector
 * comment) that "requires a human to run it" is not a guard. Once scheduled, a single write that
 * sets acknowledged_at AND read_at together blinds FOUR surfaces at once — the coordinator inbox,
 * the sender's outstanding view, isRouterSwallowed (which requires !read_at), and REPLY_STARVATION
 * (because no auto_acked marker is written either, so isGenuinelyAcknowledged reads the row as a
 * HUMAN answer rather than a machine stamp). A backlog that was merely unread becomes invisible,
 * on a schedule. That is strictly worse than the module never running at all.
 *
 * A behavioural test over the extracted write path is the primary check, but it only survives as
 * long as the extraction does. This guard reads the SOURCE, so it keeps working if someone later
 * re-inlines the write path back into a script — which is exactly how the defect got here.
 *
 * SCOPE NOTE: this asserts the two columns are never set in the SAME update literal. Stamping
 * acknowledged_at alone is the intended behaviour of the drain branch and stays legal; what must
 * not happen is the pair, because it is the pair that removes the row from every surface at once.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const DRAIN_CLI = path.resolve(process.cwd(), 'scripts/drain-dead-letter-coordination.mjs');

/**
 * Extract the argument span of every `.update({ ... })` call in the source.
 * Brace-balanced scan rather than a regex, so a nested object inside the patch
 * (e.g. `payload: { ... }`) cannot terminate the span early and hide the pair.
 */
export function extractUpdateLiterals(source) {
  const spans = [];
  const marker = '.update(';
  let i = source.indexOf(marker);
  while (i !== -1) {
    let j = i + marker.length;
    while (j < source.length && /\s/.test(source[j])) j += 1;
    if (source[j] === '{') {
      let depth = 0;
      const start = j;
      for (; j < source.length; j += 1) {
        if (source[j] === '{') depth += 1;
        else if (source[j] === '}') {
          depth -= 1;
          if (depth === 0) { spans.push(source.slice(start, j + 1)); break; }
        }
      }
    }
    i = source.indexOf(marker, i + marker.length);
  }
  return spans;
}

/** A column is "set" when it appears as a key in the patch literal. */
function setsColumn(span, column) {
  return new RegExp(`(^|[{,\\s])${column}\\s*:`).test(span);
}

describe('dead-letter drain: no acknowledged_at + read_at co-stamp', () => {
  it('finds update literals to inspect (guard is not vacuous)', () => {
    const source = fs.readFileSync(DRAIN_CLI, 'utf8');
    const spans = extractUpdateLiterals(source);
    // If the extraction silently found nothing, the assertion below would pass for the wrong
    // reason. A guard that inspects zero spans is indistinguishable from a guard that passes.
    expect(spans.length).toBeGreaterThan(0);
  });

  it('never sets acknowledged_at and read_at in the same update', () => {
    const source = fs.readFileSync(DRAIN_CLI, 'utf8');
    const offenders = extractUpdateLiterals(source)
      .filter((span) => setsColumn(span, 'acknowledged_at') && setsColumn(span, 'read_at'));

    expect(
      offenders,
      'A re-routed or drained row must stay visible to its new target. Setting acknowledged_at and '
      + 'read_at in one write blinds the coordinator inbox, the sender outstanding view, '
      + 'isRouterSwallowed and REPLY_STARVATION simultaneously. Stamp acknowledged_at alone.'
    ).toEqual([]);
  });

  it('detects a co-stamp when one is present (two-sided control)', () => {
    // The guard must be provably capable of FAILING. Without this arm, a regex that silently
    // stopped matching would leave the suite green forever while the defect walked back in.
    const synthetic = 'db.from(\'t\').update({ acknowledged_at: now, read_at: now, payload: { a: { b: 1 } } }).eq(\'id\', x)';
    const spans = extractUpdateLiterals(synthetic);
    expect(spans).toHaveLength(1);
    expect(setsColumn(spans[0], 'acknowledged_at') && setsColumn(spans[0], 'read_at')).toBe(true);
  });

  it('does not flag an update that sets only acknowledged_at', () => {
    const synthetic = 'db.from(\'t\').update({ acknowledged_at: now, payload: p }).eq(\'id\', x)';
    const spans = extractUpdateLiterals(synthetic);
    expect(setsColumn(spans[0], 'acknowledged_at') && setsColumn(spans[0], 'read_at')).toBe(false);
  });
});
