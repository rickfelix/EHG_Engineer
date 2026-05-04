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
