/**
 * Registry-driven bypass guard.
 *
 * SD-LEO-INFRA-LEAD-EMPIRICAL-PRECHECK-001 / FR-5.
 *
 * For each entry in canonical-write-paths.json, runs verifyHelperCoverage and
 * fails if any bypass site exists that is NOT listed in exempt_writers.
 *
 * Honors LEAD_PRECHECK_GUARD_DISABLE=1 — when set, downgrades to warn-only
 * (test passes but logs the bypass list). Use once per hot fix; the next PR
 * must add the site to exempt_writers OR refactor.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyHelperCoverage } from '../../../scripts/lib/lead-precheck-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..', '..');
const sidecarPath = resolve(repoRoot, 'docs/reference/canonical-write-paths.json');

const guardDisabled = process.env.LEAD_PRECHECK_GUARD_DISABLE === '1';

const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8'));
const rows = sidecar.rows || [];

describe('FR-5 — canonical-helper bypass guard', () => {
  it('sidecar has at least one entry', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  for (const row of rows) {
    it(`${row.table} → ${row.canonical_helper} — no unexempted bypass sites`, async () => {
      const { ok, evidence } = await verifyHelperCoverage({
        helperFile: row.canonical_helper,
        table: row.table,
        repoRoot,
      });

      // Filter out exempt sites — each exempt entry can be a file path OR
      // a directory prefix (e.g. "scripts/one-off") that matches by startsWith
      const exemptPaths = (row.exempt_writers || []).map((s) => s.replaceAll('\\', '/'));
      const unexempted = (evidence.bypass_sites || []).filter((site) => {
        const sitePath = site.path.replaceAll('\\', '/');
        return !exemptPaths.some((ex) => sitePath === ex || sitePath.startsWith(ex.endsWith('/') ? ex : ex + '/'));
      });

      if (guardDisabled && unexempted.length > 0) {
        console.warn(`[FR-5 GUARD-DISABLED] ${row.table}: ${unexempted.length} unexempted bypass sites:`);
        for (const site of unexempted) console.warn(`    ${site.path}:${site.line} [${site.axis}/${site.verb}]`);
        return; // pass with warning
      }

      const detail = unexempted.map((s) => `    ${s.path}:${s.line} [${s.axis}/${s.verb}] ${s.snippet}`).join('\n');
      expect(
        unexempted.length,
        `Found ${unexempted.length} unexempted bypass site(s) for table=${row.table}, helper=${row.canonical_helper}:\n${detail}\n\nFix: refactor to use ${row.canonical_helper} OR add to exempt_writers in docs/reference/canonical-write-paths.md (then re-run scripts/lib/registry-parser.js).`,
      ).toBe(0);
      // Note: ok=false from verifyHelperCoverage is fine when all bypass sites
      // are exempted — the registry IS the way to declare known bypasses. The
      // unexempted-count assertion above is the real gate.
      void ok; // silence unused-var lint
    }, 15000);
  }
});
