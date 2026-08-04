#!/usr/bin/env node
/**
 * Workflow path-filter lint — SD-LEO-INFRA-FIVE-GUARDS-WIRED-001 (FR-3).
 *
 * GitHub Actions `paths:` filters DO NOT EXPAND BRACE ALTERNATION. A filter written as
 * `scripts/**\/*.{js,mjs,cjs,ts}` matches only a literal filename ending in the seven
 * characters `.{js,mjs,cjs,ts}` — i.e. nothing at all. The workflow stays green, appears
 * wired, and never runs on the source it exists to police.
 *
 * THE FAILURE THIS EXISTS FOR. Five lint workflows in this repo were written that way.
 * Measured at the time of the fix: count-delta-gate-lint, ismainmodule-classguard-lint and
 * realtime-subscribe-teardown-recursion-lint had each run EXACTLY ONCE EVER — on their own
 * introducing PR, matched by the literal `.github/workflows/<self>.yml` entry sitting beside
 * the dead brace-glob. Zero runs since, across 488 `scripts/**` and 1436 `lib/**` file
 * touches. A sixth workflow, session-coordination-insert-classguard-lint, was corrected on
 * 2026-08-03 and went from 3 runs ever to 24 runs in a single day. That before/after is the
 * whole argument: the mechanism is not theoretical, and the fix is not cosmetic.
 *
 * Seven violations of the ismainmodule class landed in `scripts/**` during the 32 days its
 * guard was inert. Every one of them postdates the guard. Nothing was grandfathered — the
 * guard simply could not see them.
 *
 * WHY THIS GUARD EXISTS RATHER THAN JUST FIXING THE FIVE. The class had already been fixed
 * once, in one workflow, without a guard — which left it free to recur, and it did, four
 * more times. A defect that recurs after a fix is not merely unfinished; it is unprotected.
 * This is the single representation that makes instance six detectable instead of waiting
 * for someone to notice a run count of 1.
 *
 * ── TWO CALIBRATIONS THAT MUST NOT DRIFT ─────────────────────────────────────────────────
 *
 * 1. `nobrace: true` IS LOAD-BEARING. minimatch expands braces BY DEFAULT, which is the
 *    exact opposite of GitHub Actions. A matcher used with default options reports 4729
 *    matches for the dead ismainmodule filter and GOES GREEN ON THE BUG — the instrument
 *    built to detect the ambiguity commits it on its first run. GHA_MATCH_OPTS is exported
 *    and asserted in the test suite so this cannot be silently dropped.
 *
 * 2. WE PARSE, WE DO NOT GREP. A textual scan for `{...,...}` also hits roughly 25 legitimate
 *    `${{ }}` template expressions in `run:` and `github-script` bodies. Reading the parsed
 *    `paths:`/`paths-ignore:` arrays makes those false positives structurally impossible
 *    rather than filtered-out-by-hand.
 *
 * SCOPE IS DELIBERATELY NARROW. A survey of all 353 path entries in this repo found brace
 * alternation to be the ONLY syntax-level defect class present: zero leading `./`, zero
 * leading `/`, zero character classes, zero extglob, zero backslashes, zero negation. A
 * separate population of 23 filters is dead by TARGET ABSENCE (the directory or extension
 * does not exist) — a different root cause with a different blast radius, reported rather
 * than folded in here, because a zero-match rule would fail against all 23 on day one.
 *
 * Usage:
 *   node scripts/lint/workflow-path-filter-lint.mjs            # walk .github/workflows/
 *   node scripts/lint/workflow-path-filter-lint.mjs <file...>  # check specific file(s)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import yaml from 'js-yaml';

const WORKFLOW_DIR = '.github/workflows';

/**
 * Match options that mirror GitHub Actions path-filter semantics.
 *
 * `nobrace` is not a preference — see calibration note 1 in the file header. Exported so a
 * test can assert it, because the failure mode of losing it is a silently passing lint.
 */
export const GHA_MATCH_OPTS = Object.freeze({ nobrace: true, dot: true });

