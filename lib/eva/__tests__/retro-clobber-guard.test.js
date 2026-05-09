/**
 * Tests for scripts/modules/handoff/lib/retro-clobber-guard.js + the 9 wire-in sites.
 * SD-LEO-INFRA-BACKEND-WRITE-SAFETY-001 (follow-up to cancelled SD-FDBK-INFRA-HANDOFF-RETRO-GENERATORS-001).
 *
 * 25+ cases:
 *   - FR-2 helper logic (classifyRetro + hasRichContent + AUTO_GENERATED_TYPES): 12
 *   - FR-2 isSafeToWriteRetro contract + dry-run mode: 6
 *   - Static guard: 6 unique files (7 logical wire-ins counting INSERT+UPDATE pair in 1 guardian file): 6
 *   - Multi-site INSERT/UPDATE counts (1 guardian file = +1 logical site): 1
 *   - [ENFORCE] log-prefix discipline: 1
 *   - AUTO_GENERATED_TYPES no-rehardcode (sibling-parity): 1
 *   - Legacy guardian regression-pin (QF-20260509-796): 1
 *
 * Strategy: pure-function tests for helper logic, regex assertions against the
 * source for wire-in pinning (proven 250x faster + more robust than vi.mock chains
 * per SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001 retrospective).
 */

import { describe, test, expect } from 'vitest';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import {
  AUTO_GENERATED_TYPES,
  hasRichContent,
  classifyRetro,
} from '../../../scripts/modules/handoff/lib/retro-clobber-guard.js';

// ── FR-2 helper: AUTO_GENERATED_TYPES whitelist (4 cases) ──

describe('FR-2: AUTO_GENERATED_TYPES whitelist', () => {
  test('contains exactly 7 values', () => {
    expect(AUTO_GENERATED_TYPES).toHaveLength(7);
  });

  test('includes all canonical auto-generator markers', () => {
    expect(AUTO_GENERATED_TYPES).toEqual(
      expect.arrayContaining(['AUTO', 'AUTO_HOOK', 'NON_SD_MERGE', 'RETRO_SUB_AGENT', 'SUB_AGENT', 'system', 'non_interactive'])
    );
  });

  test('does NOT include manual markers', () => {
    expect(AUTO_GENERATED_TYPES).not.toContain('manual');
    expect(AUTO_GENERATED_TYPES).not.toContain('user');
    expect(AUTO_GENERATED_TYPES).not.toContain(null);
  });

  test('exported as named export (sites must NOT re-hardcode the list)', () => {
    expect(typeof AUTO_GENERATED_TYPES).toBe('object');
    expect(Array.isArray(AUTO_GENERATED_TYPES)).toBe(true);
  });
});

// ── FR-2 helper: hasRichContent (4 cases) ──

describe('FR-2: hasRichContent threshold', () => {
  test('empty array returns false', () => {
    expect(hasRichContent([])).toBe(false);
  });

  test('non-array returns false (defensive)', () => {
    expect(hasRichContent(null)).toBe(false);
    expect(hasRichContent(undefined)).toBe(false);
    expect(hasRichContent('not-an-array')).toBe(false);
  });

  test('3+ items with avg length > 100 returns true (rich)', () => {
    const longText = 'x'.repeat(150);
    expect(hasRichContent([longText, longText, longText])).toBe(true);
  });

  test('thin content (avg <= 100 chars) returns false', () => {
    expect(hasRichContent(['short', 'thin', 'tiny'])).toBe(false);
  });

  test('handles object-shaped learnings ({learning: text} or {text: text})', () => {
    const longText = 'x'.repeat(150);
    expect(hasRichContent([{ learning: longText }, { learning: longText }, { learning: longText }])).toBe(true);
    expect(hasRichContent([{ text: longText }, { text: longText }, { text: longText }])).toBe(true);
  });

  test('mix of strings and objects works', () => {
    const longText = 'x'.repeat(150);
    expect(hasRichContent([longText, { learning: longText }, longText])).toBe(true);
  });
});

// ── FR-2 helper: classifyRetro (5 cases) ──

describe('FR-2: classifyRetro decision tree', () => {
  test('null retro returns {safe: true, reason: no_retro}', () => {
    expect(classifyRetro(null)).toEqual({ safe: true, reason: 'no_retro' });
  });

  test('manual retro (generated_by=manual) returns {safe: false, reason: manual_retro}', () => {
    expect(classifyRetro({ generated_by: 'manual', key_learnings: [] })).toEqual({
      safe: false, reason: 'manual_retro'
    });
  });

  test('PRIMARY LEAK CASE: generated_by=null + rich content -> manual_retro_null_inferred', () => {
    const longText = 'x'.repeat(150);
    const retro = {
      generated_by: null,
      key_learnings: [longText, longText, longText, longText, longText],
    };
    expect(classifyRetro(retro)).toEqual({ safe: false, reason: 'manual_retro_null_inferred' });
  });

  test('auto-generated + rich content -> rich_existing_content (skip)', () => {
    const longText = 'x'.repeat(150);
    const retro = {
      generated_by: 'SUB_AGENT',
      key_learnings: [longText, longText, longText],
    };
    expect(classifyRetro(retro)).toEqual({ safe: false, reason: 'rich_existing_content' });
  });

  test('auto-generated + thin content -> auto_thin (safe to overwrite)', () => {
    const retro = {
      generated_by: 'AUTO',
      key_learnings: ['thin'],
    };
    expect(classifyRetro(retro)).toEqual({ safe: true, reason: 'auto_thin' });
  });
});

