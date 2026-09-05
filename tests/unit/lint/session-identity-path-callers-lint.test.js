/**
 * SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001 (FR-4) — advisory lint: a module that
 * mentions the .claude/session-identity marker path without importing anything from the SSOT
 * (lib/fleet/cc-pid-liveness.cjs) is a candidate re-derivation of this SD's own root-cause bug.
 */
import { describe, it, expect } from 'vitest';
import { referencesSessionIdentityPathWithoutSsot } from '../../../scripts/lint/session-identity-path-callers-lint.mjs';

describe('referencesSessionIdentityPathWithoutSsot', () => {
  it('FIRES on a file that derives the marker path itself with no SSOT import', () => {
    const src = `
      import path from 'node:path';
      export function markerDir() { return path.join(process.cwd(), '.claude', 'session-identity'); }
    `;
    expect(referencesSessionIdentityPathWithoutSsot(src, 'lib/some-module.js')).toBe(true);
  });

  it('PASSES a file that imports anything from cc-pid-liveness.cjs, even if it also names the path', () => {
    const src = `
      const { markerDirs } = require('../lib/fleet/cc-pid-liveness.cjs');
      // .claude/session-identity is the directory markerDirs() unions.
      console.log(markerDirs());
    `;
    expect(referencesSessionIdentityPathWithoutSsot(src, 'lib/some-module.js')).toBe(false);
  });

  it('PASSES a file that never mentions the session-identity path at all', () => {
    const src = 'export function unrelated() { return 1; }';
    expect(referencesSessionIdentityPathWithoutSsot(src, 'lib/some-module.js')).toBe(false);
  });

  it('a comment-only mention does not count (comments are blanked before matching)', () => {
    const src = '// this used to read .claude/session-identity directly, now delegates elsewhere\nexport const x = 1;';
    expect(referencesSessionIdentityPathWithoutSsot(src, 'lib/some-module.js')).toBe(false);
  });

  it('excludes the SSOT file itself and the canonical writer by path, even if flaggable text is present', () => {
    const src = "const dir = '.claude/session-identity';"; // no SSOT import — would otherwise fire
    expect(referencesSessionIdentityPathWithoutSsot(src, 'lib/fleet/cc-pid-liveness.cjs')).toBe(false);
    expect(referencesSessionIdentityPathWithoutSsot(src, 'scripts/hooks/capture-session-id.cjs')).toBe(false);
  });
});
