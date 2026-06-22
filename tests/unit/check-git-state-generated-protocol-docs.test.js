/**
 * Regression: the handoff STEP-1 git-state check must not block on DB-generated protocol-doc
 * regen drift.
 *
 * SD-REFILL-00HKPG2F: CLAUDE*.md / *_DIGEST.md / claude-generation-manifest.json are
 * regenerated from leo_protocol_sections at session start and sit uncommitted on main, yet are
 * uncommittable there (no-direct-commit pre-commit hook) with no maintenance branch. That drift
 * tripped checkGitState (passed=false) for every worker, forcing a restore-to-HEAD that
 * re-introduces DB drift. Fix excludes them from the blocking classification (mirrors
 * isPerWorktreeMetadata / QF-20260529-729) without untracking them; DB-fidelity stays enforced
 * independently by scripts/check-claude-md-drift.cjs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { isGeneratedProtocolDoc } from '../../scripts/check-git-state.js';

const srcPath = fileURLToPath(new URL('../../scripts/check-git-state.js', import.meta.url));

describe('check-git-state exempts generated protocol-doc drift (SD-REFILL-00HKPG2F)', () => {
  it('matches the DB-generated protocol docs (FR-1)', () => {
    expect(isGeneratedProtocolDoc('CLAUDE.md')).toBe(true);
    expect(isGeneratedProtocolDoc('CLAUDE_CORE.md')).toBe(true);
    expect(isGeneratedProtocolDoc('CLAUDE_LEAD.md')).toBe(true);
    expect(isGeneratedProtocolDoc('CLAUDE_ADAM_DIGEST.md')).toBe(true);
    expect(isGeneratedProtocolDoc('CLAUDE_LEAD_DIGEST.md')).toBe(true);
    expect(isGeneratedProtocolDoc('CLAUDE_DIGEST.md')).toBe(true);
    expect(isGeneratedProtocolDoc('CLAUDE_COORDINATOR_DIGEST.md')).toBe(true);
    expect(isGeneratedProtocolDoc('claude-generation-manifest.json')).toBe(true);
  });

  it('matches on basename regardless of path prefix', () => {
    expect(isGeneratedProtocolDoc('./CLAUDE.md')).toBe(true);
    expect(isGeneratedProtocolDoc('some/nested/CLAUDE_PLAN.md')).toBe(true);
  });

  it('does NOT match authored / unrelated files (FR-1 narrowing)', () => {
    expect(isGeneratedProtocolDoc('README.md')).toBe(false);
    expect(isGeneratedProtocolDoc('CLAUDEX.md')).toBe(false);
    expect(isGeneratedProtocolDoc('docs/claude-helper.md')).toBe(false);
    expect(isGeneratedProtocolDoc('src/index.js')).toBe(false);
    expect(isGeneratedProtocolDoc('claude-generation-manifest.json.bak')).toBe(false);
    expect(isGeneratedProtocolDoc('')).toBe(false);
    expect(isGeneratedProtocolDoc(null)).toBe(false);
  });

  it('the classification loop is actually wired to skip generated docs (QF-888 dead-code lesson, FR-2)', () => {
    const src = readFileSync(srcPath, 'utf8');
    // skip wired into the porcelain loop, accumulating into the transparency array
    expect(src).toMatch(/if \(isGeneratedProtocolDoc\(file\)\) \{/);
    expect(src).toMatch(/result\.details\.exemptedGeneratedDocs\.push\(file\)/);
  });

  it('emits a non-blocking transparency warning, never failing the gate (FR-3)', () => {
    const src = readFileSync(srcPath, 'utf8');
    expect(src).toMatch(/GENERATED_DOC_DRIFT_EXEMPTED/);
    // the exempted-docs branch must not set passed=false
    const exemptBlock = src.slice(src.indexOf('exemptedGeneratedDocs.length > 0'));
    const warnBlock = exemptBlock.slice(0, exemptBlock.indexOf('console.log'));
    expect(warnBlock).not.toMatch(/passed = false/);
  });
});
