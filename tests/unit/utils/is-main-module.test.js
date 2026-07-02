/**
 * SD-LEO-INFRA-ISMAINMODULE-WINDOWS-GUARD-CLASSFIX-001-A (FR-1/FR-2).
 * The raw `import.meta.url === \`file://${process.argv[1]}\`` guard never matches on
 * Windows (backslash paths, no percent-encoding) — isMainModule() uses pathToFileURL
 * instead, which is what previously had zero dedicated unit coverage.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { pathToFileURL } from 'node:url';
import { isMainModule } from '../../../lib/utils/is-main-module.js';

describe('isMainModule', () => {
  const originalArgv1 = process.argv[1];

  afterEach(() => {
    process.argv[1] = originalArgv1;
  });

  it('detects a Windows backslash-path argv[1] as the main module (the bug this SD fixes)', () => {
    process.argv[1] = 'C:\\repo\\scripts\\foo.mjs';
    const url = pathToFileURL(process.argv[1]).href;
    expect(isMainModule(url)).toBe(true);
    // the raw broken pattern this helper replaces would have failed here:
    expect(url === `file://${process.argv[1]}`).toBe(false);
  });

  it('detects a Unix-path argv[1] as the main module', () => {
    process.argv[1] = '/repo/scripts/foo.mjs';
    const url = pathToFileURL(process.argv[1]).href;
    expect(isMainModule(url)).toBe(true);
  });

  it('returns false when importMetaUrl does not match argv[1]', () => {
    process.argv[1] = '/repo/scripts/foo.mjs';
    expect(isMainModule('file:///repo/scripts/other.mjs')).toBe(false);
  });

  beforeEach(() => {
    process.argv[1] = originalArgv1;
  });

  it('returns false defensively when argv[1] is missing', () => {
    process.argv[1] = undefined;
    expect(isMainModule('file:///anything.mjs')).toBe(false);
  });

  it('handles a path with spaces correctly (manual string-replace normalization would mis-encode this)', () => {
    process.argv[1] = 'C:\\Program Files\\repo\\foo.mjs';
    const url = pathToFileURL(process.argv[1]).href;
    expect(isMainModule(url)).toBe(true);
  });
});
