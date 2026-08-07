/**
 * The drain's paginated fetch must be ORDERED.
 * SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-1e — adversarial security review finding.
 *
 * THE DEFECT. `all()` paginated with `.range()` and no `.order()`. Unordered LIMIT/OFFSET carries
 * no row-order guarantee, and claude_sessions holds ~13,000 rows fetched over ~14 pages while
 * heartbeat UPDATEs continuously rewrite them — so a row can shift across a page boundary and be
 * dropped from the result entirely. The rows most likely to move are the LIVE, actively-
 * heartbeating ones: exactly the sessions whose mail must never be redirected.
 *
 * WHY IT WAS WORSE THAN A MISCOUNT, and why it needed its own guard rather than a code comment.
 * A dropped session fails the `byId.has(t)` membership test and is judged dead WITHOUT the
 * heartbeat threshold ever being consulted. So the careful liveness oracle FR-1c added would be
 * bypassed SILENTLY — not overruled by a wrong verdict, but skipped by an absence. A guard on the
 * oracle could never have caught this, because the oracle is not where the failure happens.
 *
 * The uncomfortable part, recorded deliberately: the STEP 0 snapshot script written earlier in this
 * same SD already used keyset pagination and explained in its own header why offset paging is
 * wrong here. The knowledge was present, written down, and applied in one file while the file that
 * actually redirects mail kept the unsafe form. Knowing a rule and enforcing it are different
 * things, which is what this guard is for.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const DRAIN_CLI = path.resolve(process.cwd(), 'scripts/drain-dead-letter-coordination.mjs');
const source = () => fs.readFileSync(DRAIN_CLI, 'utf8');

/**
 * Every line that actually CALLS `.range(`, excluding comments and string literals.
 *
 * Both exclusions were earned rather than anticipated. Comments matter because the drain
 * documents this defect at length, and a guard satisfied by the description of a bug is worse
 * than no guard. String literals matter because the FIRST version of this guard flagged its own
 * enforcement line — the `throw new Error('... unordered .range() pagination ...')` that exists
 * precisely to prevent the defect. The guard read the words describing the rule as a violation of
 * it. Stripping literals is the general fix; special-casing that one line would have left the
 * next quoted mention to rediscover the same thing.
 */
function rangeStatements(src) {
  const stripLiterals = (l) => l
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
  return src
    .split('\n')
    .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
    .filter((l) => stripLiterals(l).includes('.range('));
}

describe('drain pagination is ordered', () => {
  it('finds range() calls to inspect (guard is not vacuous)', () => {
    // A guard that inspected zero statements would pass for the wrong reason forever.
    expect(rangeStatements(source()).length).toBeGreaterThan(0);
  });

  it('every .range() pagination is accompanied by .order() in the same statement', () => {
    const unordered = rangeStatements(source()).filter((l) => !l.includes('.order('));
    expect(
      unordered,
      'Unordered .range() pagination can silently drop rows across page boundaries. A dropped '
      + 'session is judged dead by membership test alone, bypassing the heartbeat oracle entirely, '
      + 'and its mail gets redirected. Add .order() on a stable unique column.'
    ).toEqual([]);
  });

  it('the fetch helper REFUSES to run without an explicit order column', () => {
    // Stronger than "the current call sites happen to pass one": a future caller that forgets
    // must fail loudly rather than silently inherit unordered paging. The runtime throw is the
    // real enforcement; this asserts it exists.
    expect(source()).toMatch(/if \(!orderBy\) throw new Error/);
  });

  it('CONTROL: an unordered range statement is detectable', () => {
    // Without this arm, a filter that silently stopped matching would leave the suite green while
    // the drain went back to dropping live sessions on an hourly cron.
    const synthetic = '    let q = db.from(table).select(cols).range(from, from + PAGE - 1);';
    const found = rangeStatements(synthetic).filter((l) => !l.includes('.order('));
    expect(found).toHaveLength(1);
  });

  it('CONTROL: prose describing .range() does not count as a call site', () => {
    const synthetic = ' * This previously paginated with .range() and NO .order().';
    expect(rangeStatements(synthetic)).toHaveLength(0);
  });
});

describe('the guard does not flag its own enforcement (regression on the guard itself)', () => {
  it('CONTROL: a .range() mention inside a string literal is not a call site', () => {
    // The first version of this guard failed exactly here, flagging the throw that enforces the
    // rule as a violation of it. Pinned so the literal-stripping cannot be quietly removed.
    const synthetic = '  if (!orderBy) throw new Error(`all(x): orderBy is required — unordered .range() pagination drops rows`);';
    expect(rangeStatements(synthetic)).toHaveLength(0);
  });
});
