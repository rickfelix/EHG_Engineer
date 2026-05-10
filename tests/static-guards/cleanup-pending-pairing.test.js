/**
 * tests/static-guards/cleanup-pending-pairing.test.js
 *
 * SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001 (FR-2e)
 *
 * Static guard pinning the canonical writer + reader for
 * claude_sessions.cleanup_pending. Closes the 16th-witness candidate of
 * PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.
 *
 * Pin list rationale:
 *   • Writer: lib/worktree-manager.js — markCleanupPendingBestEffort is the only
 *     code path that should set cleanup_pending=NOW() on a released session.
 *     Drift here means a sibling cleanup site is silently writing the column
 *     without going through the helper that surfaces operator-visible logs.
 *   • Reader: scripts/cleanup-pending-sweep.mjs — the only code path that
 *     should sweep cleanup_pending IS NOT NULL rows and clear them via the
 *     CAS pattern. Drift here means another sweeper is racing with the canonical
 *     reaper, potentially without the CAS guard.
 *
 * Test fails when:
 *   1. A NEW write site (`cleanup_pending: <expr>` in an .update() chain) appears
 *      outside the pinned-writer file.
 *   2. A NEW read site (.select includes 'cleanup_pending' or .not('cleanup_pending', ...))
 *      appears outside the pinned-reader file.
 *
 * Allowlist exists for:
 *   • Tests + fixtures (this file, integration tests)
 *   • Documentation (.md files)
 *   • Migration files (write-once at the schema layer)
 *   • The PRD-INSERT one-off (paper trail in metadata)
 *   • The migration-apply one-off (verification SELECT)
 *
 * To add a new canonical writer/reader: update PINNED_WRITERS/PINNED_READERS
 * with rationale, then update PRD/CLAUDE_CORE.md to document the pattern.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');

const PINNED_WRITERS = [
  'lib/worktree-manager.js',
];

const PINNED_READERS = [
  'scripts/cleanup-pending-sweep.mjs',
];

// Files allowed to MENTION cleanup_pending without being writers/readers.
const ALLOWLIST_PATTERNS = [
  /^tests\//,
  /^docs\//,
  /^database\/migrations\//,
  /^scripts\/one-off\/_lead-update-sd-worktree-cleanup-windows\.mjs$/,
  /^scripts\/one-off\/_plan-insert-prd-worktree-cleanup\.mjs$/,
  /^scripts\/one-off\/_apply-migration-worktree-cleanup-pending\.mjs$/,
  /^scripts\/one-off\/_database-evidence-sd-leo-infra-worktree-cleanup-windows-001\.mjs$/,
  /\.md$/,
  /^node_modules\//,
  /^\.worktrees\//,
  /^\.git\//,
];

// WRITER detection: any line that sets cleanup_pending to a NON-null value.
// CLEAR detection:  any line that sets cleanup_pending: null.
// Tightened to single-line scan to avoid greedy multi-line matches across multiple
// .update() blocks (the previous pattern produced false positives when a file
// contained TWO `cleanup_pending: null` updates because `[^}]*` could span them).
function classifyAssignment(line) {
  const m = line.match(/\bcleanup_pending\s*:\s*(.+?)(?:[,}\n]|$)/);
  if (!m) return null;
  const valueExpr = m[1].trim();
  if (/^null\b/.test(valueExpr)) return 'clear';
  return 'write';
}

function fileHasWriterAssignment(content) {
  for (const line of content.split('\n')) {
    if (classifyAssignment(line) === 'write') return true;
  }
  return false;
}

function fileHasClearAssignment(content) {
  for (const line of content.split('\n')) {
    if (classifyAssignment(line) === 'clear') return true;
  }
  return false;
}

// Reader patterns: .select('cleanup_pending'), .not('cleanup_pending', ...),
// .order('cleanup_pending', ...), .eq('cleanup_pending', ...), or selecting a
// column list that contains it. Excludes the writer's pre-check (writer reads
// existing cleanup_pending to decide already_pending → that is allowed inside
// the canonical writer file).
const READER_PATTERNS = [
  /\.not\(\s*['"]cleanup_pending['"]/,
  /\.order\(\s*['"]cleanup_pending['"]/,
  /\.eq\(\s*['"]cleanup_pending['"]/,
  /\.select\([^)]*\bcleanup_pending\b/,
];

function listSourceFiles(dir, base = '') {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const entry of entries) {
    if (entry.name.startsWith('.git')) continue;
    if (entry.name === 'node_modules') continue;
    if (entry.name === '.worktrees') continue;
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full, rel));
    } else if (entry.isFile() && /\.(m?js|cjs|ts)$/.test(entry.name)) {
      out.push({ abs: full, rel: rel.replace(/\\/g, '/') });
    }
  }
  return out;
}

function isAllowlisted(rel) {
  return ALLOWLIST_PATTERNS.some((p) => p.test(rel));
}

describe('cleanup-pending writer/consumer pairing static guard', () => {
  const allFiles = listSourceFiles(REPO_ROOT);

  it('PINNED_WRITERS exist and contain the writer pattern', () => {
    for (const w of PINNED_WRITERS) {
      const abs = path.join(REPO_ROOT, w);
      expect(fs.existsSync(abs), `Pinned writer missing: ${w}`).toBe(true);
      const content = fs.readFileSync(abs, 'utf8');
      expect(
        fileHasWriterAssignment(content),
        `Pinned writer ${w} no longer contains cleanup_pending UPDATE — pin list out of sync`
      ).toBe(true);
    }
  });

  it('PINNED_READERS exist and contain a reader pattern', () => {
    for (const r of PINNED_READERS) {
      const abs = path.join(REPO_ROOT, r);
      expect(fs.existsSync(abs), `Pinned reader missing: ${r}`).toBe(true);
      const content = fs.readFileSync(abs, 'utf8');
      const hasReader = READER_PATTERNS.some((p) => p.test(content));
      expect(
        hasReader,
        `Pinned reader ${r} no longer contains cleanup_pending SELECT/NOT/ORDER/EQ — pin list out of sync`
      ).toBe(true);
    }
  });

  it('no UNREGISTERED writer sites exist outside pin list', () => {
    const unregistered = [];
    for (const f of allFiles) {
      if (PINNED_WRITERS.includes(f.rel)) continue;
      if (isAllowlisted(f.rel)) continue;
      let content;
      try { content = fs.readFileSync(f.abs, 'utf8'); } catch { continue; }
      if (fileHasWriterAssignment(content)) {
        unregistered.push(f.rel);
      }
    }
    expect(
      unregistered,
      `New cleanup_pending writer site(s) detected outside pin list: ${unregistered.join(', ')}.\n` +
      `Either add to PINNED_WRITERS in this file with rationale, or refactor to call ` +
      `markCleanupPendingBestEffort() in lib/worktree-manager.js (the canonical helper).\n` +
      `Reference: SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001 / PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.`
    ).toEqual([]);
  });

  it('no UNREGISTERED reader sites exist outside pin list', () => {
    // The canonical writer (PINNED_WRITERS) is allowed to READ cleanup_pending
    // for its pre-check (`if (sessionRow.cleanup_pending) return already_pending`)
    // — that is an internal state-check, not a separate consumer.
    const allowedReadFiles = new Set([...PINNED_READERS, ...PINNED_WRITERS]);
    const unregistered = [];
    for (const f of allFiles) {
      if (allowedReadFiles.has(f.rel)) continue;
      if (isAllowlisted(f.rel)) continue;
      let content;
      try { content = fs.readFileSync(f.abs, 'utf8'); } catch { continue; }
      const hasReader = READER_PATTERNS.some((p) => p.test(content));
      if (hasReader) {
        unregistered.push(f.rel);
      }
    }
    expect(
      unregistered,
      `New cleanup_pending reader site(s) detected outside pin list: ${unregistered.join(', ')}.\n` +
      `Either add to PINNED_READERS in this file with rationale, or refactor to delegate ` +
      `to processCleanupPendingQueue() in scripts/cleanup-pending-sweep.mjs.\n` +
      `Reference: SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001 / PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.`
    ).toEqual([]);
  });

  it('no UNREGISTERED CLEAR sites exist outside pin list (only the reader may set cleanup_pending = null)', () => {
    const unregistered = [];
    for (const f of allFiles) {
      if (PINNED_READERS.includes(f.rel)) continue;
      if (isAllowlisted(f.rel)) continue;
      let content;
      try { content = fs.readFileSync(f.abs, 'utf8'); } catch { continue; }
      if (fileHasClearAssignment(content)) {
        unregistered.push(f.rel);
      }
    }
    expect(
      unregistered,
      `New cleanup_pending CLEAR (set to null) site(s) detected outside reader: ${unregistered.join(', ')}.\n` +
      `Only the canonical reader (scripts/cleanup-pending-sweep.mjs) should clear the column ` +
      `via the CAS pattern — drift here means another path is racing without the CAS guard.`
    ).toEqual([]);
  });

  it('migration file exists at the canonical path (deploy-order anchor)', () => {
    const migration = path.join(REPO_ROOT, 'database/migrations/20260510_worktree_cleanup_pending.sql');
    expect(fs.existsSync(migration), 'Migration file missing — FR-2 deliverable not committed').toBe(true);
    const sql = fs.readFileSync(migration, 'utf8');
    expect(
      /ADD COLUMN IF NOT EXISTS\s+cleanup_pending\s+TIMESTAMPTZ/i.test(sql),
      'Migration file does not contain ADD COLUMN IF NOT EXISTS cleanup_pending TIMESTAMPTZ'
    ).toBe(true);
  });
});
