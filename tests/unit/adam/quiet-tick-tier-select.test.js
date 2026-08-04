/**
 * QF-20260728-544 — readCriticalPathParents MUST select `tier`.
 *
 * QF-20260725-639 shipped a correct suppression predicate (stall-alert.js:
 * `node.tier === 'parent'`) and it never fired once, because the query feeding it selected
 * 'id, title, updated_at, status, source_kind, source_ref' — no `tier`. node.tier was undefined
 * on every row, so the comparison was always false and 49 alerts/tick recurred against a set
 * where 100% of rows qualified for suppression by the query's own WHERE clause.
 *
 * WHY THE OMISSION LOOKED HARMLESS, and why this test exists: the query already pins the column
 * with .eq('tier','parent'), so selecting it reads as redundant. It is not — the CONSUMER reads
 * the VALUE, not the filter. A filtered-but-unselected column is invisible downstream, and
 * nothing in the pipeline errors: it just silently reads undefined.
 *
 * ASSERTED AT SOURCE, deliberately. A behavioural test would have to stand up syncParentRollupStatus
 * and the fetchAllPaginated stack to observe a field that is consumed in a DIFFERENT module — and
 * that indirection is exactly what hid the defect for the life of QF-639. The select list is the
 * precise thing that regressed, so it is the precise thing pinned here.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.resolve(process.cwd(), 'scripts/adam-quiet-tick.mjs'),
  'utf8'
);

/** The select list inside readCriticalPathParents, isolated from every other select in the file. */
function readCriticalPathParentsSelect() {
  const fnStart = SRC.indexOf('export async function readCriticalPathParents');
  expect(fnStart, 'readCriticalPathParents must exist').toBeGreaterThan(-1);
  const region = SRC.slice(fnStart, fnStart + 1500);
  const m = region.match(/\.select\(\s*'([^']+)'/);
  expect(m, 'readCriticalPathParents must call .select() with a literal column list').toBeTruthy();
  return m[1].split(',').map((c) => c.trim());
}

describe('QF-20260728-544 — the stall classifier can see its own input', () => {
  it('selects `tier`, the column stall-alert.js decides suppression on', () => {
    expect(readCriticalPathParentsSelect()).toContain('tier');
  });

  it('still selects the columns the rest of the pipeline consumes', () => {
    // Guards the opposite regression: "fixing" the select by replacing it rather than extending it.
    const cols = readCriticalPathParentsSelect();
    for (const required of ['id', 'title', 'updated_at', 'status', 'source_kind', 'source_ref']) {
      expect(cols).toContain(required);
    }
  });

  it('CONTROL — the extractor really reads this function, not the whole file', () => {
    // Without this, a broken extractor that returned every select in the file (there are 10+)
    // would satisfy both assertions above no matter what readCriticalPathParents actually does.
    const cols = readCriticalPathParentsSelect();
    expect(cols).not.toContain('orchestrator_state'); // belongs to the venture query, a different select
    expect(cols).not.toContain('from_phone');         // belongs to the SMS query
    expect(cols.length).toBeLessThan(10);
  });

  it('the query still pins tier=parent, so the selected value is meaningful', () => {
    const fnStart = SRC.indexOf('export async function readCriticalPathParents');
    const region = SRC.slice(fnStart, fnStart + 1500);
    expect(region).toMatch(/\.eq\(\s*'tier'\s*,\s*'parent'\s*\)/);
  });
});
