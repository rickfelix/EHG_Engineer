/**
 * SD-LEO-FIX-TEST-FIXTURE-LANE-001 — ENF-18 bare-import-of-dangerous-one-off-script guard.
 *
 * Reproduces the 2026-08-21 incident shape (a bare `import()` of scripts/one-off/
 * backfill-solomon-ledger-decision-by.mjs executed a live 1,241-row prod overwrite) against the
 * new detector, plus the false-positive and fail-open coverage the PRD names (TS-1..TS-6).
 */
import { describe, it, expect } from 'vitest';
import {
  extractOperativeOneOffImportPath,
  isDirectExecution,
  decideOneOffBareImport,
} from '../../../scripts/hooks/lib/one-off-bare-import.cjs';

const DANGEROUS_PATH = 'scripts/one-off/backfill-solomon-ledger-decision-by.mjs';

function manifestWith(entries) {
  return () => ({ dangerous: entries, ok: true });
}

describe('extractOperativeOneOffImportPath', () => {
  it('TS-1: matches the exact incident command shape — node -e "import(\'./scripts/one-off/X.mjs\')"', () => {
    const cmd = 'node -e "import(\'./scripts/one-off/backfill-solomon-ledger-decision-by.mjs\')"';
    expect(extractOperativeOneOffImportPath(cmd)).toBe(DANGEROUS_PATH);
  });

  it('matches `await import(...)`', () => {
    const cmd = 'node -e "await import(\'./scripts/one-off/backfill-solomon-ledger-decision-by.mjs\')"';
    expect(extractOperativeOneOffImportPath(cmd)).toBe(DANGEROUS_PATH);
  });

  it('matches --input-type=module static import', () => {
    const cmd = 'node --input-type=module -e "import \'./scripts/one-off/backfill-solomon-ledger-decision-by.mjs\'"';
    expect(extractOperativeOneOffImportPath(cmd)).toBe(DANGEROUS_PATH);
  });

  it('matches require(...) of a .cjs one-off file', () => {
    const cmd = 'node -e "require(\'./scripts/one-off/foo.cjs\')"';
    expect(extractOperativeOneOffImportPath(cmd)).toBe('scripts/one-off/foo.cjs');
  });

  it('matches a Windows-separator path', () => {
    const cmd = 'node -e "import(\'.\\\\scripts\\\\one-off\\\\backfill-solomon-ledger-decision-by.mjs\')"';
    expect(extractOperativeOneOffImportPath(cmd)).toBe(DANGEROUS_PATH);
  });

  it('TS-2: a bare mention inside grep is NOT operative', () => {
    const cmd = 'grep -r backfill-solomon-ledger-decision-by scripts/one-off/';
    expect(extractOperativeOneOffImportPath(cmd)).toBeNull();
  });

  it('a git commit message mentioning the path is NOT operative', () => {
    const cmd = 'git commit -m "fix: guard scripts/one-off/backfill-solomon-ledger-decision-by.mjs"';
    expect(extractOperativeOneOffImportPath(cmd)).toBeNull();
  });

  it('cat of a one-off path is NOT operative', () => {
    expect(extractOperativeOneOffImportPath('cat scripts/one-off/backfill-solomon-ledger-decision-by.mjs')).toBeNull();
  });

  it('TS-3: direct node execution (no import/require) is NOT operative', () => {
    const cmd = 'node scripts/one-off/backfill-solomon-ledger-decision-by.mjs';
    expect(extractOperativeOneOffImportPath(cmd)).toBeNull();
    expect(isDirectExecution(cmd)).toBe(true);
  });

  it('an import of a non-one-off path is not matched', () => {
    expect(extractOperativeOneOffImportPath('node -e "import(\'./lib/supabase-client.js\')"')).toBeNull();
  });
});

describe('decideOneOffBareImport', () => {
  const cmd = 'node -e "import(\'./scripts/one-off/backfill-solomon-ledger-decision-by.mjs\')"';

  it('TS-1: blocks a dangerous (manifest-listed) target with no override', () => {
    const d = decideOneOffBareImport(cmd, {}, { loadManifest: manifestWith({ [DANGEROUS_PATH]: { reason: 'x' } }) });
    expect(d.matched).toBe(true);
    expect(d.outcome).toBe('block');
    expect(d.targetPath).toBe(DANGEROUS_PATH);
  });

  it('overrides with LEO_ALLOW_ONE_OFF_IMPORT set to a non-empty reason', () => {
    const d = decideOneOffBareImport(cmd, { LEO_ALLOW_ONE_OFF_IMPORT: 'QF-1: reviewed, safe' }, { loadManifest: manifestWith({ [DANGEROUS_PATH]: { reason: 'x' } }) });
    expect(d.outcome).toBe('override');
    expect(d.overrideReason).toBe('QF-1: reviewed, safe');
  });

  it('TS-4: allows a target NOT in the dangerous manifest (already guarded)', () => {
    const d = decideOneOffBareImport(cmd, {}, { loadManifest: manifestWith({}) });
    expect(d.matched).toBe(true);
    expect(d.outcome).toBe('allow');
    expect(d.reason).toBe('not_in_dangerous_manifest');
  });

  it('TS-5: fails OPEN when the manifest is unreadable/corrupt', () => {
    const d = decideOneOffBareImport(cmd, {}, { loadManifest: () => ({ dangerous: {}, ok: false }) });
    expect(d.matched).toBe(true);
    expect(d.outcome).toBe('allow');
    expect(d.reason).toBe('manifest_unreadable_fail_open');
    expect(d.manifestOk).toBe(false);
  });

  it('a non-matching command never touches the manifest loader', () => {
    let called = false;
    const d = decideOneOffBareImport('git status', {}, { loadManifest: () => { called = true; return { dangerous: {}, ok: true }; } });
    expect(d.matched).toBe(false);
    expect(called).toBe(false);
  });
});
