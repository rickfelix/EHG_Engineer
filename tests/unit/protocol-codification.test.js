/**
 * Static-source-code regression tests for SD-LEO-INFRA-CODIFY-PROTOCOL-RULES-001.
 *
 * Pins the 3 protocol rules into the regenerated CLAUDE_*.md files. Tests assume
 * scripts/generate-claude-md-from-db.js has already been run; they do NOT spawn
 * regen, vitest stays cheap and deterministic.
 *
 * Mutation contract: removing the corresponding section from CLAUDE_LEAD/PLAN/EXEC.md
 * MUST fail the matching test; restoring (re-running regen) MUST make it pass.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function readClaudeFile(name) {
  const fp = path.join(REPO_ROOT, name);
  return fs.readFileSync(fp, 'utf8');
}

describe('Protocol codification (SD-LEO-INFRA-CODIFY-PROTOCOL-RULES-001)', () => {
  it('CLAUDE_LEAD.md contains the testing-agent prospective LEAD cadence rule', () => {
    const md = readClaudeFile('CLAUDE_LEAD.md');
    expect(md).toMatch(/^## Default Sub-Agent Invocation Cadence for Harness-Fix SDs\b/m);
    expect(md).toMatch(/before PRD authoring/);
  });

  it('CLAUDE_PLAN.md contains the substring-redundancy keyword audit rule', () => {
    const md = readClaudeFile('CLAUDE_PLAN.md');
    expect(md).toMatch(/^## Substring-Redundancy Audit for Keyword-List Expansions\b/m);
    expect(md).toMatch(/keyword.*substring/i);
  });

  it('CLAUDE_EXEC.md contains the atomic INSERT writer/consumer pattern rule', () => {
    const md = readClaudeFile('CLAUDE_EXEC.md');
    expect(md).toMatch(/^## Atomic INSERT Pattern for Writer\/Consumer Asymmetry Fixes\b/m);
    expect(md).toMatch(/writer.consumer/i);
  });
});
