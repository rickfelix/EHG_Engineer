import { describe, it, expect, vi } from 'vitest';
import {
  runRetireCowork, runStep1, runStep2, runStep3Archive, runStep3Verify, runStep4, runStep5,
  classifySchtasksResult, assertTaskName, parseCliArgs,
} from './retire-cowork.mjs';

// A synthetic, never-real path — never the chairman's literal home path (no-literal-home-path-lint).
const FAKE_COWORK_ROOT = 'X:/synthetic-test-root/cowork-fixture';

/** In-memory fake fs — no real disk touched by any test in this file. */
function fakeFs(initial = {}) {
  const files = { ...initial };
  return {
    _files: files,
    existsSync: (p) => Object.prototype.hasOwnProperty.call(files, p),
    readFileSync: (p) => {
      if (!Object.prototype.hasOwnProperty.call(files, p)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      return files[p];
    },
    writeFileSync: (p, content) => { files[p] = content; },
    mkdirSync: () => {},
    rmSync: vi.fn(),
  };
}

describe('classifySchtasksResult', () => {
  it('status 0 or undefined is ok', () => {
    expect(classifySchtasksResult({ status: 0 })).toBe('ok');
    expect(classifySchtasksResult({})).toBe('ok');
  });
  it('a not-found error is classified not_found, never ok', () => {
    expect(classifySchtasksResult({ status: 1, stderr: 'ERROR: The system cannot find the file specified.' })).toBe('not_found');
  });
  it('Access is denied is classified denied, never tolerated as not_found', () => {
    expect(classifySchtasksResult({ status: 1, stderr: 'ERROR: Access is denied.' })).toBe('denied');
  });
  it('an unrecognized non-zero exit is classified failed', () => {
    expect(classifySchtasksResult({ status: 1, stderr: 'some other schtasks error' })).toBe('failed');
  });
});

describe('assertTaskName', () => {
  it('refuses an illegal Task-Scheduler character before any schtasks call', () => {
    expect(() => assertTaskName('bad/name')).toThrow();
    expect(() => assertTaskName('bad:name')).toThrow();
  });
  it('accepts a normal task name', () => {
    expect(() => assertTaskName('Wake Cowork PC')).not.toThrow();
  });
});

describe('runStep1 — disable candidate scheduled tasks', () => {
  it('dry-run (apply=false) never calls runSchtasks — positive control that the mock IS wired when apply=true', () => {
    const runSchtasks = vi.fn();
    const dry = runStep1({ taskNames: ['Wake Cowork PC'], runSchtasks, apply: false });
    expect(runSchtasks).not.toHaveBeenCalled();
    expect(dry.results[0]).toMatchObject({ outcome: 'would_disable' });

    const applied = runStep1({ taskNames: ['Wake Cowork PC'], runSchtasks: () => ({ status: 0 }), apply: true });
    expect(applied.ok).toBe(true);
    expect(applied.results[0]).toMatchObject({ outcome: 'disabled' });
  });

  it('a THROWN not-found error (execFileSync semantics) is treated as already_satisfied, never a failure', () => {
    const runSchtasks = vi.fn(() => ({ status: 1, stderr: 'ERROR: The system cannot find the file specified.' }));
    const result = runStep1({ taskNames: ['Wake Cowork PC'], runSchtasks, apply: true });
    expect(runSchtasks).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.results[0]).toMatchObject({ outcome: 'already_satisfied' });
    expect(result.failed).toEqual([]);
  });

  it('Access is denied is a real FAILURE, never reported as disabled', () => {
    const runSchtasks = () => ({ status: 1, stderr: 'ERROR: Access is denied.' });
    const result = runStep1({ taskNames: ['Wake Cowork PC'], runSchtasks, apply: true });
    expect(result.ok).toBe(false);
    expect(result.results[0]).toMatchObject({ outcome: 'failed', reason: 'ACCESS_DENIED' });
    expect(result.failed).toHaveLength(1);
  });
});

