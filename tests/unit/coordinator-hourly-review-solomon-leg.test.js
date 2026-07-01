/**
 * SD-LEO-INFRA-SOLOMON-HOURLY-ROLE-REFRESHER-001 — the SOLOMON leg of coordinator-hourly-review.cjs
 * mirrors the Adam leg: resolve the live Solomon (getActiveSolomonId, no hardcoded UUID) and dispatch a
 * coordinator_reminder (topic=solomon_responsibilities) via the validated dispatch guard. Self-contained
 * (returns a verdict, does NOT exit main), dry-run-safe, fail-open. Deps (resolveSolomon/insert) are
 * injectable so the test drives the leg without a live DB. The cycle-down gate is the caller's
 * (assessFleetActivity, checked once) — a quiescent fleet never reaches this leg.
 *
 * SD-LEO-INFRA-SOLOMON-REFRESHER-FOUNDATIONS-EXTENSION-001: the dispatched body now also carries a
 * FOUNDATIONS pointer (buildFoundationsPointer) — Constitution + Mission/Vision + operating model —
 * widening the re-affirmation set beyond the role contract. buildFoundations is injectable so these
 * tests stay DB-free; buildFoundationsPointer itself is unit-tested separately below (fail-open path).
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { dispatchSolomonReminder, SOLOMON_REMINDER, buildFoundationsPointer } = require('../../scripts/coordinator-hourly-review.cjs');

const sb = {};

describe('dispatchSolomonReminder — the Solomon hourly leg', () => {
  it('dispatches a coordinator_reminder (topic=solomon_responsibilities) to the LIVE Solomon, body = role reminder + foundations pointer', async () => {
    const insert = vi.fn(async () => ({ data: { id: 'row-1' }, error: null }));
    const buildFoundations = vi.fn(async () => 'FOUNDATIONS-POINTER-STUB');
    const r = await dispatchSolomonReminder(sb, { dryRun: false, resolveSolomon: async () => 'solomon-sess-123', insert, buildFoundations });
    expect(r.dispatched).toBe(true);
    expect(r.target).toBe('solomon-sess-123');
    expect(buildFoundations).toHaveBeenCalledWith(sb);
    const [, row] = insert.mock.calls[0];
    expect(row.target_session).toBe('solomon-sess-123');
    expect(row.payload.kind).toBe('coordinator_reminder');
    expect(row.payload.topic).toBe('solomon_responsibilities'); // mirrors adam_responsibilities
    expect(row.sender_type).toBe('coordinator');
    expect(row.body).toContain(SOLOMON_REMINDER); // role contract still present
    expect(row.body).toContain('FOUNDATIONS-POINTER-STUB'); // widened set present
  });

  it('skips (no dispatch) when there is no live Solomon — itself a cycle-down', async () => {
    const insert = vi.fn();
    const buildFoundations = vi.fn();
    const r = await dispatchSolomonReminder(sb, { dryRun: false, resolveSolomon: async () => null, insert, buildFoundations });
    expect(r.dispatched).toBe(false);
    expect(r.reason).toBe('no_live_solomon');
    expect(insert).not.toHaveBeenCalled();
    expect(buildFoundations).not.toHaveBeenCalled(); // no wasted foundations read on a no-Solomon cycle
  });

  it('dry-run: resolves the live Solomon but does NOT dispatch, and does NOT read foundations', async () => {
    const insert = vi.fn();
    const buildFoundations = vi.fn();
    const r = await dispatchSolomonReminder(sb, { dryRun: true, resolveSolomon: async () => 'solomon-sess-123', insert, buildFoundations });
    expect(r.dispatched).toBe(false);
    expect(r.reason).toBe('dry_run');
    expect(insert).not.toHaveBeenCalled();
    expect(buildFoundations).not.toHaveBeenCalled(); // "re-read only when not idle" — dry-run never dispatches
  });

  it('fail-open: a resolve/dispatch error returns a non-dispatched verdict (never throws)', async () => {
    const r = await dispatchSolomonReminder(sb, { dryRun: false, resolveSolomon: async () => { throw new Error('db down'); }, insert: vi.fn() });
    expect(r.dispatched).toBe(false);
    expect(r.reason).toBe('error');
  });

  it('SOLOMON_REMINDER references CONST-002 + the consult triage gate + the task_budget', () => {
    expect(SOLOMON_REMINDER).toMatch(/CONST-002/);
    expect(SOLOMON_REMINDER).toMatch(/consult triage gate/i);
    expect(SOLOMON_REMINDER).toMatch(/task_budget/);
  });
});

describe('buildFoundationsPointer — SD-LEO-INFRA-SOLOMON-REFRESHER-FOUNDATIONS-EXTENSION-001', () => {
  it('points at the canonical Constitution, Mission/Vision, and operating-model sources — never embeds full text', async () => {
    const fakeSb = { from: () => ({ select: () => ({ order: async () => ({ data: [{ rule_code: 'CONST-001' }, { rule_code: 'CONST-014' }] }) }) }) };
    const pointer = await buildFoundationsPointer(fakeSb);
    expect(pointer).toMatch(/protocol_constitution/);
    expect(pointer).toMatch(/CONST-001\.\.CONST-014/);
    expect(pointer).toMatch(/docs\/vision\/ehg-mission-vision-canonical\.md/);
    expect(pointer).toMatch(/eva_vision_documents/);
    expect(pointer).toMatch(/venture-hosting-standard\.md/);
    expect(pointer).toMatch(/only-the-chairman-can\.md/);
    // cheap: no full rule/doc text embedded, just pointers + a count
    expect(pointer.length).toBeLessThan(600);
  });

  it('fail-open: a DB error still returns a usable static pointer (never throws)', async () => {
    const throwingSb = { from: () => { throw new Error('db down'); } };
    const pointer = await buildFoundationsPointer(throwingSb);
    expect(pointer).toMatch(/protocol_constitution/);
    expect(pointer).toMatch(/CONST-001\.\.014/);
    expect(pointer).toMatch(/docs\/vision\/ehg-mission-vision-canonical\.md/);
  });
});
