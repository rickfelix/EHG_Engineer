import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync } from 'fs';

const HOOK_PATH = resolve(process.cwd(), 'scripts/hooks/pre-tool-enforce.cjs');

/**
 * Run the hook with specific env vars and return the exit code + stderr.
 */
function runHook(toolName, toolInput) {
  try {
    const result = execSync(`node "${HOOK_PATH}"`, {
      env: {
        ...process.env,
        CLAUDE_TOOL_NAME: toolName,
        CLAUDE_TOOL_INPUT: JSON.stringify(toolInput),
      },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    return { exitCode: 0, stdout: result, stderr: '' };
  } catch (err) {
    return {
      exitCode: err.status || 1,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
    };
  }
}

describe('DB-Only Strategic Artifacts Enforcement (Enforcement 5)', () => {
  const testDir = resolve(process.cwd(), 'docs/plans');
  const testFile = resolve(testDir, '__test-existing.md');

  beforeEach(() => {
    // Create a temporary existing file for "allow existing file" tests
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    writeFileSync(testFile, '# Test existing file\n');
  });

  afterEach(() => {
    if (existsSync(testFile)) unlinkSync(testFile);
  });

  it('blocks Write to NEW docs/plans/*.md file', () => {
    const result = runHook('Write', {
      file_path: resolve(testDir, 'brand-new-vision.md'),
      content: '# New Vision',
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('DB-ONLY ENFORCEMENT');
    expect(result.stderr).toContain('vision-command.mjs');
  });

  it('allows Write to EXISTING docs/plans/*.md file', () => {
    const result = runHook('Write', {
      file_path: testFile,
      content: '# Updated content',
    });
    expect(result.exitCode).toBe(0);
  });

  it('allows Write to docs/plans/archived/*.md', () => {
    const archivedDir = resolve(testDir, 'archived');
    if (!existsSync(archivedDir)) mkdirSync(archivedDir, { recursive: true });
    const result = runHook('Write', {
      file_path: resolve(archivedDir, 'old-vision.md'),
      content: '# Archived',
    });
    expect(result.exitCode).toBe(0);
  });

  it('blocks Write to NEW brainstorm/*.md file', () => {
    const result = runHook('Write', {
      file_path: resolve(process.cwd(), 'brainstorm/brand-new-brainstorm.md'),
      content: '# New brainstorm',
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('DB-ONLY ENFORCEMENT');
    expect(result.stderr).toContain('brainstorm_sessions');
  });

  it('allows Read tool on docs/plans/ (not intercepted)', () => {
    const result = runHook('Read', {
      file_path: resolve(testDir, 'any-file.md'),
    });
    expect(result.exitCode).toBe(0);
  });

  it('allows Write to non-.md files in docs/plans/', () => {
    const result = runHook('Write', {
      file_path: resolve(testDir, 'new-file.json'),
      content: '{}',
    });
    expect(result.exitCode).toBe(0);
  });

  it('allows Edit tool on docs/plans/*.md (only works on existing)', () => {
    const result = runHook('Edit', {
      file_path: testFile,
      old_string: '# Test',
      new_string: '# Updated',
    });
    expect(result.exitCode).toBe(0);
  });
});
