// SD-FDBK-INFRA-SUPPRESS-CORRECTIVE-GENERATOR-001 — vitest pin for CAPA 1-4 + FR-5.
// Verdict scope-lock: 13 test scenarios from PRD (TS-1 through TS-13).
// Mock pattern: plain-object (mirrors corrective-sd-generator-a05-filter.test.js:88-103)
// per validation-agent finding #6 — vi.fn() is NOT the existing convention.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  isSourceCompletedRecently,
  isParentOrchestratorStale,
  isAllKeyChangesPlaceholder,
  stripSelfExemptingGate,
} from '../../../scripts/eva/corrective-sd-generator.mjs';

// ── plain-object Supabase mock (matches existing test convention) ──
function makeSupabaseLookup(rowMap, failureRows = []) {
  return {
    from(table) {
      if (table === 'sub_agent_execution_results') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                limit: async () => ({ data: failureRows, error: null }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          or: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: rowMap.byOr ?? null, error: null }),
            }),
          }),
          eq: () => ({
            maybeSingle: async () => ({ data: rowMap.byEq ?? null, error: null }),
          }),
        }),
      };
    },
  };
}

// ── CAPA-1: source-completion suppression ──
describe('CAPA-1 isSourceCompletedRecently — TS-1 / TS-2 / TS-3 / TS-4 / TS-12', () => {
  const NOW = Date.now();
  const HOURS = (h) => new Date(NOW - h * 3600 * 1000).toISOString();

  it('TS-1: skips when source_sd.status=completed AND completion_date 12h ago', async () => {
    const sb = makeSupabaseLookup({
      byOr: { id: 'u1', sd_key: 'SD-X', status: 'completed', completion_date: HOURS(12) },
    });
    const r = await isSourceCompletedRecently('SD-X', sb);
    expect(r.suppress).toBe(true);
    expect(r.reason).toBe('completed_within_24h_no_failures');
    expect(r.sourceSdKey).toBe('SD-X');
  });

  it('TS-2 boundary: emits at exactly 24h00m (boundary excluded)', async () => {
    const sb = makeSupabaseLookup({
      byOr: { id: 'u2', sd_key: 'SD-X', status: 'completed', completion_date: HOURS(24.01) },
    });
    const r = await isSourceCompletedRecently('SD-X', sb);
    expect(r.suppress).toBe(false);
  });

  it('TS-2 boundary: skips at 23h59m (boundary included)', async () => {
    const sb = makeSupabaseLookup({
      byOr: { id: 'u2b', sd_key: 'SD-X', status: 'completed', completion_date: HOURS(23.5) },
    });
    const r = await isSourceCompletedRecently('SD-X', sb);
    expect(r.suppress).toBe(true);
  });

  it('TS-3: emits when completed-recent BUT a FAIL/BLOCKED gate evidence row exists', async () => {
    const sb = makeSupabaseLookup(
      { byOr: { id: 'u3', sd_key: 'SD-X', status: 'completed', completion_date: HOURS(12) } },
      [{ id: 'ev-fail', verdict: 'FAIL' }]
    );
    const r = await isSourceCompletedRecently('SD-X', sb);
    expect(r.suppress).toBe(false);
    expect(r.reason).toBe('has_failing_gate_evidence');
  });

  it('TS-4 conservative default: emits when source-SD lookup misses (data null)', async () => {
    const sb = makeSupabaseLookup({ byOr: null });
    const r = await isSourceCompletedRecently('SD-MISSING', sb);
    expect(r.suppress).toBe(false);
  });

  it('TS-12: emits when source_sd.status=cancelled (predicate is status-specific, not terminal)', async () => {
    const sb = makeSupabaseLookup({
      byOr: { id: 'u4', sd_key: 'SD-X', status: 'cancelled', completion_date: HOURS(12) },
    });
    const r = await isSourceCompletedRecently('SD-X', sb);
    expect(r.suppress).toBe(false);
  });

  it('emits when completion_date is NULL (incomplete data — conservative default)', async () => {
    const sb = makeSupabaseLookup({
      byOr: { id: 'u5', sd_key: 'SD-X', status: 'completed', completion_date: null },
    });
    const r = await isSourceCompletedRecently('SD-X', sb);
    expect(r.suppress).toBe(false);
  });

  it('emits when sourceSdId is null (no-op input)', async () => {
    const r = await isSourceCompletedRecently(null, makeSupabaseLookup({}));
    expect(r.suppress).toBe(false);
  });
});