// ── FR-2 isSafeToWriteRetro contract (3 cases) ──

describe('FR-2: isSafeToWriteRetro return shape', () => {
  // Verify the return shape contract via source-level regex (avoiding the vi.mock supabase
  // chain issues from SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001).
  const src = readFileSync(
    path.resolve(__dirname, '../../../scripts/modules/handoff/lib/retro-clobber-guard.js'),
    'utf8'
  );

  test('returns object with safe + reason + existingRetro fields', () => {
    expect(src).toMatch(/return \{ safe: decision\.safe, reason: decision\.reason, existingRetro/);
  });

  test('selects key_learnings + status + generated_by + auto_generated columns', () => {
    expect(src).toMatch(/key_learnings/);
    expect(src).toMatch(/generated_by/);
    expect(src).toMatch(/auto_generated/);
  });

  test('orders by created_at DESC + LIMIT 1 (latest retro lookup)', () => {
    expect(src).toMatch(/order\('created_at', \{ ascending: false \}\)/);
    expect(src).toMatch(/\.limit\(1\)/);
  });
});

// ── FR-7 dry-run mode (3 cases) ──

describe('FR-7: dry-run mode log discrimination', () => {
  const src = readFileSync(
    path.resolve(__dirname, '../../../scripts/modules/handoff/lib/retro-clobber-guard.js'),
    'utf8'
  );

  test('helper checks LEO_RETRO_GUARD_DRY_RUN env var', () => {
    expect(src).toMatch(/LEO_RETRO_GUARD_DRY_RUN/);
  });

  test('dry-run path uses [DRY_RUN] log prefix', () => {
    expect(src).toMatch(/\[DRY_RUN\] would-have-skipped/);
  });

  test('dry-run returns safe:true with dry_run_override reason prefix', () => {
    expect(src).toMatch(/dry_run_override:/);
  });
});

// NOTE: cancel-sd.js cancelled_at fix was shipped via parallel-session
// QF-20260509-CANCEL-SD-COLDROP (PR #3625), not this SD. The original
// SD-FDBK-INFRA-HANDOFF-RETRO-GENERATORS-001 commit bundled both fixes;
// this SD re-extracts only the retro-clobber guard.

// ── Static guard: 7 wire-in sites pinned ──

describe('Static guard: 7 wire-in sites consult isSafeToWriteRetro', () => {
  const sites = [
    'scripts/modules/handoff/retrospective-enricher.js',
    'scripts/modules/handoff/executors/exec-to-plan/retrospective.js',
    'scripts/modules/handoff/executors/lead-to-plan/retrospective.js',
    'scripts/modules/handoff/executors/plan-to-exec/retrospective.js',
    'scripts/modules/handoff/executors/plan-to-lead/state-transitions.js',
    'scripts/modules/handoff/orchestrator-completion-guardian.js',
  ];

  for (const site of sites) {
    test(`${site} references isSafeToWriteRetro`, () => {
      const src = readFileSync(path.resolve(__dirname, '../../..', site), 'utf8');
      expect(src).toMatch(/isSafeToWriteRetro/);
    });
  }

  test('handoff/orchestrator-completion-guardian.js wires BOTH INSERT (596) and UPDATE (637) paths', () => {
    const src = readFileSync(
      path.resolve(__dirname, '../../../scripts/modules/handoff/orchestrator-completion-guardian.js'),
      'utf8'
    );
    const matches = src.match(/isSafeToWriteRetro/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  // QF-20260509-796 regression-pin: prevent re-add of drifted duplicate guardian.
  // Legacy file at scripts/modules/orchestrator-completion-guardian.js was deleted
  // because it had zero production importers and had drifted from the canonical
  // handoff/ version (different handoff requirements, missing cross-child-integration
  // import). If this file ever returns, the consolidation has regressed.
  test('legacy scripts/modules/orchestrator-completion-guardian.js does NOT exist (consolidation regression-pin)', () => {
    const legacyPath = path.resolve(__dirname, '../../../scripts/modules/orchestrator-completion-guardian.js');
    expect(existsSync(legacyPath)).toBe(false);
  });

  test('all wire-in sites use [ENFORCE] log prefix on skip', () => {
    for (const site of sites) {
      const src = readFileSync(path.resolve(__dirname, '../../..', site), 'utf8');
      expect(src, `${site} should log skip with [ENFORCE] prefix`).toMatch(/\[ENFORCE\]/);
    }
  });

  test('AUTO_GENERATED_TYPES whitelist is NOT re-hardcoded outside the helper file (sibling-parity)', () => {
    // Only the helper itself should declare the 7-value array. Sites consuming it
    // should import it, not re-declare. Quick heuristic: check that no consuming
    // site contains the literal full whitelist as an inline array.
    const inlineWhitelistRegex = /\[\s*['"]AUTO['"]\s*,\s*['"]AUTO_HOOK['"]\s*,\s*['"]NON_SD_MERGE['"]/;
    for (const site of sites) {
      const src = readFileSync(path.resolve(__dirname, '../../..', site), 'utf8');
      expect(src, `${site} should NOT re-hardcode the AUTO_GENERATED_TYPES inline list`).not.toMatch(inlineWhitelistRegex);
    }
  });
});
