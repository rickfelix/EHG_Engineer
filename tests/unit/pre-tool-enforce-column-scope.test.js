/**
 * QF-20260609-547: pre-tool-enforce.cjs column-validation scan must (1) NOT descend into jsonb-array
 * inner objects and (2) scope columns to the nearest preceding .from() in a multi-table command.
 * Both previously false-blocked valid commands (forcing write-to-file / split-command workarounds).
 *
 * Behavioral tests: run the hook as a subprocess (matching real PreToolUse usage + the existing
 * pre-tool-enforce-schema.test.js). DB-backed (the schema-preflight queries real columns).
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

const hookPath = path.resolve('scripts/hooks/pre-tool-enforce.cjs');

function runHook(toolName, toolInput, options = {}) {
  const env = { ...process.env, CLAUDE_TOOL_NAME: toolName, CLAUDE_TOOL_INPUT: JSON.stringify(toolInput) };
  try {
    const stdout = execSync(`node "${hookPath}"`, { env, timeout: options.timeout || 15000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    return { exitCode: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

describe('QF-20260609-547: column-scope / jsonb-descent fixes', () => {
  // Defect 1: a jsonb-array column value's INNER keys must NOT be treated as table columns.
  it('does NOT flag jsonb-array inner keys (success_metrics: [{metric,target,...}]) as unknown columns', () => {
    const result = runHook('Bash', {
      command: "node scripts/test.js && supabase.from('strategic_directives_v2').update({ success_metrics: [{ metric: 'x', target: 'y', acceptance: 'z' }] })",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('metric');
    expect(result.stdout).not.toContain('Unknown column');
  });

  // Defect 2: columns scoped to their own .from() table in a compound two-table command.
  it('scopes columns to the nearest preceding .from() (no cross-table mis-attribution)', () => {
    const result = runHook('Bash', {
      command: "node scripts/test.js && supabase.from('strategic_directives_v2').select('sd_key') && supabase.from('product_requirements_v2').select('directive_id')",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('Unknown column');
  });

  // Regression: a genuinely-unknown column is STILL flagged (the fix did not disable validation).
  it('still flags a genuinely-unknown column (advisory)', () => {
    const result = runHook('Bash', {
      command: "node scripts/test.js && supabase.from('strategic_directives_v2').eq('definitely_fake_col_xyz', 'x')",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Unknown column');
    expect(result.stdout).toContain('definitely_fake_col_xyz');
  });

  // Regression: blocking tier still blocks a bad column through the refactored per-segment loop.
  it('still BLOCKS a genuinely-unknown column in blocking tier', () => {
    const result = runHook('Bash', {
      command: "node scripts/handoff.js execute LEAD-TO-PLAN SD-TEST && supabase.from('strategic_directives_v2').eq('fake_col_blocking', 'x')",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('SCHEMA VALIDATION FAILED');
  });

  // Regression: a real top-level mutation column is still extracted + validated (no false pass).
  it('still flags an unknown TOP-LEVEL mutation column (inner jsonb keys excluded)', () => {
    const result = runHook('Bash', {
      command: "node scripts/test.js && supabase.from('strategic_directives_v2').update({ fake_top_level_col: 'v', success_metrics: [{ metric: 'm' }] })",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Unknown column');
    expect(result.stdout).toContain('fake_top_level_col');
    expect(result.stdout).not.toContain('metric');
  });
});
