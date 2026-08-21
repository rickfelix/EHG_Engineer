// SD-LEO-INFRA-TERMINAL-RITUAL-ENFORCEMENT-001 — STEP 0 (safe-alone).
// Kill-switch read plumbing + arm predicate + two-verdict flush-race observation.
// Nothing here decides anything yet; step A wires awaitStableVerdict() to the block decision.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const require = createRequire(import.meta.url);
const MOD = path.resolve(__dirname, '../lib/wakeup-arm-evidence.cjs');
const HOOK_PATH = path.resolve(__dirname, '../stop-loop-wakeup-reminder.cjs');
const PBP_PATH = path.resolve(__dirname, '../print-before-park.cjs');
const SETTINGS = path.resolve(__dirname, '../../../.claude/settings.json');

const ev = require(MOD);
const pbp = require(PBP_PATH);

const SID = '11111111-2222-4333-8444-555555555555';

// ── entry builders matching the MEASURED transcript shape (session ab29dc41, 2026-08-02) ──
const humanPrompt = () => ({ type: 'user', origin: { kind: 'human' }, timestamp: new Date().toISOString() });
const loopPrompt = () => ({ type: 'user', isMeta: true, promptSource: 'system', timestamp: new Date().toISOString() });
const armEntry = (input = {}) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'ScheduleWakeup', input }] } });
const textEntry = (t = 'done') => ({ type: 'assistant', message: { content: [{ type: 'text', text: t }] } });
const otherTool = (name = 'Bash') => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input: {} }] } });

describe('kill switch — filter shape (FR-2)', () => {
  it('emits BOTH legs, each with its own time bound inside the and(...) group', () => {
    const f = ev.buildCoordinationFilter({ sessionId: SID, sinceIso: '2026-08-02T20:00:00.000Z', nowIso: '2026-08-02T21:00:00.000Z' });
    expect(f).toContain(`and(sender_session.eq.${SID},created_at.gte.2026-08-02T20:00:00.000Z)`);
    expect(f).toContain(`and(target_sd.eq.${ev.FLEET_BROADCAST_SD},payload->>kind.eq.${ev.KILL_SWITCH_KIND},expires_at.gt.2026-08-02T21:00:00.000Z)`);
    // exactly two top-level legs — a stray comma would silently widen the query
    expect(f.split(/,(?![^(]*\))/).length).toBe(2);
  });

  // session_coordination has CHECK valid_target: target_session IS NOT NULL OR target_sd IS NOT
  // NULL. A null-targeted broadcast is UNINSERTABLE (verified against the live DB 2026-08-02 —
  // the insert was rejected, which is why this rides target_sd instead).
  it('carries the broadcast on target_sd, never on a null target', () => {
    expect(ev.FLEET_BROADCAST_SD).toBe('__FLEET_ENFORCEMENT__');
    expect(ev.buildCoordinationFilter({ sessionId: SID, sinceIso: 'a', nowIso: 'b' })).toContain('target_sd.eq.');
  });

  // POSTGREST FILTER INJECTION — confirmed LIVE by the SECURITY sub-agent, not theorised. A
  // sessionId of `x),or(...)` escaped the and(...) group and widened the query: benign input
  // returned 0 rows, the crafted one returned 3. It could not forge a kill row (partition
  // re-checks target_sd/kind/expires_at in JS) but that was the ONLY thing containing it.
  it('refuses to interpolate a non-UUID session id (injection)', () => {
    const hostile = 'x),or(target_sd.eq.__FLEET_ENFORCEMENT__';
    const f = ev.buildCoordinationFilter({ sessionId: hostile, sinceIso: 'S', nowIso: 'N' });
    expect(f).not.toContain(hostile);
    expect(f).not.toContain('sender_session');      // the sender leg is dropped entirely
    expect(f).toContain('target_sd.eq.__FLEET_ENFORCEMENT__'); // kill switch still readable
  });

  it('still builds both legs for a well-formed session id', () => {
    const f = ev.buildCoordinationFilter({ sessionId: SID, sinceIso: 'S', nowIso: 'N' });
    expect(f).toContain(`sender_session.eq.${SID}`);
    expect(f).toContain('target_sd.eq.__FLEET_ENFORCEMENT__');
  });

  // The invariant "scan ONLY this session's own rows" was previously enforced SOLELY by the
  // interpolated SQL — recentSenderRows filtered on created_at alone. An invariant worth writing
  // in a comment is worth enforcing where it is consumed.
  it('recentSenderRows enforces the sender itself, not just the time window', () => {
    const now = Date.now();
    const rows = [
      { sender_session: SID, created_at: new Date(now - 1000).toISOString(), body: 'mine' },
      { sender_session: 'someone-else', created_at: new Date(now - 1000).toISOString(), body: 'theirs' },
    ];
    const kept = ev.recentSenderRows(rows, { nowMs: now, sessionId: SID });
    expect(kept).toHaveLength(1);
    expect(kept[0].body).toBe('mine');
  });
});

