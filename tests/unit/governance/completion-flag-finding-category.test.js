/**
 * Unit/integration tests — SD-LEO-INFRA-HARNESS-BACKLOG-PER-001, TS-1, TS-2, TS-3, TS-6, TS-9.
 *
 * FR-1/FR-2: capture-completion-flags.js's routeFlag() now routes every REAL per-flag finding
 * to category='completion_flag_finding' (write-time-terminal) instead of 'harness_backlog',
 * mirroring the completion_flag_witness precedent. This suite is the NEW SD's own acceptance
 * gate, distinct from tests/unit/governance/completion-flags.test.js's regression suite for the
 * routeFlag() function itself (updated in place there for the same routing change).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';

import { captureCompletionFlags, formatCompletionFlagsBlock } from '../../../scripts/capture-completion-flags.js';
import { emitFeedback } from '../../../lib/governance/emit-feedback.js';
import { TERMINAL_CATEGORIES, isTerminalCategory } from '../../../lib/governance/feedback-terminal-categories.cjs';
import { SLA_CATEGORIES } from '../../../lib/coordinator/feedback-sla-gauge.cjs';
import { DRAIN_DESCRIPTORS } from '../../../lib/governance/gauge-registry.js';

/** Same mock shape as tests/unit/governance/completion-flags.test.js's buildEmitSupabase. */
function buildEmitSupabase({ existingByHash = {} } = {}) {
  const rows = [];
  const probes = [];
  const makeDedupChain = () => {
    let captured = {};
    const chain = {
      eq: vi.fn((col, val) => {
        if (col === 'category') captured.category = val;
        if (col === 'metadata->>dedup_hash') captured.hash = val;
        return chain;
      }),
      maybeSingle: vi.fn(async () => {
        probes.push(captured.hash);
        return { data: existingByHash[captured.hash] || null, error: null };
      }),
    };
    return chain;
  };
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => makeDedupChain()),
      insert: vi.fn((row) => {
        rows.push(row);
        return { select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: `fb-${rows.length}` }, error: null })) })) };
      }),
    })),
    _rows: rows,
    _probes: probes,
  };
}

// ---------------------------------------------------------------------------
// TS-1
// ---------------------------------------------------------------------------
describe('TS-1: a real (non-witness) finding writes completion_flag_finding, not harness_backlog', () => {
  it('harness/quirk/friction/tied_to_sd/default findings all land in completion_flag_finding', async () => {
    const supabase = buildEmitSupabase();
    await captureCompletionFlags({
      supabase,
      sdKey: 'SD-TEST-PER-001',
      flags: [
        { type: 'harness', item: 'sweep fired with no heartbeat' },
        { type: 'quirk', item: 'odd but expected behavior' },
        { type: 'friction', item: 'gate 2x recurrence' },
        { type: 'tied_to_sd', base_type: 'harness', sd_id: 'sd-uuid-1', item: 'linked finding' },
      ],
      reflection: { asked: true, checklist_items: 4, gaps_found: 0 },
    });
    expect(supabase._rows).toHaveLength(4);
    for (const row of supabase._rows) {
      expect(row.category).toBe('completion_flag_finding');
      expect(row.category).not.toBe('harness_backlog');
    }
  });
});

// ---------------------------------------------------------------------------
// TS-2
// ---------------------------------------------------------------------------
describe('TS-2: zero findings still writes completion_flag_witness (regression guard)', () => {
  it('a zero-findings run writes exactly one witness row, category unchanged', async () => {
    const supabase = buildEmitSupabase();
    const results = await captureCompletionFlags({
      supabase,
      sdKey: 'SD-TEST-PER-002',
      flags: [],
      reflection: { asked: true, checklist_items: 3, gaps_found: 0 },
    });
    expect(results).toHaveLength(0);
    expect(supabase._rows).toHaveLength(1);
    expect(supabase._rows[0].category).toBe('completion_flag_witness');
    expect(supabase._rows[0].metadata.no_flags).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TS-3
// ---------------------------------------------------------------------------
describe('TS-3: other harness_backlog writers are untouched', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const otherWriters = [
    { file: 'lib/eva/lifecycle-sd-bridge.js', label: 'capability-suppression rows' },
    { file: 'lib/coordinator/signal-router.cjs', label: 'promoted-signal dedup rows' },
    { file: 'lib/adam/inbound-backlog-watchdog.js', label: 'watchdog alert rows' },
    { file: 'lib/adam/outbound-silence-watchdog.js', label: 'watchdog alert rows' },
  ];

  it.each(otherWriters)('$file ($label) still writes the literal harness_backlog category', ({ file }) => {
    const contents = readFileSync(path.join(repoRoot, file), 'utf8');
    expect(contents).toMatch(/category:\s*'harness_backlog'/);
    // Never accidentally migrated to the new category.
    expect(contents).not.toMatch(/category:\s*'completion_flag_finding'/);
  });
});

// ---------------------------------------------------------------------------
// TS-6
// ---------------------------------------------------------------------------
describe('TS-6: consumers account for the new category; the 2 no-change gauges are unaffected', () => {
  it('feedback-terminal-categories.cjs is additive: completion_flag_finding added, nothing removed', () => {
    expect(TERMINAL_CATEGORIES).toContain('completion_flag_finding');
    expect(TERMINAL_CATEGORIES).toContain('completion_flag_witness');
    expect(TERMINAL_CATEGORIES).toContain('telemetry_aggregate');
    expect(TERMINAL_CATEGORIES).toContain('informational_note');
    expect(isTerminalCategory('completion_flag_finding')).toBe(true);
  });

  it('feedback-sla-gauge.cjs SLA_CATEGORIES.harness_backlog filter is unchanged (regression guard — no logic change per FR-5)', () => {
    expect(SLA_CATEGORIES.harness_backlog).toEqual({ days: 7 });
    expect(SLA_CATEGORIES).not.toHaveProperty('completion_flag_finding');
  });

  it('gauge-registry.js harness-backlog descriptor source.category filter is unchanged (regression guard — no logic change per FR-5)', () => {
    const descriptor = DRAIN_DESCRIPTORS['harness-backlog'];
    expect(descriptor.source).toEqual({ kind: 'feedback_category', category: 'harness_backlog' });
  });
});

// ---------------------------------------------------------------------------
// TS-9
// ---------------------------------------------------------------------------
describe('TS-9: completion_flag_finding round-trips through the REAL persistence layer (emitFeedback)', () => {
  it('emitFeedback accepts category=completion_flag_finding with no schema/validator rejection', async () => {
    const supabase = buildEmitSupabase();
    const { id, deduped } = await emitFeedback({
      supabase,
      title: 'Completion flag (harness) — SD-TEST-PER-009',
      description: 'TS-9 persistence round-trip check',
      type: 'enhancement',
      category: 'completion_flag_finding',
      status: 'new',
    });
    expect(deduped).toBe(false);
    expect(id).toBeTruthy();
    expect(supabase._rows[0].category).toBe('completion_flag_finding');
  });
});

// Sanity: formatter still works for a completion_flag_finding-routed result (no format regression).
describe('formatCompletionFlagsBlock renders completion_flag_finding routing', () => {
  it('renders the routedTo column with the new category value', () => {
    const block = formatCompletionFlagsBlock([{ item: 'finding A', type: 'harness', routedTo: 'completion_flag_finding', id: 'fb-1' }]);
    expect(block).toContain('- finding A | harness | completion_flag_finding | fb-1');
  });
});
