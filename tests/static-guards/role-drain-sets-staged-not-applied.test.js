/**
 * tests/static-guards/role-drain-sets-staged-not-applied.test.js
 *
 * SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-B (Child A) — PRD TS-6, durable half.
 *
 * database/migrations/20260720_role_drain_sets_STAGED.sql is chairman-gated:
 * this SD commits it but never applies it. That guarantee was only ever
 * verified by a one-time manual grep during EXEC — this guard makes it a
 * durable, static tripwire so a FUTURE commit can't silently wire an
 * apply-migration invocation against this file without a test failing.
 *
 * Fails when any source file (outside the allowlist below) references the
 * STAGED migration's basename together with an apply-migration invocation
 * marker (`apply-migration`, `applyMigration`, or `--prod-deploy`).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');

const MIGRATION_BASENAME = '20260720_role_drain_sets_STAGED.sql';

const ALLOWLIST_PATTERNS = [
  /^tests\//,
  /^docs\//,
  /^database\/migrations\//,
  /^\.prd-payloads\//,
  /\.md$/,
  /^node_modules\//,
  /^\.worktrees\//,
  /^\.git\//,
];

const APPLY_MARKERS = [/apply-migration/i, /applyMigration/, /--prod-deploy/];

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
    } else if (entry.isFile() && /\.(m?js|cjs|ts|sh|ya?ml)$/.test(entry.name)) {
      out.push({ abs: full, rel: rel.replace(/\\/g, '/') });
    }
  }
  return out;
}

function isAllowlisted(rel) {
  return ALLOWLIST_PATTERNS.some((p) => p.test(rel));
}

describe('role_drain_sets STAGED migration remains unapplied (static guard, PRD TS-6)', () => {
  it('the STAGED migration file exists at the canonical path', () => {
    const migration = path.join(REPO_ROOT, 'database/migrations', MIGRATION_BASENAME);
    expect(fs.existsSync(migration), 'STAGED migration missing — FR-1 deliverable not committed').toBe(true);
  });

  it('no source file outside tests/docs/migrations invokes apply-migration against this STAGED file', () => {
    const allFiles = listSourceFiles(REPO_ROOT);
    const offenders = [];
    for (const f of allFiles) {
      if (isAllowlisted(f.rel)) continue;
      let content;
      try { content = fs.readFileSync(f.abs, 'utf8'); } catch { continue; }
      if (!content.includes(MIGRATION_BASENAME)) continue;
      const hasApplyMarker = APPLY_MARKERS.some((p) => p.test(content));
      if (hasApplyMarker) offenders.push(f.rel);
    }
    expect(
      offenders,
      `File(s) reference ${MIGRATION_BASENAME} alongside an apply-migration marker: ${offenders.join(', ')}.\n` +
      'This migration is chairman-gated (SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-B FR-1/TR-2) — ' +
      'applying it is a separate, deliberate chairman action outside this SD\'s scope.'
    ).toEqual([]);
  });
});
