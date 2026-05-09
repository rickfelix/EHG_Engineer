// QF-20260508-847: orphan-qf-reaper UPDATE must include force_completed:true
// to satisfy quick_fixes CHECK constraint completed_requires_verification:
//   (tests_passing AND uat_verified) OR force_completed
//
// Both UPDATE call-sites in scripts/orphan-qf-reaper.mjs are reaper-driven
// retroactive completions — neither path can vouch for tests_passing or
// uat_verified at row-level. force_completed:true is the canonical override
// (mirrors the database-agent canonical UPDATE pattern used for QF-20260508-515
// retro-reconcile and the complete-quick-fix.js --force-complete flag).
//
// Prior witness: QF-20260508-182 added verified_by + verification_notes but
// missed force_completed; reaper still hit the CHECK on every cron run since
// 2026-05-08T23:32Z, leaving QF-911/-492/-182/-648 stuck as orphans.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REAPER_PATH = join(__dirname, '..', '..', '..', 'scripts', 'orphan-qf-reaper.mjs');

describe('orphan-qf-reaper.mjs — force_completed coverage (QF-847 static guard)', () => {
  const source = readFileSync(REAPER_PATH, 'utf8');

  // Robust to formatting: count `.update({` blocks targeting quick_fixes that
  // also contain `force_completed: true` somewhere in the same block (until
  // the matching `})`). Both sites must qualify.
  function findUpdateBlocks(src) {
    const blocks = [];
    let cursor = 0;
    while (true) {
      const start = src.indexOf('.update({', cursor);
      if (start === -1) break;
      // Find matching closing `})` by tracking braces, naive but sufficient
      let depth = 1;
      let i = src.indexOf('{', start) + 1;
      while (i < src.length && depth > 0) {
        const ch = src[i];
        if (ch === '{') depth += 1;
        else if (ch === '}') depth -= 1;
        i += 1;
      }
      blocks.push(src.slice(start, i));
      cursor = i;
    }
    return blocks;
  }

  it('contains exactly two .update({...}) blocks (pr_url + branch-derived paths)', () => {
    const blocks = findUpdateBlocks(source);
    expect(blocks.length).toBe(2);
  });

  it('every UPDATE block sets status:completed AND force_completed:true', () => {
    const blocks = findUpdateBlocks(source);
    for (const [idx, block] of blocks.entries()) {
      expect(block, `block #${idx + 1} missing status:'completed'`).toMatch(/status:\s*'completed'/);
      expect(block, `block #${idx + 1} missing force_completed:true`).toMatch(/force_completed:\s*true/);
      expect(block, `block #${idx + 1} missing verified_by:'ORPHAN_REAPER'`).toMatch(/verified_by:\s*'ORPHAN_REAPER'/);
      expect(block, `block #${idx + 1} missing verification_notes`).toMatch(/verification_notes:/);
    }
  });

  it('still references the SD origin (FR1) in the file header', () => {
    expect(source).toMatch(/SD-LEO-INFRA-LIFECYCLE-RECONCILIATION-ORPHAN-001.*FR1/);
  });

  // SD-LEO-INFRA-ORPHAN-REAPER-INTEGRATION-001 FR-1: per-path UPDATE column allowlist
  // and FORBIDDEN-column guard. Closes the writer/consumer asymmetry regression class
  // that produced QF-911/-492/-182/-847 in 24h.
  describe('FR-1: per-path UPDATE column allowlist + forbidden columns', () => {
    const REQUIRED_BOTH_PATHS = [
      'status', 'completed_at', 'commit_sha',
      'compliance_verdict', 'compliance_details',
      'verified_by', 'verification_notes', 'force_completed',
    ];
    const REQUIRED_BRANCH_DERIVED_ONLY = ['pr_url'];
    const FORBIDDEN_COLUMNS = ['metadata', 'merged_via', 'escalation_target', 'audit_log'];

    function blockHasKey(block, key) {
      // Match `<key>:` at top level of the block (allow whitespace)
      return new RegExp(`\\b${key}\\s*:`).test(block);
    }

    it('pr_url path UPDATE block contains all 8 required columns', () => {
      const blocks = findUpdateBlocks(source);
      const block = blocks[0]; // first .update({...}) is the pr_url path
      for (const col of REQUIRED_BOTH_PATHS) {
        expect(blockHasKey(block, col), `pr_url path missing column: ${col}`).toBe(true);
      }
    });

    it('branch-derived path UPDATE block contains all 9 required columns (incl. pr_url)', () => {
      const blocks = findUpdateBlocks(source);
      const block = blocks[1]; // second .update({...}) is the branch-derived path
      const required = [...REQUIRED_BOTH_PATHS, ...REQUIRED_BRANCH_DERIVED_ONLY];
      for (const col of required) {
        expect(blockHasKey(block, col), `branch-derived path missing column: ${col}`).toBe(true);
      }
    });

    it('neither UPDATE block contains forbidden columns', () => {
      const blocks = findUpdateBlocks(source);
      for (const [idx, block] of blocks.entries()) {
        for (const col of FORBIDDEN_COLUMNS) {
          expect(blockHasKey(block, col), `block #${idx + 1} contains forbidden column: ${col}`).toBe(false);
        }
      }
    });
  });

  // FR-2: idempotency .eq('status', qf.status) chain pinned on both UPDATE call sites.
  describe('FR-2: idempotency guard on both UPDATE blocks', () => {
    it('source contains exactly two .eq(\'id\', qf.id).eq(\'status\', qf.status) chains', () => {
      // Match `.eq('id', qf.id)` followed (allowing whitespace/newlines) by `.eq('status', qf.status)`
      const re = /\.eq\(\s*['"]id['"]\s*,\s*qf\.id\s*\)\s*\.eq\(\s*['"]status['"]\s*,\s*qf\.status\s*\)/g;
      const matches = source.match(re) || [];
      expect(matches.length).toBe(2);
    });
  });

  // FR-3: SUMMARY counter shape pin (10 keys) — protects GitHub Action observability.
  describe('FR-3: summary object key shape', () => {
    const EXPECTED_KEYS = [
      'evaluated', 'reconciled',
      'skipped_pr_not_merged', 'skipped_pr_not_found', 'skipped_already_completed',
      'orphan_evaluated', 'orphan_reconciled',
      'orphan_skipped_no_merged_pr', 'orphan_skipped_already_completed',
      'errored',
    ];

    function extractSummaryBlock(src) {
      const start = src.indexOf('const summary = {');
      if (start === -1) return null;
      let depth = 1;
      let i = src.indexOf('{', start) + 1;
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth += 1;
        else if (src[i] === '}') depth -= 1;
        i += 1;
      }
      return src.slice(start, i);
    }

    it('summary block declares all 10 expected counter keys', () => {
      const block = extractSummaryBlock(source);
      expect(block, 'summary block not found').not.toBeNull();
      for (const key of EXPECTED_KEYS) {
        expect(new RegExp(`\\b${key}\\s*:`).test(block), `summary missing key: ${key}`).toBe(true);
      }
    });

    it('summary block declares ONLY the expected 10 counter keys (no extras)', () => {
      const block = extractSummaryBlock(source);
      expect(block).not.toBeNull();
      // Count `<word>:` occurrences at top level (rough — but valid since summary is a flat object)
      const keyMatches = block.match(/^\s*[a-z_]+\s*:/gm) || [];
      expect(keyMatches.length).toBe(EXPECTED_KEYS.length);
    });
  });
});
