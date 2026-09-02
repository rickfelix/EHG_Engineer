/**
 * SD-LEO-FIX-TEST-FIXTURE-LANE-001 -- FR-5/TS-6: ratchet on the committed dangerous-file manifest
 * (scripts/lint/one-off-mutate-key-manifest.json). The manifest itself can only ever WIDEN what
 * ENF-18 allows (see generate-one-off-mutate-key-manifest.mjs's manifest-drift workflow for
 * staleness), so this is the companion control on the other axis: it fails loud the moment the
 * dangerous set grows past a literal, committed ceiling, forcing a deliberate bump of RATCHET_MAX
 * in this file (a reviewable diff) rather than a silent creep in unguarded, key-holding, mutating
 * one-off scripts.
 *
 * RATCHET_MAX is the dangerous_count measured by the manifest generator during this SD's own EXEC
 * phase (2026-09-02, see metadata.corpus_correction_final on the SD row) -- all 45 already tracked
 * in the pre-existing require-main-guard-in-one-off-allowlist.json. Bumping it up requires a
 * reason in the same PR; bumping it down (after a retrofit) is always welcome.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.resolve(__dirname, '../../../scripts/lint/one-off-mutate-key-manifest.json');
const REPO_ROOT = path.resolve(__dirname, '../../..');

const RATCHET_MAX = 45;

function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

describe('one-off-mutate-key-manifest.json ratchet', () => {
  it(`the dangerous set has not grown past the committed ceiling (${RATCHET_MAX})`, () => {
    const manifest = loadManifest();
    const count = Object.keys(manifest.dangerous).length;
    expect(count).toBeLessThanOrEqual(RATCHET_MAX);
  });

  it('dangerous_count matches the actual number of dangerous entries (no hand-edit drift)', () => {
    const manifest = loadManifest();
    expect(manifest.dangerous_count).toBe(Object.keys(manifest.dangerous).length);
  });

  it('every manifest key exists on disk with a non-empty reason', () => {
    const manifest = loadManifest();
    for (const [relPath, entry] of Object.entries(manifest.dangerous)) {
      expect(existsSync(path.resolve(REPO_ROOT, relPath)), `${relPath} does not exist on disk`).toBe(true);
      expect(typeof entry.reason).toBe('string');
      expect(entry.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it('every manifest key points inside scripts/one-off/', () => {
    const manifest = loadManifest();
    for (const relPath of Object.keys(manifest.dangerous)) {
      expect(relPath.startsWith('scripts/one-off/')).toBe(true);
    }
  });
});
