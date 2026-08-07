/**
 * QF-20260807-269 — the §H6 residue-assertion list was hand-coded from the fence TEXT instead of
 * generated from the journal's touched-tables, producing an exactly INVERTED guard.
 *
 * Measured on run s2026-alpha4-0807: the sweep asserted zero rows for eva_scheduler_queue and
 * eva_scheduler_metrics — which appear in NO entry's touched_tables, so those assertions were
 * vacuous — while asserting NOTHING about the four tables the run demonstrably wrote
 * (ventures=1, venture_stage_work=20, venture_artifacts=36, system_events=2). It printed
 * "containment complete" with 59 rows of residue in tables it never examined.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunJournal } from '../../../lib/harness/run-journal.mjs';
import { containmentSweep, SCHEDULER_FENCE_TABLES } from '../../../scripts/harness/s20-run.mjs';

let baseDir;
beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), 'qf269-')); });
afterEach(() => { rmSync(baseDir, { recursive: true, force: true }); });

const mkJournal = (id = 'qf269') => new RunJournal(id, { baseDir, clock: () => '2026-08-07T13:00:00Z' });

/** Fake supabase recording which tables were actually queried; every table reads back empty. */
function spySupabase(counts = {}) {
  const queried = [];
  return {
    queried,
    from: (table) => ({
      select: () => ({ eq: async () => { queried.push(table); return { count: counts[table] ?? 0, error: null }; } }),
    }),
  };
}

const sweptTables = (journal) => journal.readAll()
  .filter((e) => e.kind === 'fence_assertion' && e.detail?.table)
  .map((e) => e.detail.table);

describe('QF-20260807-269: the assertion list is GENERATED from the journal', () => {
  // THE QF'S STATED ACCEPTANCE: a novel table, asserted with zero code change.
  it('ACCEPTANCE: a run touching a NOVEL table gets that table asserted, no code change', async () => {
    const journal = mkJournal();
    journal.append({ kind: 'observation', event: 'wrote somewhere new', touched_tables: ['a_table_nobody_enumerated'] });
    const supabase = spySupabase();

    await containmentSweep({ supabase, journal, runId: 'qf269', ventureId: 'v1' });

    expect(supabase.queried).toContain('a_table_nobody_enumerated');
    expect(sweptTables(journal)).toContain('a_table_nobody_enumerated');
  });

  it('REGRESSION, the exact inversion: the four written tables are all swept', async () => {
    const journal = mkJournal();
    const written = ['ventures', 'venture_stage_work', 'venture_artifacts', 'system_events'];
    for (const t of written) journal.append({ kind: 'observation', event: `wrote ${t}`, touched_tables: [t] });
    const supabase = spySupabase();

    await containmentSweep({ supabase, journal, runId: 'qf269', ventureId: 'v1' });

    // Every table the run actually touched is asserted — the thing the old list never did.
    for (const t of written) expect(sweptTables(journal)).toContain(t);
  });

  it('the §H5.6 standing scheduler fence still runs on a leg that touched nothing', async () => {
    const journal = mkJournal();
    const supabase = spySupabase();
    await containmentSweep({ supabase, journal, runId: 'qf269', ventureId: 'v1' });
    // Standing check: the spec's harm is stale rows left by OTHER ventures, so it cannot be
    // dropped just because this leg wrote nowhere.
    for (const t of SCHEDULER_FENCE_TABLES) expect(sweptTables(journal)).toContain(t);
  });

  it('records the COUNT, so a real query is distinguishable from a pass-through log line', async () => {
    const journal = mkJournal();
    journal.append({ kind: 'observation', event: 'wrote', touched_tables: ['venture_artifacts'] });
    await containmentSweep({ supabase: spySupabase(), journal, runId: 'qf269', ventureId: 'v1' });

    const assertion = journal.readAll().find((e) => e.detail?.table === 'venture_artifacts');
    expect(assertion.detail.count).toBe(0);
    expect(assertion.detail.source).toBe('journal_touched_tables');
  });

  it('a touched table WITH residue is a RESIDUE finding, not a green assertion', async () => {
    const journal = mkJournal();
    journal.append({ kind: 'observation', event: 'wrote', touched_tables: ['venture_artifacts'] });
    await containmentSweep({ supabase: spySupabase({ venture_artifacts: 36 }), journal, runId: 'qf269', ventureId: 'v1' });

    const finding = journal.readAll().find((e) => e.finding_type === 'RESIDUE');
    expect(finding).toBeDefined();
    expect(finding.event).toContain('36');
    // And it must NOT also be reported clean — two-sided.
    expect(sweptTables(journal)).not.toContain('venture_artifacts');
  });

  it('1-REP: no hard-coded fence-text list remains as a second source of truth', async () => {
    // SCHEDULER_FENCE_TABLES is the standing §H5.6 check, unioned in — the derived list is the
    // source of truth. Guard that it did not silently regrow into the full assertion set.
    expect(SCHEDULER_FENCE_TABLES).toEqual(['eva_scheduler_queue', 'eva_scheduler_metrics']);
    const journal = mkJournal();
    journal.append({ kind: 'observation', event: 'wrote', touched_tables: ['novel_one', 'novel_two'] });
    const supabase = spySupabase();
    await containmentSweep({ supabase, journal, runId: 'qf269', ventureId: 'v1' });
    expect(supabase.queried.sort()).toEqual([...SCHEDULER_FENCE_TABLES, 'novel_one', 'novel_two'].sort());
  });
});
