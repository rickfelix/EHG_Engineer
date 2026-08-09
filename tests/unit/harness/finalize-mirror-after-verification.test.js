/**
 * QF-20260807-067 — the durable mirror was a PRE-VERIFICATION SNAPSHOT presenting itself as the
 * run of record. On s2026-alpha4-0807 it froze at 44 of 52 journal entries and carried none of
 * the verification outcomes, and because the mirror is write-once nothing could ever repair it.
 *
 * TWO defects, and the second is why the acceptance criterion was unreachable on its own:
 *   TIMING   — runArc called finalizeMirror before the coverage close-out and O10 verdict.
 *   ORDERING — finalizeMirror appended its OWN lifecycle entry AFTER the write, so the mirror
 *              was always exactly one entry short of the journal, whenever it ran.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunJournal, finalizeMirror } from '../../../lib/harness/run-journal.mjs';

let baseDir;
const mkJournal = (id = 'qf067') => new RunJournal(id, { baseDir, clock: () => '2026-08-07T13:00:00Z' });

beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), 'qf067-')); });
afterEach(() => { rmSync(baseDir, { recursive: true, force: true }); });

/** Capture what the mirror WOULD persist, via the injectable write seam. */
function captureSeam() {
  const captured = [];
  return { captured, insertEvent: async () => { captured.push('written'); } };
}

describe('QF-20260807-067: the mirror captures the journal COMPLETELY', () => {
  it('ACCEPTANCE: mirror entry count EQUALS journal entry count', async () => {
    const journal = mkJournal();
    journal.append({ kind: 'lifecycle', event: 'run arc started' });
    journal.finding('CANNOT_DRIVE', 'a finding', { o_requirements: ['O6'] });
    const seam = captureSeam();

    const res = await finalizeMirror({ supabase: null, journal, seams: seam });

    // The count the mirror sealed is the count the journal ends with — no off-by-one.
    expect(res.entryCount).toBe(journal.readAll().length);
    expect(res.persisted).toBe(true);
  });

  it('the self-append is INSIDE the snapshot — the old post-write append made equality impossible', async () => {
    const journal = mkJournal();
    journal.append({ kind: 'lifecycle', event: 'run arc started' });
    await finalizeMirror({ supabase: null, journal, seams: captureSeam() });

    const all = journal.readAll();
    const sealEntry = all.find((e) => String(e.event).includes('finalize-mirror snapshot sealed'));
    expect(sealEntry).toBeDefined();
    // It is the LAST entry, and the sealed count included it.
    expect(all[all.length - 1].event).toBe(sealEntry.event);
  });

  it('the seal entry does NOT claim persistence before the write has happened', async () => {
    const journal = mkJournal();
    await finalizeMirror({ supabase: null, journal, seams: captureSeam() });
    const sealEntry = journal.readAll().find((e) => String(e.event).includes('finalize-mirror'));
    // "sealed" describes what just happened; "persisted" would be an intention in the past tense.
    expect(sealEntry.event).toContain('sealed');
    expect(sealEntry.event).not.toContain('persisted');
  });

  it('a write failure still fails LOUD (NC-7) and is never swallowed', async () => {
    const journal = mkJournal();
    const boom = { insertEvent: async () => { throw new Error('db down'); } };
    await expect(finalizeMirror({ supabase: null, journal, seams: boom }))
      .rejects.toThrow(/finalize-mirror write failed for run qf067: db down/);
  });
});

describe('QF-20260807-067: write-once preserved, with a correction path', () => {
  const fakeSupabase = (calls) => ({
    from: () => ({
      insert: async (row) => { calls.push({ op: 'insert', row }); return { error: null }; },
      upsert: async (row, opts) => { calls.push({ op: 'upsert', row, opts }); return { error: null }; },
    }),
  });

  it('DEFAULT is a plain INSERT — write-once stays DB-enforced exactly as before', async () => {
    const calls = [];
    await finalizeMirror({ supabase: fakeSupabase(calls), journal: mkJournal() });
    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe('insert');
  });

  it('allowRefinalize upserts on the idempotency key — still ONE row per run, but correctable', async () => {
    const calls = [];
    await finalizeMirror({ supabase: fakeSupabase(calls), journal: mkJournal('s2026-alpha4-0807'), allowRefinalize: true });
    expect(calls[0].op).toBe('upsert');
    expect(calls[0].opts).toEqual({ onConflict: 'idempotency_key' });
    // One row per run is what write-once actually protects; the key is unchanged.
    expect(calls[0].row.idempotency_key).toBe('harness_run_journal_finalized:s2026-alpha4-0807');
  });

  it('the mirrored payload carries the entries, not just a count', async () => {
    const calls = [];
    const journal = mkJournal();
    journal.finding('RESIDUE', 'leftover rows', {});
    await finalizeMirror({ supabase: fakeSupabase(calls), journal });
    const { entries } = calls[0].row.payload;
    expect(entries).toHaveLength(journal.readAll().length);
    expect(entries.some((e) => e.finding_type === 'RESIDUE')).toBe(true);
  });
});
