// QF-20260504-628 — guard against re-introduction of hardcoded absolute
// paths in .claude/settings.json hook commands. Per Claude Code hooks
// reference, ${CLAUDE_PROJECT_DIR} resolves per-worktree at exec time,
// which is what we want for multi-worktree fleets. Hardcoded paths point
// child worktrees at the parent's stale code (closes feedback 7c11211b).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SETTINGS_PATH = path.resolve(__dirname, '../../.claude/settings.json');

function allHookCommands() {
  const j = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  return Object.values(j.hooks).flatMap(arr => arr.flatMap(g => g.hooks || [])).map(h => h.command);
}

describe('QF-628 SETTINGS-1: no hook command hardcodes the parent worktree path', () => {
  it('rejects any /Users/.../EHG_Engineer/ or C:/Users/.../EHG_Engineer/ literal in commands', () => {
    const offenders = allHookCommands().filter(c =>
      /[A-Za-z]:[\\/]Users[\\/][^\s"']+[\\/]EHG_Engineer[\\/]/.test(c) ||
      /\/Users\/[^\s"']+\/EHG_Engineer\//.test(c)
    );
    expect(offenders).toEqual([]);
  });
});

describe('QF-628 SETTINGS-2: hook commands invoking project files use ${CLAUDE_PROJECT_DIR}', () => {
  it('every hook command referencing scripts/ or lib/ goes through the variable', () => {
    const offenders = allHookCommands().filter(c =>
      /\b(scripts|lib)\//.test(c) && !/\$\{?CLAUDE_PROJECT_DIR\}?/.test(c)
    );
    expect(offenders).toEqual([]);
  });
});

describe('QF-628 SETTINGS-3: statusLine command also uses ${CLAUDE_PROJECT_DIR}', () => {
  it('statusLine.command is variable-relative', () => {
    const j = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    expect(j.statusLine.command).toMatch(/\$\{?CLAUDE_PROJECT_DIR\}?/);
  });
});

// QF-20260604-729 — a wired hook command must point at a file that exists.
// A bulk-archive sweep silently orphaned a hook's spawn target (scripts/auto-learning-capture.js)
// while leaving the hook wired; the detached stdio:'ignore' spawn then masked the break and the hook
// printed a false-success banner. This locks down the directly-wired command files (the first,
// zero-false-positive layer). The deeper transitive guard (spawn/require targets *inside* hooks, which
// have mixed resolution bases across the fleet) is tracked separately — RCA acde2541 / PAT-HOOK-ARCHIVE-ORPHAN-001.
const REPO_ROOT = path.resolve(__dirname, '../../');

function wiredProjectFiles() {
  const j = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  const cmds = allHookCommands();
  if (j.statusLine && j.statusLine.command) cmds.push(j.statusLine.command);
  const files = [];
  for (const c of cmds) {
    const m = c.match(/\$\{?CLAUDE_PROJECT_DIR\}?[\\/]+([^\s"']+)/);
    if (m) files.push(m[1]);
  }
  return [...new Set(files)];
}

describe('QF-729 SETTINGS-4: every wired hook command points at an existing file', () => {
  it('no settings.json hook/statusLine command references a missing ${CLAUDE_PROJECT_DIR} file', () => {
    const missing = wiredProjectFiles().filter(rel => !fs.existsSync(path.resolve(REPO_ROOT, rel)));
    expect(missing).toEqual([]);
  });
});
