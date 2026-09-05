#!/usr/bin/env node
/**
 * claude-sessions-terminal-chokepoint-lint.mjs
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E (FR-1 AC: "A census-completeness test/lint fails if a new
 * claude_sessions write sets a terminal/stale status without routing through the chokepoint").
 *
 * lib/fleet/terminal-session-update.cjs (terminalSessionUpdate()/sessionStatusUpdate()) is a
 * VOLUNTARY convention -- nothing stops a writer #N+1 from hand-rolling `.update({status:
 * 'released', ...})` again without it. This lint is the mechanical backstop: scans every
 * `claude_sessions` UPDATE in scripts/ and lib/ (live paths only) that sets a literal terminal
 * status ('released'/'stale'), and requires EITHER routing through the shared chokepoint OR an
 * inline `is_alive` write in the same statement (the actual outcome the chokepoint exists to
 * guarantee -- one pre-existing site, scripts/stale-session-sweep.cjs:3251, already does this by
 * hand and predates the chokepoint). A site satisfying neither is a candidate regression of the
 * exact defect class this SD closed, unless explicitly allowlisted with a reason
 * (scripts/audit/claude-sessions-terminal-chokepoint-allowlist.json).
 *
 * TABLE-AWARE, not a bare `status: 'released'|'stale'` grep: `.update({status:...})` sites also
 * exist for other tables (feedback, chairman_held_sends, coverage_matrix) that share the column
 * name `status` but have nothing to do with claude_sessions liveness. Anchors on the nearest
 * preceding `.from('claude_sessions')` within a short backward window, mirroring
 * scripts/audit/count-truncation-inventory.mjs's chainWindow() heuristic for the same reason:
 * one classifier design, not a second bespoke heuristic per lint.
 *
 * Usage: node scripts/lint/claude-sessions-terminal-chokepoint-lint.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCAN_DIRS = ['scripts', 'lib'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', '__tests__', 'tests', 'fixtures']);
const EXTS = new Set(['.js', '.mjs', '.cjs']);
const NON_LIVE_PATH_RES = [
  /^scripts\/archive\//,
  /^scripts\/one-off\//,
  /^scripts\/_deprecated\//,
  /^scripts\/smoke\//, // synthetic probe/smoke infrastructure, not a production lifecycle writer
  /\/_deprecated\//,
  /\/archive\/one-time\//,
];
const ALLOWLIST_PATH = path.join(ROOT, 'scripts', 'audit', 'claude-sessions-terminal-chokepoint-allowlist.json');

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(dir, entry.name));
    } else if (EXTS.has(path.extname(entry.name)) && !/\.test\.[cm]?js$/.test(entry.name)) {
      yield path.join(dir, entry.name);
    }
  }
}

function isNonLivePath(rel) {
  return NON_LIVE_PATH_RES.some((re) => re.test(rel));
}

function loadAllowlist() {
  try { return JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8')); } catch { return {}; }
}

/** The statement window: from the .update( line forward to a closing ');' or blank/statement end. */
function updateWindow(lines, idx) {
  let win = lines[idx];
  let depth = (lines[idx].match(/\(/g) || []).length - (lines[idx].match(/\)/g) || []).length;
  for (let j = idx + 1; j < Math.min(idx + 40, lines.length) && depth > 0; j++) {
    win += '\n' + lines[j];
    depth += (lines[j].match(/\(/g) || []).length - (lines[j].match(/\)/g) || []).length;
  }
  return win;
}

/** Is `.update(` at idx anchored to a claude_sessions chain within the preceding few lines? */
function anchoredToClaudeSessions(lines, idx) {
  for (let j = idx; j >= Math.max(0, idx - 6); j--) {
    if (/\.from\(\s*['"]claude_sessions['"]\s*\)/.test(lines[j])) return true;
    if (j < idx && /;\s*$/.test((lines[j] ?? '').trim())) break; // previous statement boundary
  }
  return false;
}

export function classifyUpdateSite(win) {
  // A chokepoint call is ALWAYS "sets terminal" regardless of whether its status argument is a
  // literal or a variable/ternary (e.g. sessionStatusUpdate(targetStatus, {...}) or
  // sessionStatusUpdate(s.status === 'ACTIVE' ? 'idle' : 'released', {...})) -- the whole point of
  // routing through it is that the caller no longer needs to spell out 'released'/'stale' itself.
  if (/terminalSessionUpdate\(|sessionStatusUpdate\(/.test(win)) return 'chokepoint';
  const setsTerminal = /status\s*:\s*['"](released|stale)['"]/.test(win);
  if (!setsTerminal) return 'not-applicable';
  if (/is_alive\s*:\s*false/.test(win)) return 'inline-compliant';
  return 'needs-review';
}

export function scanRepo({ root = ROOT } = {}) {
  const allowlist = loadAllowlist();
  const sites = [];
  for (const dir of SCAN_DIRS) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const rel = path.relative(root, file).replace(/\\/g, '/');
      if (rel === 'lib/fleet/terminal-session-update.cjs') continue; // the chokepoint's own internals
      if (isNonLivePath(rel)) continue;
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!/\.update\s*\(/.test(line)) return;
        if (!anchoredToClaudeSessions(lines, i)) return;
        const key = `${rel}:${i + 1}`;
        const classification = classifyUpdateSite(updateWindow(lines, i));
        if (classification === 'not-applicable') return;
        const allow = allowlist[key];
        const finalClass = (allow && allow.reason) ? 'allowlisted' : classification;
        sites.push({ site: key, classification: finalClass, auto: classification, snippet: line.trim().slice(0, 160) });
      });
    }
  }
  return sites;
}

function main() {
  const sites = scanRepo();
  const needsReview = sites.filter((s) => s.classification === 'needs-review');
  if (needsReview.length === 0) {
    console.log(`✅ claude-sessions-terminal-chokepoint-lint: 0 unguarded terminal-status write(s) across ${sites.length} site(s) scanned`);
    process.exit(0);
  }
  console.error(`❌ claude-sessions-terminal-chokepoint-lint: ${needsReview.length} unguarded terminal-status write(s)\n`);
  for (const s of needsReview) console.error(`  ${s.site}  ${s.snippet}`);
  console.error(
    '\nA claude_sessions UPDATE setting status to \'released\'/\'stale\' must either route through' +
    '\nterminalSessionUpdate()/sessionStatusUpdate() (lib/fleet/terminal-session-update.cjs) or set' +
    '\nis_alive:false in the same statement. Genuine exceptions: add a reasoned entry to' +
    '\nscripts/audit/claude-sessions-terminal-chokepoint-allowlist.json.'
  );
  process.exit(1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
