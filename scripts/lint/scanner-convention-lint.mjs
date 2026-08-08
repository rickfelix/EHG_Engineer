#!/usr/bin/env node
/**
 * SD-LEO-INFRA-SWEEP-REPO-SCANNERS-001 (FR-3) — the lint-for-the-linters.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS THE PIECE THAT MATTERS ─────────────────────────────────
 * The strip-and-exclude fix for diff-scanning has been derived INDEPENDENTLY TWICE and propagated
 * to neither sibling: collectSdDiff solved it for SQL migrations, detectCreator later re-derived
 * BOTH halves for JS and wrote its own version of the same explanation. The fixture-path regex
 * alone is duplicated THREE TIMES inside operator-contract/index.js. Publishing
 * lib/lint/added-line-text.mjs (FR-1) makes the convention EXIST; it does not make it FOUND. A
 * convention that must be remembered is documentation, and documentation is precisely what already
 * failed twice here.
 *
 * So this check exists to make the SEVENTH rediscovery fail loudly at the moment a new scanner is
 * written, rather than quietly a year later when someone notices their linter flagging its own
 * fixtures.
 *
 * ── SCOPE: SHAPE A ONLY, DELIBERATELY AND NARROWLY ────────────────────────────────────────
 * Triage (banked at sd.metadata.exec_fr2_triage_20260808) found the class splits in two:
 *   SHAPE A reads a PATCH and matches ADDED-LINE text. The fragment hazard is real here — the slice
 *     can begin mid-JSDoc, so continuation lines arrive with no opener. This check governs shape A.
 *   SHAPE B takes `git diff --name-only` paths and then reads WHOLE FILES. No fragment hazard;
 *     comments arrive intact. All six lint scanners are shape B, and whether the sweep covers them
 *     is an OPEN SCOPE QUESTION with the coordinator.
 * This check therefore flags ONLY shape A. Widening it to shape B before that ruling would encode
 * my own reading of an ambiguous scope into an enforcement gate — which is exactly the kind of
 * unearned authority a linter should never take.
 *
 * ── FAIL-CLOSED ON ITS OWN CLASS ──────────────────────────────────────────────────────────
 * A scanner may opt out with the marker below, but the opt-out must carry a REASON on the same
 * line. An unexplained exemption is how a guard erodes into a formality.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

/** Directories that can contain scanners. */
export const SCAN_ROOTS = ['scripts/lint', 'lib/gates'];

/** The helper every shape-A scanner must consume. */
const HELPER_HINT = /added-line-text(?:\.mjs)?['"]/;

/**
 * Opt-out marker; the trailing text is the MANDATORY reason.
 *
 * `[ \t]*` NOT `\s*` — and my own test caught the difference. `\s` includes the newline, so
 * `\s*(\S.*)` on a BARE marker skipped the line break and captured the NEXT LINE OF CODE as the
 * "reason". A bare exemption would have silently passed, which is the erosion this rule exists to
 * prevent: the guard would have accepted any exemption at all while appearing to demand a reason.
 */
const OPT_OUT = /scanner-convention-lint-exempt:[ \t]*(\S.*)$/m;

/**
 * SHAPE A DETECTION. A `git diff` invocation that is NOT --name-only produces a PATCH, so the
 * consumer is reading added-line text.
 *
 * Deliberately NOT matched: `--name-only`, which yields paths (shape B). That single flag is the
 * whole discriminator, and getting it wrong in either direction is the failure mode — too broad
 * flags every shape-B scanner on an unruled scope, too narrow flags nothing.
 */
export function readsAddedLineText(source) {
  const code = String(source || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\*.*$/gm, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  // THE COMMAND MUST OPEN THE STRING. Requiring a quote/backtick IMMEDIATELY before `git diff`
  // distinguishes an INVOCATION from a MENTION:
  //   invocation: run(`git diff ${ref}...HEAD -- "${p}"`)      -> the string starts with the command
  //   mention:    console.error(`[my-scanner] git diff failed`) -> the string starts with prose
  //
  // THIS FIX CAME FROM THE CHECK FAILING ITS OWN CLASS ON ITS FIRST LIVE RUN. The first version
  // matched `git diff` anywhere outside a comment, and immediately flagged
  // compute-changed-retro-migrations for the words "git diff failed" inside an ERROR MESSAGE. A
  // linter written to stop scanners false-positiving on their own prose false-positived on prose.
  // Stripping comments was not enough: STRING LITERALS carry pattern-shaped text too, and a
  // diagnostic message is the single most likely place to find a command quoted in full.
  return [...code.matchAll(/['"`]git diff([^`'"\n]*)/g)].some((m) => !/--name-only/.test(m[1]));
}

/** @returns {{file: string, reason: string}[]} violations */
export function findViolations({ root = repoRoot, roots = SCAN_ROOTS, readFile, listFiles } = {}) {
  const read = readFile || ((p) => fs.readFileSync(p, 'utf8'));
  const list =
    listFiles ||
    ((dir) => {
      const abs = path.join(root, dir);
      if (!fs.existsSync(abs)) return [];
      return fs
        .readdirSync(abs, { recursive: true })
        .map((f) => path.join(dir, String(f)).replace(/\\/g, '/'))
        .filter((f) => /\.(?:mjs|js|cjs)$/.test(f));
    });

  const violations = [];
  for (const dir of roots) {
    for (const rel of list(dir)) {
      // A scanner's own TESTS legitimately contain scanner-shaped strings — the very defect class
      // this SD is about. Skipping them here is the convention applied to itself.
      if (/(?:\.test\.|\.spec\.|__tests__\/|(?:^|\/)tests\/)/.test(rel)) continue;
      let src;
      try {
        src = read(path.join(root, rel));
      } catch {
        continue;
      }
      if (!readsAddedLineText(src)) continue;
      if (HELPER_HINT.test(src)) continue;
      const exempt = src.match(OPT_OUT);
      if (exempt) continue;
      violations.push({
        file: rel,
        reason:
          'reads git-diff ADDED-LINE text without lib/lint/added-line-text.mjs. A scanner matching '
          + 'added lines false-positives on its own fixtures and worked-example comments. Import the '
          + 'helper, or add "scanner-convention-lint-exempt: <reason>" stating why it cannot.',
      });
    }
  }
  return violations;
}

if (isMainModule(import.meta.url)) {
  const violations = findViolations();
  for (const v of violations) console.error(`[scanner-convention-lint] ${v.file}: ${v.reason}`);
  console.log(`[scanner-convention-lint] shape-A scanners checked; violations=${violations.length}`);
  // exitCode, never process.exit — cleanup must not depend on control flow.
  process.exitCode = violations.length === 0 ? 0 : 1;
}
