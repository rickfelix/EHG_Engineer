import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';

const HOOK_PATH = resolve(process.cwd(), 'scripts/hooks/pre-tool-enforce.cjs');
const STATE_FILE = resolve(process.cwd(), '.claude/unified-session-state.json');
const STATE_BACKUP = STATE_FILE + '.test-backup';
// SD key for "a different SD" — never matches this worktree
const CLAIMED_SD = 'SD-UNIT-TEST-CLAIMED-999';

function runHook(toolName, toolInput) {
  try {
    const result = execSync(`node "${HOOK_PATH}"`, {
      env: { ...process.env, CLAUDE_TOOL_NAME: toolName, CLAUDE_TOOL_INPUT: JSON.stringify(toolInput) },
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000,
    });
    return { exitCode: 0, stdout: result, stderr: '' };
  } catch (err) {
    return { exitCode: err.status || 1, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

describe('Worktree Claim Guard (Enforcement 4 — PAT-CLMMULTI-001)', () => {
  beforeEach(() => {
    if (existsSync(STATE_FILE)) writeFileSync(STATE_BACKUP, readFileSync(STATE_FILE));
    writeFileSync(STATE_FILE, JSON.stringify({ sd: { id: CLAIMED_SD } }));
  });

  afterEach(() => {
    if (existsSync(STATE_BACKUP)) { writeFileSync(STATE_FILE, readFileSync(STATE_BACKUP)); unlinkSync(STATE_BACKUP); }
    else if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
  });

  it('blocks Edit to a different SD worktree path', () => {
    // .worktrees/<OTHER-SD>/file — different from what session claims
    const r = runHook('Edit', { file_path: `/repo/.worktrees/SD-OTHER-PROJECT-001/src/foo.js`, old_string: 'a', new_string: 'b' });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('CLAIM GUARD');
  });

  it('allows Edit to the claimed SD worktree path', () => {
    // .worktrees/<CLAIMED-SD>/file — matches session claim
    const r = runHook('Edit', { file_path: `/repo/.worktrees/${CLAIMED_SD}/src/foo.js`, old_string: 'a', new_string: 'b' });
    expect(r.exitCode).toBe(0);
  });

  it('allows Edit outside any worktree (no .worktrees in path)', () => {
    const r = runHook('Edit', { file_path: `/repo/src/app.js`, old_string: 'a', new_string: 'b' });
    expect(r.exitCode).toBe(0);
  });
});
