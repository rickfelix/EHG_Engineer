#!/usr/bin/env node
/**
 * No-cd-and-run recipe lint — QF-20260905-646.
 *
 * Command docs and generated protocol files must not teach a `cd <dir>` followed by another
 * command in the same fenced shell block: two ops after a cd is two classifier evaluations
 * against an unscoped cd target, the exact shape behind the 20-block session review gate.
 * The companion fix (checked-in .claude/settings.json prefix rules) narrows what needs a
 * prompt at all, but a doc that keeps teaching cd-then-run keeps generating fresh cd targets
 * outside that scope. Workers should run scripts by absolute path from the repo root, or
 * `git -C <path>` for git verbs — never `cd` then a second command.
 *
 * A bare `cd <dir>` with nothing else in its fenced block is allowed (the scoped shape
 * .claude/settings.json now permits); `cd` chained with `&&` or followed by another line in
 * the same block is flagged.
 *
 * ALLOWLIST is count-anchored (matches require-release-sd-wrapper-lint.mjs): a file with no
 * entry must have ZERO violations; a file WITH an entry only fails if its violation count
 * EXCEEDS `expected` -- so pre-existing debt doesn't block CI, but a NEW addition does.
 *
 * KNOWN LIMITATION (self-review, same class the sibling lint already documents): count-anchoring
 * cannot distinguish WHICH violations are the allowlisted ones. Fixing an allowlisted file's
 * existing cd-and-run recipe while separately introducing an unrelated NEW one in the same file,
 * at the same count, passes silently. Acceptable here because both allowlisted files are small,
 * rarely-touched docs -- a content-hash-per-entry model would close this but is not worth the
 * complexity for two files.
 *
 * Usage: node scripts/lint/no-cd-and-run-recipe-lint.mjs [--root <dir>]
 * --root points the scan at a different tree (e.g. a seed-test fixture dir); the allowlist
 * stays anchored to this script's own location either way, since it's the control's config,
 * not part of the scanned corpus.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootFlagIndex = process.argv.indexOf('--root');
const REPO_ROOT = rootFlagIndex !== -1 && process.argv[rootFlagIndex + 1]
  ? path.resolve(process.argv[rootFlagIndex + 1])
  : path.resolve(__dirname, '..', '..');
const ALLOWLIST_PATH = path.join(__dirname, 'no-cd-and-run-recipe-allowlist.json');
// Self-review finding (WARNING, fixed): the language tag must cover every realistic shell-fence
// spelling actually used in this docs corpus, not just ```bash -- an untagged/```shell/```console
// fence was a silent bypass. Deliberately NOT a bare optional tag (which would also scan
// ```json/```javascript/etc. and risk false positives on unrelated code samples).
// Adversarial review (post-merge) finding: `\n` immediately after the tag required an LF fence;
// `.claude/commands/document.md`, `learn.md`, `leo.md` are stored CRLF and `CLAUDE_COORDINATOR*.md`
// are mixed (confirmed via `git ls-files --eol`, none pinned eol=lf in .gitattributes) -- a
// ```bash\r\n fence in any of them never matched at all, silently skipping the whole block.
const FENCE_RE = /```(?:bash|sh|shell|zsh|console)?\r?\n([\s\S]*?)```/g;

export function findCdAndRunViolations(markdown) {
  const violations = [];
  let m;
  FENCE_RE.lastIndex = 0;
  while ((m = FENCE_RE.exec(markdown))) {
    const lines = m[1].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    lines.forEach((line, i) => {
      if (!/^cd\s+\S/.test(line)) return;
      // Self-review finding (WARNING, fixed): `;`-chaining on a single line (`cd X; run Y`) as
      // the block's ONLY line evaded detection -- only `&&` and "another line follows" were
      // checked, not a same-line `;` chain.
      if (/&&|;/.test(line) || i < lines.length - 1) violations.push(line.slice(0, 120));
    });
  }
  return violations;
}

function collectTargets() {
  const targets = fs.readdirSync(REPO_ROOT)
    .filter((f) => /^CLAUDE.*\.md$/.test(f))
    .map((f) => path.join(REPO_ROOT, f));
  const cmdDir = path.join(REPO_ROOT, '.claude', 'commands');
  // Tolerant of a missing dir: --root against a seed-test fixture (or any root with no
  // .claude/commands at all) should still scan the root-level CLAUDE*.md files, not crash.
  if (fs.existsSync(cmdDir)) {
    fs.readdirSync(cmdDir).filter((f) => f.endsWith('.md')).forEach((f) => targets.push(path.join(cmdDir, f)));
  }
  return targets;
}

function loadAllowlist() {
  try {
    return JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function main() {
  const allowlist = loadAllowlist();
  let failed = false;
  for (const file of collectTargets()) {
    const relPath = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
    const violations = findCdAndRunViolations(fs.readFileSync(file, 'utf8'));
    const expected = allowlist[relPath]?.expected ?? 0;
    if (violations.length > expected) {
      failed = true;
      console.error(`❌ ${relPath}: ${violations.length} cd-and-run recipe(s) found (${expected} allowlisted):`);
      violations.forEach((v) => console.error(`   ${v}`));
    }
  }
  if (failed) {
    console.error('\nFix: run scripts by absolute path from the repo root, or `git -C <path>` for git verbs.');
    console.error('Pre-existing, reviewed debt can be allowlisted in scripts/lint/no-cd-and-run-recipe-allowlist.json with a reason.');
    process.exit(1);
  }
  console.log('✅ No new cd-and-run recipes found.');
}

if (isMainModule(import.meta.url)) main();
