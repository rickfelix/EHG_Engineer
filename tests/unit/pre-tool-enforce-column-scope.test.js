/**
 * QF-20260609-547: pre-tool-enforce.cjs column-validation scan must (1) NOT descend into jsonb-array
 * inner objects and (2) scope columns to the nearest preceding .from() in a multi-table command.
 * Both previously false-blocked valid commands (forcing write-to-file / split-command workarounds).
 *
 * NOTE on test shape: the schema-preflight DB path (which emits "Unknown column" / blocks) is only
 * exercisable in CI — locally the hook subprocess fails-open with no schema output (the existing
 * pre-tool-enforce-schema.test.js's DB assertions also can't run here). So this suite verifies the
 * fix with assertions that hold WITHOUT the DB path: behavioral "no false-block" (exit 0) for the two
 * defect cases, plus source-pins proving the fix is in place and validation is NOT disabled.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const hookPath = path.resolve('scripts/hooks/pre-tool-enforce.cjs');
const hookSrc = fs.readFileSync(hookPath, 'utf8');

function runHook(toolInput) {
  const env = { ...process.env, CLAUDE_TOOL_NAME: 'Bash', CLAUDE_TOOL_INPUT: JSON.stringify(toolInput) };
  try {
    const stdout = execSync(`node "${hookPath}"`, { env, timeout: 15000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    return { exitCode: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

describe('QF-20260609-547: column-scope / jsonb-descent fixes', () => {
  // Behavioral: the two previously-false-blocking shapes must NOT block (exit 0, no false reject).
  it('does NOT false-block a jsonb-array column update (success_metrics: [{metric,...}])', () => {
    const result = runHook({
      command: "node scripts/test.js && supabase.from('strategic_directives_v2').update({ success_metrics: [{ metric: 'x', target: 'y', acceptance: 'z' }] })",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('SCHEMA VALIDATION FAILED');
    expect(result.stdout).not.toContain('metric'); // inner jsonb keys never surfaced as columns
  });

  it('does NOT false-block a compound two-table command (per-from scoping)', () => {
    const result = runHook({
      command: "node scripts/test.js && supabase.from('strategic_directives_v2').select('sd_key') && supabase.from('product_requirements_v2').select('directive_id')",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('SCHEMA VALIDATION FAILED');
  });

  // Source-pins (deterministic, no DB): the fix is present and validation is NOT disabled.
  it('defect 1: extracts only TOP-LEVEL mutation keys (balanced body + strip nested groups)', () => {
    expect(hookSrc).toMatch(/function balancedBody\(/);
    expect(hookSrc).toMatch(/function stripNestedGroups\(/);
    expect(hookSrc).toMatch(/stripNestedGroups\(balancedBody\(command, openIdx\)\)/);
    // the new top-of-object matcher replaced the old flat descending one
    expect(hookSrc).toContain('mutHeadPattern');
    expect(hookSrc).not.toContain('mutationPattern');
  });

  it('defect 2: segments by .from() and validates each segment against its own table', () => {
    expect(hookSrc).toMatch(/function extractTableSegments\(/);
    expect(hookSrc).toMatch(/const segments = extractTableSegments\(command\)/);
    expect(hookSrc).toMatch(/for \(const seg of segments\)/);
    expect(hookSrc).toMatch(/validateOperation\(seg\.table, 'query', params\)/);
  });

  it('regression: validation is NOT disabled (still calls validateOperation; still fail-open)', () => {
    expect(hookSrc).toMatch(/validateOperation/);
    expect(hookSrc).toMatch(/Fail-open: validation errors never block execution/);
  });
});
