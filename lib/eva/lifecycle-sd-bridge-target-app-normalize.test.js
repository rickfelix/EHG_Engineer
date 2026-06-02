import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SRC = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'lifecycle-sd-bridge.js'), 'utf8');

describe('lifecycle-sd-bridge target_application normalization (QF-20260504-716)', () => {
  it('declares the canonical-case map and normalize helper', () => {
    expect(SRC).toMatch(/TARGET_APP_CANONICAL\s*=\s*\{[^}]*'ehg'\s*:\s*'EHG'/);
    expect(SRC).toMatch(/function normalizeTargetApplication\s*\(/);
  });

  it('wraps every target_application write site (normalizeTargetApplication or resolveTreeTargetApplication)', () => {
    // QF-20260602-280: sprint-tree descendant write sites now route through
    // resolveTreeTargetApplication (which itself calls normalizeTargetApplication) so the
    // whole venture tree shares ONE casing; root/expand still call normalizeTargetApplication.
    const wrapped = (SRC.match(/(normalizeTargetApplication|resolveTreeTargetApplication)\(/g) || []).length;
    expect(wrapped).toBeGreaterThanOrEqual(6);
    // No RAW (unwrapped) call-style write: every `target_application: fn(` must use a wrapper.
    const callWrites = SRC.match(/target_application:\s*([A-Za-z_][A-Za-z0-9_]*)\(/g) || [];
    expect(callWrites.length).toBeGreaterThan(0);
    for (const w of callWrites) {
      expect(w).toMatch(/target_application:\s*(normalizeTargetApplication|resolveTreeTargetApplication)\(/);
    }
  });

  it('declares resolveTreeTargetApplication (QF-20260602-280 tree-casing helper)', () => {
    expect(SRC).toMatch(/function resolveTreeTargetApplication\s*\(/);
  });
});
