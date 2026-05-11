/**
 * SD-FDBK-INFRA-MIGRATE-EMIT-FEEDBACK-001 FR-6
 *
 * Static-guard regression test: enforce that lib/governance/emit-feedback.js
 * remains the canonical INSERT writer for the feedback table.
 *
 * Pattern: runs verifyHelperCoverage on lib/+scripts/ and asserts the bypass
 * sites set EXACTLY EQUALS the documented OOS allowlist (5 entries).
 *
 * If a NEW bypass appears (or an OOS line drifts), this test fails — forcing
 * either the new caller to migrate to emitFeedback OR an explicit allowlist
 * update via PR review (TR-5: line-tuple matching is intentional).
 *
 * Allowlist update procedure:
 *   1. If a file moved or a line shifted, update the OOS_ALLOWLIST entry.
 *   2. If a NEW bypass site is intentionally OOS (template string, one-off
 *      script, UPDATE-axis), document the rationale in a code comment AND
 *      add to OOS_ALLOWLIST.
 *   3. If a NEW bypass site is in scope, migrate the caller to emitFeedback
 *      / emitFeedbackBatch instead of adding to allowlist.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { verifyHelperCoverage } from '../../scripts/lib/lead-precheck-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

/**
 * Documented OOS bypass sites as (path, line) tuples. Match by path AND line.
 * Path uses forward slashes (cross-platform; verifyHelperCoverage normalizes).
 *
 * Each entry MUST have a `reason` explaining why it is NOT in scope for
 * canonical-helper migration. Reason is non-functional — included for the
 * human reviewing a future allowlist change.
 */
const OOS_ALLOWLIST = [
  { path: 'lib/eva/bridge/replit-format-strategies.js', line: 570, reason: 'lines.push of source-template literal — emits sample code into Replit prompt; not a real DB call.' },
  { path: 'lib/eva/bridge/replit-prompt-formatter.js',  line: 179, reason: 'inside markdown template string emitted to Replit setup instructions; not a real DB call.' },
  { path: 'lib/quality/assist-engine.js',               line: 444, reason: 'UPDATE not INSERT; emitFeedback is INSERT-only canonical surface. UPDATE bypass requires separate canonical pattern (deferred — see SD-FDBK-INFRA-MIGRATE-EMIT-FEEDBACK-001 follow-up scope).' },
  { path: 'scripts/one-off/migrate-harness-backlog-to-feedback.mjs', line: 205, reason: 'one-off legacy data-migration script (archived after run).' },
  { path: 'scripts/one-off/_plan-insert-prd-sd-leo-infra-lead-empirical-precheck-001.mjs', line: 315, reason: 'PRD body markdown text (not executable code).' },
];

function tupleKey(s) { return `${s.path}:${s.line}`; }

describe('FR-6: emit-feedback canonical-helper bypass guard', () => {
  it('bypass_sites set EQUALS the documented OOS allowlist (path+line tuple match)', async () => {
    const result = await verifyHelperCoverage({
      helperFile: 'lib/governance/emit-feedback.js',
      table: 'feedback',
      repoRoot: REPO_ROOT,
      includeDirs: ['lib', 'scripts'],
    });

    const actual = (result.evidence?.bypass_sites || []).map(s => ({ path: s.path, line: s.line }));
    const actualKeys = new Set(actual.map(tupleKey));
    const expectedKeys = new Set(OOS_ALLOWLIST.map(tupleKey));

    const unexpected = [...actualKeys].filter(k => !expectedKeys.has(k));
    const missing = [...expectedKeys].filter(k => !actualKeys.has(k));

    if (unexpected.length || missing.length) {
      // Enrich diagnostics with snippets for unexpected entries
      const snippetMap = new Map((result.evidence?.bypass_sites || []).map(s => [tupleKey(s), s.snippet]));
      const unexpectedDetail = unexpected.map(k => `  + UNEXPECTED ${k}\n      snippet: ${snippetMap.get(k) || '(n/a)'}`).join('\n');
      const missingDetail   = missing.map(k => `  - MISSING    ${k} (allowlist entry no longer found — was the file renamed or the line shifted?)`).join('\n');
      const msg = [
        'emit-feedback bypass-site set does not match OOS allowlist.',
        '',
        unexpectedDetail || '',
        missingDetail || '',
        '',
        'See FR-6 docstring in this file for allowlist update procedure.',
      ].filter(Boolean).join('\n');
      throw new Error(msg);
    }
    expect(actualKeys.size).toBe(expectedKeys.size);
  });

  it('canonical helper has at least 2 known importers (lifecycle-sd-bridge + log-harness-bug)', async () => {
    const result = await verifyHelperCoverage({
      helperFile: 'lib/governance/emit-feedback.js',
      table: 'feedback',
      repoRoot: REPO_ROOT,
      includeDirs: ['lib', 'scripts'],
    });
    expect((result.evidence?.canonical_imports || []).length).toBeGreaterThanOrEqual(2);
  });
});