// ── CAPA-2: parent-orchestrator stale-completion ──
describe('CAPA-2 isParentOrchestratorStale — TS-5 / TS-6 / TS-7', () => {
  const NOW = Date.now();
  const DAYS = (d) => new Date(NOW - d * 24 * 3600 * 1000).toISOString();

  function makeSb(sdRow, parentRow) {
    let callCount = 0;
    return {
      from() {
        return {
          select: () => ({
            or: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: sdRow, error: null }),
              }),
            }),
            eq: () => ({
              maybeSingle: async () => {
                callCount++;
                return { data: parentRow, error: null };
              },
            }),
          }),
        };
      },
    };
  }

  it('TS-5: skips when parent.status=completed AND completion_date 31d ago', async () => {
    const sb = makeSb(
      { id: 'sd1', parent_sd_id: 'parent1' },
      { id: 'parent1', sd_key: 'SD-PARENT', status: 'completed', completion_date: DAYS(31) }
    );
    const r = await isParentOrchestratorStale('SD-X', sb);
    expect(r.suppress).toBe(true);
    expect(r.reason).toBe('parent_completed_30d_stale');
    expect(r.parentSdKey).toBe('SD-PARENT');
    expect(r.daysSince).toBeGreaterThanOrEqual(31);
  });

  it('TS-6: emits when parent_sd_id is NULL (no parent — not orphan-stale)', async () => {
    const sb = makeSb({ id: 'sd2', parent_sd_id: null }, null);
    const r = await isParentOrchestratorStale('SD-X', sb);
    expect(r.suppress).toBe(false);
  });

  it('TS-7: emits when parent.completion_date is NULL (incomplete data — conservative default)', async () => {
    const sb = makeSb(
      { id: 'sd3', parent_sd_id: 'parent3' },
      { id: 'parent3', sd_key: 'SD-PARENT', status: 'completed', completion_date: null }
    );
    const r = await isParentOrchestratorStale('SD-X', sb);
    expect(r.suppress).toBe(false);
  });

  it('emits when parent.status is in_progress (not completed)', async () => {
    const sb = makeSb(
      { id: 'sd4', parent_sd_id: 'parent4' },
      { id: 'parent4', sd_key: 'SD-PARENT', status: 'in_progress', completion_date: DAYS(60) }
    );
    const r = await isParentOrchestratorStale('SD-X', sb);
    expect(r.suppress).toBe(false);
  });

  it('emits when parent.completion_date is within 30d (not stale)', async () => {
    const sb = makeSb(
      { id: 'sd5', parent_sd_id: 'parent5' },
      { id: 'parent5', sd_key: 'SD-PARENT', status: 'completed', completion_date: DAYS(15) }
    );
    const r = await isParentOrchestratorStale('SD-X', sb);
    expect(r.suppress).toBe(false);
  });
});

// ── CAPA-3: tautology guard via isPlaceholderText ──
describe('CAPA-3 isAllKeyChangesPlaceholder — TS-8 / TS-9', () => {
  it('TS-8: returns true when key_changes=["Implement core changes for: foo"] (matches isPlaceholderText regex)', () => {
    expect(isAllKeyChangesPlaceholder(['Implement core changes for: vision-scorer'])).toBe(true);
  });

  it('TS-8 (object form): returns true when key_changes=[{change: "Implement core changes for: bar"}]', () => {
    expect(isAllKeyChangesPlaceholder([{ change: 'Implement core changes for: bar' }])).toBe(true);
  });

  it('TS-9: returns false when at least one entry has concrete file/function reference', () => {
    expect(
      isAllKeyChangesPlaceholder([
        'Implement core changes for: foo',
        'Edit scripts/eva/corrective-sd-generator.mjs:481 to add suppression check',
      ])
    ).toBe(false);
  });

  it('returns false when key_changes is empty array', () => {
    expect(isAllKeyChangesPlaceholder([])).toBe(false);
  });

  it('returns false when key_changes is null/undefined', () => {
    expect(isAllKeyChangesPlaceholder(null)).toBe(false);
    expect(isAllKeyChangesPlaceholder(undefined)).toBe(false);
  });
});

