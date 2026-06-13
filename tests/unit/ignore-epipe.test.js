/**
 * SD-FDBK-FIX-HANDOFF-EPIPE-GUARD-001 — EPIPE-tolerant stream guard.
 *
 * Pins the shared handler that handoff.js (and add-prd-to-database.js) attach so a closed
 * read-end pipe never crashes the process mid-DB-persistence: EPIPE (and the no-error edge)
 * is swallowed, every other stream error still throws, and a static guard confirms
 * handoff.js actually attaches it.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { ignoreEpipe, attachIgnoreEpipe } from '../../lib/utils/ignore-epipe.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HANDOFF = resolve(__dirname, '../../scripts/handoff.js');

describe('ignoreEpipe predicate', () => {
  it('swallows an EPIPE error (does not throw)', () => {
    const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    expect(() => ignoreEpipe(epipe)).not.toThrow();
  });

  it('swallows the falsy/no-error edge', () => {
    expect(() => ignoreEpipe(null)).not.toThrow();
    expect(() => ignoreEpipe(undefined)).not.toThrow();
  });

  it('RETHROWS any non-EPIPE stream error (never hides a real fault)', () => {
    const econnreset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    expect(() => ignoreEpipe(econnreset)).toThrow(/socket hang up/);
    const generic = new Error('boom'); // no .code
    expect(() => ignoreEpipe(generic)).toThrow(/boom/);
  });
});

describe('attachIgnoreEpipe', () => {
  it('registers the handler on both streams so a closed pipe is swallowed end-to-end', () => {
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    attachIgnoreEpipe({ stdout, stderr });
    // Emitting an EPIPE 'error' on an EventEmitter WITH a listener does not throw;
    // WITHOUT the listener Node would throw "Unhandled error". So a non-throw proves attach.
    const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    expect(() => stdout.emit('error', epipe)).not.toThrow();
    expect(() => stderr.emit('error', epipe)).not.toThrow();
  });

  it('the attached handler still surfaces a non-EPIPE error', () => {
    const stdout = new EventEmitter();
    attachIgnoreEpipe({ stdout });
    const real = Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    expect(() => stdout.emit('error', real)).toThrow(/disk full/);
  });

  it('tolerates streams missing .on (no throw)', () => {
    expect(() => attachIgnoreEpipe({ stdout: {}, stderr: undefined })).not.toThrow();
  });
});

describe('production wiring guard', () => {
  it('handoff.js imports and attaches the shared EPIPE guard before the heavy graph', () => {
    const src = readFileSync(HANDOFF, 'utf8');
    // Dynamic import by design: it must load AFTER the re-exec preflight (builtin-only
    // module top), so assert the specifier appears in any import form.
    expect(src).toContain("'../lib/utils/ignore-epipe.mjs'");
    expect(src).toContain('attachIgnoreEpipe()');
    // It must be attached BEFORE the heavy main import (which begins the gate+persist output).
    expect(src.indexOf('attachIgnoreEpipe()')).toBeLessThan(src.indexOf("import('./modules/handoff/cli/index.js')"));
  });
});