describe('stdout muzzle honours the write callback', () => {
  const hookSrc = fs.readFileSync(HOOK_PATH, 'utf8');

  // `() => true` DROPS the callback. A transitive writer that waits for it would hang to the 10s
  // hook timeout — and a timed-out Stop hook returns NO DECISION, the exact failure the budget
  // work exists to prevent. Found by the SECURITY sub-agent.
  it('no muzzle site discards the write callback', () => {
    expect(hookSrc).not.toMatch(/process\.stdout\.write = \(\) => true/);
    expect(hookSrc).toMatch(/const SWALLOW = \(_chunk, enc, cb\)/);
  });

  // Tests the REAL exported function rather than re-parsing its source — a source-derived copy
  // can pass while the shipped one differs, which is the whole failure family this SD kept hitting.
  it('SWALLOW invokes the callback in both node signatures and swallows the bytes', () => {
    const { SWALLOW } = require(HOOK_PATH);
    let cb2 = false;
    expect(SWALLOW('x', () => { cb2 = true; })).toBe(true);
    expect(cb2).toBe(true);                      // write(chunk, cb)
    let cb3 = false;
    expect(SWALLOW('x', 'utf8', () => { cb3 = true; })).toBe(true);
    expect(cb3).toBe(true);                      // write(chunk, encoding, cb)
    expect(SWALLOW('x')).toBe(true);             // no callback supplied — must not throw
  });
});

describe('kill switch — partition (widening a shared query changes every consumer)', () => {
  const kill = { target_sd: ev.FLEET_BROADCAST_SD, payload: { kind: ev.KILL_SWITCH_KIND }, body: 'winding down the enforcement' };
  const mine = { target_sd: null, payload: {}, body: 'winding down — anything queued?', created_at: new Date().toISOString() };

  it('routes a broadcast row to killRows and this session\'s rows to senderRows', () => {
    const { killRows, senderRows } = ev.partitionCoordinationRows([kill, mine]);
    expect(killRows).toEqual([kill]);
    expect(senderRows).toEqual([mine]);
  });

  // The regression the widening could have introduced: a kill row whose text says "winding down"
  // must NOT be able to flip windDownSignaled, which would silently suppress the block.
  it('a kill row can never reach the wind-down text scan', () => {
    const { senderRows } = ev.partitionCoordinationRows([kill]);
    expect(senderRows).toHaveLength(0);
    expect(ev.recentSenderRows(senderRows)).toHaveLength(0);
  });

  it('a row that is only half-shaped (right target, wrong kind) is NOT a kill row', () => {
    const { killRows } = ev.partitionCoordinationRows([{ target_sd: ev.FLEET_BROADCAST_SD, payload: { kind: 'roll_call' } }]);
    expect(killRows).toHaveLength(0);
  });
});

describe('kill switch — isEnforcementDisabled', () => {
  const now = Date.parse('2026-08-02T21:00:00.000Z');
  const row = (over = {}) => ({ payload: { kind: ev.KILL_SWITCH_KIND, ...(over.payload || {}) }, expires_at: over.expires_at });

  it('no rows ⇒ enforcement ENABLED', () => {
    expect(ev.isEnforcementDisabled([], { nowMs: now })).toBe(false);
    expect(ev.isEnforcementDisabled(null, { nowMs: now })).toBe(false);
  });

  it('a live row naming this enforcement disables it', () => {
    expect(ev.isEnforcementDisabled([row({ payload: { enforcement: ev.ENFORCEMENT_ID }, expires_at: '2026-08-02T21:30:00.000Z' })], { nowMs: now })).toBe(true);
  });

  it('a blanket row (enforcement absent or "all") disables it', () => {
    expect(ev.isEnforcementDisabled([row({ expires_at: '2026-08-02T21:30:00.000Z' })], { nowMs: now })).toBe(true);
    expect(ev.isEnforcementDisabled([row({ payload: { enforcement: 'all' }, expires_at: '2026-08-02T21:30:00.000Z' })], { nowMs: now })).toBe(true);
  });

  it('a row naming a DIFFERENT enforcement does not disable this one', () => {
    expect(ev.isEnforcementDisabled([row({ payload: { enforcement: 'some_other_hook' }, expires_at: '2026-08-02T21:30:00.000Z' })], { nowMs: now })).toBe(false);
  });

  it('an EXPIRED row does not disable (re-checked in JS, not only in SQL)', () => {
    expect(ev.isEnforcementDisabled([row({ expires_at: '2026-08-02T20:59:59.000Z' })], { nowMs: now })).toBe(false);
  });
});

