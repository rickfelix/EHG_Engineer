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
});
