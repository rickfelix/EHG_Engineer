import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';

const HOOK_PATH = resolve(process.cwd(), 'scripts/hooks/pre-tool-enforce.cjs');
const AGENT_DIR = resolve(process.cwd(), '.claude/agents');
const MOCK_AGENT = resolve(AGENT_DIR, '_test-restricted-agent.md');

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

describe('Tool Policy Profile Enforcement (Enforcement 2)', () => {
  beforeEach(() => {
    if (!existsSync(AGENT_DIR)) mkdirSync(AGENT_DIR, { recursive: true });
    writeFileSync(MOCK_AGENT,
      '---\nname: _test-restricted-agent\ndescription: "Test agent"\ntools: Read, Grep, Glob\n---\n# tool_policy_profile: readonly\n'
    );
  });

  afterEach(() => {
    if (existsSync(MOCK_AGENT)) unlinkSync(MOCK_AGENT);
  });

  it('exits 0 (advisory-only, non-blocking) when agent has restricted profile', () => {
    const r = runHook('Task', { subagent_type: '_test-restricted-agent', prompt: 'read some files' });
    expect(r.exitCode).toBe(0);
  });

  it('logs policy info to stdout for restricted agents', () => {
    const r = runHook('Task', { subagent_type: '_test-restricted-agent', prompt: 'check something' });
    expect(r.stdout).toMatch(/POLICY|profile/i);
  });
});
