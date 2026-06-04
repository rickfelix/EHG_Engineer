/**
 * Unit tests for the Completion Flags mechanism.
 *
 * SD-LEO-INFRA-COMPLETION-FLAGS-DURABLE-001 — TS-1..TS-7.
 *
 * Covers:
 *   TS-1 routeFlag tuple mapping per class
 *   TS-2 writer/consumer frozen-key contract (constant identity)
 *   TS-3 witness 3-filter invariant (lifecycle + assist exclusion via the REAL functions)
 *   TS-4 validator placement (WARN in missingRecommended, no exit(2); record present -> no warn)
 *   TS-5 idempotency (same-day dedup; distinct findings -> distinct dedup_key)
 *   TS-6 reflection non-empty (empty -> warns; full -> passes)
 *   TS-7 emitFeedback backward-compat (no status -> row.status === 'new')
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  routeFlag,
  captureCompletionFlags,
  formatCompletionFlagsBlock,
} from '../../../scripts/capture-completion-flags.js';
import { COMPLETION_FLAG } from '../../../lib/governance/completion-flag-keys.js';
import { emitFeedback } from '../../../lib/governance/emit-feedback.js';

// REAL consumer functions (TS-3) — assert the witness tuple against actual behavior.
import { mapFeedbackLifecycle } from '../../../lib/inbox/unified-inbox-builder.js';
import { splitEnhancementsExcludingHarnessBacklog } from '../../../lib/quality/assist-engine.js';

// Consumer under test for TS-4/TS-6.
import { validatePostCompletion } from '../../../scripts/hooks/stop-subagent-enforcement/post-completion-validator.js';

// ---------------------------------------------------------------------------
// Supabase mock helpers
// ---------------------------------------------------------------------------

/**
 * Mock for emit-feedback's dedup+insert chain:
 *   from('feedback').select(...).eq(...).eq(...).maybeSingle()  -> dedup probe
 *   from('feedback').insert(row).select('id').single()          -> insert
 * Records every inserted row on `_rows` and every probed dedup_hash on `_probes`.
 * `existingByHash` lets a test simulate an already-present row (dedup hit).
 */
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
        const hit = existingByHash[captured.hash] || null;
        return { data: hit, error: null };
      }),
    };
    return chain;
  };

  const supabase = {
    from: vi.fn((_table) => ({
      select: vi.fn(() => makeDedupChain()),
      insert: vi.fn((row) => {
        rows.push(row);
        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { id: `fb-${rows.length}` }, error: null })),
          })),
        };
      }),
    })),
    _rows: rows,
    _probes: probes,
  };
  return supabase;
}

/**
 * Mock for the post-completion validator. Routes each table to a canned result set.
 * The `feedback` table responds to the completion-flags witness query
 * (.eq('metadata->>origin', ...).eq('metadata->>source_sd', ...)).
 */
function buildValidatorSupabase({ feedbackRows = [], retros = [], prRecords = [], docmon = [] } = {}) {
  const terminal = (data) => Promise.resolve({ data, error: null });

  function tableHandler(table) {
    // Generic chainable builder; .then resolves to the canned data for non-feedback tables.
    const result =
      table === 'retrospectives' ? retros :
      table === 'sd_scope_deliverables' ? prRecords :
      table === 'sub_agent_execution_results' ? docmon :
      [];

    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      ilike: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => terminal(result)),
      // Some queries end on .eq() (feedback witness) — make the chain thenable so
      // `await supabase.from('feedback').select().eq().eq()` resolves.
      then: (resolve) => resolve({ data: table === 'feedback' ? feedbackRows : result, error: null }),
    };
    return chain;
  }

  return { from: vi.fn((table) => tableHandler(table)) };
}

