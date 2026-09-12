/**
 * QF-20260912-825: complete-quick-fix's orchestrator.js resolved the completion test
 * directory via a raw case-sensitive `REPO_PATHS[targetApplication]` bracket lookup
 * instead of the canonical `resolveRepoPath()` normalizer (lib/repo-paths.js), which
 * lowercases + strips non-alphanumeric via normalizeAppName so callers never need an
 * exact-case match.
 *
 * MEASURED 2026-09-12: QF-20260912-235 had quick_fixes.target_application stored as the
 * lowercase 'ehg_engineer' (not the registry's exact-cased 'EHG_Engineer'). The bracket
 * lookup missed, silently fell back to EHG_ROOT (the OTHER repo, 'ehg'), and testDir
 * pointed at the wrong checkout.
 *
 * Lint-style regression tripwire (same pattern as complete-quick-fix-no-which-probe.test.js):
 * orchestrator.js must resolve testDir via resolveRepoPath(), never a direct REPO_PATHS[...]
 * bracket lookup.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRepoPath, ENGINEER_ROOT } from '../../../lib/repo-paths.js';

const ORCHESTRATOR_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/modules/complete-quick-fix/orchestrator.js'
);

describe('complete-quick-fix orchestrator — test dir resolution (QF-20260912-825)', () => {
  it('resolves testDir via resolveRepoPath(), never a raw REPO_PATHS[...] bracket lookup', () => {
    const src = readFileSync(ORCHESTRATOR_PATH, 'utf8');
    expect(src).toMatch(/testDir\s*=\s*resolveRepoPath\(targetApplication\)/);
    // Matches the buggy assignment shape, not this file's own explanatory prose.
    expect(src).not.toMatch(/=\s*REPO_PATHS\[targetApplication\]/);
  });

  it('a lowercase/underscore target_application variant resolves to EHG_Engineer, not the ehg venture root', () => {
    // This is the exact shape measured live: quick_fixes.target_application stored as
    // 'ehg_engineer' rather than the registry's exact-cased 'EHG_Engineer'.
    expect(resolveRepoPath('ehg_engineer')).toBe(ENGINEER_ROOT);
    expect(resolveRepoPath('ehg_engineer')).not.toBe(resolveRepoPath('ehg'));
  });
});
