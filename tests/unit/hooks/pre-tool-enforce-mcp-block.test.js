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

describe('MCP Write Operation Block (Enforcement 6)', () => {
  it('blocks mcp__supabase__apply_migration', () => {
    const r = runHook('mcp__supabase__apply_migration', { name: 'test_migration', query: 'CREATE TABLE foo (id int);' });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('MCP WRITE BLOCK');
  });

  it('allows mcp__supabase__execute_sql (read-only)', () => {
    const r = runHook('mcp__supabase__execute_sql', { query: 'SELECT 1' });
    expect(r.exitCode).toBe(0);
  });

  it('allows mcp__supabase__list_tables (read-only)', () => {
    const r = runHook('mcp__supabase__list_tables', {});
    expect(r.exitCode).toBe(0);
  });
});
