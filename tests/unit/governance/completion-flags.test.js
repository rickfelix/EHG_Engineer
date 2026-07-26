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
import { COMPLETION_FLAG, WITNESS_INDETERMINATE, isWitnessIndeterminate } from '../../../lib/governance/completion-flag-keys.js';
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
function buildValidatorSupabase({ feedbackRows = [], retros = [], prRecords = [], docmon = [], healRows = [], tablesSeen = null } = {}) {
  const terminal = (data) => Promise.resolve({ data, error: null });

  function tableHandler(table) {
    if (tablesSeen) tablesSeen.push(table);
    // Generic chainable builder; .then resolves to the canned data for non-feedback tables.
    // NOTE (QF-20260725-868): this fixture answers ANY table name with `[]`, which is precisely
    // why it never caught the `eva_heal_scores` phantom — a stub that satisfies every name cannot
    // discriminate a wrong one. Hence the explicit table-name assertion in the HEAL suite below.
    const result =
      table === 'retrospectives' ? retros :
      table === 'sd_scope_deliverables' ? prRecords :
      table === 'sub_agent_execution_results' ? docmon :
      table === 'eva_vision_scores' ? healRows :
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
// SD-LEO-INFRA-HARNESS-BACKLOG-DRAIN-POLICY-001 (FR-2): the pinned witness tuple's
// category moved from 'harness_backlog' to 'completion_flag_witness' -- the describe
// title and the assertion below are updated to match; status:'backlog' is unchanged.
describe('TS-3 witness tuple invariant {enhancement, completion_flag_witness, backlog}', () => {
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
    expect(witness.category).toBe('completion_flag_witness');
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

  // QF-20260725-868 — the witness could not detect its OWN failure to run. Its catch returned null,
  // byte-identical to the success path, so a CRASH reported VERIFIED-CLEAN.
  //
  // The QF's acceptance is explicit: demonstrate AT THE CONSUMER that a thrown validator is observed
  // as could-not-determine AND that completion is NOT blocked. A green CI shows neither half, so
  // these force the throw rather than asserting on the predicate in isolation.
  describe('QF-20260725-868: a crashed witness is distinguishable from a clean one, and never blocks', () => {
    /** A client whose completion-flags probe THROWS, with every other path intact. */
    function buildThrowingWitnessSupabase() {
      const base = buildValidatorSupabase({ feedbackRows: [] });
      const inserted = [];
      return {
        _inserted: inserted,
        from(table) {
          if (table === 'feedback') {
            return {
              // The witness read path explodes...
              select: () => { throw new Error('supabase exploded'); },
              // ...but the countability write path must still be reachable.
              insert: (row) => { inserted.push(row); return Promise.resolve({ data: null, error: null }); },
            };
          }
          return base.from(table);
        },
      };
    }

    it('HALF 1 — the crash is OBSERVED as indeterminate, not silently reported clean', async () => {
      const supabase = buildThrowingWitnessSupabase();
      await validatePostCompletion(supabase, sd, 'SD-INFRA-XYZ-001');
      const advisories = errSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(advisories).toMatch(/could NOT be determined/i);
      expect(advisories).toContain('COMPLETION_FLAGS_WITNESS_INDETERMINATE');
      // It must NOT masquerade as a genuine "record missing" finding — that would be the same
      // defect inverted: asserting a result from a check that never produced one.
      expect(advisories).not.toMatch(/completion-flags record missing/i);
    });

    it('HALF 2 — completion is NOT blocked (surface, never block)', async () => {
      const supabase = buildThrowingWitnessSupabase();
      await validatePostCompletion(supabase, sd, 'SD-INFRA-XYZ-001');
      // A witness that blocks when it fails turns an observability gap into an availability outage:
      // this sits in a Stop hook between every worker and done, so one transient DB error would
      // wedge the fleet. exit(2) is the blocking path.
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('the indeterminate state is COUNTABLE, not merely logged', async () => {
      const supabase = buildThrowingWitnessSupabase();
      await validatePostCompletion(supabase, sd, 'SD-INFRA-XYZ-001');
      // "A non-blocking marker nobody can count is the same defect wearing a different value."
      const row = supabase._inserted.find(r => r?.category === WITNESS_INDETERMINATE.FEEDBACK_CATEGORY);
      expect(row, 'expected a queryable feedback row for the indeterminate state').toBeTruthy();
      expect(row.metadata.sd_key).toBe('SD-INFRA-XYZ-001');
      expect(row.metadata.state).toBe(WITNESS_INDETERMINATE.STATE);
    });

    it('telemetry failure cannot escalate into the blocking path', async () => {
      // If recording the crash also throws, the hook must still not block — otherwise the
      // availability risk we just rejected returns through the back door.
      const base = buildValidatorSupabase({ feedbackRows: [] });
      const supabase = {
        from(table) {
          if (table === 'feedback') {
            return {
              select: () => { throw new Error('read exploded'); },
              insert: () => { throw new Error('write exploded too'); },
            };
          }
          return base.from(table);
        },
      };
      await expect(validatePostCompletion(supabase, sd, 'SD-INFRA-XYZ-001')).resolves.not.toThrow();
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('the sentinel is tested by IDENTITY, never truthiness', () => {
      // A genuine reason string is also truthy; only the sentinel is could-not-determine.
      expect(isWitnessIndeterminate(WITNESS_INDETERMINATE.STATE)).toBe(true);
      expect(isWitnessIndeterminate('completion-flags record missing for SD-X')).toBe(false);
      expect(isWitnessIndeterminate(null)).toBe(false);
      expect(isWitnessIndeterminate(undefined)).toBe(false);
    });
  });

  // QF-20260725-868, THIRD SITE — surfaced by this PR's own schema-reference-lint failure.
  //
  // The HEAL check queried `eva_heal_scores`, a table that does not exist and never did (no
  // migration in the repo; that line was its only reference anywhere). So the probe errored every
  // run, the discarded error left `data` null, and 'HEAL' was pushed for EVERY code-producing SD
  // whether /heal ran or not — a permanent false positive in the same advisory list this QF's new
  // labels report into. The real writer is scripts/eva/heal-command.mjs, which inserts into
  // `eva_vision_scores` with `sd_id: <sd_key>`.
  describe('QF-20260725-868: the HEAL witness queries the table the writer actually writes', () => {
    let exitSpy, errSpy, logSpy;
    beforeEach(() => {
      exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('UNEXPECTED_EXIT'); });
      errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => { exitSpy.mockRestore(); errSpy.mockRestore(); logSpy.mockRestore(); });

    // Code-producing so the isCodeProducing branch (and therefore the HEAL check) actually runs.
    const codeSd = {
      id: 'sd-uuid-FEAT',
      sd_key: 'SD-FEAT-ABC-001',
      sd_type: 'feature',
      source: 'manual',
      completion_date: '2026-06-04T00:00:00Z',
    };

    it('a present heal score clears the HEAL advisory (RED before the fix)', async () => {
      // THE DISCRIMINATING TEST. Pre-fix this could not pass for any input: the phantom table meant
      // HEAL was pushed unconditionally, so "heal ran" and "heal did not run" were indistinguishable.
      const supabase = buildValidatorSupabase({
        healRows: [{ id: 'vs-1' }],
        feedbackRows: [{ id: 'fb-1', metadata: { reflection: { checklist_items: 4 } } }],
      });
      await validatePostCompletion(supabase, codeSd, 'SD-FEAT-ABC-001');
      const advisories = errSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(advisories).not.toMatch(/\bHEAL\b/);
    });

    it('no heal score still reports HEAL — the fix must not silence the real signal', async () => {
      // Proving BOTH directions: a table-name fix that always cleared HEAL would be just as broken.
      const supabase = buildValidatorSupabase({ healRows: [] });
      await validatePostCompletion(supabase, codeSd, 'SD-FEAT-ABC-001');
      const advisories = errSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(advisories).toMatch(/\bHEAL\b/);
      expect(advisories).toContain('/heal sd');
    });

    it('queries eva_vision_scores and never the phantom eva_heal_scores', async () => {
      // Pins the SEMANTIC that broke — writer and consumer must name the same relation. The generic
      // fixture answers any table with [], so without this assertion a re-drift to another
      // nonexistent name would keep every test green.
      const tablesSeen = [];
      const supabase = buildValidatorSupabase({ healRows: [{ id: 'vs-1' }], tablesSeen });
      await validatePostCompletion(supabase, codeSd, 'SD-FEAT-ABC-001');
      expect(tablesSeen).toContain('eva_vision_scores');
      expect(tablesSeen).not.toContain('eva_heal_scores');
    });

    it('an unreachable heal table surfaces as indeterminate, not as "HEAL missing"', async () => {
      // The original defect in miniature: a probe that cannot see the constraint must not report a
      // verdict. Non-blocking, consistent with the coordinator decision.
      const base = buildValidatorSupabase({});
      const supabase = {
        from(table) {
          if (table === 'eva_vision_scores') {
            const chain = {
              select: () => chain,
              eq: () => chain,
              limit: () => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }),
            };
            return chain;
          }
          return base.from(table);
        },
      };
      await validatePostCompletion(supabase, codeSd, 'SD-FEAT-ABC-001');
      const advisories = errSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(advisories).toContain('HEAL_CHECK_INDETERMINATE');
      expect(advisories).toMatch(/HEAL witness could NOT be determined/i);
      expect(exitSpy).not.toHaveBeenCalled();
    });
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
