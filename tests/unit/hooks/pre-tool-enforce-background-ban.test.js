import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { resolve } from 'path';

const HOOK_PATH = resolve(process.cwd(), 'scripts/hooks/pre-tool-enforce.cjs');

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

describe('Background Execution Ban (Enforcement 1 — NC-006)', () => {
  it('blocks Task tool with run_in_background=true', () => {
    const r = runHook('Task', { prompt: 'do something', run_in_background: true });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('PROTOCOL VIOLATION');
  });

  it('blocks Bash tool with run_in_background=true', () => {
    const r = runHook('Bash', { command: 'echo hi', run_in_background: true });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('NC-006');
  });

  it('allows Task tool with run_in_background=false', () => {
    const r = runHook('Task', { prompt: 'do something', run_in_background: false });
    expect(r.exitCode).toBe(0);
  });

  it('allows Bash tool with no run_in_background field', () => {
    const r = runHook('Bash', { command: 'echo hi' });
    expect(r.exitCode).toBe(0);
  });
});
