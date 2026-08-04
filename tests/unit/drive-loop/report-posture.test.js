/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — FR-7: fail-loud, propose-only, self-staleness.
 *
 * The propose-only block is the unusual one: it asserts an ABSENCE. A property that says "no write
 * path exists" cannot be checked by calling anything — there is nothing to call. So it walks the
 * shipped modules and proves no such path is present, and it carries its own positive control,
 * because a scan for something that isn't there and a broken scan produce identical output.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unavailable, isAvailable, isSelfStale, DEFAULT_GRACE_MULTIPLIER } from '../../../lib/drive-loop/report-posture.js';

const NOW = Date.parse('2026-08-03T12:00:00Z');
const ago = (sec) => new Date(NOW - sec * 1000).toISOString();

describe('FR-7 fail-loud — unavailable is not zero', () => {
  it('never yields a number a caller could mistake for a measurement', () => {
    const u = unavailable('capacity query threw');
    expect(u.available).toBe(false);
    expect(u.value).toBeNull();          // NOT 0 — that is the whole requirement
    expect(u.reason).toBe('capacity query threw');
    expect(isAvailable(u)).toBe(false);
  });

  it('distinguishes a measured zero from an unmeasurable one', () => {
    // The two readings a false 0 would collapse: a starved belt scoring 0/8, and a query that threw.
    const measuredZero = { available: true, value: 0 };
    expect(isAvailable(measuredZero)).toBe(true);
    expect(isAvailable(unavailable('threw'))).toBe(false);
  });

  it('refuses an unavailable with no reason — that is fail-quiet, not fail-loud', () => {
    expect(() => unavailable('')).toThrow(/a reason is required/);
    expect(() => unavailable()).toThrow(/a reason is required/);
  });

  it('says when it last knew, so "how stale is this?" is answerable', () => {
    expect(unavailable('x', '2026-08-03T11:00:00Z').measured_at_note).toMatch(/last attempted/);
    expect(unavailable('x').measured_at_note).toMatch(/no successful measurement/);
  });
});

describe('FR-7 self-staleness — the existing primitive, not a second rule', () => {
  const row = (intervalSec, lastRunSec) => ({ expected_interval_seconds: intervalSec, last_run_at: ago(lastRunSec) });

  it('breaches at expected_interval_seconds * graceMultiplier, boundary pinned', () => {
    const I = 3600;
    expect(isSelfStale({ registryRow: row(I, I * 2 - 1), nowMs: NOW }).stale).toBe(false); // inside
    expect(isSelfStale({ registryRow: row(I, I * 2), nowMs: NOW }).stale).toBe(false);     // exactly at 2x
    expect(isSelfStale({ registryRow: row(I, I * 2 + 1), nowMs: NOW }).stale).toBe(true);  // past it
    expect(DEFAULT_GRACE_MULTIPLIER).toBe(2); // "past 2x cadence" is the ratified wording
  });

  it('[VACUITY] an UNKNOWN cadence is stale, not fresh', () => {
    // Defaulting to fresh is how a dead scheduler reads as healthy: it cannot say how often it
    // should run, so it can never be late.
    for (const bad of [{}, { expected_interval_seconds: 0 }, { expected_interval_seconds: null }]) {
      const r = isSelfStale({ registryRow: bad, nowMs: NOW });
      expect(r.stale).toBe(true);
      expect(r.reason).toMatch(/cadence unknown/);
    }
  });

  it('a missing or malformed last_run_at is stale, not fresh', () => {
    expect(isSelfStale({ registryRow: { expected_interval_seconds: 60 }, nowMs: NOW }).stale).toBe(true);
    expect(isSelfStale({ registryRow: { expected_interval_seconds: 60, last_run_at: 'nope' }, nowMs: NOW }).stale).toBe(true);
  });

  it('refuses an implicit clock', () => {
    expect(() => isSelfStale({ registryRow: row(60, 10) })).toThrow(/nowMs must be provided/);
  });
});

describe('FR-7 propose-only — asserted as NEGATIVE SPACE across the shipped modules', () => {
  const DIR = fileURLToPath(new URL('../../../lib/drive-loop/', import.meta.url));

  /** Every .js under lib/drive-loop, recursively. */
  function sources(dir = DIR, acc = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) sources(p, acc);
      else if (e.name.endsWith('.js')) acc.push(p);
    }
    return acc;
  }

  // The acts the report must never PERFORM. Each pattern matches a CALL or a WRITE, never a noun.
  //
  // NARROWED ONCE, WITH A REASON — and the distinction matters more than the patch. The first
  // version used a bare /dispatch/i, which fired on section 4's `metadata.dispatch_rank`: a column
  // being READ, not a dispatch being performed. The tempting response to a guard that cries wolf is
  // to loosen it until it goes quiet, and then it catches nothing real either. So it was narrowed to
  // the ACT — an invocation — rather than deleted, and the read-vs-perform distinction is pinned by
  // the test below so a future edit cannot quietly re-broaden or re-blunt it.
  const FORBIDDEN = [
    /\.insert\s*\(/, /\.update\s*\(/, /\.upsert\s*\(/, /\.delete\s*\(/,
    /\bclaim_sd\s*\(|\brelease_sd\s*\(/,
    /\bdispatch[A-Za-z]*\s*\(/,   // dispatch(...), dispatchWork(...) — a call, not `dispatch_rank`
  ];

  it('the scan actually reads files — positive control', () => {
    // A scan for something absent and a scan that read nothing produce the same empty result. This
    // is the control that tells them apart, and it is why the assertion below means anything.
    const files = sources();
    expect(files.length).toBeGreaterThanOrEqual(6);
    const text = files.map((f) => fs.readFileSync(f, 'utf8')).join('');
    expect(text).toMatch(/export function cite/);       // known-present anchor
    expect(FORBIDDEN[0].test('supabase.from("x").insert({})')).toBe(true); // the pattern can match
  });

  it('the patterns catch PERFORMING an act and tolerate merely NAMING one', () => {
    // The narrowing that a bare /dispatch/i got wrong. Reading metadata.dispatch_rank is how section
    // 4 cites the existing order; calling dispatch() is the act this report must never take. If a
    // future edit re-broadens this, the first line fails; if it blunts it, the second does.
    const hits = (s) => FORBIDDEN.some((re) => re.test(s));
    expect(hits('const r = i.metadata.dispatch_rank;'), 'reading a rank column is not dispatching').toBe(false);
    expect(hits('dispatch_rank ordering, dispatch order, dispatchRank')).toBe(false);
    expect(hits('await dispatch(item)'), 'performing a dispatch must be caught').toBe(true);
    expect(hits('await dispatchWork({ sd })')).toBe(true);
    expect(hits('await supabase.rpc("claim_sd", {})')).toBe(false);   // a string arg, not a call site
    expect(hits('claim_sd({ p_session_id })')).toBe(true);
  });

  it('no module under lib/drive-loop reaches a claim, a dispatch or a write', () => {
    const offenders = [];
    for (const f of sources()) {
      const src = fs.readFileSync(f, 'utf8');
      // Strip block and line comments: the modules DISCUSS persistence and dispatch at length, and
      // prose about a forbidden act is not the act. Without this the check flags its own docs.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const re of FORBIDDEN) {
        if (re.test(code)) offenders.push(`${path.basename(f)} :: ${re}`);
      }
    }
    expect(offenders, 'the drive report PROPOSES; it must never act. A write path here would make '
      + 'the instrument a participant in what it measures').toEqual([]);
  });
});
