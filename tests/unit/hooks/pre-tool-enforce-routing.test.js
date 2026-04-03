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

describe('Sub-Agent Routing Advisory (Enforcement 3)', () => {
  it('exits 0 (advisory only, non-blocking) for routing mismatch', () => {
    // "execute migration" is a DATABASE primary keyword — using wrong agent triggers hint
    const r = runHook('Task', { subagent_type: 'api-agent', prompt: 'execute migration on the database' });
    expect(r.exitCode).toBe(0);
  });

  it('emits ROUTING HINT to stdout when keyword matches wrong agent', () => {
    const r = runHook('Task', { subagent_type: 'api-agent', prompt: 'execute migration on the users table' });
    expect(r.stdout).toContain('ROUTING HINT');
  });

  it('emits no hint when correct agent type is used', () => {
    const r = runHook('Task', { subagent_type: 'database-agent', prompt: 'execute migration on the users table' });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).not.toContain('ROUTING HINT');
  });
});
