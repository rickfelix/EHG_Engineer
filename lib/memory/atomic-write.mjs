/**
 * Contention-safe primitives for the shared MEMORY.md auto-memory index
 * (SD-LEO-INFRA-MEMORY-MD-WRITE-CONTENTION-001).
 *
 * Parallel fleet sessions regenerate the same MEMORY.md via memory/reindex.mjs.
 * Two problems with a plain writeFileSync of a shared file:
 *   1. It is not atomic — a concurrent reader can observe a torn/partial file,
 *      and two writers can interleave.
 *   2. Read-modify-write (or stale-snapshot regenerate) races can drop a line
 *      (lost update).
 *
 * This module provides:
 *   - atomicWriteFileSync: write to a unique temp file in the SAME directory,
 *     then renameSync over the target. rename(2)/ReplaceFile is atomic, so a
 *     reader always sees either the old or the new COMPLETE file — never a tear.
 *   - withMemoryIndexLock: an atomic mkdir-based advisory lock with bounded
 *     retry + stale-lock breaking, so concurrent regenerators serialize and a
 *     crashed session cannot deadlock the index. Fails OPEN (proceeds) after the
 *     retry budget — atomicWriteFileSync still prevents a torn file.
 *
 * Node built-ins only (fs/path/os) — no new runtime dependency, cross-platform.
 */
import { writeFileSync, renameSync, rmSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

let _tmpCounter = 0;

/**
 * Atomically write `content` to `filePath` via temp-file + rename.
 * The temp file lives in the same directory so the rename stays on one
 * filesystem (a cross-device rename would fall back to a non-atomic copy).
 * On any failure the temp file is best-effort removed and the error rethrown.
 *
 * @param {string} filePath
 * @param {string} content
 * @param {object} [opts]
 * @param {string} [opts.encoding='utf8']
 */
export function atomicWriteFileSync(filePath, content, opts = {}) {
  const encoding = opts.encoding || 'utf8';
  const dir = dirname(filePath);
  const unique = `${process.pid}.${Date.now()}.${++_tmpCounter}`;
  const tmpPath = join(dir, `.${basename(filePath)}.${unique}.tmp`);
  try {
    writeFileSync(tmpPath, content, encoding);
    renameSync(tmpPath, filePath);
  } catch (err) {
    try { rmSync(tmpPath, { force: true }); } catch { /* best-effort cleanup */ }
    throw err;
  }
}

/**
 * Run `fn` while holding an atomic mkdir-based lock for the memory index.
 *
 * mkdir is atomic across platforms: exactly one caller can create the lock dir;
 * others get EEXIST and retry. A lock older than `staleMs` is assumed orphaned
 * (crashed session) and broken. After `retries` exhausted attempts the lock is
 * NOT acquired and we proceed anyway (fail-open) — combined with
 * atomicWriteFileSync this still cannot corrupt the file, it only loosens
 * serialization under pathological contention.
 *
 * @param {string} dir            Memory directory (lock lives at <dir>/.memory-index.lock)
 * @param {() => T} fn            Critical section
 * @param {object} [opts]
 * @param {number} [opts.retries=20]
 * @param {number} [opts.backoffMs=25]
 * @param {number} [opts.staleMs=30000]
 * @param {() => number} [opts.now=Date.now]   Injectable clock (tests)
 * @param {(ms:number)=>void} [opts.sleep]     Injectable sleep (tests); default busy-wait
 * @returns {{ acquired: boolean, result: T }}
 * @template T
 */
export function withMemoryIndexLock(dir, fn, opts = {}) {
  const retries = opts.retries ?? 20;
  const backoffMs = opts.backoffMs ?? 25;
  const staleMs = opts.staleMs ?? 30000;
  const now = opts.now || Date.now;
  const sleep = opts.sleep || defaultSleep;
  const lockPath = join(dir, '.memory-index.lock');

  let acquired = false;
  for (let attempt = 0; attempt <= retries && !acquired; attempt++) {
    try {
      mkdirSync(lockPath); // atomic: throws EEXIST if held
      acquired = true;
      break;
    } catch (err) {
      if (err && err.code !== 'EEXIST') throw err; // unexpected fs error — surface it
      // Lock held — break it if stale, else back off and retry.
      if (isLockStale(lockPath, staleMs, now)) {
        try { rmSync(lockPath, { recursive: true, force: true }); } catch { /* race: someone else broke it */ }
        continue; // retry immediately after breaking a stale lock
      }
      if (attempt < retries) sleep(backoffMs);
    }
  }

  try {
    return { acquired, result: fn() };
  } finally {
    if (acquired) {
      try { rmSync(lockPath, { recursive: true, force: true }); } catch { /* best-effort release */ }
    }
  }
}

/**
 * @returns {boolean} true if the lock dir exists and is older than staleMs.
 */
function isLockStale(lockPath, staleMs, now) {
  try {
    const st = statSync(lockPath);
    return (now() - st.mtimeMs) > staleMs;
  } catch {
    // Vanished between EEXIST and stat — treat as not-stale; next mkdir will win.
    return false;
  }
}

/** Synchronous, dependency-free backoff (the critical section is tiny). */
function defaultSleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* spin briefly */ }
}