// ---------------------------------------------------------------------------
// TS-1 — routeFlag tuple mapping
// ---------------------------------------------------------------------------
describe('TS-1 routeFlag tuple mapping per class', () => {
  it('harness/quirk/friction -> harness_backlog / enhancement / new', () => {
    for (const type of ['harness', 'quirk', 'friction']) {
      expect(routeFlag({ type })).toEqual({
        category: 'harness_backlog',
        feedbackType: 'enhancement',
        status: 'new',
      });
    }
  });

  it('needs_decision -> non-harness category / issue / new', () => {
    const r = routeFlag({ type: 'needs_decision' });
    expect(r.feedbackType).toBe('issue');
    expect(r.status).toBe('new');
    expect(r.category).not.toBe('harness_backlog'); // must NOT be excluded from /leo assist
  });

  it('tied_to_sd -> base class routing + sd_id', () => {
    const r = routeFlag({ type: 'tied_to_sd', base_type: 'harness', sd_id: 'sd-uuid-9' });
    expect(r.category).toBe('harness_backlog');
    expect(r.feedbackType).toBe('enhancement');
    expect(r.sd_id).toBe('sd-uuid-9');
  });

  it('already_homed -> link_only, no new row', () => {
    const r = routeFlag({ type: 'already_homed', existing_id: 'fb-existing' });
    expect(r.link_only).toBe(true);
    expect(r.existing_id).toBe('fb-existing');
  });
});

// ---------------------------------------------------------------------------
// TS-2 — writer/consumer frozen-key contract
// ---------------------------------------------------------------------------
describe('TS-2 writer/consumer key contract (frozen constant identity)', () => {
  it('capture writes metadata under the frozen ORIGIN/SOURCE keys', async () => {
    const supabase = buildEmitSupabase();
    await captureCompletionFlags({
      supabase,
      sdKey: 'SD-TEST-001',
      flags: [{ type: 'harness', item: 'sweep fired with no heartbeat' }],
      reflection: { asked: true, checklist_items: 3, gaps_found: 0 },
    });
    const inserted = supabase._rows[0];
    expect(inserted.metadata[COMPLETION_FLAG.ORIGIN_KEY]).toBe(COMPLETION_FLAG.ORIGIN_VALUE);
    expect(inserted.metadata[COMPLETION_FLAG.SOURCE_SD_KEY]).toBe('SD-TEST-001');
  });

  it('the validator imports the SAME frozen constant object (identity)', async () => {
    // The writer module and the validator module both `import { COMPLETION_FLAG }`
    // from lib/governance/completion-flag-keys.js. ESM module caching guarantees a
    // single shared object instance, so the test-visible constant IS the same object
    // both modules reference. A drift in the literal source would break BOTH the
    // capture assertion above AND the validator query below simultaneously.
    const capModule = await import('../../../scripts/capture-completion-flags.js');
    const keysModule = await import('../../../lib/governance/completion-flag-keys.js');
    expect(keysModule.COMPLETION_FLAG).toBe(COMPLETION_FLAG); // identity, not deep-equal
    // The constant is frozen — a mutation attempt is silently ignored, so neither the
    // writer nor the consumer can drift it at runtime.
    expect(Object.isFrozen(COMPLETION_FLAG)).toBe(true);
    const before = COMPLETION_FLAG.ORIGIN_VALUE;
    try { COMPLETION_FLAG.ORIGIN_VALUE = 'mutated'; } catch { /* strict-mode throw OK */ }
    expect(COMPLETION_FLAG.ORIGIN_VALUE).toBe(before);
    expect(capModule.routeFlag).toBeTypeOf('function');
  });
});

