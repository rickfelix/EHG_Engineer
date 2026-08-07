/**
 * SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (FR-3c)
 *
 * THE RESIDUAL THE SD REFUSED TO PAPER OVER. Its author recorded that the session-bound loop DID
 * fire — Golf-3 was stamped at 14:46:49, inside a :47 slot — yet the other FOUR dead seats carried
 * no stale marker at all, and warned in terms: "there may additionally be a filter, a batch limit,
 * or an ordering that evaluates only a subset per run. ESTABLISH THAT BEFORE ASSUMING THE VENUE
 * MOVE IS SUFFICIENT. A venue fix that leaves four of five deaths undetected would ship green and
 * change nothing."
 *
 * ESTABLISHED: it was an ordering plus a limit, in periodic-liveness-watcher.mjs resolveRoleSession:
 *
 *     .order('heartbeat_at', { ascending: false }).limit(1).maybeSingle()
 *
 * ONE seat per class was examined — the freshest-heartbeat row — and its verdict stood for the
 * whole class. No amount of invoker durability fixes that; a more reliable cron just re-runs the
 * same single-row probe more reliably.
 *
 * AND THE ORDERING MADE IT WORSE THAN RANDOM. Sorting by heartbeat_at DESC selects FOR the exact
 * pathology the SD was filed about: a dead seat whose immortal tick kept stamping fresh heartbeats
 * sorts FIRST. The one row examined was preferentially the forged one, and it reported OK. A
 * uniformly random pick of 1-in-5 would have caught a real death 80% of the time; this picked the
 * liar by construction.
 *
 * These tests pin the population, not the mechanism: the source must not reduce the class to a
 * single row, and the per-seat census must reach the verdict.
 */

import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

const SRC = fs.readFileSync(
  new URL('../../../scripts/periodic-liveness-watcher.mjs', import.meta.url),
  'utf8'
);

// The function body under test, isolated so assertions cannot be satisfied by an unrelated
// .limit(1) elsewhere in the file (resolveSchedulerRound legitimately keeps one — it reads a
// genuine singleton table).
const ROLE_FN = SRC.slice(
  SRC.indexOf('async function resolveRoleSession'),
  SRC.indexOf('async function resolveSchedulerRound')
);

describe('FR-3c the role-session probe no longer collapses the class to one row', () => {
  it('is not empty (the slice actually found the function)', () => {
    // Guard against the test silently passing because the anchors moved and ROLE_FN is ''.
    expect(ROLE_FN.length).toBeGreaterThan(500);
  });

  it('does NOT cap the query at a single seat', () => {
    expect(ROLE_FN).not.toMatch(/\.limit\(1\)/);
    expect(ROLE_FN).not.toMatch(/\.maybeSingle\(\)/);
  });

  it('THE CONTROL: the singleton scheduler probe legitimately KEEPS its limit(1)', () => {
    // Without this, "delete every limit(1)" would satisfy the test above while breaking a
    // function whose table genuinely holds one row. The fix is targeted, not a sweep.
    const schedFn = SRC.slice(
      SRC.indexOf('async function resolveSchedulerRound'),
      SRC.indexOf('async function evaluateRow')
    );
    expect(schedFn).toMatch(/\.limit\(1\)/);
  });

  it('evaluates every returned seat and counts them', () => {
    expect(ROLE_FN).toMatch(/data\.map\(/);
    expect(ROLE_FN).toMatch(/examined: seats\.length/);
  });

  it('names evaluable-but-not-alive seats instead of discarding them', () => {
    expect(ROLE_FN).toMatch(/deadSeatIds/);
    // >=2 evaluable signals mirrors the file's existing "never declare dead on one signal" rule,
    // so surfacing a candidate death cannot regress into single-signal death declarations.
    expect(ROLE_FN).toMatch(/evaluableCount >= 2/);
  });

  it('selects session_id so the PID rung is resolvable for terminal_id-NULL rows', () => {
    // FR-1 (C2) made hasPidAlive resolve markers by session_id; querying without that column
    // would silently re-blind the PID rung for the 25% of live rows that carry no terminal_id.
    expect(ROLE_FN).toMatch(/select\('session_id/);
  });
});

describe('FR-3c the census reaches the verdict', () => {
  const EVAL_FN = SRC.slice(SRC.indexOf('async function evaluateRow'), SRC.length);

  it('states the examined-seat count on the OK path, not only on failure', () => {
    expect(EVAL_FN).toMatch(/seatCensus/);
    expect(EVAL_FN).toMatch(/examined \$\{resolved\.examined\} seat\(s\)/);
  });

  it('a class-level OK still carries the per-seat dead list', () => {
    const okBranch = EVAL_FN.slice(
      EVAL_FN.indexOf('if (freshSignals > 0)'),
      EVAL_FN.indexOf('if (resolved.evaluableCount < 2)')
    );
    expect(okBranch).toMatch(/dead_seat_ids/);
    expect(okBranch).toMatch(/seats_examined/);
    // This is the anti-absorption assertion: "the class is alive" must not be allowed to mean
    // "and therefore nothing in it is dead".
  });
});
