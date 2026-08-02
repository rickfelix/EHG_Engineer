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

describe('stdout decision-channel muzzle', () => {
  const hook = require(HOOK_PATH);

  // Requiring the supabase client loads dotenv, which writes ~80 bytes of banner to STDOUT — the
  // channel Claude Code parses as the Stop decision. Measured pre-existing at git HEAD.
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

  // A throw inside the muzzle must not leave stdout muted for the decision write that follows.
  it('restores stdout even when the callee throws', () => {
    const before = process.stdout.write;
    expect(() => hook.muzzleStdout(() => { throw new Error('boom'); })).toThrow('boom');
    expect(process.stdout.write).toBe(before);
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
describe('ship-order tripwires (green during step 0/A, red at step B by design)', () => {
  const hookSrc = fs.readFileSync(HOOK_PATH, 'utf8');

  // AC3 is countable, so count it. Step B deletes this call site; this test going red IS the
  // signal that step B landed, at which point it is updated deliberately rather than by accident.
  it('setLoopState(_, AWAITING_TICK) has EXACTLY ONE call site', () => {
    const sites = hookSrc.match(/setLoopState\(\s*sessionId\s*,\s*LOOP_STATE_AWAITING_TICK\s*\)/g) || [];
    expect(sites).toHaveLength(1);
  });

  // FR-B1: parkSessionRecoverable writes TWO things. Step B kills the false arm claim and KEEPS
  // the recoverability write — deleting both would remove the unarmed parked seat from
  // detectDormantWorkers, losing the only current sighting of this SD's target population.
  it('parkSessionRecoverable still writes expected_silence_until (kept at step B)', () => {
    expect(hookSrc).toMatch(/expected_silence_until/);
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