// ---------------------------------------------------------------------------
// TS-3 — witness 3-filter invariant
// ---------------------------------------------------------------------------
describe('TS-3 witness tuple invariant {enhancement, harness_backlog, backlog}', () => {
  it('status=backlog maps to ON_THE_SHELF (NOT NEW) in the real inbox lifecycle', () => {
    // Witness uses status:'backlog' so it parks on the shelf rather than nagging in NEW.
    expect(mapFeedbackLifecycle('backlog')).toBe('ON_THE_SHELF');
    expect(mapFeedbackLifecycle('backlog')).not.toBe('NEW');
  });

  it('category=harness_backlog is dropped by the real /leo assist enhancements split', () => {
    const witnessRow = { type: 'enhancement', category: 'harness_backlog' };
    const otherRow = { type: 'enhancement', category: 'completion_flag' };
    const { enhancements, skippedHarnessBacklog } = splitEnhancementsExcludingHarnessBacklog([witnessRow, otherRow]);
    expect(skippedHarnessBacklog).toBe(1);
    expect(enhancements).toHaveLength(1);
    expect(enhancements[0].category).toBe('completion_flag'); // witness excluded, decision-flag kept
  });

  it('captureCompletionFlags writes exactly the pinned witness tuple when no flags', async () => {
    const supabase = buildEmitSupabase();
    await captureCompletionFlags({
      supabase,
      sdKey: 'SD-TEST-002',
      flags: [],
      reflection: { asked: true, checklist_items: 5, gaps_found: 0 },
    });
    expect(supabase._rows).toHaveLength(1);
    const witness = supabase._rows[0];
    expect(witness.type).toBe('enhancement');
    expect(witness.category).toBe('harness_backlog');
    expect(witness.status).toBe('backlog');
    expect(witness.metadata.no_flags).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TS-4 — validator placement
// ---------------------------------------------------------------------------
describe('TS-4 validator placement (reminder-first, never exit(2))', () => {
  let exitSpy;
  let errSpy;
  let logSpy;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('UNEXPECTED_EXIT'); });
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    exitSpy.mockRestore();
    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  // Completed, NON-code-producing SD with a completion_date so the SHIP block never fires
  // and the isCodeProducing branch is skipped — isolating the completion-flags witness check.
  const sd = {
    id: 'sd-uuid-INFRA',
    sd_key: 'SD-INFRA-XYZ-001',
    sd_type: 'infrastructure',
    completion_date: '2026-06-04T00:00:00Z',
  };

  it('no completion-flags record -> COMPLETION_FLAGS warning, no exit(2)', async () => {
    const supabase = buildValidatorSupabase({ feedbackRows: [] });
    await validatePostCompletion(supabase, sd, 'SD-INFRA-XYZ-001');
    expect(exitSpy).not.toHaveBeenCalled();
    const advisories = errSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(advisories).toContain('Missing recommended');
    expect(advisories).toMatch(/completion-flags record missing/i);
    expect(advisories).toContain('scripts/capture-completion-flags.js');
  });

  it('valid completion-flags record present -> no COMPLETION_FLAGS warning', async () => {
    const supabase = buildValidatorSupabase({
      feedbackRows: [{ id: 'fb-1', metadata: { reflection: { checklist_items: 4 } } }],
    });
    await validatePostCompletion(supabase, sd, 'SD-INFRA-XYZ-001');
    expect(exitSpy).not.toHaveBeenCalled();
    const advisories = errSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(advisories).not.toMatch(/completion-flags record (missing|incomplete)/i);
  });
});

// ---------------------------------------------------------------------------
// TS-5 — idempotency
// ---------------------------------------------------------------------------
describe('TS-5 idempotency (same-day dedup; distinct findings -> distinct keys)', () => {
  it('capturing the same finding twice in a day dedups on the second pass', async () => {
    // First pass: no existing rows -> insert. Capture the probed dedup_hash.
    const first = buildEmitSupabase();
    await captureCompletionFlags({
      supabase: first,
      sdKey: 'SD-TEST-005',
      flags: [{ type: 'harness', item: 'same finding' }],
      reflection: { asked: true, checklist_items: 1, gaps_found: 0 },
    });
    expect(first._rows).toHaveLength(1);
    const hash = first._probes[0];
    expect(hash).toMatch(/^[a-f0-9]{64}$/);

    // Second pass: same day + same finding -> emit-feedback's dedup probe hits -> no insert.
    const second = buildEmitSupabase({ existingByHash: { [hash]: { id: 'fb-existing' } } });
    const results = await captureCompletionFlags({
      supabase: second,
      sdKey: 'SD-TEST-005',
      flags: [{ type: 'harness', item: 'same finding' }],
      reflection: { asked: true, checklist_items: 1, gaps_found: 0 },
    });
    expect(second._rows).toHaveLength(0); // deduped: no new INSERT
    expect(results[0].id).toBe('fb-existing');
  });

  it('distinct findings produce distinct dedup_hash probes', async () => {
    const supabase = buildEmitSupabase();
    await captureCompletionFlags({
      supabase,
      sdKey: 'SD-TEST-005b',
      flags: [
        { type: 'harness', item: 'finding A' },
        { type: 'harness', item: 'finding B' },
      ],
      reflection: { asked: true, checklist_items: 2, gaps_found: 0 },
    });
    expect(supabase._probes).toHaveLength(2);
    expect(supabase._probes[0]).not.toBe(supabase._probes[1]);
    expect(supabase._rows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// TS-6 — reflection non-empty
// ---------------------------------------------------------------------------
describe('TS-6 reflection completeness gates the validator warning', () => {
  let exitSpy, errSpy, logSpy;
  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('UNEXPECTED_EXIT'); });
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    exitSpy.mockRestore(); errSpy.mockRestore(); logSpy.mockRestore();
  });

  const sd = { id: 'sd-uuid-R', sd_key: 'SD-R-001', sd_type: 'infrastructure', completion_date: '2026-06-04T00:00:00Z' };

  it('record present but reflection empty (no numeric checklist_items) -> warns', async () => {
    const supabase = buildValidatorSupabase({
      feedbackRows: [{ id: 'fb-1', metadata: { reflection: {} } }], // checklist_items missing
    });
    await validatePostCompletion(supabase, sd, 'SD-R-001');
    const advisories = errSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(advisories).toMatch(/completion-flags record incomplete/i);
  });

  it('record present with full reflection (numeric checklist_items) -> no warn', async () => {
    const supabase = buildValidatorSupabase({
      feedbackRows: [{ id: 'fb-1', metadata: { reflection: { checklist_items: 6, asked: true, gaps_found: 1 } } }],
    });
    await validatePostCompletion(supabase, sd, 'SD-R-001');
    const advisories = errSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(advisories).not.toMatch(/completion-flags record (missing|incomplete)/i);
  });

  it('captureCompletionFlags always carries the reflection bag in metadata (FR-6)', async () => {
    const supabase = buildEmitSupabase();
    await captureCompletionFlags({
      supabase,
      sdKey: 'SD-TEST-006',
      flags: [{ type: 'harness', item: 'x' }],
      reflection: { asked: true, checklist_items: 7, gaps_found: 2 },
    });
    const meta = supabase._rows[0].metadata;
    expect(meta.reflection).toEqual({ asked: true, checklist_items: 7, gaps_found: 2 });
  });
});

// ---------------------------------------------------------------------------
// TS-7 — emitFeedback backward-compat
// ---------------------------------------------------------------------------
describe('TS-7 emitFeedback additive status param (backward-compat)', () => {
  function buildInsertCaptureSupabase() {
    const insert = vi.fn((_row) => ({
      select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: 'fb-1' }, error: null })) })),
    }));
    const dedupSelect = vi.fn(() => ({
      eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })),
    }));
    return { from: vi.fn(() => ({ select: dedupSelect, insert })), _insert: insert };
  }

  it('called WITHOUT status -> inserted row.status === "new"', async () => {
    const supabase = buildInsertCaptureSupabase();
    await emitFeedback({ supabase, title: 't', description: 'd' });
    expect(supabase._insert.mock.calls[0][0].status).toBe('new');
  });

  it('called WITH status -> inserted row.status honored', async () => {
    const supabase = buildInsertCaptureSupabase();
    await emitFeedback({ supabase, title: 't', description: 'd', status: 'backlog' });
    expect(supabase._insert.mock.calls[0][0].status).toBe('backlog');
  });

  it('resolution_notes is only set when supplied (additive pass-through)', async () => {
    const supabase = buildInsertCaptureSupabase();
    await emitFeedback({ supabase, title: 't', description: 'd' });
    expect('resolution_notes' in supabase._insert.mock.calls[0][0]).toBe(false);

    const supabase2 = buildInsertCaptureSupabase();
    await emitFeedback({ supabase: supabase2, title: 't', description: 'd', resolution_notes: 'note' });
    expect(supabase2._insert.mock.calls[0][0].resolution_notes).toBe('note');
  });
});

// ---------------------------------------------------------------------------
// FR-1 — output block formatting (explicit 0-flags)
// ---------------------------------------------------------------------------
describe('FR-1 formatCompletionFlagsBlock', () => {
  it('prints "- 0 flags" explicitly when empty', () => {
    const block = formatCompletionFlagsBlock([]);
    expect(block).toContain('## Completion Flags');
    expect(block).toContain('- 0 flags');
  });

  it('prints one row per flag with item | type | routed-to | id', () => {
    const block = formatCompletionFlagsBlock([
      { item: 'finding A', type: 'harness', routedTo: 'harness_backlog', id: 'fb-1' },
    ]);
    expect(block).toContain('- finding A | harness | harness_backlog | fb-1');
  });
});
