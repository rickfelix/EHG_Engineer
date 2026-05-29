/**
 * Enforcement Hook Registration Invariant
 * QF-20260529-009 (RCA root_cause_reports 88a3d33b)
 *
 * Regression guard for a class of bug where pre-tool-enforce.cjs contains
 * enforcement rules for a tool (e.g. Write/Edit) but .claude/settings.json
 * does NOT list that tool in the PreToolUse matcher — so the hook is never
 * invoked for it and the rules are dead code. This was true for Write/Edit
 * from commit 7e6ec942 (2026-05-02) until this QF: every Edit/Write guard
 * (worktree-main hard block, claim guard, DB-only, bugfix-TDD, RCA-tiered,
 * file-claim) silently never ran.
 *
 * Invariant: every tool that pre-tool-enforce.cjs guards MUST appear in the
 * PreToolUse matcher that invokes it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = resolve(__dirname, '../../.claude/settings.json');

// Tools whose enforcement logic lives in pre-tool-enforce.cjs and therefore
// MUST be in the matcher. Bash/Task: DB-write + background-exec guards.
// Write/Edit/MultiEdit: worktree-main, claim, DB-only, bugfix-TDD, RCA-tiered,
// file-claim guards (all gate internally on TOOL_NAME === 'Edit'|'Write'|'MultiEdit').
const GUARDED_TOOLS = ['Task', 'Bash', 'Write', 'Edit', 'MultiEdit'];

function getPreToolEnforceMatchers() {
  const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
  const preToolUse = settings?.hooks?.PreToolUse || [];
  const matchers = [];
  for (const entry of preToolUse) {
    const cmds = (entry.hooks || []).map((h) => h.command || '');
    if (cmds.some((c) => c.includes('pre-tool-enforce.cjs'))) {
      matchers.push(entry.matcher || '');
    }
  }
  return matchers;
}

describe('pre-tool-enforce.cjs registration invariant', () => {
  it('is registered in PreToolUse at least once', () => {
    const matchers = getPreToolEnforceMatchers();
    expect(matchers.length).toBeGreaterThan(0);
  });

  it('covers every tool it guards (Task, Bash, Write, Edit, MultiEdit)', () => {
    const matchers = getPreToolEnforceMatchers();
    // Union of all tools across every matcher that invokes the hook.
    const covered = new Set(
      matchers.flatMap((m) => m.split('|').map((t) => t.trim()).filter(Boolean))
    );
    const missing = GUARDED_TOOLS.filter((t) => !covered.has(t));
    expect(
      missing,
      `pre-tool-enforce.cjs guards ${missing.join(', ')} but they are absent from the PreToolUse matcher — those guards are dead code. Add them to the matcher.`
    ).toEqual([]);
  });
});
