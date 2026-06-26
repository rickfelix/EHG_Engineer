/**
 * SD-LEO-FIX-GREEN-MAIN-TRIAGE-001 — quarantine manifest shape + config seam.
 *
 * The manifest (tests/quarantine-manifest.json) is the debt register for the
 * red unit-tier estate: nothing is excluded without a reason_class + linked_ref.
 * This test runs IN the unit tier (self-hosting) so a malformed manifest or a
 * drifted config seam turns the tier red again.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST_PATH = path.join(ROOT, 'tests', 'quarantine-manifest.json');

const REASON_CLASSES = new Set([
  'supabase-mock-chain',
  'assertion-drift',
  'windows-abort-0xC0000409',
  'timeout',
  'suite-load-error',
  'live-db-dependent',
  'duplicate',
  'unclassified',
  // Hand-maintained debt-register classes already present in the manifest.
  'test-setup-error',
  'real-finding-guard',
  'missing-fixture',
  'missing-db-function',
  'misclassified-e2e',
  'mock-gap',
  'missing-db-seed',
  'schema-drift',
  'process-exit-in-test',
  // SD-REFILL-00CO4E8Q: node:test files (valid under `node --test`, invisible to vitest) +
  // the two fixable singletons split out of suite-load-error.
  'node-test-runner',
  'stale-import-extension',
  'empty-suite',
  // SD-LEO-INFRA-CI-BASELINE-ROT-FIX-001: tests that pass in isolation AND in a local full
  // suite but fail under CI's parallel worker order — environment/order-dependent isolation
  // pollution (shared-state leak), not a code bug. Un-quarantine when the isolation-leak SD ships.
  'test-isolation-order-dependent',
]);

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

describe('quarantine-manifest shape (debt register integrity)', () => {
  it('manifest exists with a quarantined array', () => {
    expect(Array.isArray(manifest.quarantined)).toBe(true);
    expect(manifest.quarantined.length).toBeGreaterThan(0);
  });

  it('every entry has file, known reason_class, non-empty linked_ref, quarantined_at', () => {
    for (const e of manifest.quarantined) {
      expect(e.file, JSON.stringify(e)).toBeTruthy();
      expect(REASON_CLASSES.has(e.reason_class), `${e.file}: unknown reason_class '${e.reason_class}'`).toBe(true);
      expect(String(e.linked_ref || '').length, `${e.file}: missing linked_ref`).toBeGreaterThan(0);
      expect(Date.parse(e.quarantined_at), `${e.file}: bad quarantined_at`).not.toBeNaN();
    }
  });

  it('every quarantined file still exists on disk (deleted files must leave the manifest)', () => {
    const missing = manifest.quarantined.filter(e => !fs.existsSync(path.join(ROOT, e.file)));
    expect(missing.map(e => e.file)).toEqual([]);
  });

  it('no duplicate file entries', () => {
    const files = manifest.quarantined.map(e => e.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it('config seam: vitest.config.js consumes the manifest (QUARANTINE_EXCLUDE)', () => {
    const config = fs.readFileSync(path.join(ROOT, 'vitest.config.js'), 'utf8');
    expect(config).toContain('quarantine-manifest.json');
    expect(config).toContain('QUARANTINE_EXCLUDE');
    // The unit project's exclude must include the quarantine list.
    expect(config).toMatch(/exclude:\s*\[\.\.\.SHARED_EXCLUDE,\s*\.\.\.DB_INCLUDE,\s*\.\.\.QUARANTINE_EXCLUDE\]/);
  });

  it('this test file itself is not quarantined (self-hosting guard)', () => {
    expect(manifest.quarantined.some(e => e.file.includes('quarantine-manifest.test.js'))).toBe(false);
  });
});
