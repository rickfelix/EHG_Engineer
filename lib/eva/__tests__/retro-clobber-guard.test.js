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
  isSafeToWriteRetro,
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

  // SD-LEO-INFRA-RETRO-PROMOTION-PATH-001 FR-1: this test previously pinned the DEFECT as the
  // requirement. Measured against the live retro_type=HANDOFF population, this exact shape
  // (auto-generated + rich boilerplate) was the refusal path for 99.7%+ of rows -- the guard's
  // own charter (module docblock) is protecting MANUALLY-curated content, and generated_by='SUB_AGENT'
  // is a KNOWN auto-generated type, so richness alone must not refuse it. Inverted, not deleted.
  test('auto-generated + rich content -> auto_thin (provenance exempts richness)', () => {
    const longText = 'x'.repeat(150);
    const retro = {
      generated_by: 'SUB_AGENT',
      key_learnings: [longText, longText, longText],
    };
    expect(classifyRetro(retro)).toEqual({ safe: true, reason: 'auto_thin' });
  });

  // The ambiguous-provenance counterpart: falsy-but-not-null generated_by (never classified as a
  // KNOWN auto type) still refuses on richness -- this guard fails conservative on ambiguity, it
  // does not treat "not explicitly manual" as "safe".
  test('unrecognized/falsy-non-null generated_by + rich content -> rich_existing_content (ambiguous provenance, fail conservative)', () => {
    const longText = 'x'.repeat(150);
    const retro = {
      generated_by: '',
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

// ── SD-FDBK-FIX-PREVENT-AUTOMATED-RETRO-001: never clobber a published/high-quality SD_COMPLETION retro ──

describe('SD-FDBK-FIX-PREVENT-AUTOMATED-RETRO-001: published SD_COMPLETION protection', () => {
  const lesson = (n) => ({ lesson: 'L'.repeat(n) });

  test('WITNESS ROW (fc3f0c84): SD_COMPLETION + PUBLISHED + q=100 + SUB_AGENT + {lesson}x5 -> published_sd_completion', () => {
    const retro = {
      retro_type: 'SD_COMPLETION', status: 'PUBLISHED', quality_score: 100,
      generated_by: 'SUB_AGENT',
      key_learnings: [lesson(601), lesson(601), lesson(601), lesson(601), lesson(601)],
    };
    // Previously mis-classified `auto_thin` (SUB_AGENT auto-marked + {lesson} scored as empty) and overwritten.
    expect(classifyRetro(retro)).toEqual({ safe: false, reason: 'published_sd_completion' });
  });

  test('status=PUBLISHED alone protects (even at low quality_score)', () => {
    expect(classifyRetro({ retro_type: 'SD_COMPLETION', status: 'PUBLISHED', quality_score: 10, generated_by: 'AUTO', key_learnings: ['thin'] }))
      .toEqual({ safe: false, reason: 'published_sd_completion' });
  });

  test('quality_score>=70 alone protects (status not PUBLISHED)', () => {
    expect(classifyRetro({ retro_type: 'SD_COMPLETION', status: 'DRAFT', quality_score: 85, generated_by: 'AUTO', key_learnings: ['thin'] }))
      .toEqual({ safe: false, reason: 'published_sd_completion' });
  });

  test('short-circuit is checked FIRST — wins over generated_by/richness even for an empty published completion retro', () => {
    expect(classifyRetro({ retro_type: 'SD_COMPLETION', status: 'PUBLISHED', quality_score: 0, generated_by: 'SUB_AGENT', key_learnings: [] }))
      .toEqual({ safe: false, reason: 'published_sd_completion' });
  });

  test('NO over-protection: a non-completion (SPRINT) auto-thin retro is still overwritable', () => {
    expect(classifyRetro({ retro_type: 'SPRINT', status: 'PUBLISHED', quality_score: 95, generated_by: 'AUTO', key_learnings: ['thin'] }))
      .toEqual({ safe: true, reason: 'auto_thin' });
  });

  test('SD_COMPLETION but DRAFT + low quality + thin is NOT short-circuited (falls through to auto_thin)', () => {
    expect(classifyRetro({ retro_type: 'SD_COMPLETION', status: 'DRAFT', quality_score: 30, generated_by: 'AUTO', key_learnings: ['thin'] }))
      .toEqual({ safe: true, reason: 'auto_thin' });
  });

  test('hasRichContent recognizes the production {lesson} key shape (closes the heuristic blind spot)', () => {
    expect(hasRichContent([lesson(601), lesson(601), lesson(601)])).toBe(true);
  });

  test('isSafeToWriteRetro SELECT now includes retro_type + quality_score (short-circuit inputs)', () => {
    const src = readFileSync(
      path.resolve(__dirname, '../../../scripts/modules/handoff/lib/retro-clobber-guard.js'),
      'utf8'
    );
    expect(src).toMatch(/retro_type/);
    expect(src).toMatch(/quality_score/);
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

// SD-LEO-INFRA-RETRO-PROMOTION-PATH-001 FR-2/TS-7: proves the row-selection fix (targetRowId
// option) at the SHARED FUNCTION level, which is what actually protects all 7 production
// callers of isSafeToWriteRetro that never pass it (see the module docblock) -- a recording
// fake that tracks the ACTUAL query shape used, not a source regex, since the two shapes now
// diverge conditionally.
describe('FR-2: isSafeToWriteRetro targetRowId option (row-selection fix, TS-4/TS-7)', () => {
  function recordingFakeSupabase(rowsById) {
    const calls = [];
    return {
      calls,
      from() {
        const filters = {};
        let usedOrderLimit = false;
        const b = {
          select: () => b,
          eq: (field, value) => { filters[field] = value; return b; },
          order: () => { usedOrderLimit = true; return b; },
          limit: () => b,
          maybeSingle: async () => {
            calls.push({ filters: { ...filters }, usedOrderLimit });
            const key = filters.id ?? filters.sd_id;
            return { data: rowsById[key] ?? null, error: null };
          },
        };
        return b;
      },
    };
  }

  test('omitting targetRowId uses the pre-existing sd_id + order + limit(1) query -- byte-identical for the 7 other callers', async () => {
    const sb = recordingFakeSupabase({ 'sd-1': { id: 'most-recent-row', generated_by: 'AUTO', key_learnings: ['thin'] } });

    const result = await isSafeToWriteRetro(sb, 'sd-1');

    expect(sb.calls).toHaveLength(1);
    expect(sb.calls[0].filters).toEqual({ sd_id: 'sd-1' });
    expect(sb.calls[0].usedOrderLimit).toBe(true);
    expect(result.existingRetro.id).toBe('most-recent-row');
  });

  test('supplying targetRowId queries WHERE id=targetRowId instead, skipping order/limit entirely', async () => {
    const sb = recordingFakeSupabase({ 'row-target': { id: 'row-target', generated_by: 'AUTO', key_learnings: ['thin'] } });

    const result = await isSafeToWriteRetro(sb, 'sd-1', { targetRowId: 'row-target' });

    expect(sb.calls).toHaveLength(1);
    expect(sb.calls[0].filters).toEqual({ id: 'row-target' });
    expect(sb.calls[0].usedOrderLimit).toBe(false);
    expect(result.existingRetro.id).toBe('row-target');
  });

  test('the targetRowId row and the most-recent-for-sd_id row can classify differently -- proves the fix is not a no-op', async () => {
    const rows = {
      // The row actually being enhanced: thin + auto -- should be safe to write.
      'handoff-row': { id: 'handoff-row', generated_by: 'SUB_AGENT', key_learnings: ['thin'] },
      // The most-recent row for the sd_id (e.g. a later INCIDENT retro): rich + manual -- if the
      // guard classified THIS row instead (the pre-fix bug), the write would be wrongly refused.
      'sd-1': { id: 'incident-row', generated_by: null, key_learnings: [
        { learning: 'x'.repeat(150) }, { learning: 'x'.repeat(150) }, { learning: 'x'.repeat(150) },
      ] },
    };
    const sb = recordingFakeSupabase(rows);

    const withoutFix = await isSafeToWriteRetro(sb, 'sd-1');
    const withFix = await isSafeToWriteRetro(sb, 'sd-1', { targetRowId: 'handoff-row' });

    expect(withoutFix.safe).toBe(false);
    expect(withoutFix.reason).toBe('manual_retro_null_inferred');
    expect(withFix.safe).toBe(true);
    expect(withFix.reason).toBe('auto_thin');
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