/** A brace group. GHA expands none of these, so any occurrence in a path entry is dead. */
const BRACE_GROUP = /\{([^{}]*)\}/g;

/**
 * PURE: does this single path-filter entry contain a brace group?
 * @param {string} entry
 * @returns {boolean}
 */
export function hasBraceAlternation(entry) {
  if (typeof entry !== 'string') return false;
  BRACE_GROUP.lastIndex = 0;
  return BRACE_GROUP.test(entry);
}

/**
 * PURE: expand a brace-glob entry into the literal entries it was MEANT to be.
 * Only the first brace group is expanded — nothing in this repo nests them, and emitting a
 * combinatorial suggestion for a case that does not exist would be noise.
 * @param {string} entry
 * @returns {string[]} the corrected entries, or [entry] when there is nothing to expand
 */
export function expandBraceEntry(entry) {
  const m = /\{([^{}]*)\}/.exec(entry);
  if (!m) return [entry];
  const alternatives = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  if (alternatives.length === 0) return [entry];
  return alternatives.map((alt) => entry.slice(0, m.index) + alt + entry.slice(m.index + m[0].length));
}

/**
 * Collect every `paths:` / `paths-ignore:` entry from a parsed workflow document, tagged with
 * the trigger and key it came from so a report can say WHERE precisely.
 * @param {object} doc  parsed workflow YAML
 * @returns {Array<{trigger: string, key: string, entry: string}>}
 */
export function collectPathEntries(doc) {
  const out = [];
  // js-yaml v4 uses the YAML 1.2 core schema, where `on` is a plain string key. The
  // doc[true] fallback covers a 1.1-style parse rather than assuming which one ran.
  const on = doc?.on ?? doc?.[true];
  if (!on || typeof on !== 'object') return out;
  for (const [trigger, cfg] of Object.entries(on)) {
    if (!cfg || typeof cfg !== 'object') continue;
    for (const key of ['paths', 'paths-ignore']) {
      const raw = cfg[key];
      if (raw === undefined || raw === null) continue;
      // A scalar `paths: 'scripts/**/*.{js,ts}'` is not the shape GitHub Actions documents,
      // but skipping it because it is not an Array is precisely the failure this whole lint
      // exists to prevent: a guard that silently declines to look at something. Normalise
      // instead, so an off-spec shape is still EXAMINED rather than passed over in silence.
      const entries = Array.isArray(raw) ? raw : [raw];
      for (const entry of entries) {
        if (typeof entry === 'string') out.push({ trigger, key, entry });
      }
    }
  }
  return out;
}

/**
 * Best-effort 1-indexed line number for a path entry, by locating it in the raw source.
 * Reported as null rather than guessed when it cannot be found — a wrong line number sends a
 * reader to the wrong place, which is worse than sending them to the file.
 * @param {string} raw
 * @param {string} entry
 * @returns {number|null}
 */
export function findEntryLine(raw, entry) {
  const lines = String(raw).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes(entry)) continue;
    // Must be a sequence item (`- <entry>`), not a mention inside a run: body.
    if (/^\s*-\s*['"]?/.test(line)) return i + 1;
  }
  return null;
}

/**
 * PURE over a YAML STRING — the shape the fixture tests drive, so they need no filesystem.
 *
 * @param {string} yamlString
 * @param {{filename?: string}} [opts]
 * @returns {{ok: boolean, parsed: boolean, error?: string, violations: Array<object>}}
 *   `parsed:false` means the file could not be read as YAML. That is NOT a clean result —
 *   callers must surface it as an INCOMPLETE scan, never fold it into a zero.
 */
export function findBraceGlobEntries(yamlString, { filename = '<string>' } = {}) {
  let doc;
  try {
    doc = yaml.load(yamlString);
  } catch (e) {
    return {
      ok: false,
      parsed: false,
      error: String(e && e.message ? e.message : e).split('\n')[0],
      violations: [],
    };
  }
  const violations = [];
  for (const { trigger, key, entry } of collectPathEntries(doc)) {
    if (!hasBraceAlternation(entry)) continue;
    violations.push({
      file: filename,
      line: findEntryLine(yamlString, entry),
      trigger,
      key,
      entry,
      expansion: expandBraceEntry(entry),
    });
  }
  return { ok: violations.length === 0, parsed: true, violations };
}

