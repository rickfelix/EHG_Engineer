/**
 * SD-LEO-INFRA-RUN-EVIDENCE-DURABILITY-001 — unit tests covering PRD
 * TS-1 (journal survives teardown at its run_id path), TS-2/TS-3 (finalize-mirror
 * loud-warn pre-apply / hard-fail post-apply), TS-5 (finalize-mirror excluded from
 * teardown's delete + residue assertion). TS-4 (post-migration CHECK acceptance) and
 * TS-6 (parity-test exemption) are covered by the migration dry-run + the existing
 * tests/unit/eva/artifact-type-db-parity.test.js suite, not duplicated here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../../lib/repo-paths.js', () => ({
  getRepoRoot: vi.fn(),
}));
vi.mock('../../../lib/eva/stage-templates/artifact-type-parity.js', () => ({
  loadPendingChairmanGateAllowlist: vi.fn(),
}));

import { getRepoRoot } from '../../../lib/repo-paths.js';
import { loadPendingChairmanGateAllowlist } from '../../../lib/eva/stage-templates/artifact-type-parity.js';
import { RunJournal, finalizeMirror } from '../../../lib/harness/run-journal.mjs';
import { teardownFixture, assertClean, CORE_FIXTURE_TABLES } from '../../../scripts/harness/s20-fixture.mjs';

let TMP;

beforeEach(() => {
  TMP = mkdtempSync(join(tmpdir(), 'harness-run-evidence-'));
  getRepoRoot.mockReturnValue(TMP);
  loadPendingChairmanGateAllowlist.mockReturnValue({});
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

describe('FR-3/FR-4: finalizeMirror loud-fail gated on migration-applied state', () => {
  function makeJournal(runId = 'mirror-run') {
    const j = new RunJournal(runId);
    j.append({ kind: 'lifecycle', event: 'run started' });
    return j;
  }

  it('persists successfully and journals a lifecycle event when the write succeeds', async () => {
    const journal = makeJournal();
    const writeArtifact = vi.fn(async () => 'artifact-id');
    const result = await finalizeMirror({ supabase: {}, journal, ventureId: 'v1', lifecycleStage: 20, seams: { writeArtifact } });

    expect(result).toEqual({ persisted: true });
    expect(writeArtifact).toHaveBeenCalledTimes(1);
    const events = journal.readAll();
    expect(events.some((e) => e.event.includes('finalize-mirror persisted'))).toBe(true);
  });

  it('degrades to a loud warning (never throws) when the migration is still pending-chairman-gated', async () => {
    loadPendingChairmanGateAllowlist.mockReturnValue({ harness_run_journal: { reason: 'staged' } });
    const journal = makeJournal();
    const writeArtifact = vi.fn(async () => { throw new Error('CHECK constraint violation'); });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await finalizeMirror({ supabase: {}, journal, ventureId: 'v1', lifecycleStage: 20, seams: { writeArtifact } });

    expect(result.persisted).toBe(false);
    expect(result.degraded).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('HARNESS_FINALIZE_MIRROR_DEGRADED'));
    const events = journal.readAll();
    expect(events.some((e) => e.detail?.evidence_degraded === true)).toBe(true);
    warnSpy.mockRestore();
  });

  it('hard-fails (throws) on a write failure once the migration is applied (exemption removed)', async () => {
    loadPendingChairmanGateAllowlist.mockReturnValue({}); // exemption removed = migration applied
    const journal = makeJournal();
    const writeArtifact = vi.fn(async () => { throw new Error('unexpected DB error'); });

    await expect(finalizeMirror({ supabase: {}, journal, ventureId: 'v1', lifecycleStage: 20, seams: { writeArtifact } }))
      .rejects.toThrow(/finalize-mirror write failed/);
  });
});

describe('FR-2: assertClean asserts journal evidence PRESENT (additive to residue-absence)', () => {
  function makeSupabaseStub({ ventureRowCount = 0, otherTableCount = 0 } = {}) {
    const calls = [];
    function chain(result) {
      const obj = {
        eq: (...args) => { calls.push(['eq', ...args]); return obj; },
        neq: (...args) => { calls.push(['neq', ...args]); return obj; },
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

describe('Mitigation: finalize-mirror row excluded from venture_id-scoped delete + residue count', () => {
  const VENTURE_ID = 'v-mitigation-1';

  /** Tracks, per table, the sequence of chained calls (eq/neq/select/delete). */
  function makeTrackedSupabase() {
    const perTableCalls = {};
    function chain(table, result) {
      perTableCalls[table] = perTableCalls[table] || [];
      const record = (name, ...args) => perTableCalls[table].push([name, ...args]);
      const obj = {
        eq: (...args) => { record('eq', ...args); return obj; },
        neq: (...args) => { record('neq', ...args); return obj; },
        select: (...args) => { record('select', ...args); return obj; },
        delete: (...args) => { record('delete', ...args); return obj; },
        maybeSingle: async () => ({ data: table === 'ventures' ? { id: VENTURE_ID } : null }),
        then: (resolve) => resolve(result),
      };
      return obj;
    }
    return {
      perTableCalls,
      from(table) {
        if (table === 'ventures') return chain(table, { error: null, count: 0 });
        return chain(table, { count: 0, error: null });
      },
    };
  }

  it('teardownFixture excludes artifact_type=harness_run_journal ONLY when deleting venture_artifacts, not other tables', async () => {
    const supabase = makeTrackedSupabase();
    const journal = new RunJournal('mitigation-run');
    journal.append({ kind: 'lifecycle', event: 'fixture created' });

    await teardownFixture(supabase, 'mitigation-run', { journal });

    const artifactsCalls = supabase.perTableCalls['venture_artifacts'] || [];
    const artifactsHasExclusion = artifactsCalls.some((c) => c[0] === 'neq' && c[1] === 'artifact_type' && c[2] === 'harness_run_journal');
    expect(artifactsHasExclusion).toBe(true);

    // A sibling core table must NOT carry the same exclusion (it's specific to
    // venture_artifacts, where the finalize-mirror row actually lives).
    const stageWorkCalls = supabase.perTableCalls['venture_stage_work'] || [];
    const stageWorkHasExclusion = stageWorkCalls.some((c) => c[0] === 'neq');
    expect(stageWorkHasExclusion).toBe(false);
  });

  it('assertClean excludes artifact_type=harness_run_journal from the venture_artifacts residue count', async () => {
    const supabase = makeTrackedSupabase();
    const journal = new RunJournal('mitigation-residue-run');
    journal.append({ kind: 'lifecycle', event: 'fixture created' });

    await assertClean(supabase, 'mitigation-residue-run', { journal, ventureId: VENTURE_ID });

    const artifactsCalls = supabase.perTableCalls['venture_artifacts'] || [];
    const hasExclusion = artifactsCalls.some((c) => c[0] === 'neq' && c[1] === 'artifact_type' && c[2] === 'harness_run_journal');
    expect(hasExclusion).toBe(true);
  });

  it('CORE_FIXTURE_TABLES includes venture_artifacts (sanity — the exclusion only matters because this table is always in scope)', () => {
    expect(CORE_FIXTURE_TABLES).toContain('venture_artifacts');
  });
});