describe('runStep2 — host-only checklist', () => {
  it('is pending without --confirm-step2', () => {
    const r = runStep2({ confirmStep2: false });
    expect(r).toMatchObject({ ok: false, outcome: 'pending' });
    expect(r.checklist.length).toBeGreaterThan(0);
  });
  it('is confirmed with a timestamp when --confirm-step2 is passed', () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const r = runStep2({ confirmStep2: true, now });
    expect(r).toMatchObject({ ok: true, outcome: 'confirmed', confirmedAt: now.toISOString() });
  });
});

describe('runStep3Archive — local zip creation', () => {
  it('dry-run reports the exact PowerShell command without calling runPowershell', () => {
    const runPowershell = vi.fn();
    const r = runStep3Archive({ coworkRoot: FAKE_COWORK_ROOT, archiveDate: '2026-11-10', runPowershell, apply: false });
    expect(runPowershell).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    expect(r.psCommand).toContain('Compress-Archive');
    expect(r.psCommand).toContain('-LiteralPath');
    expect(r.psCommand).toContain('-Force');
    expect(r.psCommand).not.toMatch(/-Path\s/); // never the wildcard-interpreting -Path
  });

  it('requires --cowork-root, refuses without it (never the archiveDate check first — no-literal-home-path-lint means this can never default)', () => {
    const r = runStep3Archive({ coworkRoot: null, archiveDate: '2026-11-10', apply: false });
    expect(r).toMatchObject({ ok: false, outcome: 'failed', reason: 'COWORK_ROOT_REQUIRED' });
  });

  it('requires --archive-date, refuses without it', () => {
    const r = runStep3Archive({ coworkRoot: FAKE_COWORK_ROOT, archiveDate: null, apply: false });
    expect(r).toMatchObject({ ok: false, outcome: 'failed', reason: 'ARCHIVE_DATE_REQUIRED' });
  });

  it('apply calls runPowershell exactly once with the -Force command — positive control the mock is wired', () => {
    const runPowershell = vi.fn(() => ({ status: 0 }));
    const r = runStep3Archive({ coworkRoot: FAKE_COWORK_ROOT, archiveDate: '2026-11-10', runPowershell, apply: true });
    expect(runPowershell).toHaveBeenCalledTimes(1);
    expect(runPowershell.mock.calls[0][0][0]).toContain('-Force');
    expect(r).toMatchObject({ ok: true, outcome: 'archived' });
  });

  it('a re-run (idempotent, thanks to -Force) still succeeds — no special-cased "already exists" failure', () => {
    const runPowershell = vi.fn(() => ({ status: 0 }));
    const first = runStep3Archive({ coworkRoot: FAKE_COWORK_ROOT, archiveDate: '2026-11-10', runPowershell, apply: true });
    const second = runStep3Archive({ coworkRoot: FAKE_COWORK_ROOT, archiveDate: '2026-11-10', runPowershell, apply: true });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(runPowershell).toHaveBeenCalledTimes(2);
  });

  it('a non-zero PowerShell exit is reported as a real failure', () => {
    const runPowershell = () => ({ status: 1, stderr: 'Compress-Archive : Access to the path is denied.' });
    const r = runStep3Archive({ coworkRoot: FAKE_COWORK_ROOT, archiveDate: '2026-11-10', runPowershell, apply: true });
    expect(r).toMatchObject({ ok: false, outcome: 'failed', reason: 'COMPRESS_ARCHIVE_FAILED' });
  });
});

describe('runStep3Verify — read-only Drive verification, never a write', () => {
  it('reports upload_verified when listDriveFiles finds the archive', async () => {
    const listDrive = vi.fn().mockResolvedValue({ ok: true, files: [{ id: '1', name: '_Cowork-archive-2026-11-10.zip' }] });
    const r = await runStep3Verify({ archiveDate: '2026-11-10', listDrive });
    expect(listDrive).toHaveBeenCalledWith({ folderId: expect.any(String), name: '_Cowork-archive-2026-11-10.zip' });
    expect(r).toMatchObject({ ok: true, outcome: 'upload_verified' });
  });

  it('reports upload_pending (not unverifiable) when the Drive call succeeds but finds nothing', async () => {
    const listDrive = vi.fn().mockResolvedValue({ ok: true, files: [] });
    const r = await runStep3Verify({ archiveDate: '2026-11-10', listDrive });
    expect(r).toMatchObject({ ok: false, outcome: 'upload_pending' });
  });

  it('reports a DISTINCT unverifiable outcome when the Drive call itself fails — never conflated with "not uploaded"', async () => {
    const listDrive = vi.fn().mockResolvedValue({ ok: false, error: 'invalid_grant' });
    const r = await runStep3Verify({ archiveDate: '2026-11-10', listDrive });
    expect(r).toMatchObject({ ok: false, outcome: 'unverifiable', reason: 'DRIVE_LIST_FAILED' });
    expect(r.outcome).not.toBe('upload_pending');
  });
});

