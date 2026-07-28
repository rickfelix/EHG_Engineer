// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-5c — parentage capture + principal guard.

import { describe, it, expect } from 'vitest';
import {
  buildParentageRecord,
  canConcludeLeakStopped,
  validateScheduledTaskPrincipal,
  persistParentageRecords,
  REQUIRED_PARENTAGE_FIELDS,
} from './console-parentage.mjs';

const full = {
  consolePid: 1234,
  observedAt: '2026-07-27T14:00:00Z',
  parentPid: 99,
  parentImage: 'powershell.exe',
  parentCommandLine: 'powershell -NoProfile -Command ...',
  grandparentPid: 42,
  grandparentImage: 'Cursor.exe',
};

describe('FR5c-RECORD: the record must survive the parent exiting', () => {
  it('builds a complete, attributed record', () => {
    const { ok, record, missing } = buildParentageRecord(full);
    expect(ok).toBe(true);
    expect(missing).toEqual([]);
    expect(record.attribution).toBe('powershell.exe (via Cursor.exe)');
  });

  it('keeps identifying detail, not just a pid — a pid alone is useless (or recycled) later', () => {
    const { record } = buildParentageRecord(full);
    expect(record.parent_image).toBe('powershell.exe');
    expect(record.parent_command_line).toMatch(/powershell/);
  });

  it('records the GRANDPARENT, which is usually what names the culprit', () => {
    // The 15 live claude.exe on this host are grandchildren of Cursor.exe via powershell,
    // so the immediate parent is often just a shell and names nothing useful.
    const { record } = buildParentageRecord(full);
    expect(record.grandparent_image).toBe('Cursor.exe');
  });

  it('reports an incomplete record as UNATTRIBUTED rather than storing it as an answer', () => {
    const { ok, record, missing } = buildParentageRecord({ consolePid: 1, observedAt: 'now' });
    expect(ok).toBe(false);
    expect(missing).toEqual(expect.arrayContaining(['parent_pid', 'parent_image', 'parent_command_line']));
    expect(record.attribution).toBe('unattributed');
  });

  it('the required-field set is what makes a record outlive its subject', () => {
    expect(REQUIRED_PARENTAGE_FIELDS).toContain('parent_image');
    expect(REQUIRED_PARENTAGE_FIELDS).toContain('parent_command_line');
  });
});

describe('FR5c-BURST: a quiet window is NOT evidence the leak stopped', () => {
  it('REFUSES the exact wrong conclusion — 0 consoles in 60s', () => {
    // Measured: a 60-second observation right after the reap saw zero new consoles. The SD
    // states plainly that this is not evidence, because accumulation is bursty.
    const r = canConcludeLeakStopped({ observationWindowMs: 60_000, consolesObserved: 0 });
    expect(r.concluded).toBe(false);
    expect(r.why).toMatch(/bursty/);
  });

  it('a window well past the burst spacing CAN support the conclusion', () => {
    const r = canConcludeLeakStopped({ observationWindowMs: 3 * 3_600_000, consolesObserved: 0 });
    expect(r.concluded).toBe(true);
  });

  it('any console appearing settles it immediately — the leak is live', () => {
    const r = canConcludeLeakStopped({ observationWindowMs: 10 * 3_600_000, consolesObserved: 1 });
    expect(r.concluded).toBe(false);
    expect(r.why).toMatch(/leak is live/);
  });
});

describe('FR5c-PRINCIPAL: the reaper must not feed the thing it reaps', () => {
  it('REJECTS an interactive principal — that IS the leak mechanism', () => {
    const r = validateScheduledTaskPrincipal({ logonType: 'Interactive', userId: 'rickf' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/leaks a console per run/);
  });

  it('rejects an unspecified principal — it may default to interactive', () => {
    expect(validateScheduledTaskPrincipal({}).ok).toBe(false);
  });

  it('accepts a session-0 service principal', () => {
    expect(validateScheduledTaskPrincipal({ logonType: 'ServiceAccount', userId: 'SYSTEM' }).ok).toBe(true);
    expect(validateScheduledTaskPrincipal({ logonType: 'S4U', userId: 'NT AUTHORITY\\SYSTEM' }).ok).toBe(true);
  });

  it('rejects an unrecognised logon type rather than assuming it is safe', () => {
    expect(validateScheduledTaskPrincipal({ logonType: 'Password', userId: 'rickf' }).ok).toBe(false);
  });
});

describe('FR5c-PERSIST: capture without writing achieves nothing', () => {
  function fakeFs(initial = null) {
    let content = initial;
    return {
      get content() { return content; },
      appendFileSync: (_p, data) => { content = (content || '') + data; },
      readFileSync: () => content,
      existsSync: () => content !== null,
      opts(filePath = 'X') {
        return { filePath, appendFileSync: this.appendFileSync, readFileSync: this.readFileSync, existsSync: this.existsSync };
      },
    };
  }

  it('writes one JSONL line per console', () => {
    const fs = fakeFs();
    const r = persistParentageRecords([buildParentageRecord(full)], fs.opts());
    expect(r.written).toBe(1);
    const rec = JSON.parse(fs.content.trim());
    expect(rec.console_pid).toBe(1234);
    expect(rec.parent_image).toBe('powershell.exe');
    expect(rec.grandparent_image).toBe('Cursor.exe'); // survives the parent's exit
  });

  it('does NOT re-write the same console on a later scan', () => {
    const fs = fakeFs();
    persistParentageRecords([buildParentageRecord(full)], fs.opts());
    const again = persistParentageRecords([buildParentageRecord(full)], fs.opts());
    expect(again.written).toBe(0);
    expect(again.skipped).toBe(1);
    expect(fs.content.trim().split('\n')).toHaveLength(1);
  });

  it('DOES record a RECYCLED pid under a different parent — dedup is pid+parent, not pid', () => {
    // Windows recycles pids. Keying on pid alone would silently swallow a genuinely new console.
    const fs = fakeFs();
    persistParentageRecords([buildParentageRecord(full)], fs.opts());
    const recycled = buildParentageRecord({ ...full, parentPid: 777, parentImage: 'other.exe' });
    const r = persistParentageRecords([recycled], fs.opts());
    expect(r.written).toBe(1);
    expect(fs.content.trim().split('\n')).toHaveLength(2);
  });

  it('a corrupt existing line does not block new writes', () => {
    const fs = fakeFs('{not json\n');
    const r = persistParentageRecords([buildParentageRecord(full)], fs.opts());
    expect(r.written).toBe(1);
  });

  it('FAILS OPEN — a write error is reported, never thrown', () => {
    const r = persistParentageRecords([buildParentageRecord(full)], {
      filePath: 'X', appendFileSync: () => { throw new Error('disk full'); },
    });
    expect(r.error).toMatch(/disk full/);
    expect(r.written).toBe(0);
  });
});
