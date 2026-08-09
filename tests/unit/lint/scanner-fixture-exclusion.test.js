/**
 * SD-LEO-INFRA-SWEEP-REPO-SCANNERS-001 (FR-2 / AC-5) — fixture exclusion in the shape-B scanners.
 *
 * VERIFIED AT THE CONSUMER, NOT AT THE MERGE. Asserting that each scanner imports isFixturePath
 * would pass even if the import were dead — the "adopted but not wired" shape. So these tests RUN
 * each scanner against a planted tree and assert its selection actually changed.
 *
 * TWO-SIDED, because over-suppression is the failure this fix could introduce. Every case asserts
 * BOTH that the fixture twin is skipped AND that a byte-identical file outside the fixture path is
 * still flagged. A one-sided test would pass for a scanner that had simply stopped working.
 *
 * Typed UNIT deliberately: tests/integration/** resolves to ZERO FILES here, so an integration-typed
 * test would SKIP AND REPORT GREEN.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFixturePath, isFixtureEntry } from '../../../lib/lint/added-line-text.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('isFixtureEntry — the trailing-separator trap, encoded once', () => {
  it('[THE TRAP] matches a fixture DIRECTORY, which the bare path does NOT', () => {
    // This is the whole reason the helper exists. `__tests__/` and `tests/` carry a separator, so a
    // walk pruning on isFixturePath('lib/__tests__') descends into the fixture tree while LOOKING
    // like it prunes. Three scanners were about to hand-write the `? p + '/' : p` fix independently.
    expect(isFixturePath('lib/__tests__')).toBe(false);
    expect(isFixtureEntry('lib/__tests__', true)).toBe(true);
  });

  it('treats a nested tests/ directory the same way', () => {
    expect(isFixturePath('lib/tests')).toBe(false);
    expect(isFixtureEntry('lib/tests', true)).toBe(true);
  });

  it('[CONTROL] does NOT suppress an ordinary directory', () => {
    // Without this, a helper that returned true unconditionally would pass every case above while
    // silently disarming all four scanners — a false NEGATIVE, worse than the noise it replaces.
    expect(isFixtureEntry('lib/gates', true)).toBe(false);
    expect(isFixtureEntry('scripts/lint', true)).toBe(false);
  });

  it('[CONTROL] does NOT suppress an ordinary source file', () => {
    expect(isFixtureEntry('lib/gates/index.js', false)).toBe(false);
    expect(isFixtureEntry('scripts/lint/schema-reference-lint.mjs', false)).toBe(false);
  });

  it('still flags a fixture FILE when isDirectory is false', () => {
    expect(isFixtureEntry('lib/foo.test.js', false)).toBe(true);
    expect(isFixtureEntry('lib/__tests__/helper.js', false)).toBe(true);
  });
});

/**
 * One payload carrying a violation for each of the four scanners, written to two paths that differ
 * ONLY by being fixture material. Any difference in verdict is therefore attributable to the path.
 */
const PAYLOAD = [
  'const row = {};',
  'supabase.from("session_coordination").insert(row);',        // classguard
  'supabase.from("totally_fake_table_xyz").select("*");',      // schema-reference
  'db.update({ current_lifecycle_stage: 5 });',                // stage-advancement
  'if (retrospectives.quality_score > 80) { go(); }',          // diagnostic-gauge
  '',
].join('\n');

const FIXTURE_REL = 'lib/__tests__/planted.mjs';
const CONTROL_REL = 'lib/planted-real.mjs';

function plantTree() {
  const root = mkdtempSync(path.join(tmpdir(), 'scanner-fx-'));
  mkdirSync(path.join(root, 'lib', '__tests__'), { recursive: true });
  mkdirSync(path.join(root, 'scripts'), { recursive: true });
  mkdirSync(path.join(root, 'database'), { recursive: true });
  writeFileSync(path.join(root, FIXTURE_REL), PAYLOAD);
  writeFileSync(path.join(root, CONTROL_REL), PAYLOAD);
  // schema-reference-lint exits early without a snapshot; give it the real one.
  copyFileSync(
    path.join(REPO, 'database/schema-reference-snapshot.json'),
    path.join(root, 'database/schema-reference-snapshot.json')
  );
  return root;
}

/** @returns {string[]} paths the scanner reported a violation in */
function runScanner(scanner, root, extraArgs = []) {
  let out;
  try {
    out = execFileSync(
      process.execPath,
      [path.join(REPO, 'scripts/lint', `${scanner}.mjs`), '--all', '--json', ...extraArgs],
      { cwd: root, encoding: 'utf8', timeout: 120000 }
    );
  } catch (e) {
    // A scanner that finds violations EXITS 1, and execFileSync throws on that — so the exception is
    // the expected path here, not the error path. The control assertion below is what proves the run
    // was real; swallowing this without it would turn a crashed scanner into a silent pass.
    if (e.stdout == null) throw e;
    out = e.stdout;
  }
  const parsed = JSON.parse(out.slice(out.indexOf('{')));
  // The four scanners disagree on the key: three emit `file`, classguard emits `filePath`.
  return (parsed.violations || []).map((v) => (v.file || v.filePath).replace(/\\/g, '/'));
}

const SCANNERS = [
  { name: 'diagnostic-gauge-citation-lint', args: [] },
  { name: 'stage-advancement-chokepoint-lint', args: [] },
  { name: 'schema-reference-lint', args: [] },
  // classguard resolves its scan root from --root rather than cwd.
  { name: 'session-coordination-insert-classguard-lint', args: null },
];

describe('shape-B scanners skip fixture material selected from a diff', () => {
  for (const { name, args } of SCANNERS) {
    it(`${name}: skips ${FIXTURE_REL}, still flags ${CONTROL_REL}`, () => {
      const root = plantTree();
      try {
        const hits = runScanner(name, root, args === null ? ['--root', root] : args);
        // CONTROL FIRST: if the scanner silently stopped working, "no fixture hit" would be
        // meaningless. This asserts the scanner is alive before reading anything into its silence.
        expect(hits.some((h) => h.endsWith('planted-real.mjs'))).toBe(true);
        expect(hits.some((h) => h.includes('__tests__'))).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }, 120000);
  }
});
