/**
 * SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-5.
 * TS-8: refuses autonomous execution on all charter path classes, on both '/' and '\' separators.
 * TS-9: does not false-positive on adversarial docs/migrations-guide.md and lib/authors/**.
 */
import { describe, it, expect } from 'vitest';
import {
  isSensitivePath,
  scanForSensitivePaths,
  evaluateQfEligibilityPreflight,
  SENSITIVE_PATH_PATTERNS
} from '../../lib/quick-fix/sensitive-path-registry.js';

describe('isSensitivePath — TS-8: must-refuse fixtures, forward-slash', () => {
  const mustRefuse = [
    'database/migrations/20260101_add_column.sql',
    'scripts/modules/handoff/executors/exec-to-plan/gates/rca-gate.js',
    'config/security-policy.json',
    '.claude/hooks/pre-tool-enforce.cjs',
    'scripts/hooks/pre-tool-enforce.cjs',
    'lib/rca/lifecycle-history/tracker.js',
    'lib/secrets-manager.js',
    '.env.production',
    'scripts/publish/release.js',
    'scripts/deploy/rollout.js',
    '.github/workflows/ci.yml',
    'database/chairman-gated/20260819_anon_truncate_sweep.sql'
  ];

  it.each(mustRefuse)('refuses %s', (file) => {
    expect(isSensitivePath(file)).toBe(true);
  });
});

describe('isSensitivePath — TS-8: same fixtures, Windows backslash separators', () => {
  const mustRefuseWindows = [
    'database\\migrations\\20260101_add_column.sql',
    'scripts\\modules\\handoff\\executors\\exec-to-plan\\gates\\rca-gate.js',
    '.claude\\hooks\\pre-tool-enforce.cjs',
    'scripts\\hooks\\pre-tool-enforce.cjs',
    'database\\chairman-gated\\20260819_anon_truncate_sweep.sql'
  ];

  it.each(mustRefuseWindows)('refuses %s (backslash-normalized)', (file) => {
    expect(isSensitivePath(file)).toBe(true);
  });
});

describe('isSensitivePath — SEC-01 (EXEC-phase SECURITY evidence 59bc9c16): git-enforced hooks root', () => {
  // core.hooksPath=.husky/_ in this repo — the ACTUAL git-invoked hooks path, distinct from
  // the .claude/hooks/** and scripts/hooks/** conventions already covered. Pre-fix, a QF
  // modifying .husky/pre-commit passed the preflight and could be autonomously merged.
  const mustRefuse = [
    '.husky/pre-commit',
    '.husky/_/husky.sh',
    '.githooks/pre-push',
    'hooks/wrappers/lint.sh',
    'lib/hooks/pre-tool-enforce.cjs'
  ];

  it.each(mustRefuse)('refuses %s', (file) => {
    expect(isSensitivePath(file)).toBe(true);
  });
});

describe('isSensitivePath — SEC-02 (EXEC-phase SECURITY evidence 59bc9c16): case-insensitive matching', () => {
  // Pre-fix, minimatch ran without {nocase:true}; a tracked file with different casing than
  // the glob's literal segment (e.g. docs/SECRETS-SETUP-CHECKLIST.txt vs **/*secret*) silently
  // evaded the blocklist on this win32 repo's case-insensitive working tree.
  it('refuses a differently-cased secret-named file', () => {
    expect(isSensitivePath('docs/SECRETS-SETUP-CHECKLIST.txt')).toBe(true);
    expect(isSensitivePath('DATABASE/MIGRATIONS/x.sql')).toBe(true);
  });
});

describe('isSensitivePath — TS-9: adversarial false-positive traps must NOT refuse', () => {
  const mustNotRefuse = [
    'docs/migrations-guide.md',
    'lib/authors/utils.js',
    'lib/authors/index.js',
    'src/components/PolicyBadge.tsx', // "policy" substring but not config/*policy* or **/policy/**
    'README.md',
    'scripts/one-off/_enrich-something.mjs'
  ];

  it.each(mustNotRefuse)('does not refuse %s', (file) => {
    expect(isSensitivePath(file)).toBe(false);
  });
});

describe('isSensitivePath — TS-9 addendum: .env template files are NOT secrets (C5 fix)', () => {
  const templates = ['.env.example', '.env.sample', '.env.template', 'config/.env.example'];

  it.each(templates)('does not refuse %s', (file) => {
    expect(isSensitivePath(file)).toBe(false);
  });

  it('still refuses a real .env file', () => {
    expect(isSensitivePath('.env')).toBe(true);
    expect(isSensitivePath('.env.production')).toBe(true);
  });
});

describe('isSensitivePath — defensive edges', () => {
  it('returns false for empty/null/non-string input', () => {
    expect(isSensitivePath('')).toBe(false);
    expect(isSensitivePath(null)).toBe(false);
    expect(isSensitivePath(undefined)).toBe(false);
  });
});

describe('scanForSensitivePaths', () => {
  it('splits a mixed file list into sensitive and clean', () => {
    const result = scanForSensitivePaths([
      'database/migrations/x.sql',
      'docs/migrations-guide.md',
      'src/components/Button.tsx'
    ]);
    expect(result.sensitive).toEqual(['database/migrations/x.sql']);
    expect(result.clean).toEqual(['docs/migrations-guide.md', 'src/components/Button.tsx']);
  });
});

describe('evaluateQfEligibilityPreflight', () => {
  it('refuses when the diff touches a sensitive path, recording the diff-source tier', () => {
    const result = evaluateQfEligibilityPreflight({
      filesChanged: ['database/migrations/x.sql', 'src/index.js'],
      diffSourceTier: 'branch-diff'
    });
    expect(result.refused).toBe(true);
    expect(result.sensitiveFiles).toEqual(['database/migrations/x.sql']);
    expect(result.diffSourceTier).toBe('branch-diff');
    expect(result.reason).toContain('database/migrations/x.sql');
    expect(result.reason).toContain('branch-diff');
  });

  it('records working-tree-fallback as the tier when that is what produced the diff', () => {
    const result = evaluateQfEligibilityPreflight({
      filesChanged: ['.claude/hooks/foo.cjs'],
      diffSourceTier: 'working-tree-fallback'
    });
    expect(result.refused).toBe(true);
    expect(result.diffSourceTier).toBe('working-tree-fallback');
    expect(result.reason).toContain('working-tree-fallback');
  });

  it('does not refuse a benign diff', () => {
    const result = evaluateQfEligibilityPreflight({
      filesChanged: ['src/components/Button.tsx', 'docs/migrations-guide.md'],
      diffSourceTier: 'branch-diff'
    });
    expect(result.refused).toBe(false);
    expect(result.sensitiveFiles).toEqual([]);
    expect(result.reason).toBeNull();
  });

  it('handles an empty file list without refusing', () => {
    const result = evaluateQfEligibilityPreflight({ filesChanged: [] });
    expect(result.refused).toBe(false);
  });

  it('SENSITIVE_PATH_PATTERNS covers all 8 named classes (migrations, gate-criteria, policy, hooks x2, lifecycle-history, secrets, publish/deploy, chairman-gated)', () => {
    expect(SENSITIVE_PATH_PATTERNS.length).toBeGreaterThanOrEqual(14);
  });
});