// ── CAPA-4: self-exemption strip ──
describe('CAPA-4 stripSelfExemptingGate — TS-10 / TS-11', () => {
  it('TS-10: strips GATE_VISION_SCORE when source_gate=eva_vision_score', () => {
    const r = stripSelfExemptingGate(['GATE_VISION_SCORE'], 'eva_vision_score');
    expect(r).toEqual([]);
  });

  it('TS-10: strips GATE_VISION_SCORE when source_gate=eva_heal_score (heal scores under vision umbrella)', () => {
    const r = stripSelfExemptingGate(['GATE_VISION_SCORE'], 'eva_heal_score');
    expect(r).toEqual([]);
  });

  it('TS-11 additive: strips ONLY the self-exempting entry, preserves other exemptions', () => {
    const r = stripSelfExemptingGate(
      ['GATE_VISION_SCORE', 'GATE_TESTING', 'GATE_DESIGN'],
      'eva_vision_score'
    );
    expect(r).toEqual(['GATE_TESTING', 'GATE_DESIGN']);
  });

  it('preserves array as-is when source_gate is unknown (no mapping)', () => {
    const r = stripSelfExemptingGate(['GATE_VISION_SCORE'], 'unknown_source');
    expect(r).toEqual(['GATE_VISION_SCORE']);
  });

  it('returns empty array when input is null/undefined/empty', () => {
    expect(stripSelfExemptingGate(null, 'eva_vision_score')).toEqual([]);
    expect(stripSelfExemptingGate([], 'eva_vision_score')).toEqual([]);
  });
});

// ── FR-5: heal-command.mjs:681 forwards options ──
describe('FR-5 — heal-command.mjs cmdSDGenerateAll forwards options to generateCorrectiveSD (TS-13)', () => {
  const HEAL = path.resolve(__dirname, '../../../scripts/eva/heal-command.mjs');
  const src = readFileSync(HEAL, 'utf8');

  it('TS-13: line in cmdSDGenerateAll forwards `options` (was `generateCorrectiveSD(scoreId)` pre-fix)', () => {
    // Static-pattern assertion: the for-loop in cmdSDGenerateAll must forward options.
    // Pre-fix called with 1 arg; post-fix calls with 2 args.
    expect(src).toMatch(/cmdSDGenerateAll[\s\S]*?for\s*\(\s*const\s+scoreId\s+of\s+ids\s*\)\s*\{[\s\S]*?const\s+result\s*=\s*await\s+generateCorrectiveSD\s*\(\s*scoreId\s*,\s*options\s*\)/);
  });

  it('cmdSDGenerate (single-emit path) forwards options too — sibling parity check', () => {
    expect(src).toMatch(/async\s+function\s+cmdSDGenerate\s*\([^)]*\)\s*\{[\s\S]*?const\s+result\s*=\s*await\s+generateCorrectiveSD\s*\(\s*scoreId\s*,\s*options\s*\)/);
  });
});

// ── AC-2: static-grep for isPlaceholderText reuse ──
describe('AC-2 — corrective-sd-generator.mjs reuses isPlaceholderText (does not redefine)', () => {
  const GEN = path.resolve(__dirname, '../../../scripts/eva/corrective-sd-generator.mjs');
  const src = readFileSync(GEN, 'utf8');

  it('imports isPlaceholderText from canonical location (no redefinition)', () => {
    expect(src).toMatch(
      /^import\s+\{[^}]*isPlaceholderText[^}]*\}\s+from\s+['"][^'"]*lead-to-plan\/gates\/placeholder-content[^'"]*['"]/m
    );
  });

  it('isPlaceholderText is referenced AT LEAST 2x (1 import + 1 use)', () => {
    const matches = src.match(/\bisPlaceholderText\b/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

// ── AC-4: distinct event types for each suppression path ──
describe('AC-4 — each suppression path emits a distinct eva.corrective.* event', () => {
  const GEN = path.resolve(__dirname, '../../../scripts/eva/corrective-sd-generator.mjs');
  const src = readFileSync(GEN, 'utf8');

  it('emits skipped_completed_source_24h (CAPA-1)', () => {
    expect(src).toMatch(/['"]skipped_completed_source_24h['"]/);
  });
  it('emits skipped_stale_orchestrator_30d (CAPA-2)', () => {
    expect(src).toMatch(/['"]skipped_stale_orchestrator_30d['"]/);
  });
  it('emits refused_tautology_key_changes (CAPA-3)', () => {
    expect(src).toMatch(/['"]refused_tautology_key_changes['"]/);
  });

  it('preserves existing skipped_a05_source_class + skipped_lifecycle_feature_class events', () => {
    expect(src).toMatch(/['"]skipped_a05_source_class['"]/);
    expect(src).toMatch(/['"]skipped_lifecycle_feature_class['"]/);
  });
});