/**
 * Resolve which workflow files to check: explicit CLI args when given, else a sorted walk.
 * Mirrors scripts/check-workflow-yaml.mjs so the two behave the same from the command line.
 * @param {string[]} args
 * @returns {string[]}
 */
export function resolveWorkflowFiles(args = []) {
  if (args.length > 0) return args;
  if (!existsSync(WORKFLOW_DIR)) return [];
  return readdirSync(WORKFLOW_DIR)
    .filter((f) => ['.yml', '.yaml'].includes(extname(f)))
    .sort()
    // Forward slashes always. On Windows join() emits backslashes, and a reported path a
    // reader copies into a workflow file or a grep has to be in the repo's own idiom —
    // GitHub Actions path filters are forward-slash, on every platform.
    .map((f) => join(WORKFLOW_DIR, f).split(/[\\/]/).join('/'));
}

function main() {
  const files = resolveWorkflowFiles(process.argv.slice(2));
  if (files.length === 0) {
    console.error('[WORKFLOW_PATH_FILTER] no workflow files found to check');
    process.exitCode = 1;
    return;
  }

  const violations = [];
  const unreadable = [];

  for (const file of files) {
    let raw;
    try {
      raw = readFileSync(file, 'utf8');
    } catch (e) {
      unreadable.push({ file, error: `cannot read: ${e.message}` });
      continue;
    }
    const res = findBraceGlobEntries(raw, { filename: file });
    if (!res.parsed) {
      unreadable.push({ file, error: res.error });
      continue;
    }
    violations.push(...res.violations);
  }

  // An unreadable file is reported BEFORE any verdict, because a scan that skipped a file
  // has not established that the file is clean — and "0 violations" printed over a partial
  // scan is exactly the shape of false assurance this whole SD is about.
  if (unreadable.length > 0) {
    console.error(
      `❌ workflow-path-filter-lint: ${violations.length} brace-alternation entr${violations.length === 1 ? 'y' : 'ies'} found, ` +
      `but ${unreadable.length} of ${files.length} file(s) could not be parsed — this scan is INCOMPLETE, not clean.`
    );
    for (const u of unreadable) console.error(`  ${u.file}  ${u.error}`);
  }

  if (violations.length > 0) {
    if (unreadable.length === 0) {
      console.error(`❌ workflow-path-filter-lint: ${violations.length} brace-alternation entr${violations.length === 1 ? 'y' : 'ies'} across ${files.length} file(s) scanned`);
    }
    console.error('');
    for (const v of violations) {
      const where = v.line === null ? v.file : `${v.file}:${v.line}`;
      console.error(`  ${where}  on.${v.trigger}.${v.key}`);
      console.error(`      ${v.entry}`);
      console.error(`      GitHub Actions does not expand braces, so this matches only a literal filename ending in "${/\{[^{}]*\}/.exec(v.entry)?.[0] ?? ''}" — i.e. nothing.`);
      console.error(`      Replace with ${v.expansion.length} explicit entr${v.expansion.length === 1 ? 'y' : 'ies'}:`);
      for (const e of v.expansion) console.error(`        - '${e}'`);
      console.error('');
    }
    console.error('There is deliberately no allow-list: a path filter that matches nothing has no legitimate use.');
    console.error('If a filter is meant to match nothing, delete the entry instead of writing one that silently cannot fire.');
    process.exitCode = 1;
    return;
  }

  if (unreadable.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(`✅ workflow-path-filter-lint: 0 brace-alternation path filters across ${files.length} file(s) scanned (${WORKFLOW_DIR})`);
}

// Direct-execution guard via the canonical helper — the raw import.meta.url comparison is
// Windows-broken, and this SD exists partly to remove seven instances of it.
import { isMainModule } from '../../lib/utils/is-main-module.js';
if (isMainModule(import.meta.url)) main();