describe('arm predicate — "current turn" defined explicitly (the STALE ARM bug)', () => {
  it('an arm AFTER the boundary is admissible evidence', () => {
    const r = ev.findArmInCurrentTurn([humanPrompt(), otherTool(), armEntry({ delaySeconds: 900 })]);
    expect(r.verdict).toBe('armed');
    expect(r.armCount).toBe(1);
  });

  // THE bug this predicate exists to avoid. A ScheduleWakeup from the PREVIOUS turn counted as
  // evidence for THIS one makes the hook believe every turn is armed — it never blocks again,
  // with no error, no log, no alert. Silent and permanent.
  it('an arm BEFORE the boundary is STALE and must NOT count', () => {
    const r = ev.findArmInCurrentTurn([armEntry({ delaySeconds: 900 }), loopPrompt(), otherTool()]);
    expect(r.verdict).toBe('unarmed');
    expect(r.armCount).toBe(0);
  });

  it('the boundary is the LAST prompt, so an arm two turns back is also stale', () => {
    const r = ev.findArmInCurrentTurn([loopPrompt(), armEntry(), loopPrompt(), textEntry()]);
    expect(r.verdict).toBe('unarmed');
  });

  it('human and loop prompts both open a turn', () => {
    expect(ev.findArmInCurrentTurn([armEntry(), humanPrompt(), textEntry()]).verdict).toBe('unarmed');
    expect(ev.findArmInCurrentTurn([armEntry(), loopPrompt(), textEntry()]).verdict).toBe('unarmed');
  });

  // Absence of evidence is not evidence of absence: a turn bigger than the tail window has no
  // boundary in view, and must never be treated as unarmed.
  it("no boundary in the tail window ⇒ 'unknown', never 'unarmed'", () => {
    expect(ev.findArmInCurrentTurn([armEntry(), textEntry()]).verdict).toBe('unknown');
    expect(ev.findArmInCurrentTurn([]).verdict).toBe('unknown');
    expect(ev.findArmInCurrentTurn(null).verdict).toBe('unknown');
  });

  it('a stop:true arm is recorded distinctly (deliberate loop END, not a continuation)', () => {
    const r = ev.findArmInCurrentTurn([loopPrompt(), armEntry({ stop: true })]);
    expect(r.verdict).toBe('armed');
    expect(r.stopRequested).toBe(true);
    expect(ev.findArmInCurrentTurn([loopPrompt(), armEntry({ delaySeconds: 60 })]).stopRequested).toBe(false);
  });

  it('only ScheduleWakeup counts — other tool calls are not arms', () => {
    expect(ev.findArmInCurrentTurn([loopPrompt(), otherTool('Bash'), otherTool('Write')]).verdict).toBe('unarmed');
    expect(ev.WAKEUP_TOOL).toBe('ScheduleWakeup'); // measured against a real transcript
  });

  it('a user-role entry carrying a tool_use block is not an assistant arm', () => {
    const spoof = { type: 'user', message: { content: [{ type: 'tool_use', name: 'ScheduleWakeup', input: {} }] } };
    expect(ev.findArmInCurrentTurn([loopPrompt(), spoof]).verdict).toBe('unarmed');
  });
});

