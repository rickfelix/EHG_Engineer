/**
 * Integration Tests: PreToolUse Hook Schema Validation
 * SD-LEO-ORCH-SELF-HEALING-DATABASE-001-C
 *
 * Tests the schema pre-flight validation integration in pre-tool-enforce.cjs.
 * Uses child_process.execSync to run the hook as a subprocess (matching real usage).
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

const hookPath = path.resolve('scripts/hooks/pre-tool-enforce.cjs');

function runHook(toolName, toolInput, options = {}) {
  const env = {
    ...process.env,
    CLAUDE_TOOL_NAME: toolName,
    CLAUDE_TOOL_INPUT: JSON.stringify(toolInput),
  };

  try {
    const stdout = execSync(`node "${hookPath}"`, {
      env,
      timeout: options.timeout || 15000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      exitCode: err.status,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
    };
  }
}

describe('pre-tool-enforce schema validation', () => {
  it('allows non-Supabase Bash commands without validation', () => {
    const result = runHook('Bash', { command: 'git status' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('schema-preflight');
  });

  it('allows valid Supabase operations (advisory tier)', () => {
    const result = runHook('Bash', {
      command: 'node scripts/test.js && supabase.from(\'strategic_directives_v2\').select(\'sd_key\').eq(\'status\', \'active\')',
    });
    expect(result.exitCode).toBe(0);
  });

  it('warns on unknown column in advisory tier', () => {
    const result = runHook('Bash', {
      command: 'node scripts/test.js && supabase.from(\'strategic_directives_v2\').eq(\'nonexistent_column\', \'x\')',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('schema-preflight');
    expect(result.stdout).toContain('Unknown column');
  });

  it('blocks unknown column in blocking tier (handoff script)', () => {
    const result = runHook('Bash', {
      command: 'node scripts/handoff.js execute LEAD-TO-PLAN SD-TEST && supabase.from(\'strategic_directives_v2\').eq(\'fake_col\', \'x\')',
    });
    // Should block (exit 2) or fail with assertion on Windows
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('SCHEMA VALIDATION FAILED');
  });

  it('blocks unknown column in blocking tier (migration path)', () => {
    const result = runHook('Bash', {
      command: 'node database/migrations/test.js && supabase.from(\'strategic_directives_v2\').eq(\'fake_col\', \'x\')',
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('SCHEMA VALIDATION FAILED');
  });

  it('skips validation when no columns are extractable', () => {
    const result = runHook('Bash', {
      command: 'supabase.from(\'strategic_directives_v2\').select(\'*\')',
    });
    expect(result.exitCode).toBe(0);
    // No warning because select('*') has no extractable column params
    expect(result.stdout).not.toContain('Unknown column');
  });

  it('preserves NC-006 background execution ban', () => {
    const result = runHook('Bash', {
      command: 'echo test',
      run_in_background: true,
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('NC-006');
  });

  it('preserves MCP write operation block', () => {
    const result = runHook('mcp__supabase__apply_migration', {});
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('MCP WRITE BLOCK');
  });

  it('allows non-Bash tools without schema validation', () => {
    const result = runHook('Read', { file_path: '/tmp/test.txt' });
    expect(result.exitCode).toBe(0);
  });

  // SD-D: Extended pattern extraction tests
  it('detects columns from .insert() pattern', () => {
    const result = runHook('Bash', {
      command: 'node scripts/test.js && supabase.from(\'strategic_directives_v2\').insert({ fake_insert_col: \'value\' })',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Unknown column');
    expect(result.stdout).toContain('fake_insert_col');
  });

  it('detects columns from .update() pattern', () => {
    const result = runHook('Bash', {
      command: 'node scripts/test.js && supabase.from(\'strategic_directives_v2\').update({ fake_update_col: 42 })',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Unknown column');
    expect(result.stdout).toContain('fake_update_col');
  });

  it('detects columns from .upsert() pattern', () => {
    const result = runHook('Bash', {
      command: 'node scripts/test.js && supabase.from(\'strategic_directives_v2\').upsert({ fake_upsert_col: true })',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Unknown column');
    expect(result.stdout).toContain('fake_upsert_col');
  });

  it('detects columns from .order() pattern', () => {
    const result = runHook('Bash', {
      command: 'node scripts/test.js && supabase.from(\'strategic_directives_v2\').select(\'*\').order(\'fake_order_col\')',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Unknown column');
    expect(result.stdout).toContain('fake_order_col');
  });

  it('detects columns from .in() pattern', () => {
    const result = runHook('Bash', {
      command: 'node scripts/test.js && supabase.from(\'strategic_directives_v2\').in(\'fake_in_col\', [\'a\', \'b\'])',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Unknown column');
    expect(result.stdout).toContain('fake_in_col');
  });

  it('allows valid columns in .insert() pattern', () => {
    const result = runHook('Bash', {
      command: 'node scripts/test.js && supabase.from(\'strategic_directives_v2\').insert({ title: \'test\', status: \'draft\' })',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('Unknown column');
  });

  it('detects columns from .neq() filter pattern', () => {
    const result = runHook('Bash', {
      command: 'node scripts/test.js && supabase.from(\'strategic_directives_v2\').neq(\'fake_neq_col\', \'x\')',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Unknown column');
  });

  it('detects columns from .gte() filter pattern', () => {
    const result = runHook('Bash', {
      command: 'node scripts/test.js && supabase.from(\'strategic_directives_v2\').gte(\'fake_gte_col\', 10)',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Unknown column');
  });
});
