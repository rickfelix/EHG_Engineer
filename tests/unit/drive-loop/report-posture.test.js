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
import { unavailable, isAvailable, isSelfStale, DEFAULT_GRACE_MULTIPLIER, LAST_RUN_FIELD } from '../../../lib/drive-loop/report-posture.js';

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

/**
 * The REAL columns of periodic_process_registry, read from production on 2026-08-04 via
 *   supabase.from('periodic_process_registry').select('*').limit(1) -> Object.keys(row).sort()
 *
 * This list exists because the first version of isSelfStale read `last_run_at`, a column that
 * does not exist on this table — and the fixtures below invented the same field, so the test
 * agreed with the code about a world neither had measured. Date.parse(undefined) is NaN, so the
 * function returned stale:true unconditionally: FR-7's alarm was stuck ON and could never clear.
 */
const REGISTRY_COLUMNS = Object.freeze([
  'consecutive_miss_count', 'created_at', 'currently_expected_active', 'display_name',
  'expected_interval_seconds', 'grace_multiplier', 'last_fired_at', 'last_state',
  'last_state_changed_at', 'liveness_source', 'liveness_source_ref', 'owner',
  'process_key', 'process_type', 'session_bound', 'updated_at',
]);

/**
 * Build a registry row that CANNOT contain a column the table does not have. A fixture free to
 * invent fields can only ever confirm what the code already believes; this one refuses, so the
 * specific mistake above is unrepresentable here rather than merely warned against.
 */
function registryRow(fields) {
  for (const k of Object.keys(fields)) {
    if (!REGISTRY_COLUMNS.includes(k)) {
      throw new Error(`registryRow(): "${k}" is not a column of periodic_process_registry — `
        + `real columns: ${REGISTRY_COLUMNS.join(', ')}. A fixture that invents a field proves nothing about production.`);
    }
  }
  return fields;
}

describe('FR-7 self-staleness — the existing primitive, not a second rule', () => {
  const row = (intervalSec, lastRunSec) => registryRow({ expected_interval_seconds: intervalSec, [LAST_RUN_FIELD]: ago(lastRunSec) });

  it('[REGRESSION] reads a column that ACTUALLY EXISTS on periodic_process_registry', () => {
    // The whole defect in one assertion. Had this existed, the alarm would never have shipped stuck-on.
    expect(REGISTRY_COLUMNS).toContain(LAST_RUN_FIELD);
    expect(LAST_RUN_FIELD).toBe('last_fired_at');
    expect(REGISTRY_COLUMNS, 'last_run_at is a real column on a DIFFERENT table — never this one').not.toContain('last_run_at');
  });

  it('[CONTROL] the fixture builder itself refuses an invented column', () => {
    // Without this, "the builder validates" is an untested claim and the guard could be inert.
    expect(() => registryRow({ expected_interval_seconds: 60, last_run_at: 'x' })).toThrow(/not a column of periodic_process_registry/);
    expect(() => registryRow({ expected_interval_seconds: 60, [LAST_RUN_FIELD]: 'x' })).not.toThrow();
  });

  it('a HEALTHY producer reads fresh — the alarm must be able to CLEAR, not only to fire', () => {
    // The two-sided half. The old code passed every "is it stale?" test while being incapable of
    // ever reporting fresh, because a stuck-on alarm satisfies one-sided testing perfectly.
    const r = isSelfStale({ registryRow: row(3600, 60), nowMs: NOW });
    expect(r.stale).toBe(false);
    expect(r.reason).toMatch(/within 2x cadence/);
  });

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

  it(`a missing or malformed ${LAST_RUN_FIELD} is stale, not fresh`, () => {
    expect(isSelfStale({ registryRow: registryRow({ expected_interval_seconds: 60 }), nowMs: NOW }).stale).toBe(true);
    expect(isSelfStale({ registryRow: registryRow({ expected_interval_seconds: 60, [LAST_RUN_FIELD]: 'nope' }), nowMs: NOW }).stale).toBe(true);
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
      // .mjs too: everything under lib/drive-loop is .js today, so a single new .mjs would have
      // been invisible to this whole scan while the suite stayed green. A guard that silently
      // stops covering a file is worse than one that never covered it.
      else if (e.name.endsWith('.js') || e.name.endsWith('.mjs')) acc.push(p);
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
    // .rpc(...) — ADDED after the SECURITY sub-agent found the hole. This list had every
    // client-builder write method and omitted the one that can do ANY of them: a Postgres
    // function invoked through rpc() can insert, claim or dispatch, and none of the patterns
    // above see it. Worse, the read-vs-perform test below explicitly PINNED
    // `supabase.rpc("claim_sd", {})` as expected-NOT-caught, reasoning "a string arg, not a call
    // site". That reasoning is right about JS syntax and backwards about this guard's purpose:
    // for rpc, the string argument IS the invocation. There are zero rpc call sites under
    // lib/drive-loop today, so this closes a hole at no cost — and if a genuinely read-only rpc
    // is ever needed here, the answer is a deliberate, argued carve-out, not silence.
    /\.rpc\s*\(/,
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
    // REVERSED, deliberately. This previously asserted `false` on the reasoning that the function
    // name is only a string argument. Syntactically true, and exactly wrong for a guard whose
    // subject is "does this module PERFORM an act": rpc() is how a Supabase client performs an
    // arbitrary server-side write. The old pin did not merely miss the case, it certified it.
    expect(hits('await supabase.rpc("claim_sd", {})'), 'rpc IS the act, the string arg is its name').toBe(true);
    expect(hits('await supabase.rpc("anything_at_all")')).toBe(true);
    expect(hits('claim_sd({ p_session_id })')).toBe(true);
    // Still a noun, still tolerated — the narrowing this guard already earned must survive.
    expect(hits('const label = "rpc";'), 'the word rpc in a string is not a call').toBe(false);
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
