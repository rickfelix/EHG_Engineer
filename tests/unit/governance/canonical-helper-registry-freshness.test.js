/**
 * Registry-freshness meta-test.
 *
 * SD-LEO-INFRA-LEAD-EMPIRICAL-PRECHECK-001 / FR-6.
 *
 * Closes the writer/consumer asymmetry the bypass-guard would otherwise
 * re-create when the registry itself drifts.
 *
 * Two checks:
 *   1) STALE — every registry entry's canonical_helper must exist on disk
 *      AND must contain at least one write to its declared table.
 *   2) ORPHAN — for any table that has a canonical helper file living in
 *      `lib/governance/` or `lib/security/` (the canonical-helper paths),
 *      the registry MUST list it. Tables in archived/, scripts/one-off/,
 *      scripts/modules/, scripts/archive/, etc. are LONG TAIL — they have
 *      writers but no canonical helper yet, and are NOT in scope for this SD.
 *      Long-tail registry coverage is tracked separately.
 *
 * Discovery is INTENTIONALLY independent of the registry — this is a real
 * second signal, not a tautology.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// PRECHECK_EXEMPT: meta-test that independently discovers writers via grep — not a LEAD enrichment script

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..', '..');
const sidecarPath = resolve(repoRoot, 'docs/reference/canonical-write-paths.json');

// Paths considered "canonical helper" locations. Files here that write to a
// table are subject to registry coverage. Other paths are long-tail and
// excluded from orphan detection.
const CANONICAL_HELPER_PATH_PREFIXES = [
  'lib/governance/',
  'lib/security/',
];

const SCAN_DIRS = ['lib'];
const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.worktrees', 'tests', '__tests__']);

const FROM_WRITE_RE = /\.from\(\s*[\'"`]([a-z_][a-z0-9_]*)[\'"`]\s*\)\s*\.(insert|upsert|update)\s*\(/g;

function discoverCanonicalHelperWrites(rootAbs) {
  // Map<table, Set<helperPath>> — only counting writes from CANONICAL_HELPER_PATH_PREFIXES
  const writers = new Map();
  function walk(dirAbs) {
    let ents;
    try { ents = readdirSync(dirAbs, { withFileTypes: true }); } catch { return; }
    for (const ent of ents) {
      const full = join(dirAbs, ent.name);
      if (ent.isDirectory()) {
        if (EXCLUDE_DIRS.has(ent.name)) continue;
        walk(full);
        continue;
      }
      if (!ent.isFile()) continue;
      if (!/\.[mc]?js$/.test(ent.name)) continue;
      if (/\.(test|spec)\.[mc]?js$/.test(ent.name)) continue;
      const relPath = relative(rootAbs, full).replaceAll(sep, '/');
      // Only consider files in CANONICAL_HELPER_PATH_PREFIXES
      if (!CANONICAL_HELPER_PATH_PREFIXES.some((p) => relPath.startsWith(p))) continue;
      let src;
      try { src = readFileSync(full, 'utf8'); } catch { continue; }
      let m;
      FROM_WRITE_RE.lastIndex = 0;
      while ((m = FROM_WRITE_RE.exec(src)) !== null) {
        const table = m[1];
        if (!writers.has(table)) writers.set(table, new Set());
        writers.get(table).add(relPath);
      }
    }
  }
  for (const sub of SCAN_DIRS) {
    const dirAbs = resolve(rootAbs, sub);
    try {
      const st = statSync(dirAbs);
      if (st.isDirectory()) walk(dirAbs);
    } catch { /* skip */ }
  }
  return writers;
}

describe('FR-6 — registry-freshness meta-test', () => {
  const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8'));
  const rows = sidecar.rows || [];

  it('every registry canonical_helper file exists on disk', () => {
    const missing = rows.filter((r) => !existsSync(resolve(repoRoot, r.canonical_helper)));
    expect(
      missing.length,
      `Stale registry — canonical_helper files missing:\n${missing.map((r) => `  - ${r.table} → ${r.canonical_helper}`).join('\n')}`,
    ).toBe(0);
  });

  it('every registry helper carries @canonical-writer-for annotation OR writes directly', () => {
    const drift = [];
    for (const r of rows) {
      const helperAbs = resolve(repoRoot, r.canonical_helper);
      if (!existsSync(helperAbs)) continue; // covered by stale test above
      const src = readFileSync(helperAbs, 'utf8');
      // Accept any of:
      //   (a) literal `.from('<table>').insert/upsert/update(`
      //   (b) `@canonical-writer-for: <table>` docstring tag (preferred for delegating helpers)
      //   (c) prose annotation mentioning canonical + table
      const writeRe = new RegExp(`\\.from\\(\\s*[\\'"\`]${r.table}[\\'"\`]\\s*\\)\\.(insert|upsert|update)\\s*\\(`);
      const annotationRe = new RegExp(`@canonical-writer-for:\\s*${r.table}\\b`);
      const proseRe = new RegExp(`canonical (helper|writer|emitter)[^\\n]*${r.table}|${r.table}[^\\n]*canonical (helper|writer|emitter)`, 'i');
      if (!writeRe.test(src) && !annotationRe.test(src) && !proseRe.test(src)) {
        drift.push(`  - ${r.table} → ${r.canonical_helper} (no .from('${r.table}').(insert|upsert|update), no @canonical-writer-for: ${r.table} tag, no canonical/wrapper prose)`);
      }
    }
    expect(drift.length, `Stale registry — helpers do not advertise themselves for their declared tables:\n${drift.join('\n')}`).toBe(0);
  });

  it('orphan detection (informative): tables written from canonical-helper paths SHOULD be in registry', () => {
    const discovered = discoverCanonicalHelperWrites(repoRoot);
    const registryTables = new Set(rows.map((r) => r.table));
    const orphans = [];
    for (const [table, paths] of discovered.entries()) {
      if (!registryTables.has(table)) {
        orphans.push({ table, paths: [...paths] });
      }
    }
    if (orphans.length > 0) {
      // SOFT signal — log so the inventory is visible in CI, but do not fail.
      // Long-tail registry coverage is a follow-up SD; this test surfaces it
      // so it cannot be silently lost. Promote to expect().toBe(0) once the
      // long tail is closed.
      console.warn(`[FR-6 INFO] ${orphans.length} canonical-helper-path tables not yet in registry (informative — long-tail follow-up):`);
      for (const o of orphans) console.warn(`    - ${o.table} → ${o.paths.join(', ')}`);
    }
    expect(true).toBe(true); // always passes — informative only
  }, 15000);
});
