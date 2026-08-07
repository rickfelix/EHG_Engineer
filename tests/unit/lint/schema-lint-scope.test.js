/**
 * QF-20260802-742 — the schema-reference lint must scope to the PR's OWN new drift.
 *
 * MEASURED FAILURE THIS PINS (A/B run against origin/main on an identical working tree):
 *   a PR that appended ONE COMMENT to lib/validation/validation-gate-enforcer.js
 *     old script: EXIT 1, "8 violation(s) in 3 file(s) checked"
 *     new script: EXIT 0, 0 new violations, 8 reported as pre-existing
 *   and with a genuinely new bad reference added to the same file
 *     new script: EXIT 1, naming ONLY the 1 new violation — not the 8 old ones
 *
 * Both polarities matter. A lint that stops blocking is trivially achievable by never firing,
 * which is the same defect wearing the opposite sign.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { violationKey, partitionViolations } from '../../../scripts/lint/schema-lint-scope.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Shape produced by findViolations() in schema-reference-extract.mjs. */
const v = (over = {}) => ({
  file: 'lib/validation/validation-gate-enforcer.js',
  type: 'column',
  table: 'product_requirements_v2',
  column: 'validation_status',
  kind: 'update',
  line: 278,
  missing: 'product_requirements_v2.validation_status',
  ...over,
});

describe('the backlog must not become the toucher\'s problem', () => {
  it('a violation present at the merge base is PRE-EXISTING, not new', () => {
    const head = [v()];
    const baseline = new Set([violationKey(v())]);
    const { newViolations, preExisting } = partitionViolations(head, baseline);
    expect(newViolations).toHaveLength(0);
    expect(preExisting).toHaveLength(1);
  });

  it('a violation ABSENT from the merge base still BLOCKS', () => {
    // The polarity that stops this fix from being "disable the lint".
    const head = [v({ table: 'table_that_does_not_exist_qf742', column: undefined, type: 'table', kind: 'from' })];
    const baseline = new Set([violationKey(v())]);
    const { newViolations, preExisting } = partitionViolations(head, baseline);
    expect(newViolations).toHaveLength(1);
    expect(preExisting).toHaveLength(0);
  });

  it('separates them in the SAME file — the reproduced #6738 shape', () => {
    const old1 = v();
    const old2 = v({ column: 'validation_blocker', missing: 'product_requirements_v2.validation_blocker' });
    const fresh = v({ table: 'brand_new_typo_table', column: undefined, type: 'table', kind: 'from', line: 415 });
    const baseline = new Set([violationKey(old1), violationKey(old2)]);
    const { newViolations, preExisting } = partitionViolations([old1, old2, fresh], baseline);
    expect(newViolations.map(x => x.table)).toEqual(['brand_new_typo_table']);
    expect(preExisting).toHaveLength(2);
  });
});

describe('line numbers must not resurrect a pre-existing violation', () => {
  it('the SAME violation shifted to a new line is still pre-existing', () => {
    // THE CRLF/refactor case: inserting code above a violation moves its line. If the key
    // included `line`, every old violation in a touched file would read as new — exactly the
    // bug, reintroduced through the back door.
    const baseline = new Set([violationKey(v({ line: 278 }))]);
    const { newViolations, preExisting } = partitionViolations([v({ line: 999 })], baseline);
    expect(newViolations).toHaveLength(0);
    expect(preExisting).toHaveLength(1);
  });

  it('violationKey does not contain the line number', () => {
    expect(violationKey(v({ line: 278 }))).toBe(violationKey(v({ line: 4242 })));
    expect(violationKey(v())).not.toMatch(/278/);
  });

  it('but a DIFFERENT column at the same line is a different violation', () => {
    // Opposite polarity: the key must still discriminate, or everything collapses to
    // pre-existing and the lint silently dies.
    expect(violationKey(v({ column: 'a' }))).not.toBe(violationKey(v({ column: 'b' })));
    expect(violationKey(v({ table: 'x' }))).not.toBe(violationKey(v({ table: 'y' })));
    expect(violationKey(v({ kind: 'select' }))).not.toBe(violationKey(v({ kind: 'update' })));
    expect(violationKey(v({ file: 'a.js' }))).not.toBe(violationKey(v({ file: 'b.js' })));
  });
});