// MEASURED shape (session ab29dc41, 4,826 entries, 2026-08-02): every user entry carries the
// promptId of its turn; assistant entries carry none. The origin/isMeta discriminators matched
// 3 and ZERO respectively across that whole session — a predicate built on them alone is blind.
describe('turn boundary — promptId primary, origin fallback', () => {
  const u = (promptId, extra = {}) => ({ type: 'user', promptId, message: { content: [{ type: 'tool_result' }] }, ...extra });

  it('the turn starts at the FIRST entry bearing the newest promptId', () => {
    const r = ev.findArmInCurrentTurn([u('t1'), armEntry(), u('t2'), otherTool(), u('t2'), armEntry()]);
    expect(r.via).toBe('promptId');
    expect(r.verdict).toBe('armed');
    expect(r.armCount).toBe(1); // the t1-turn arm is excluded
  });

  it('an arm in the PREVIOUS promptId group is stale and excluded', () => {
    const r = ev.findArmInCurrentTurn([u('t1'), armEntry(), armEntry(), u('t2'), otherTool()]);
    expect(r.via).toBe('promptId');
    expect(r.verdict).toBe('unarmed');
    expect(r.armCount).toBe(0);
  });

  it('tool-result user entries share the turn promptId and do not open a new turn', () => {
    const r = ev.findArmInCurrentTurn([u('t1'), otherTool(), u('t1'), armEntry()]);
    expect(r.verdict).toBe('armed');
    expect(r.turnStartIdx).toBe(0);
  });

  // Regression guard for the blindness found on a real transcript: with no promptId anywhere,
  // the fallback must still resolve a boundary rather than silently reporting 'unknown'.
  it('falls back to origin discriminators when no promptId is present', () => {
    const r = ev.findArmInCurrentTurn([humanPrompt(), armEntry()]);
    expect(r.via).toBe('origin');
    expect(r.verdict).toBe('armed');
  });

  it('reports via=none only when NEITHER method finds a boundary', () => {
    expect(ev.findArmInCurrentTurn([armEntry(), textEntry()]).via).toBe('none');
  });

  it('promptId wins over the fallback when both are available', () => {
    const r = ev.findArmInCurrentTurn([humanPrompt(), armEntry(), u('t9'), otherTool()]);
    expect(r.via).toBe('promptId');
    expect(r.verdict).toBe('unarmed'); // fallback alone would have said armed
  });
});

// FR-3 — THE POPULATION THAT ACTUALLY FAILS. Arm compliance is ~100% on failure-shaped turns
// (an error is salient, the worker is still "in" the task) and decays toward zero on
// success-terminal ones, where a dense closing summary displaces the mechanical step. A suite
// that only exercises failure paths passes while leaving the entire real failure population
// untouched — so the specimens below are all SUCCESS-shaped.
describe('FR-3 — success-terminal unarmed turns are the target, and they block', () => {
  const { shouldRemind } = require(HOOK_PATH);
  const u = (promptId) => ({ type: 'user', promptId, message: { content: [{ type: 'tool_result' }] } });
  const worker = { loopState: 'active', flagEnabled: true, hasActiveClaim: true, stopHookActive: false };

  // The exact shape of all three recorded dormancies: work done, tests green, a long closing
  // summary written — and the wakeup never armed because the summary displaced it.
  it('a turn that ends on a successful summary with no arm is UNARMED and blocks', () => {
    const specimen = [u('t1'), otherTool('Bash'), otherTool('Edit'), textEntry('All 362 tests pass. Shipped as PR #6741.')];
    const v = ev.findArmInCurrentTurn(specimen);
    expect(v.verdict).toBe('unarmed');
    expect(shouldRemind({ ...worker, armVerdict: v.verdict })).toBe(true);
  });

  // Charlie's false positive, reproduced deliberately: the worker SAYS it armed, in the same
  // turn, in text. Text is not a tool call.
  it('a turn that ANNOUNCES "wakeup armed" in text but never calls the tool still blocks', () => {
    const specimen = [u('t1'), otherTool('Bash'), textEntry('Done. wakeup-armed +900s at 17:53.')];
    const v = ev.findArmInCurrentTurn(specimen);
    expect(v.verdict).toBe('unarmed');
    expect(shouldRemind({ ...worker, armVerdict: v.verdict })).toBe(true);
  });

  // The same announcement mirrored into the DB as the worker's self-report. The OLD predicate
  // read exactly this and allowed the stop.
  it('the same turn still blocks even with loop_state=awaiting_tick claiming otherwise', () => {
    const v = ev.findArmInCurrentTurn([u('t1'), textEntry('wakeup-armed +900s')]);
    expect(shouldRemind({ ...worker, loopState: 'awaiting_tick', armVerdict: v.verdict })).toBe(true);
  });

  // STALE ARM, end to end: a real ScheduleWakeup exists in the transcript — one turn too early.
  it('a success-shaped turn whose only arm is in the PREVIOUS turn blocks (stale arm)', () => {
    const specimen = [u('t1'), armEntry({ delaySeconds: 900 }), textEntry('tick done'),
      u('t2'), otherTool('Bash'), textEntry('next tick done')];
    const v = ev.findArmInCurrentTurn(specimen);
    expect(v.verdict).toBe('unarmed');
    expect(v.armCount).toBe(0);
    expect(shouldRemind({ ...worker, armVerdict: v.verdict })).toBe(true);
  });

  // The compliant shape this SD is trying to produce: arm, THEN summarise.
  it('arming before the closing summary is compliant and does NOT block', () => {
    const specimen = [u('t1'), otherTool('Bash'), armEntry({ delaySeconds: 900 }), textEntry('Shipped. Next tick in 15m.')];
    const v = ev.findArmInCurrentTurn(specimen);
    expect(v.verdict).toBe('armed');
    expect(shouldRemind({ ...worker, armVerdict: v.verdict })).toBe(false);
  });

  it('a deliberate ScheduleWakeup({stop:true}) loop-end is not treated as a failure to arm', () => {
    const v = ev.findArmInCurrentTurn([u('t1'), armEntry({ stop: true }), textEntry('loop complete')]);
    expect(v.stopRequested).toBe(true);
    expect(shouldRemind({ ...worker, armVerdict: v.verdict })).toBe(false);
  });
});

