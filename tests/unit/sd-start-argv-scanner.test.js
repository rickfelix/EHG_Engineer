/**
 * Unit tests for sd-start.js argv flag-stripping scanner.
 * QF-20260511-069 / PAT-CLI-ARGV-POSITIONAL-FLAG-COLLISION-001
 *
 * Pins the argv scanner so the bare `process.argv[2]` reader cannot silently
 * regress. The scanner skips zero-arity flags (`--parent`, `--confirm`, etc.)
 * and value-arity flag pairs (`--child <X>`, `--override-cadence-gate <Y>`,
 * `--pattern-id <Z>`, `--followup-sd-key <W>`) before picking the first
 * remaining positional as the SD identifier.
 *
 * Symptom before fix: `node sd-start.js --parent SD-X` made sdId='--parent',
 * triggering PostgREST PGRST116 from getSDDetails(...).single() over zero
 * rows.
 *
 * Behavior tests mirror the scanner inline (pure function, no Supabase / no
 * spawn). Static-pin tests load the real source file and assert the scanner
 * is wired in main() — guarding against accidental regression to the bare
 * `process.argv[2]` reader.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SD_START_PATH = path.join(__dirname, '..', '..', 'scripts', 'sd-start.js');

/**
 * Mirrors the scanner predicate in scripts/sd-start.js main() (lines ~593-613).
 * Returns the first non-flag positional argument from argv, treating
 * VALUE_FLAGS as taking one value (which must also be skipped).
 */
function pickSdIdFromArgv(argv) {
  const VALUE_FLAGS = new Set([
    '--child',
    '--override-cadence-gate',
    '--pattern-id',
    '--followup-sd-key',
  ]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_FLAGS.has(a)) { i++; continue; }
    if (a.startsWith('--')) continue;
    return a;
  }
  return null;
}

describe('sd-start argv flag-stripping scanner (behavior)', () => {
  it('extracts SD id when --parent precedes it (the failing case)', () => {
    expect(pickSdIdFromArgv(['--parent', 'SD-EVA-SUPPORT-CLI-SKILL-ORCH-001']))
      .toBe('SD-EVA-SUPPORT-CLI-SKILL-ORCH-001');
  });

  it('extracts SD id when it precedes --parent (workaround path stays valid)', () => {
    expect(pickSdIdFromArgv(['SD-EVA-SUPPORT-CLI-SKILL-ORCH-001', '--parent']))
      .toBe('SD-EVA-SUPPORT-CLI-SKILL-ORCH-001');
  });

  it('skips both --child and its value when picking the positional', () => {
    expect(pickSdIdFromArgv(['--child', 'SD-CHILD-X', 'SD-PARENT-Y']))
      .toBe('SD-PARENT-Y');
  });

  it('skips --override-cadence-gate value-arity flag pair', () => {
    const argv = ['--override-cadence-gate', 'reason string here >=20 chars', 'SD-OVR-001'];
    expect(pickSdIdFromArgv(argv)).toBe('SD-OVR-001');
  });

  it('skips --pattern-id and --followup-sd-key value-arity pairs', () => {
    const argv = ['--pattern-id', 'PAT-X-001', '--followup-sd-key', 'SD-OTHER-A', 'SD-MAIN-Y'];
    expect(pickSdIdFromArgv(argv)).toBe('SD-MAIN-Y');
  });

  it('returns null when only flags are present', () => {
    expect(pickSdIdFromArgv(['--parent', '--confirm'])).toBe(null);
  });

  it('returns null on empty argv (existing usage-error path is preserved)', () => {
    expect(pickSdIdFromArgv([])).toBe(null);
  });

  it('handles --parent SD --confirm (all three positions correctly)', () => {
    expect(pickSdIdFromArgv(['--parent', 'SD-X-001', '--confirm'])).toBe('SD-X-001');
  });

  it('handles --force and --fallback as zero-arity flags', () => {
    expect(pickSdIdFromArgv(['--force', '--fallback', 'SD-FORCE-001']))
      .toBe('SD-FORCE-001');
  });
});

describe('sd-start argv scanner (static-pin against source)', () => {
  const SOURCE = fs.readFileSync(SD_START_PATH, 'utf8');

  it('contains the QF-20260511-069 scanner anchor in source', () => {
    expect(SOURCE).toMatch(/QF-20260511-069/);
    expect(SOURCE).toMatch(/PAT-CLI-ARGV-POSITIONAL-FLAG-COLLISION-001/);
  });

  it('declares VALUE_FLAGS Set including --child and --override-cadence-gate', () => {
    // Locate the VALUE_FLAGS declaration in main() and assert all 4 entries.
    const valueFlagsBlock = SOURCE.match(/const VALUE_FLAGS = new Set\(\[[\s\S]*?\]\);/);
    expect(valueFlagsBlock).not.toBeNull();
    expect(valueFlagsBlock[0]).toMatch(/'--child'/);
    expect(valueFlagsBlock[0]).toMatch(/'--override-cadence-gate'/);
    expect(valueFlagsBlock[0]).toMatch(/'--pattern-id'/);
    expect(valueFlagsBlock[0]).toMatch(/'--followup-sd-key'/);
  });

  it('does NOT contain the bare `const sdId = process.argv[2]` regression', () => {
    // The exact pattern that produced PGRST116 must stay gone.
    // Whitespace-tolerant but exact otherwise.
    expect(SOURCE).not.toMatch(/const\s+sdId\s*=\s*process\.argv\[2\]\s*;/);
  });

  it('wires the scanner inside async function main', () => {
    // Anchor: the scanner loop must appear after `async function main(` and
    // before the usage-error block ("Error: SD ID required").
    const mainStart = SOURCE.indexOf('async function main(');
    expect(mainStart).toBeGreaterThan(0);
    const usageError = SOURCE.indexOf('Error: SD ID required', mainStart);
    expect(usageError).toBeGreaterThan(mainStart);
    const slice = SOURCE.slice(mainStart, usageError);
    expect(slice).toMatch(/for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*argv\.length/);
    expect(slice).toMatch(/a\.startsWith\(['"]--['"]\)/);
  });
});
