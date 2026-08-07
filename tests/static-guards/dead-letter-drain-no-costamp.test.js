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
 * Extract the patch argument of every `.update(...)` call in the source.
 *
 * ORIGINALLY THIS ONLY CAPTURED `.update({` — A LITERAL OBJECT — AND THAT MADE IT BLIND TO THE
 * BRANCH THAT CARRIES THE DEFECT. An adversarial audit proved it: the CLI has two `.update(` calls,
 * the guard inspected one (retarget), and the STAMP branch passes an expression rather than a
 * literal, so it was invisible. Reinstating the exact original co-stamp on the stamp branch left
 * the ENTIRE suite green — the defect fully restored, 2199/2199 passing.
 *
 * The non-vacuity arm did not save it, and that is the instructive part: `spans.length > 0` was
 * satisfied by the retarget branch, so the control was genuinely working and genuinely controlling
 * THE WRONG BRANCH. A guard can be well-formed, mutation-proved, and still aimed somewhere the bug
 * is not — which is why counting how many call sites exist matters as much as inspecting them.
 *
 * Now: capture EVERY `.update(` argument, resolving three forms — an inline object literal, a bare
 * identifier (resolved to its `const x = { ... }` initializer), and any other expression (captured
 * as-is so a spread like `{ ...build(), read_at: now }` is still inspected). Call-site COUNT is
 * exported so a test can assert none are being skipped, which is the property that actually failed.
 */
export function extractUpdateLiterals(source) {
  return extractUpdateArgs(source).map((a) => a.resolved);
}

/** Balanced-scan a bracketed span starting at `start` (whose char is `open`). */
function spanFrom(source, start, open, close) {
  let depth = 0;
  for (let j = start; j < source.length; j += 1) {
    if (source[j] === open) depth += 1;
    else if (source[j] === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, j + 1);
    }
  }
  return source.slice(start);
}

/**
 * Every `.update(` call site with its argument text and, where the argument is an identifier,
 * the initializer that identifier resolves to.
 * @returns {Array<{raw:string, resolved:string, form:'literal'|'identifier'|'expression'}>}
 */
export function extractUpdateArgs(source) {
  const out = [];
  const marker = '.update(';
  let i = source.indexOf(marker);
  while (i !== -1) {
    let j = i + marker.length;
    while (j < source.length && /\s/.test(source[j])) j += 1;

    if (source[j] === '{') {
      const raw = spanFrom(source, j, '{', '}');
      out.push({ raw, resolved: raw, form: 'literal' });
    } else {
      // Whole argument list, then the first argument.
      const args = spanFrom(source, i + marker.length - 1, '(', ')');
      const raw = args.slice(1, -1).trim();
      const ident = raw.match(/^([A-Za-z_$][\w$]*)$/);
      if (ident) {
        // Resolve `const <ident> = { ... }` / `let` / `var` to its initializer.
        const declIdx = source.search(new RegExp(`(?:const|let|var)\\s+${ident[1]}\\s*=\\s*\\{`));
        if (declIdx !== -1) {
          const braceIdx = source.indexOf('{', declIdx);
          out.push({ raw, resolved: spanFrom(source, braceIdx, '{', '}'), form: 'identifier' });
        } else {
          out.push({ raw, resolved: raw, form: 'identifier' });
        }
      } else {
        out.push({ raw, resolved: raw, form: 'expression' });
      }
    }
    i = source.indexOf(marker, i + marker.length);
  }
  return out;
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

  it('inspects EVERY .update() call site, not just the ones with literal arguments', () => {
    // THE ASSERTION THAT WAS MISSING, and the one whose absence let the defect hide. The old
    // extractor captured only `.update({`, so the stamp branch — which passes an expression —
    // was never inspected at all. Reinstating the original co-stamp there left the whole suite
    // green. Coverage is now asserted as a COUNT: every call site the file contains must appear
    // in what the guard examines, so a future branch added in an unhandled form fails HERE
    // rather than silently widening the blind spot.
    const source = fs.readFileSync(DRAIN_CLI, 'utf8');
    const callSites = (source.match(/\.update\(/g) || []).length;
    expect(callSites).toBeGreaterThan(1);
    expect(extractUpdateArgs(source)).toHaveLength(callSites);
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