describe('runStep4 — gated, irreversible deletion', () => {
  const fullState = { step1: 'ok', step2: 'ok', step3: 'ok' };

  it('refuses PRIOR_STEPS_INCOMPLETE when steps 1-3 are not all recorded ok', async () => {
    const r = await runStep4({ sb: {}, windowStartEtDate: '2026-01-01', state: { step1: 'ok', step2: 'pending', step3: 'ok' } });
    expect(r).toMatchObject({ ok: false, outcome: 'refused', reason: 'PRIOR_STEPS_INCOMPLETE' });
  });

  it('refuses WINDOW_START_REQUIRED when no window start is given', async () => {
    const r = await runStep4({ sb: {}, windowStartEtDate: null, state: fullState });
    expect(r).toMatchObject({ ok: false, outcome: 'refused', reason: 'WINDOW_START_REQUIRED' });
  });

  /** Mirrors the real Supabase chain readRows drives: .select(sel).limit(500) then .gte().lte(), thenable at the end. */
  function sbRows(rowsByTable) {
    return {
      from: (table) => ({
        select: () => ({
          limit: () => ({
            gte: () => ({
              lte: () => Promise.resolve({ data: rowsByTable[table] ?? [], error: null }),
            }),
          }),
        }),
      }),
    };
  }
  function sbError(errorByTable) {
    return {
      from: (table) => ({
        select: () => ({
          limit: () => ({
            gte: () => ({
              lte: () => Promise.resolve({ data: null, error: errorByTable[table] || errorByTable['*'] }),
            }),
          }),
        }),
      }),
    };
  }

  it('refuses COWORK_ROOT_REQUIRED before ever reading the DB, when no root is given', async () => {
    const sb = sbRows({ michael_brief_runs: [], michael_feedback_ledger: [] });
    const r = await runStep4({ sb, windowStartEtDate: '2026-01-01', today: '2026-01-20', state: fullState, coworkRoot: null });
    expect(r).toMatchObject({ ok: false, outcome: 'refused', reason: 'COWORK_ROOT_REQUIRED' });
  });

  it('refuses WINDOW_NOT_ELAPSED when the computed streak has a gap, and never deletes', async () => {
    const sb = sbRows({ michael_brief_runs: [], michael_feedback_ledger: [] });
    const fsImpl = { rmSync: vi.fn() };
    const r = await runStep4({ sb, windowStartEtDate: '2026-01-01', today: '2026-01-20', state: fullState, coworkRoot: FAKE_COWORK_ROOT, fsImpl });
    expect(r).toMatchObject({ ok: false, outcome: 'refused', reason: 'WINDOW_NOT_ELAPSED' });
    expect(fsImpl.rmSync).not.toHaveBeenCalled();
  });

  it('refuses TABLES_ABSENT when the migration is unapplied, never silently proceeds', async () => {
    const sb = sbError({ '*': { code: '42P01', message: 'relation does not exist' } });
    const fsImpl = { rmSync: vi.fn() };
    const r = await runStep4({ sb, windowStartEtDate: '2026-01-01', today: '2026-01-20', state: fullState, coworkRoot: FAKE_COWORK_ROOT, fsImpl });
    expect(r).toMatchObject({ ok: false, outcome: 'refused', reason: 'TABLES_ABSENT' });
    expect(fsImpl.rmSync).not.toHaveBeenCalled();
  });

  function fourteenDayRows() {
    const dates = [];
    for (let i = 0; i < 14; i++) { const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10); dates.push(d); }
    return {
      michael_brief_runs: dates.map((et_date) => ({ et_date, verified: true })),
      michael_feedback_ledger: dates.map((et_date) => ({ et_date })),
    };
  }

  it('a fully-satisfied window with applyDeletion=false reports would_delete without touching the filesystem', async () => {
    const sb = sbRows(fourteenDayRows());
    const fsImpl = { rmSync: vi.fn() };
    const r = await runStep4({ sb, windowStartEtDate: '2026-01-01', today: '2026-01-20', state: fullState, coworkRoot: FAKE_COWORK_ROOT, applyDeletion: false, fsImpl });
    expect(r).toMatchObject({ ok: true, outcome: 'would_delete' });
    expect(fsImpl.rmSync).not.toHaveBeenCalled();
  });

  it('a fully-satisfied window WITH applyDeletion=true deletes the folder — michael_feedback_ledger is never written', async () => {
    const sb = sbRows(fourteenDayRows());
    const ledgerWrite = vi.fn();
    sb.from = new Proxy(sb.from, {
      apply(target, thisArg, args) {
        const table = args[0];
        const base = Reflect.apply(target, thisArg, args);
        if (table === 'michael_feedback_ledger') {
          return { ...base, insert: ledgerWrite, update: ledgerWrite, upsert: ledgerWrite, delete: ledgerWrite };
        }
        return base;
      },
    });
    const fsImpl = { rmSync: vi.fn() };
    const r = await runStep4({ sb, windowStartEtDate: '2026-01-01', today: '2026-01-20', state: fullState, coworkRoot: FAKE_COWORK_ROOT, applyDeletion: true, fsImpl });
    expect(r).toMatchObject({ ok: true, outcome: 'deleted' });
    expect(fsImpl.rmSync).toHaveBeenCalledTimes(1);
    expect(ledgerWrite).not.toHaveBeenCalled();
  });
});

