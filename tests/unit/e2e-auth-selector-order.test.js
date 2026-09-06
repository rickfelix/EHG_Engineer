/**
 * SD-LEO-INFRA-REPAIR-DECAYED-EHG-001 (FR-1) -- regression guard for the root cause found by
 * RCA (agent a108d1bf4de57683c): 'button:has-text("Sign In")' is TAG-based and ALSO matches a
 * Radix TabsTrigger tab labeled "Sign In" that precedes the real submit button in DOM order, so
 * putting it first in a selector list/array silently clicks a no-op tab instead of submitting
 * the login form. Live-verified fix: form/type-scoped selectors must be tried BEFORE the
 * ambiguous text-based ones in all three auth helpers. This test is static (reads the source
 * files as text) rather than a live browser test, so a future edit that reintroduces the
 * ambiguous selector at the front is caught cheaply, without needing a running app.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/**
 * Finds `declMarker` in `text`, then checks that `scopedNeedle` appears before
 * `ambiguousNeedle` within a bounded window after it. A precise "parse the array literal"
 * regex is defeated by entries like '[data-testid="signin-button"]' that contain their own
 * ']' -- a bounded-window substring check is simpler and robust to that.
 */
function assertScopedBeforeAmbiguous(text, declMarker, scopedNeedle, ambiguousNeedle) {
  const declIdx = text.indexOf(declMarker);
  expect(declIdx, `expected to find ${JSON.stringify(declMarker)} in the file`).toBeGreaterThanOrEqual(0);
  const window = text.slice(declIdx, declIdx + 500);
  const scopedIdx = window.indexOf(scopedNeedle);
  const ambiguousIdx = window.indexOf(ambiguousNeedle);
  expect(scopedIdx, `expected to find ${JSON.stringify(scopedNeedle)} near the declaration`).toBeGreaterThanOrEqual(0);
  expect(ambiguousIdx, `expected to find ${JSON.stringify(ambiguousNeedle)} near the declaration`).toBeGreaterThanOrEqual(0);
  expect(scopedIdx).toBeLessThan(ambiguousIdx);
}

describe('e2e auth helpers: form/type-scoped sign-in selectors precede ambiguous text-based ones', () => {
  it('tests/e2e/ehg-app/auth.setup.spec.ts SIGNIN_SELECTORS', () => {
    const src = readFileSync(path.join(REPO_ROOT, 'tests/e2e/ehg-app/auth.setup.spec.ts'), 'utf8');
    assertScopedBeforeAmbiguous(src, 'const SIGNIN_SELECTORS = [', 'button[type="submit"]', 'button:has-text("Sign In")');
  });

  it('tests/uat/setup/global-auth.js signInSelectors', () => {
    const src = readFileSync(path.join(REPO_ROOT, 'tests/uat/setup/global-auth.js'), 'utf8');
    assertScopedBeforeAmbiguous(src, 'const signInSelectors = [', 'button[type="submit"]', 'button:has-text("Sign In")');
  });

  it('tests/e2e/setup/global-auth.js signInButton selector', () => {
    const src = readFileSync(path.join(REPO_ROOT, 'tests/e2e/setup/global-auth.js'), 'utf8');
    assertScopedBeforeAmbiguous(src, 'const signInButton = page.locator(', 'button[type="submit"]', 'button:has-text("Sign In")');
  });
});

describe('.env.test resolves via the shared resolveEnvTestPath (git-common-dir), never a bare relative path', () => {
  it('resolve-env-test-path.js itself resolves via --git-common-dir', () => {
    const src = readFileSync(path.join(REPO_ROOT, 'tests/e2e/setup/resolve-env-test-path.js'), 'utf8');
    expect(src).toMatch(/--git-common-dir/);
    expect(src).toMatch(/export function resolveEnvTestPath/);
  });

  for (const [file, importPath] of [
    ['tests/e2e/ehg-app/auth.setup.spec.ts', '../setup/resolve-env-test-path.js'],
    ['tests/e2e/ehg-app/login.spec.ts', '../setup/resolve-env-test-path.js'],
    ['tests/uat/setup/global-auth.js', '../../e2e/setup/resolve-env-test-path.js'],
  ]) {
    it(`${file} imports resolveEnvTestPath rather than calling dotenv.config with a bare relative path`, () => {
      const src = readFileSync(path.join(REPO_ROOT, file), 'utf8');
      expect(src).not.toMatch(/dotenv\.config\(\{\s*path:\s*'\.env\.test'\s*\}\)/);
      expect(src).not.toMatch(/path\.resolve\(process\.cwd\(\),\s*'\.env\.test/);
      expect(src).toContain(importPath);
      expect(src).toMatch(/resolveEnvTestPath/);
    });
  }
});
