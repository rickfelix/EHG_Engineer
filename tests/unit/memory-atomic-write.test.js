/**
 * SD-LEO-INFRA-MEMORY-MD-WRITE-CONTENTION-001 — contention-safe MEMORY.md writes.
 * Tests the atomic-write + index-lock primitives and the reindex lost-update guard.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync, renameSync as renameSyncReal } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { atomicWriteFileSync, withMemoryIndexLock } from '../../lib/memory/atomic-write.mjs';
import { reindex } from '../../scripts/modules/memory/reindex.mjs';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'memwrite-')); });
afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

function pointerFile(name, desc) {
  return `---\nname: ${name}\ndescription: ${desc}\nmetadata:\n  type: project\n---\n\nbody\n`;
}

describe('atomicWriteFileSync', () => {
  it('writes the complete file and leaves no temp file behind', () => {
    const target = join(dir, 'MEMORY.md');
    atomicWriteFileSync(target, 'hello world\n');
    expect(readFileSync(target, 'utf8')).toBe('hello world\n');
    const leftovers = readdirSync(dir).filter(f => f.includes('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('overwrites an existing file atomically (no torn intermediate)', () => {
    const target = join(dir, 'MEMORY.md');
    atomicWriteFileSync(target, 'v1');
    atomicWriteFileSync(target, 'v2-longer-content');
    expect(readFileSync(target, 'utf8')).toBe('v2-longer-content');
  });

  it('retries a transient EPERM rename (Windows sharing violation) then succeeds', () => {
    const target = join(dir, 'MEMORY.md');
    let calls = 0;
    const flakyRename = (from, to) => {
      calls++;
      if (calls < 3) { const e = new Error('EPERM'); e.code = 'EPERM'; throw e; }
      renameSyncReal(from, to);
    };
    atomicWriteFileSync(target, 'after-retry', { _rename: flakyRename, renameBackoffMs: 0, sleep: () => {} });
    expect(calls).toBe(3);
    expect(readFileSync(target, 'utf8')).toBe('after-retry');
  });

  it('rethrows a non-transient rename error immediately', () => {
    const target = join(dir, 'MEMORY.md');
    const enoent = (from, to) => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; };
    expect(() => atomicWriteFileSync(target, 'x', { _rename: enoent, sleep: () => {} })).toThrow('ENOENT');
  });
});

describe('withMemoryIndexLock', () => {
  it('acquires when free and runs the critical section', () => {
    const r = withMemoryIndexLock(dir, () => 42, { retries: 1 });
    expect(r).toEqual({ acquired: true, result: 42 });
    // lock released
    expect(existsSync(join(dir, '.memory-index.lock'))).toBe(false);
  });

  it('releases the lock even when fn throws', () => {
    expect(() => withMemoryIndexLock(dir, () => { throw new Error('boom'); }, { retries: 1 })).toThrow('boom');
    expect(existsSync(join(dir, '.memory-index.lock'))).toBe(false);
  });

  it('fails open (acquired=false) when the lock is held and not stale', () => {
    mkdirSync(join(dir, '.memory-index.lock')); // pre-held, fresh
    let ran = false;
    const r = withMemoryIndexLock(dir, () => { ran = true; return 'ok'; }, { retries: 2, backoffMs: 1, staleMs: 999999, sleep: () => {} });
    expect(r.acquired).toBe(false);
    expect(ran).toBe(true); // still runs the critical section (atomic write keeps it safe)
    // pre-existing foreign lock NOT removed by us (we never acquired it)
    expect(existsSync(join(dir, '.memory-index.lock'))).toBe(true);
  });

  it('breaks a stale lock and acquires', () => {
    mkdirSync(join(dir, '.memory-index.lock'));
    // now() far in the future => existing lock looks stale
    const future = Date.now() + 10 * 60 * 1000;
    const r = withMemoryIndexLock(dir, () => 'done', { retries: 3, backoffMs: 1, staleMs: 1000, now: () => future, sleep: () => {} });
    expect(r.acquired).toBe(true);
    expect(r.result).toBe('done');
    expect(existsSync(join(dir, '.memory-index.lock'))).toBe(false);
  });
});

describe('reindex lost-update guard + atomic output', () => {
  it('regenerates the index from pointer files (every entry present)', () => {
    writeFileSync(join(dir, 'project_a.md'), pointerFile('mem-a', 'first memory'));
    writeFileSync(join(dir, 'project_b.md'), pointerFile('mem-b', 'second memory'));
    const r = reindex({ memoryDir: dir });
    expect(r.ok).toBe(true);
    const idx = readFileSync(join(dir, 'MEMORY.md'), 'utf8');
    expect(idx).toContain('mem-a');
    expect(idx).toContain('mem-b');
    expect(r.lockAcquired).toBe(true);
  });

  it('refuses to overwrite a populated index when zero entries would result (pointer files transiently gone)', () => {
    // Populated index but the memory dir currently has NO pointer files (e.g. a
    // transient readdir miss / files momentarily absent). Reindex would produce
    // an empty index — the guard must protect the existing populated one.
    writeFileSync(join(dir, 'MEMORY.md'), '- [existing](project_x.md) — important\n');
    const r = reindex({ memoryDir: dir, stderr: { write() {} } });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('lost_update_guard');
    // populated index left intact
    expect(readFileSync(join(dir, 'MEMORY.md'), 'utf8')).toContain('existing');
  });

  it('refuses to SHRINK a populated index when some pointer files fail to read (partial lost-update)', () => {
    // 3 pointer "files": 2 are directories named *.md → readFileSync throws (EISDIR/EPERM)
    // → parseFailures>0; 1 valid. Existing index has 3 lines; result would shrink to 1.
    writeFileSync(join(dir, 'MEMORY.md'), '- [a](project_a.md)\n- [b](project_b.md)\n- [c](project_c.md)\n');
    writeFileSync(join(dir, 'project_a.md'), pointerFile('mem-a', 'first'));
    mkdirSync(join(dir, 'project_b.md')); // a directory → read throws
    mkdirSync(join(dir, 'project_c.md')); // a directory → read throws
    const r = reindex({ memoryDir: dir, stderr: { write() {} } });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('partial_lost_update_guard');
    expect(r.parseFailures).toBeGreaterThan(0);
    // existing 3-line index left intact (no lines dropped)
    expect(readFileSync(join(dir, 'MEMORY.md'), 'utf8').split('\n').filter(Boolean).length).toBe(3);
  });

  it('allows a legitimate shrink (fewer files, NO read errors)', () => {
    writeFileSync(join(dir, 'MEMORY.md'), '- [a](project_a.md)\n- [b](project_b.md)\n');
    writeFileSync(join(dir, 'project_a.md'), pointerFile('mem-a', 'only one left'));
    const r = reindex({ memoryDir: dir });
    expect(r.ok).toBe(true);
    expect(r.lineCount).toBe(1); // legitimately removed project_b
  });

  it('allows writing an empty index for a genuinely empty memory dir', () => {
    writeFileSync(join(dir, 'MEMORY.md'), '- [old](old.md)\n');
    rmSync(join(dir, 'MEMORY.md')); // start clean: no pointer files, no index
    const r = reindex({ memoryDir: dir });
    expect(r.ok).toBe(true);
    expect(r.lineCount).toBe(0);
  });

  it('two sequential reindex runs converge and never tear the index', () => {
    writeFileSync(join(dir, 'project_a.md'), pointerFile('mem-a', 'first'));
    reindex({ memoryDir: dir });
    writeFileSync(join(dir, 'project_b.md'), pointerFile('mem-b', 'second'));
    reindex({ memoryDir: dir });
    const idx = readFileSync(join(dir, 'MEMORY.md'), 'utf8');
    expect(idx).toContain('mem-a');
    expect(idx).toContain('mem-b');
    expect(readdirSync(dir).filter(f => f.includes('.tmp'))).toEqual([]);
    expect(existsSync(join(dir, '.memory-index.lock'))).toBe(false);
  });
});
