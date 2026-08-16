/**
 * QF-20260728-720, 6th field: loop_state='exited' NAME asserts "the worker's loop
 * ended" (a worker-side decision). The only programmatic writer today is the sweep's
 * bulk release-update (scripts/stale-session-sweep.cjs), which fires on ANY session
 * this cycle released — including one that simply got swept, not one that
 * deliberately wound its own loop down. The two are opposite in agency and
 * identical in storage.
 *
 * Negative test (the QF's own suggested form): "have a worker end its loop WITHOUT
 * the sweep releasing it, and assert loop_state reads 'exited'. Today nothing
 * writes it on that path." This is a structural census, not a runtime fixture,
 * because there is currently no dedicated "I deliberately exited" writer to call —
 * that absence IS the finding. If a second writer is ever added without addressing
 * the semantic conflation (see docs/reference/field-name-is-a-claim.md), this test
 * must be updated deliberately, not silently pass through.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

const SCAN_DIRS = ['scripts', 'lib'];
const EXCLUDE_SEGMENTS = ['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', 'archive'];
const WRITE_PATTERN = /loop_state\s*:\s*(LOOP_STATE_EXITED\b|['"]exited['"])/;
const EXCLUDE_FILE_RE = /\.test\.js$/i;

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_SEGMENTS.includes(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (/\.(js|cjs|mjs)$/i.test(entry) && !EXCLUDE_FILE_RE.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function findWriteSites() {
  const files = [];
  for (const dir of SCAN_DIRS) walk(path.join(REPO_ROOT, dir), files);
  const sites = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    if (WRITE_PATTERN.test(content)) {
      sites.push(path.relative(REPO_ROOT, file).replace(/\\/g, '/'));
    }
  }
  return sites.sort();
}

describe("loop_state='exited' write-site census (QF-20260728-720)", () => {
  it('is written ONLY by the sweep bulk-release path — no dedicated deliberate-self-exit writer exists', () => {
    const sites = findWriteSites();

    // Today's honest state: exactly the sweep. If this list grows, a human must
    // decide whether the new writer distinguishes deliberate-exit from
    // swept-release (the whole point of this field's negative test) — update
    // this assertion deliberately, do not just add the new path to the array.
    expect(sites).toEqual(['scripts/stale-session-sweep.cjs']);
  });
});