describe('a MISSING baseline must not silently disable the lint', () => {
  it('null baseline treats every violation as new', () => {
    // --all sweeps and degraded --diff runs have no baseline. Treating absent-baseline as
    // "all pre-existing" would disable the check on precisely the runs that already lost
    // their footing. The caller's degraded/advisory rules decide whether that blocks.
    const { newViolations, preExisting } = partitionViolations([v(), v({ column: 'other' })], null);
    expect(newViolations).toHaveLength(2);
    expect(preExisting).toHaveLength(0);
  });

  it('an EMPTY baseline set is not the same as a null baseline', () => {
    // Empty = "the file existed and was clean" -> violations are new.
    const { newViolations } = partitionViolations([v()], new Set());
    expect(newViolations).toHaveLength(1);
  });

  it('handles an empty/absent violation list without throwing', () => {
    expect(partitionViolations([], new Set()).newViolations).toHaveLength(0);
    expect(partitionViolations(undefined, null).newViolations).toHaveLength(0);
  });
});

describe('the CI scope pin is wired in the lint itself', () => {
  // Asserted on the AST-adjacent source with comments stripped: this fix's own comments quote
  // the removed assumption ("the latter two are empty in CI") verbatim, so a raw-text match
  // would pass on its own explanation.
  const SRC = readFileSync(resolve(REPO_ROOT, 'scripts/lint/schema-reference-lint.mjs'), 'utf8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('resolves an explicit merge-base rather than relying on the ... shorthand', () => {
    expect(CODE).toMatch(/git merge-base/);
    expect(CODE).toMatch(/\$\{mergeBase\}\.\.HEAD/);
  });

  it('gates the working-tree sources behind committedOnly', () => {
    // The CRLF inflation vector: staged/unstaged/untracked must NOT be unconditional.
    expect(CODE).toMatch(/if \(!committedOnly\)/);
    const idx = CODE.indexOf('if (!committedOnly)');
    const cached = CODE.indexOf('--cached');
    expect(cached).toBeGreaterThan(idx); // the working-tree reads live INSIDE the guard
  });

  it('defaults to committed-only under CI', () => {
    expect(CODE).toMatch(/process\.env\.CI/);
  });

  it('the exit decision counts NEW violations only', () => {
    expect(CODE).toMatch(/computeExitCode\(\{\s*violations:\s*allViolations\.length/);
    // preExisting must never reach the exit decision.
    expect(CODE).not.toMatch(/computeExitCode\([^)]*preExisting/);
  });

  it('an empty merge-base degrades instead of blocking', () => {
    // Measured on a deliberately shallowed clone: `git fetch <base> --depth=1` writes
    // .git/shallow, drops the base to 1 visible commit, and merge-base returns EMPTY (exit 1).
    // A falsy mergeBase would null every baseline lookup and re-block the whole backlog.
    expect(CODE).toMatch(/if \(!mergeBase\) throw/);
  });

  it('the workflow does not re-shallow the base ref it just fetched in full', () => {
    const wf = readFileSync(resolve(REPO_ROOT, '.github/workflows/schema-reference-lint.yml'), 'utf8');
    expect(wf).toMatch(/fetch-depth:\s*0/);          // full history at checkout
    expect(wf).not.toMatch(/git fetch origin \S+ --depth=1/); // and not undone one line later
  });

  it('CONTROL: the stripper did not empty the source', () => {
    expect(CODE).toMatch(/candidateFiles/);
    expect(CODE.length).toBeGreaterThan(2000);
  });
});
