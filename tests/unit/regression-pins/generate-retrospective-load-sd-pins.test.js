// Feedback e402e5c4 — static-guard regression pins.
//
// Pins scripts/generate-retrospective.js to the canonical resolveSdInput
// helper. Before this fix, the CLI did .eq('id', sdId).single() and rejected
// sd_key inputs with 'SD not found' even though the usage line advertised
// <SD_UUID>, breaking parity with handoff.js and other LEO entry points.
//
// Same class as the SD-LEO-REFAC-CONSOLIDATE-KEY-RESOLUTION-001 sweep — this
// callsite was missed because the script reads only via direct DB UUID rather
// than going through a shared helper.
//
// These pins read the source file as a string (no module load) and assert
// that the migration stays in place.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');

function read(rel) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

describe('feedback-e402e5c4 generate-retrospective canonical resolver pins', () => {
  it('imports resolveSdInput from scripts/lib/sd-id-resolver', () => {
    const src = read('scripts/generate-retrospective.js');
    expect(src).toMatch(
      /import\s*\{[^}]*\bresolveSdInput\b[^}]*\}\s*from\s*['"][^'"]*lib\/sd-id-resolver(?:\.js)?['"]/
    );
  });

  it('generateRetrospective body calls resolveSdInput(sdInput, supabase)', () => {
    const src = read('scripts/generate-retrospective.js');
    const start = src.indexOf('async function generateRetrospective(');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, start + 2000);
    expect(body).toMatch(/\bresolveSdInput\s*\(\s*sdInput\s*,\s*supabase\s*\)/);
  });

  it('generateRetrospective body does NOT contain the legacy .eq(\'id\', sdId) fetch', () => {
    const src = read('scripts/generate-retrospective.js');
    const start = src.indexOf('async function generateRetrospective(');
    // Bound to the initial-fetch region (first ~600 chars of body covers the SD lookup).
    const head = src.slice(start, start + 600);
    expect(head).not.toMatch(/\.eq\(\s*['"]id['"]\s*,\s*sdId\s*\)/);
  });

  it('CLI usage advertises both UUID and SD_KEY shapes', () => {
    const src = read('scripts/generate-retrospective.js');
    expect(src).toMatch(/Usage:.*<SD_UUID\|SD_KEY>/);
  });
});