describe('runStep5 — the retirement grep is clean (live re-check of the static test predicate)', () => {
  it('reports clean when scanForCoworkReferences finds no violations', () => {
    // Points at THIS repo's real tree — the static test already proves it's clean.
    const r = runStep5({ repoRoot: process.cwd() });
    expect(r).toMatchObject({ ok: true, outcome: 'clean' });
    expect(r.hitCount).toBeGreaterThan(0);
  });
});

describe('parseCliArgs', () => {
  it('never exposes a --required-days flag — the 14-day floor is not CLI-settable', () => {
    const parsed = parseCliArgs(['--apply-deletion', '--window-start', '2026-01-01']);
    expect(parsed).not.toHaveProperty('requiredDays');
    expect(parsed).not.toHaveProperty('required-days');
  });
  it('parses --task-names as a comma-separated list', () => {
    const parsed = parseCliArgs(['--task-names', 'Task A,Task B']);
    expect(parsed.taskNames).toEqual(['Task A', 'Task B']);
  });
});

describe('runRetireCowork — orchestration, dry-run by default, tiered apply gating', () => {
  it('refuses cleanly (never crashes, never defaults) when --cowork-root is omitted entirely', async () => {
    const r = await runRetireCowork({ sb: {}, argv: [], fsImpl: fakeFs() });
    expect(r).toMatchObject({ ok: false, refusal: 'COWORK_ROOT_REQUIRED' });
  });

  it('no flags but --cowork-root given: zero side effects across every I/O boundary (schtasks, PowerShell, Drive, filesystem)', async () => {
    const runSchtasks = vi.fn();
    const runPowershell = vi.fn();
    const listDrive = vi.fn();
    const fsx = fakeFs();
    const r = await runRetireCowork({ sb: {}, argv: ['--cowork-root', FAKE_COWORK_ROOT], runSchtasks, runPowershell, listDrive, fsImpl: fsx, statePath: '/state.json' });
    expect(runSchtasks).not.toHaveBeenCalled();
    expect(runPowershell).not.toHaveBeenCalled();
    expect(listDrive).not.toHaveBeenCalled();
    expect(fsx._files['/state.json']).toBeUndefined();
    expect(r.action).toBe('dry_run');
  });

  it('--apply-deletion without --apply refuses immediately, before evaluating the window or --cowork-root', async () => {
    const r = await runRetireCowork({ sb: {}, argv: ['--apply-deletion', '--window-start', '2026-01-01'], fsImpl: fakeFs() });
    expect(r).toMatchObject({ ok: false, refusal: 'APPLY_REQUIRED_BEFORE_DELETION' });
  });

  it('--apply persists step 1-3 state to the injected state path', async () => {
    const runSchtasks = () => ({ status: 0 });
    const fsx = fakeFs();
    await runRetireCowork({ sb: {}, argv: ['--cowork-root', FAKE_COWORK_ROOT, '--apply'], runSchtasks, fsImpl: fsx, statePath: '/state.json' });
    expect(fsx._files['/state.json']).toBeDefined();
    const persisted = JSON.parse(fsx._files['/state.json']);
    expect(persisted).toMatchObject({ step1: 'ok' });
  });

  it('--apply-deletion refuses closed (PRIOR_STEPS_INCOMPLETE) when step 2 has not been confirmed — no --confirm-step2 in this call, so a fresh state write still leaves step2 pending', async () => {
    const r = await runRetireCowork({
      sb: {}, argv: ['--cowork-root', FAKE_COWORK_ROOT, '--apply', '--apply-deletion', '--window-start', '2026-01-01', '--archive-date', '2026-01-01'],
      runSchtasks: () => ({ status: 0 }), runPowershell: () => ({ status: 0 }), fsImpl: fakeFs(), statePath: '/state.json',
    });
    expect(r.steps.step4).toMatchObject({ outcome: 'refused', reason: 'PRIOR_STEPS_INCOMPLETE' });
    expect(r.ok).toBe(false); // an explicit --apply-deletion request that did not delete is a failed run
  });

  it('a PRE-EXISTING corrupt state file blocks a plain --apply run from ever reaching a stale-open step 4 read: this run OVERWRITES it with fresh results in the same call, and a subsequent read sees the fresh (not corrupt) state', async () => {
    const fsx = fakeFs({ '/state.json': 'not valid json{{{' });
    // First call: --apply only, no deletion requested. It overwrites the corrupt file with real results.
    await runRetireCowork({
      sb: {}, argv: ['--cowork-root', FAKE_COWORK_ROOT, '--apply', '--confirm-step2', '--archive-date', '2026-01-01'],
      runSchtasks: () => ({ status: 0 }), runPowershell: () => ({ status: 0 }), fsImpl: fsx, statePath: '/state.json',
    });
    const persisted = JSON.parse(fsx._files['/state.json']);
    expect(persisted).toMatchObject({ step1: 'ok', step2: 'ok', step3: 'ok' });
  });

  it('--check-step5 runs the live grep re-check and never requires --cowork-root', async () => {
    const r = await runRetireCowork({ sb: {}, argv: ['--check-step5'], repoRoot: process.cwd(), fsImpl: fakeFs() });
    expect(r.action).toBe('check_step5');
    expect(r.ok).toBe(true);
  });

  it('a corrupt state file with NO steps run in the same call (verify-step3 mode) never crashes the process', async () => {
    const fsx = fakeFs({ '/state.json': 'not valid json{{{' });
    const listDrive = vi.fn().mockResolvedValue({ ok: true, files: [] });
    const r = await runRetireCowork({
      sb: {}, argv: ['--verify-step3', '--archive-date', '2026-01-01'], listDrive, fsImpl: fsx, statePath: '/state.json',
    });
    expect(r.action).toBe('verify_step3');
  });

  it('the top-level report is never a single boolean — each step carries its own outcome', async () => {
    const r = await runRetireCowork({ sb: {}, argv: ['--cowork-root', FAKE_COWORK_ROOT], fsImpl: fakeFs() });
    expect(r.steps.step1.outcome).toBe('would_disable');
    expect(r.steps.step2.outcome).toBe('pending');
    expect(r.steps.step3.outcome).toBe('would_archive');
    expect(r.steps.step4.outcome).toBe('not_attempted');
  });
});