describe('stdout decision-channel muzzle', () => {
  const hook = require(HOOK_PATH);
  const hookSrc = fs.readFileSync(HOOK_PATH, 'utf8');

  it('discards stdout writes made inside the muzzle', () => {
    const chunks = [];
    const real = process.stdout.write;
    process.stdout.write = (c) => { chunks.push(String(c)); return true; };
    try {
      hook.muzzleStdout(() => { process.stdout.write('◇ injected env (1) from .env\n'); return 'ok'; });
    } finally { process.stdout.write = real; }
    expect(chunks).toHaveLength(0);
  });

  it('returns the callee value and RESTORES stdout afterwards', () => {
    const before = process.stdout.write;
    expect(hook.muzzleStdout(() => 'value')).toBe('value');
    expect(process.stdout.write).toBe(before);
  });

  it('restores stdout even when the callee throws', () => {
    const before = process.stdout.write;
    expect(() => hook.muzzleStdout(() => { throw new Error('boom'); })).toThrow('boom');
    expect(process.stdout.write).toBe(before);
  });

  // THE CLASS FIX, MADE COUNTABLE. A scoped muzzle around the one require I had MEASURED was an
  // instance fix: the allow path still emitted 87 bytes from a different transitive require
  // (park-worker / emit-feedback), caught only by an end-to-end run. The muzzle now installs at
  // module load, so the invariant is structural — exactly one write reaches the real stdout, and
  // it is the decision. A new `process.stdout.write(...)` anywhere else turns this red.
  it('the real stdout has exactly ONE writer, and it is emitDecision', () => {
    const realWrites = hookSrc.match(/REAL_STDOUT_WRITE\(/g) || [];
    expect(realWrites).toHaveLength(1);
    expect(hookSrc).toMatch(/function emitDecision[\s\S]{0,200}REAL_STDOUT_WRITE\(/);
    // the muzzle is armed before any require below it can print
    expect(hookSrc.indexOf('process.stdout.write = () => true;')).toBeLessThan(hookSrc.indexOf("require('../lib/sessions/loop-state-tracker.cjs')"));
  });

  it('the block decision is emitted through emitDecision, not a raw write', () => {
    expect(hookSrc).toMatch(/emitDecision\(\{\s*decision:\s*'block'/);
    expect(hookSrc).not.toMatch(/process\.stdout\.write\(JSON\.stringify/);
  });
});

describe('awaitStableVerdict — flush race, deterministic (guard copied from print-before-park)', () => {
  const mkNow = () => { let t = 0; return { now: () => t, sleep: async (ms) => { t += ms; } }; };

  it('an armed first read returns IMMEDIATELY — a compliant seat pays one read', async () => {
    const { now, sleep } = mkNow();
    const r = await ev.awaitStableVerdict({ read: () => ({ verdict: 'armed', armCount: 1 }), now, sleep });
    expect(r.reads).toBe(1);
    expect(r.elapsedMs).toBe(0);
    expect(r.flipped).toBe(false);
  });

  it("'unknown' also returns immediately (never pay the stabilisation for a non-decision)", async () => {
    const { now, sleep } = mkNow();
    const r = await ev.awaitStableVerdict({ read: () => ({ verdict: 'unknown' }), now, sleep });
    expect(r.reads).toBe(1);
  });

  // THE RACE, reproduced deterministically rather than by timing luck: the final assistant block
  // flushes to the JSONL after the hook starts reading, so read #1 says unarmed and read #3 says
  // armed. A single-read verdict would have false-positived on a turn that DID arm.
  it('flips unarmed → armed when the arm flushes mid-stabilisation, and REPORTS the flip', async () => {
    const { now, sleep } = mkNow();
    let n = 0;
    const read = () => (++n < 3 ? { verdict: 'unarmed', armCount: 0 } : { verdict: 'armed', armCount: 1 });
    const r = await ev.awaitStableVerdict({ read, now, sleep });
    expect(r.first.verdict).toBe('unarmed');
    expect(r.stable.verdict).toBe('armed');
    expect(r.flipped).toBe(true);
    expect(r.reads).toBe(3);
  });

  it('a genuinely unarmed turn stays unarmed and stops at the deadline', async () => {
    const { now, sleep } = mkNow();
    const r = await ev.awaitStableVerdict({ read: () => ({ verdict: 'unarmed', armCount: 0 }), now, sleep, deadlineMs: 2500, intervalMs: 400 });
    expect(r.stable.verdict).toBe('unarmed');
    expect(r.flipped).toBe(false);
    expect(r.elapsedMs).toBeLessThanOrEqual(2800); // bounded: cannot eat the 10s hook timeout
    expect(r.reads).toBeLessThanOrEqual(8);
  });
});

describe('pending-wake print — BOTH verdicts, and the CHANNEL it may not touch', () => {
  it('reports first AND stable so the real race frequency is quantifiable from logs', () => {
    const line = ev.formatPendingWake(
      { first: { verdict: 'unarmed' }, stable: { verdict: 'armed', armCount: 1, stopRequested: false }, flipped: true, reads: 3, elapsedMs: 800 },
      { sessionId: SID },
    );
    expect(line).toContain('first=unarmed');
    expect(line).toContain('stable=armed');
    expect(line).toContain('flipped=yes');
    expect(line).toContain('reads=3');
    expect(line).toContain(`session=${SID}`);
    expect(line.endsWith('\n')).toBe(true);
  });

  // Claude Code parses a Stop hook's STDOUT as the decision document. The print must never be
  // mistakable for one — asserted on the emitted BYTES, not on the intent to keep it clean.
  it('is not parseable as a Stop decision (no JSON, no decision key)', () => {
    const line = ev.formatPendingWake({ first: { verdict: 'armed' }, stable: { verdict: 'armed' }, reads: 1, elapsedMs: 0 }, { sessionId: SID });
    expect(line).not.toMatch(/"decision"/);
    expect(() => JSON.parse(line)).toThrow();
    expect(line.trimStart()[0]).not.toBe('{');
  });

  it('degrades to a total function on a malformed observation', () => {
    expect(() => ev.formatPendingWake(undefined, {})).not.toThrow();
    expect(ev.formatPendingWake(null, {})).toContain('first=none');
  });
});

// print-before-park.cjs shipped with ZERO tests and this SD copies its flush-race guard.
// Copying an untested guard means inheriting whatever is wrong with it — so it gets tests here.
describe('print-before-park — discriminators (first tests for this file)', () => {
  it('isHumanPrompt matches a typed human entry', () => {
    expect(pbp.isHumanPrompt({ type: 'user', origin: { kind: 'human' } })).toBe(true);
    expect(pbp.isHumanPrompt({ type: 'user', origin: { kind: 'system' } })).toBe(false);
    expect(pbp.isHumanPrompt(null)).toBe(false);
  });

  // The class EVERY witnessed silent-stop fell into: mid-turn arrivals are recorded only as
  // queued_command attachments and never become user entries.
  it('isHumanPrompt matches a mid-turn queued_command attachment', () => {
    expect(pbp.isHumanPrompt({ type: 'attachment', attachment: { type: 'queued_command', origin: { kind: 'human' } } })).toBe(true);
    expect(pbp.isHumanPrompt({ type: 'attachment', attachment: { type: 'file', origin: { kind: 'human' } } })).toBe(false);
  });

  it('isLoopPrompt requires BOTH isMeta and promptSource=system', () => {
    expect(pbp.isLoopPrompt({ type: 'user', isMeta: true, promptSource: 'system' })).toBe(true);
    expect(pbp.isLoopPrompt({ type: 'user', isMeta: true })).toBe(false);
    expect(pbp.isLoopPrompt({ type: 'user', promptSource: 'system' })).toBe(false);
  });

  it('hasNonEmptyText ignores whitespace-only and non-text blocks', () => {
    expect(pbp.hasNonEmptyText({ message: { content: [{ type: 'text', text: 'hi' }] } })).toBe(true);
    expect(pbp.hasNonEmptyText({ message: { content: [{ type: 'text', text: '   ' }] } })).toBe(false);
    expect(pbp.hasNonEmptyText({ message: { content: [{ type: 'tool_use', name: 'X' }] } })).toBe(false);
    expect(pbp.hasNonEmptyText({ message: { content: 'plain string' } })).toBe(true);
    expect(pbp.hasNonEmptyText(null)).toBe(false);
  });

  it('readTailEntries parses JSONL and skips corrupt lines without throwing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbp-'));
    const f = path.join(dir, 't.jsonl');
    fs.writeFileSync(f, `${JSON.stringify({ type: 'user' })}\nNOT-JSON\n${JSON.stringify({ type: 'assistant' })}\n`);
    const entries = pbp.readTailEntries(f);
    expect(entries.map((e) => e.type)).toEqual(['user', 'assistant']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('decide() blocks a human-prompted turn ending on a tool call, allows one ending on text', () => {
    expect(pbp.decide([humanPrompt(), otherTool()]).block).toBe(true);
    expect(pbp.decide([humanPrompt(), otherTool(), textEntry()]).block).toBe(false);
  });
});

// ── Ship-order tripwires: these encode the BUILD ORDER itself as assertions ──
// STEP B LANDED. The tripwire is UPDATED, not weakened: AC3 stays countable (exactly one call
// site) and gains the stronger claim — that call site is now UNREACHABLE unless the turn actually
// armed. Guarding beat deleting: deleting would have stripped the true state from compliant
// workers too, and all four consumers depend on it being present when it is EARNED.
describe('step B — awaiting_tick is stamped only on real arm evidence (AC3, countable)', () => {
  const hookSrc = fs.readFileSync(HOOK_PATH, 'utf8');
  const hook = require(HOOK_PATH);

  it('setLoopState(_, AWAITING_TICK) still has EXACTLY ONE call site', () => {
    const sites = hookSrc.match(/setLoopState\(\s*sessionId\s*,\s*LOOP_STATE_AWAITING_TICK\s*\)/g) || [];
    expect(sites).toHaveLength(1);
  });

  it('that call site sits behind an armVerdict === \'armed\' guard', () => {
    expect(hookSrc).toMatch(/if \(armVerdict === 'armed'\)[\s\S]{0,300}setLoopState\(\s*sessionId\s*,\s*LOOP_STATE_AWAITING_TICK\s*\)/);
  });

  // FR-B1: the recoverability write must SURVIVE. Moving it inside the arm guard drops unarmed
  // seats out of charter-audit isParked:83 and dormancy-watchdog :27 — false starvation alarms,
  // and the loss of this SD's only sighting of its own target population.
  //
  // THIS TEST WAS REWRITTEN BECAUSE THE PREVIOUS ONE COULD NOT FAIL. It asserted
  // `body.slice(afterGuard).includes('expected_silence_until')` — a TEXT-ORDER check that stays
  // true under the exact regression it names, since moving the call into the guard leaves the
  // string later in the file either way. A mutation run (TESTING sub-agent, EXEC) moved the write
  // inside the guard and all 107 tests stayed green. An assertion that survives its own mutant is
  // decoration; the seam to do it properly already existed one test below.
  it('writes expected_silence_until for EVERY verdict, armed or not (mutation-killing)', async () => {
    const writerPath = path.resolve(__dirname, '../lib/session-telemetry-writer.cjs');
    const writer = require(writerPath);
    const origWrite = writer.writeTelemetryAwait;
    const tracker = require(path.resolve(__dirname, '../../lib/sessions/loop-state-tracker.cjs'));
    const origSet = tracker.setLoopState;
    const silenceCalls = [];
    writer.writeTelemetryAwait = async (sid, patch) => { silenceCalls.push(patch); };
    tracker.setLoopState = async () => {};
    try {
      for (const armVerdict of ['armed', 'unarmed', 'unknown', undefined]) {
        await hook.parkSessionRecoverable('11111111-2222-4333-8444-555555555555', { armVerdict });
      }
      // One recoverability write per call — the UNARMED ones are the whole point.
      expect(silenceCalls).toHaveLength(4);
      for (const patch of silenceCalls) {
        expect(patch).toHaveProperty('expected_silence_until');
        expect(Number.isNaN(Date.parse(patch.expected_silence_until))).toBe(false); // :27 must parse it
      }
    } finally {
      writer.writeTelemetryAwait = origWrite;
      tracker.setLoopState = origSet;
    }
  });

  // Behavioural, not just source-shaped: the write must not fire for an unarmed or unknown turn.
  it('does not touch loop_state for unarmed / unknown / missing verdicts', async () => {
    const tracker = require(path.resolve(__dirname, '../../lib/sessions/loop-state-tracker.cjs'));
    const orig = tracker.setLoopState;
    const calls = [];
    tracker.setLoopState = async (...a) => { calls.push(a); };
    try {
      for (const armVerdict of ['unarmed', 'unknown', undefined]) {
        await hook.parkSessionRecoverable('11111111-2222-4333-8444-555555555555', { armVerdict });
      }
      expect(calls).toHaveLength(0);
      await hook.parkSessionRecoverable('11111111-2222-4333-8444-555555555555', { armVerdict: 'armed' });
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toBe('awaiting_tick');
    } finally { tracker.setLoopState = orig; }
  });
});

// The step-C gate reads feedback(category='wind_down_survey'). That channel had written ZERO rows
// since it shipped, because source_type='wind_down_survey' violates feedback_source_type_check and
// recordWindDown swallows the throw to stderr. A dead writer reads identically to an empty
// population — the gate would have returned 0 forever and killed step C for the wrong reason.
describe('wind-down mirror writes through a source_type the DB actually accepts', () => {
  const hookSrc = fs.readFileSync(HOOK_PATH, 'utf8');
  // Mirrors CHECK feedback_source_type_check (database/schema-reference-snapshot.json:1505).
  const ALLOWED_SOURCE_TYPES = [
    'manual_feedback', 'auto_capture', 'uat_failure', 'error_capture', 'uncaught_exception',
    'unhandled_rejection', 'manual_capture', 'todoist_intake', 'youtube_intake',
    'claude_code_intake', 'telegram', 'user_feedback',
  ];

  it('every source_type this hook emits is admitted by the CHECK constraint', () => {
    const emitted = [...hookSrc.matchAll(/source_type:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(emitted.length).toBeGreaterThan(0);
    for (const st of emitted) expect(ALLOWED_SOURCE_TYPES).toContain(st);
  });

  // The category is the discriminator the gauge registry reads; it was never the blocker and
  // must not drift while fixing the source_type.
  it('still files under category wind_down_survey (what the gate and gauge query)', () => {
    expect(hookSrc).toMatch(/category:\s*'wind_down_survey'/);
  });

  // QF-20260803-503: these rows must self-resolve at write time (never land status='new' in
  // the human triage lane) without losing per-row fidelity via the collapsing machine-lane RPC.
  it('files wind_down_survey rows pre-resolved, satisfying chk_feedback_terminal_resolution', () => {
    expect(hookSrc).toMatch(/status:\s*'resolved'/);
    // chk_feedback_terminal_resolution requires a non-empty resolution_notes (or a resolution
    // FK) whenever status='resolved' — a bare status flip with no notes violates the CHECK.
    const notesMatch = hookSrc.match(/resolution_notes:\s*'([^']+)'/);
    expect(notesMatch).not.toBeNull();
    expect(notesMatch[1].trim().length).toBeGreaterThan(0);
  });

  // Never re-add this category to the collapsing aggregate-UPSERT path — that's the exact
  // change feedback-audience.js's own MACHINE_TELEMETRY_CATEGORIES comment documents as tried
  // and reverted (it collapses every same-day row to ONE, destroying per-row metadata.reason).
  it('is never routed through the machine-telemetry aggregate-UPSERT category set', async () => {
    const { MACHINE_TELEMETRY_CATEGORIES } = await import('../../../lib/governance/feedback-audience.js');
    expect(MACHINE_TELEMETRY_CATEGORIES).not.toContain('wind_down_survey');
  });
});

describe('no new hook or registry (constraint)', () => {
  it('the Stop array is unchanged — exactly 6 commands, same set', () => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const cmds = (settings.hooks.Stop || []).flatMap((g) => (g.hooks || []).map((h) => h.command));
    expect(cmds).toHaveLength(6);
    expect(cmds.filter((c) => c.includes('stop-loop-wakeup-reminder.cjs'))).toHaveLength(1);
    expect(cmds.filter((c) => c.includes('print-before-park.cjs'))).toHaveLength(1);
    // step 0 adds a lib module, NOT a hook — it must never appear in the registry
    expect(cmds.filter((c) => c.includes('wakeup-arm-evidence'))).toHaveLength(0);
  });
});
