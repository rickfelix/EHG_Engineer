/**
 * REVISIT-IF tag grammar + expired-premise detection
 * SD-LEO-INFRA-BITTER-LESSON-AUDIT-001 (chairman sprint item 4)
 *
 * A silent workaround breaks silently when its premise expires. The REVISIT-IF
 * tag makes the premise machine-readable so expiry becomes a gauge finding:
 *
 *   // REVISIT-IF(expires=2026-07-15) owner=coordinator provenance=SD-X-001 note=premise text
 *   # REVISIT-IF(condition=gemini-3.5 GA) owner=adam provenance=QF-123 note=re-run harness
 *
 * Grammar (single-line, comment-prefixed, name/provenance-anchored — never line-anchored):
 *   `REVISIT-IF(<condition>) owner=<role> provenance=<SD/QF/commit> [note=<free text>]`
 * A line only counts as a tag ATTEMPT when the tag starts the comment (marker
 * immediately followed by REVISIT-IF) — prose/docstring mentions never parse.
 *
 * Condition forms:
 *   expires=YYYY-MM-DD  — machine-evaluable; expired when now > that date (UTC end-of-day)
 *   anything else       — non-evaluable premise text; inventoried, never auto-fired
 *
 * The gauge fires on: expired machine-evaluable tags + orphaned anchors (a tag
 * that is the last non-blank content of its file — the trailing-EOF drift case;
 * deletions with surviving code below are NOT detected, deliberately narrow).
 * Conditions must not contain ')' — parens belong in note=, or the tag reads
 * malformed (which the gauge surfaces loudly rather than dropping).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

export const TAG_REGEX = /REVISIT-IF\((?<condition>[^)]+)\)\s+owner=(?<owner>\S+)\s+provenance=(?<provenance>\S+)(?:\s+note=(?<note>.*))?$/;
// A tag ATTEMPT is a comment whose body STARTS with REVISIT-IF( — one comment
// marker, then the tag. Nested/prose mentions (docstrings, grammar examples,
// string literals) deliberately do not qualify, so they can never read as
// malformed stamps and trip the gauge.
export const TAG_ATTEMPT_REGEX = /^\s*(?:\/\/|#|--|\*)\s*REVISIT-IF\(/;

const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.sql', '.yml', '.yaml', '.sh', '.ps1', '.md', '.partial']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'coverage', 'archive', 'dist', 'build']);
const DEFAULT_SCAN_DIRS = ['lib', 'scripts', 'database', '.claude/agents', 'golden-references'];
// tests/fixtures holds the PLANTED expired fixture for the miss-direction unit
// test — the live gauge must not trip on it, so fixtures are opt-in only.
const FIXTURE_DIR_FRAGMENT = ['tests', 'fixtures'].join('/');

/** Parse all REVISIT-IF tags in one file's content. */
export function parseRevisitTags(content, filePath) {
  const tags = [];
  // CRLF-safe: `.` never matches \r (a JS line terminator), so a stray \r
  // before $ silently fails every tag on Windows-ending files.
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!TAG_ATTEMPT_REGEX.test(lines[i])) continue;
    const idx = lines[i].indexOf('REVISIT-IF(');
    const m = lines[i].slice(idx).match(TAG_REGEX);
    if (!m) {
      tags.push({ file: filePath, line: i + 1, malformed: true, raw: lines[i].trim() });
      continue;
    }
    // Orphan check: the tag annotates the next non-blank line; none left = the
    // annotated code is gone (or the tag drifted to EOF) — first-class finding.
    let orphaned = true;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() !== '') { orphaned = false; break; }
    }
    tags.push({
      file: filePath,
      line: i + 1,
      condition: m.groups.condition.trim(),
      owner: m.groups.owner,
      provenance: m.groups.provenance,
      note: (m.groups.note || '').trim() || null,
      orphaned,
    });
  }
  return tags;
}

/** Evaluate one parsed tag at `now`. */
export function evaluateTag(tag, now = new Date()) {
  if (tag.malformed) return { status: 'malformed' };
  if (tag.orphaned) return { status: 'orphaned' };
  const m = tag.condition.match(/^expires=(\d{4}-\d{2}-\d{2})$/);
  if (!m) return { status: 'non_evaluable' };
  const expiry = new Date(m[1] + 'T23:59:59Z');
  return now.getTime() > expiry.getTime()
    ? { status: 'expired', expired_on: m[1] }
    : { status: 'healthy', expires_on: m[1] };
}

function collectFiles(rootDir, relDir, results, includeFixtures) {
  const fullDir = join(rootDir, relDir);
  let entries;
  try { entries = readdirSync(fullDir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const rel = `${relDir}/${entry.name}`;
    if (!includeFixtures && rel.replace(/\\/g, '/').includes(FIXTURE_DIR_FRAGMENT)) continue;
    if (entry.isDirectory()) collectFiles(rootDir, rel, results, includeFixtures);
    else if ([...SCAN_EXTENSIONS].some((ext) => entry.name.endsWith(ext))) results.push(rel);
  }
}

/**
 * Scan the repo for REVISIT-IF tags and report expired premises.
 * Detector contract (gauge-runner): returns { count, ... } — count > 0 trips.
 */
export function detectExpiredPremises(rootDir, { now = new Date(), scanDirs = DEFAULT_SCAN_DIRS, includeFixtures = false } = {}) {
  const files = [];
  for (const dir of scanDirs) collectFiles(rootDir, dir, files, includeFixtures);
  const all = [];
  for (const rel of files) {
    let content;
    try { content = readFileSync(join(rootDir, rel), 'utf8'); } catch { continue; }
    if (!content.includes('REVISIT-IF(')) continue;
    all.push(...parseRevisitTags(content, relative(rootDir, join(rootDir, rel)).replace(/\\/g, '/')));
  }
  const buckets = { expired: [], orphaned: [], malformed: [], non_evaluable: [], healthy: [] };
  for (const tag of all) {
    const evaln = evaluateTag(tag, now);
    buckets[evaln.status].push({ ...tag, ...evaln });
  }
  return {
    count: buckets.expired.length + buckets.orphaned.length + buckets.malformed.length,
    expired: buckets.expired,
    orphaned: buckets.orphaned,
    malformed: buckets.malformed,
    non_evaluable_inventory: buckets.non_evaluable.length,
    healthy: buckets.healthy.length,
    total_tags: all.length,
    scanned_files: files.length,
  };
}
