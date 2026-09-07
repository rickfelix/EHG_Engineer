/**
 * SD-LEO-INFRA-REPAIR-DECAYED-EHG-001 (FR-1) -- resolveEnvTestPath, the shared git-common-dir
 * resolver for '.env.test' (real e2e credentials, gitignored, lives only at the main repo
 * root). Exercised against the REAL repo (this test itself runs inside it), since the function
 * shells out to `git rev-parse` with no injectable seam -- mirrors the live-repo verification
 * style already used for this module (RCA-verified against this exact repo).
 */
import { describe, it, expect } from 'vitest';
import { resolveEnvTestPath } from '../../tests/e2e/setup/resolve-env-test-path.js';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

describe('resolveEnvTestPath', () => {
  it('resolves to the main repo root\'s .env.test when git-common-dir resolves and the file exists there', () => {
    const commonDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
    const expected = join(dirname(commonDir), '.env.test');
    const result = resolveEnvTestPath();
    if (existsSync(expected)) {
      expect(result).toBe(expected);
    } else {
      // This machine's main repo root genuinely has no .env.test (e.g. a fresh CI clone) --
      // the honest fallback is the bare relative filename, not a fabricated path.
      expect(result).toBe('.env.test');
    }
  });

  it('accepts an explicit fileName and resolves it the same way (.env.test.local support)', () => {
    const result = resolveEnvTestPath('.env.test.local');
    // Whatever it resolves to, it must end with the requested filename, never silently
    // substitute a different one.
    expect(result.endsWith('.env.test.local')).toBe(true);
  });

  it('falls back to the bare relative filename, never throwing, when given a nonsense filename', () => {
    expect(() => resolveEnvTestPath('.this-file-does-not-exist-anywhere.test')).not.toThrow();
    expect(resolveEnvTestPath('.this-file-does-not-exist-anywhere.test')).toBe('.this-file-does-not-exist-anywhere.test');
  });
});
