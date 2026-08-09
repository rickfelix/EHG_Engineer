/**
 * SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-E (FR-5 / AC-6) — the sweep's CLI edge: entry guard and exit
 * code. Both were defects that made the file contradict its own comment four lines earlier.
 *
 * WHY THESE ARE SOURCE ASSERTIONS RATHER THAN A SPAWNED RUN. The two properties under test are
 * "main() fires on the platform we actually run on" and "the failure path does not hard-exit".
 * Reproducing the first genuinely requires a Windows entry-point resolution, and the second
 * requires a real Supabase failure mid-sweep — neither is available in a unit tier, and faking
 * either would test the fake. So these pin the SHAPE at the CLI edge, and the mutation evidence
 * that they bite is recorded in the commit message rather than left implied.
 *
 * Typed UNIT deliberately: tests/integration/** resolves to ZERO FILES in this repo, so an
 * integration-typed test here would SKIP AND REPORT GREEN — the exact false assurance this SD is
 * about.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const SCRIPT = path.join(repoRoot, 'scripts/sweep-fixture-residue.mjs');
const src = fs.readFileSync(SCRIPT, 'utf8');
/** Comments stripped — this file DESCRIBES the old defects in prose, so a naive grep self-matches. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('sweep-fixture-residue CLI edge', () => {
  it('[ENTRY] uses the canonical isMainModule guard, not a hand-rolled suffix match', () => {
    expect(code, 'must import the canonical guard').toMatch(
      /import\s*\{\s*isMainModule\s*\}\s*from\s*['"][^'"]*is-main-module\.js['"]/
    );
    expect(code, 'the entry condition must be isMainModule(import.meta.url)').toMatch(
      /if\s*\(\s*isMainModule\s*\(\s*import\.meta\.url\s*\)\s*\)/
    );
  });

  it('[ENTRY] the endsWith suffix match is GONE', () => {
    // The specific broken shape: import.meta.url.endsWith(<basename of argv[1]>). On Windows a
    // hand-built file:// has two slashes where import.meta.url has three, so main() never ran and
    // the script exited 0 printing NOTHING — indistinguishable from "there was nothing to do".
    expect(code, 'hand-rolled endsWith entry guard still present').not.toMatch(
      /import\.meta\.url\.endsWith\s*\(/
    );
  });

  it('[EXIT] the failure path sets an exit CODE and never hard-exits', () => {
    // THE ASSERTION THAT MATTERS. process.exit terminates before `finally` runs — the mechanism by
    // which a sibling probe leaked synthetic rows on exactly its failure path — and hard-exiting
    // with live Supabase handles trips the libuv teardown assert the :104 comment documents
    // avoiding. Having process.exit(1) four lines below that comment defeated it.
    expect(code, 'process.exit() must not appear anywhere in this script').not.toMatch(
      /process\.exit\s*\(/
    );
    expect(code, 'the main() catch must set process.exitCode').toMatch(
      /main\(\)\s*\.catch\s*\([^)]*\)\s*=>\s*\{[^}]*process\.exitCode\s*=\s*1/
    );
  });

  it('[EXIT] the success path still reports residue through exitCode', () => {
    // Guards the inverse mistake: removing the hard exit must not also remove the signal. An
    // assertion tool whose exit code is always 0 cannot fail a build.
    expect(code).toMatch(/process\.exitCode\s*=\s*residue\.length\s*-\s*fixed\s*===\s*0\s*\?\s*0\s*:\s*1/);
  });
});
