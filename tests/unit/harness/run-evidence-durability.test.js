/**
 * SD-LEO-INFRA-RUN-EVIDENCE-DURABILITY-001 — unit tests covering PRD
 * TS-1 (journal survives teardown at its run_id path), TS-2 (finalize-mirror
 * persists), TS-3 (finalize-mirror hard-fails loudly on write failure), TS-5
 * (finalize-mirror row structurally immune to teardown — verified by construction,
 * not exclusion logic, since it lives in system_events not venture_artifacts).
 *
 * Design note: an earlier revision persisted the mirror as a venture_artifacts row
 * excluded from teardown's delete via .neq(). Deep-tier adversarial review found
 * venture_artifacts.venture_id is ON DELETE CASCADE — the row would be silently
 * destroyed the instant teardown deletes the venture, regardless of the .neq()
 * exclusion (CASCADE fires at the FK level, not through the application's own
 * delete queries). The mirror was moved to system_events (no FK to ventures,
 * verified live), so these tests no longer need a "mitigation" describe block —
 * durability now holds by construction, not by a delete-order workaround.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../../lib/repo-paths.js', () => ({
  getRepoRoot: vi.fn(),
}));

import { getRepoRoot } from '../../../lib/repo-paths.js';
import { RunJournal, finalizeMirror } from '../../../lib/harness/run-journal.mjs';
import { assertClean } from '../../../scripts/harness/s20-fixture.mjs';

let TMP;

beforeEach(() => {
  TMP = mkdtempSync(join(tmpdir(), 'harness-run-evidence-'));
  getRepoRoot.mockReturnValue(TMP);
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('FR-1: RunJournal default baseDir anchored to the repo root (not cwd)', () => {
  it('resolves the default path via getRepoRoot(), independent of process.cwd()', () => {
    const j = new RunJournal('cross-cwd-run');
    expect(j.baseDir).toBe(join(TMP, '.harness-runs'));
    expect(j.path).toBe(join(TMP, '.harness-runs', 'cross-cwd-run', 'journal.jsonl'));
  });

  it('a second RunJournal instantiation for the same run_id (simulating a separate CLI process) resumes the SAME journal, even after process.cwd() changes', () => {
    const originalCwd = process.cwd();
    try {
      const j1 = new RunJournal('resume-across-process');
      j1.append({ kind: 'lifecycle', event: 'run started' });
      j1.append({ kind: 'lifecycle', event: 'band complete' });

      // Simulate the bug scenario: a later invocation (e.g. teardown) runs from a
      // DIFFERENT cwd. Before the fix, RunJournal('.harness-runs') would resolve
      // relative to this new cwd and silently start a fresh, empty journal.
      process.chdir(tmpdir());

      const j2 = new RunJournal('resume-across-process');
      expect(j2.path).toBe(j1.path);
      expect(j2.readAll()).toHaveLength(2);
      j2.append({ kind: 'lifecycle', event: 'teardown executed' });
      expect(j2.readAll()).toHaveLength(3);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('an explicit opts.baseDir always overrides the repo-root default (existing callers/tests unaffected)', () => {
    const explicit = join(TMP, 'explicit-scratch');
    const j = new RunJournal('explicit-run', { baseDir: explicit });
    expect(j.baseDir).toBe(explicit);
  });
});

describe('FR-3/FR-4: finalizeMirror persists to system_events, independent of the venture lifecycle', () => {
  function makeJournal(runId = 'mirror-run') {
    const j = new RunJournal(runId);
    j.append({ kind: 'lifecycle', event: 'run started' });
    return j;
  }

  it('persists successfully and journals a lifecycle event when the write succeeds', async () => {
    const journal = makeJournal();
    const insertEvent = vi.fn(async () => undefined);
    const result = await finalizeMirror({ supabase: {}, journal, ventureId: 'v1', seams: { insertEvent } });

    expect(result).toEqual({ persisted: true });
    expect(insertEvent).toHaveBeenCalledTimes(1);
    const events = journal.readAll();
    expect(events.some((e) => e.event.includes('finalize-mirror persisted'))).toBe(true);
  });

  it('hard-fails (throws) on any write failure — no pending-migration grace window since system_events has no CHECK blocking this write', async () => {
    const journal = makeJournal();
    const insertEvent = vi.fn(async () => { throw new Error('transient DB error'); });

    await expect(finalizeMirror({ supabase: {}, journal, ventureId: 'v1', seams: { insertEvent } }))
      .rejects.toThrow(/finalize-mirror write failed/);
  });

  it('writes to system_events (not venture_artifacts) — verified by inspecting the real insert call shape', async () => {
    const journal = makeJournal();
    const insertCalls = [];
    const supabase = {
      from(table) {
        insertCalls.push(table);
        return { insert: async (row) => { insertCalls.push(row); return { error: null }; } };
      },
    };

    await finalizeMirror({ supabase, journal, ventureId: 'v1' });

    expect(insertCalls[0]).toBe('system_events');
    const row = insertCalls[1];
    expect(row.event_type).toBe('harness_run_journal_finalized');
    expect(row.payload.run_id).toBe(journal.runId);
    expect(row.venture_id).toBeUndefined(); // informational only, never a real column
  });
});

describe('FR-2: assertClean asserts journal evidence PRESENT (additive to residue-absence)', () => {
  function makeSupabaseStub({ ventureRowCount = 0, otherTableCount = 0 } = {}) {
    const calls = [];
    function chain(result) {
      const obj = {
        eq: (...args) => { calls.push(['eq', ...args]); return obj; },
        select: (...args) => { calls.push(['select', ...args]); return obj; },
        delete: (...args) => { calls.push(['delete', ...args]); return obj; },
        then: (resolve) => resolve(result),
      };
      return obj;
    }
    return {
      calls,
      from(table) {
        if (table === 'ventures') return chain({ count: ventureRowCount });
        return chain({ count: otherTableCount, error: null });
      },
    };
  }

  it('fails clean when the journal has zero entries, even with zero DB residue', async () => {
    const supabase = makeSupabaseStub({ ventureRowCount: 0, otherTableCount: 0 });
    const journal = new RunJournal('empty-journal-run'); // no entries appended
    const { clean, results } = await assertClean(supabase, 'empty-journal-run', { journal, ventureId: 'v1' });
    expect(results.journal_evidence_present).toBe(false);
    expect(clean).toBe(false);
  });

  it('passes clean when the journal is non-empty and DB residue is zero', async () => {
    const supabase = makeSupabaseStub({ ventureRowCount: 0, otherTableCount: 0 });
    const journal = new RunJournal('nonempty-journal-run');
    journal.append({ kind: 'lifecycle', event: 'fixture created' });
    const { clean, results } = await assertClean(supabase, 'nonempty-journal-run', { journal, ventureId: 'v1' });
    expect(results.journal_evidence_present).toBe(true);
    expect(clean).toBe(true);
  });

  it('still fails clean on DB residue even when the journal is non-empty (existing behavior preserved)', async () => {
    const supabase = makeSupabaseStub({ ventureRowCount: 0, otherTableCount: 1 });
    const journal = new RunJournal('residue-run');
    journal.append({ kind: 'lifecycle', event: 'fixture created' });
    const { clean } = await assertClean(supabase, 'residue-run', { journal, ventureId: 'v1' });
    expect(clean).toBe(false);
  });
});
