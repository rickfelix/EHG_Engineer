/**
 * CI invariant test: lib/sd/active-sd-predicate.js
 *
 * SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C FR-6 / TS-9 / TS-12.
 *
 * Two checks:
 * (1) Parity — every consumer of "active SD" uses the shared predicate, not an inline filter.
 *     Grep guard: scan lib/ + scripts/ for the inline pattern (status IN draft/in_progress/active
 *     combined with is_active true) and require either an import of active-sd-predicate.js OR
 *     a documented exemption comment.
 *
 * (2) Semantic — isActiveSD() unit tests assert the COALESCE-equivalent semantics:
 *     - status IN (draft, in_progress, active) AND (is_active IS NULL OR = true) AND archived_at IS NULL
 *     - is_active = NULL row IS included (the database-agent COALESCE finding).
 *     - is_active = false row is excluded.
 *     - archived_at set excludes the row regardless of is_active.
 *
 * Pattern: tests/ci/dashboard-quarantine-lint.test.js walker style — fs.readFileSync per file.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { isActiveSD, getActiveSDFilter, __testHooks } from '../../lib/sd/active-sd-predicate.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Directories to scan for inline-pattern violations.
const SCAN_DIRS = ['lib', 'scripts'];

// Files allowed to use the inline pattern (test fixtures, the predicate module itself, etc.).
const EXEMPT_FILES = new Set([
  'lib/sd/active-sd-predicate.js',
  'tests/ci/active-sd-predicate-parity.test.js',
]);

// Regex hunt: looks for the literal inline pattern.
// Pattern A: .in('status', ['draft', 'in_progress', 'active'])
// We require either an import of active-sd-predicate.js OR a documented exemption.
const INLINE_STATUS_RE = /\.in\(\s*['"]status['"]\s*,\s*\[\s*['"]draft['"]\s*,\s*['"]in_progress['"]\s*,\s*['"]active['"]\s*\]/;
const PREDICATE_IMPORT_RE = /from\s+['"][^'"]*sd\/active-sd-predicate(?:\.js)?['"]/;
const EXEMPTION_COMMENT_RE = /active-sd-predicate-exempt\s*:\s*\w+/;

function walkFiles(p, acc = []) {
  if (!existsSync(p)) return acc;
  const st = statSync(p);
  if (st.isFile()) {
    if (/\.(js|mjs|ts|cjs)$/.test(p)) acc.push(p);
    return acc;
  }
  if (!st.isDirectory()) return acc;
  // Skip node_modules ONLY. Do NOT skip on '.worktrees' substring — when this test
  // runs from a worktree (e.g. .worktrees/SD-EVA-…/tests/ci/active-…), REPO_ROOT
  // resolves to the worktree, so a naive '.worktrees' exclusion would silently
  // skip every file under lib/ + scripts/ and let inline-pattern violations
  // through (this exact bug shipped in the first draft of this test).
  if (p.endsWith('node_modules') || p.includes(`${join('node_modules', '')}`)) return acc;
  for (const e of readdirSync(p)) walkFiles(join(p, e), acc);
  return acc;
}

describe('active-sd-predicate — invariant tests', () => {

  describe('(1) Parity guard: every active-SD consumer imports the shared predicate', () => {
    it('finds zero inline status-active patterns without the shared predicate import', () => {
      const violations = [];
      for (const dir of SCAN_DIRS) {
        const dirPath = join(REPO_ROOT, dir);
        for (const file of walkFiles(dirPath)) {
          const rel = relative(REPO_ROOT, file).replace(/\\/g, '/');
          if (EXEMPT_FILES.has(rel)) continue;
          if (rel.includes('/__tests__/') || rel.endsWith('.test.js') || rel.endsWith('.test.mjs')) continue;

          const content = readFileSync(file, 'utf8');
          if (!INLINE_STATUS_RE.test(content)) continue;

          // Inline pattern present — require either the predicate import or an exemption comment.
          if (PREDICATE_IMPORT_RE.test(content)) continue;
          if (EXEMPTION_COMMENT_RE.test(content)) continue;

          violations.push({
            file: rel,
            hint: 'Import getActiveSDFilter from lib/sd/active-sd-predicate.js and apply via getActiveSDFilter(query) — or add a line comment `// active-sd-predicate-exempt: <reason>` if this caller deliberately deviates.',
          });
        }
      }

      if (violations.length > 0) {
        const message = violations.map(v => `  - ${v.file}\n    ${v.hint}`).join('\n');
        throw new Error(
          `Found ${violations.length} active-SD consumer(s) using the inline filter pattern without importing the shared predicate. ` +
          `This violates the writer/consumer asymmetry mitigation from SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C FR-6 ` +
          `(8th witness of PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001).\n\nViolations:\n${message}`
        );
      }

      expect(violations).toHaveLength(0);
    });
  });

  describe('(2) Semantic: isActiveSD() handles all edge cases', () => {
    it('includes status=draft with is_active=true and archived_at=null', () => {
      expect(isActiveSD({ status: 'draft', is_active: true, archived_at: null })).toBe(true);
    });

    it('includes status=in_progress with is_active=true and archived_at=null', () => {
      expect(isActiveSD({ status: 'in_progress', is_active: true, archived_at: null })).toBe(true);
    });

    it('includes status=active with is_active=true and archived_at=null', () => {
      expect(isActiveSD({ status: 'active', is_active: true, archived_at: null })).toBe(true);
    });

    it('TS-12: includes is_active=NULL row (COALESCE-equivalent)', () => {
      expect(isActiveSD({ status: 'draft', is_active: null, archived_at: null })).toBe(true);
    });

    it('TS-12 (undefined variant): includes is_active=undefined row', () => {
      expect(isActiveSD({ status: 'draft', is_active: undefined, archived_at: null })).toBe(true);
    });

    it('excludes is_active=false', () => {
      expect(isActiveSD({ status: 'draft', is_active: false, archived_at: null })).toBe(false);
    });

    it('excludes status=completed', () => {
      expect(isActiveSD({ status: 'completed', is_active: true, archived_at: null })).toBe(false);
    });

    it('excludes status=archived', () => {
      expect(isActiveSD({ status: 'archived', is_active: true, archived_at: null })).toBe(false);
    });

    it('excludes archived_at=set even if everything else passes', () => {
      expect(isActiveSD({ status: 'draft', is_active: true, archived_at: '2026-01-01T00:00:00Z' })).toBe(false);
    });

    it('handles null/undefined row gracefully', () => {
      expect(isActiveSD(null)).toBe(false);
      expect(isActiveSD(undefined)).toBe(false);
      expect(isActiveSD('not-an-object')).toBe(false);
      expect(isActiveSD({})).toBe(false);
    });
  });

  describe('(3) Schema: getActiveSDFilter applies the right Supabase chain', () => {
    it('chains .in(status, ACTIVE_STATUSES) + .or(is_active) + .is(archived_at, null)', () => {
      const calls = [];
      const mockQuery = {
        in(col, values) { calls.push({ method: 'in', col, values }); return this; },
        or(predicate) { calls.push({ method: 'or', predicate }); return this; },
        is(col, value) { calls.push({ method: 'is', col, value }); return this; },
      };

      const result = getActiveSDFilter(mockQuery);

      expect(result).toBe(mockQuery); // same builder returned
      expect(calls).toHaveLength(3);
      expect(calls[0]).toEqual({ method: 'in', col: 'status', values: ['draft', 'in_progress', 'active'] });
      expect(calls[1]).toEqual({ method: 'or', predicate: 'is_active.is.null,is_active.eq.true' });
      expect(calls[2]).toEqual({ method: 'is', col: 'archived_at', value: null });
    });
  });

  describe('(4) ACTIVE_STATUSES export', () => {
    it('exposes frozen array for test introspection', () => {
      expect(__testHooks.ACTIVE_STATUSES).toEqual(['draft', 'in_progress', 'active']);
      expect(Object.isFrozen(__testHooks.ACTIVE_STATUSES)).toBe(true);
    });
  });
});
