/**
 * QF-20260902-429: role-seat state files (.claude/*-session-state-*.md) and frozen scratch
 * artifacts (.artifacts/_*, .artifacts/PREREG-*) were untracked but NOT gitignored, so a plain
 * `git clean` could discard them -- witnessed 2026-09-02 02:00-02:15Z (Adam seat CP1-CP27 lost).
 * Real `git check-ignore` invocation (no mocking) against the repo's actual .gitignore: the
 * protection this pins is the literal mechanism scripts/safe-root-resync.mjs relies on (it
 * never passes -x to `git clean`, so it already defers entirely to .gitignore -- there is no
 * second exclusion list in that script to keep in sync).
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

function isIgnored(relPath) {
  try {
    execFileSync('git', ['check-ignore', '--quiet', relPath], { cwd: REPO_ROOT });
    return true;
  } catch (err) {
    // git check-ignore exits 1 when the path is NOT ignored.
    if (err.status === 1) return false;
    throw err;
  }
}

describe('QF-20260902-429: seat-state and frozen-artifact gitignore patterns', () => {
  it('ignores an Adam seat-state file (.claude/*-session-state-*.md)', () => {
    expect(isIgnored('.claude/adam-session-state-673db833.md')).toBe(true);
  });

  it('ignores a Solomon seat-state file', () => {
    expect(isIgnored('.claude/solomon-session-state-319e2797.md')).toBe(true);
  });

  it('ignores the .bak twin of a seat-state file', () => {
    expect(isIgnored('.claude/adam-session-state-673db833.md.bak')).toBe(true);
  });

  it('ignores an underscore-prefixed .artifacts/_ scratch file', () => {
    expect(isIgnored('.artifacts/_HELD-SENDS.md')).toBe(true);
  });

  it('ignores an .artifacts/PREREG- frozen preregistration file', () => {
    expect(isIgnored('.artifacts/PREREG-M3-composition-frozen-20260830.mjs')).toBe(true);
  });

  it('does NOT ignore an unrelated .claude/ file (pattern is scoped, not a blanket exclusion)', () => {
    expect(isIgnored('.claude/settings.json')).toBe(false);
  });

  // QF-20260904-439: generated testing-evidence JSON dumps (raw vitest/testing-agent output)
  // were untracked but NOT gitignored, so worktree-reaper's preserve-stage (git ls-files
  // --others --exclude-standard) swept them into a WIP-preservation commit that merged to main
  // (PR #8177, #8180) -- ignoring the shape stops the sweep at the source.
  it('ignores a generated .artifacts/testing-*.json evidence dump', () => {
    expect(isIgnored('.artifacts/testing-SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B-exec-to-plan.json')).toBe(true);
  });

  it('does NOT ignore an unrelated .artifacts/ file (pattern is scoped to testing-*.json)', () => {
    expect(isIgnored('.artifacts/adam-seat-q1.cjs')).toBe(false);
  });
});

// QF-20260907-467: companion hygiene for QF-20260905-611 -- census of the shared root's
// untracked files turned up three more narrow, zero-collision gaps in the same seat-state /
// per-role-marker family QF-20260902-429 established.
describe('QF-20260907-467: additional narrow gitignore gaps (shared-root census)', () => {
  it('ignores the Adam active-seat marker (sibling of active-coordinator/active-michael)', () => {
    expect(isIgnored('.claude/active-adam.json')).toBe(true);
  });

  it('ignores a session-state file with a suffix but no role-name prefix (third permutation)', () => {
    expect(isIgnored('.claude/session-state-43f9985a.md')).toBe(true);
  });

  it('still ignores a role-prefixed session-state file via its OWN, pre-existing pattern (negative control)', () => {
    expect(isIgnored('.claude/adam-session-state-anything.md')).toBe(true);
  });

  it('ignores a last-outcome atomic-write tmp leftover', () => {
    expect(isIgnored('.claude/last-outcome-1b847de2-bea2-4ed1-bfdd-c467a46a83bf.json.tmp-34784')).toBe(true);
  });

  it('does NOT ignore the completed (non-tmp) last-outcome file differently than before (pattern is additive, not a regression)', () => {
    expect(isIgnored('.claude/last-outcome-1b847de2-bea2-4ed1-bfdd-c467a46a83bf.json')).toBe(true);
  });
});
