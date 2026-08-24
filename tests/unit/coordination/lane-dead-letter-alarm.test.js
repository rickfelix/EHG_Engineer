/**
 * Dead-letter alarm — SD-LEO-INFRA-COMMS-LANE-TTLS-001 FR-3.
 * No live DB calls — supabase/deps are injected stubs throughout, including through the REAL
 * emitLadderDigest call chain (its own findExisting/recordPending/escalate seams are mocked).
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  DEFAULT_MODE,
  FORBIDDEN_EMIT_FUNCTION,
  detectBreachedLanes,
  resolveSenderSuccessor,
  sanitizeForDisplay,
  pageViaLadderDigest,
  runDeadLetterAlarm,
} = require('../../../lib/coordination/lane-dead-letter-alarm.cjs');

const breach = (total, expired_unread) => ({ total, expired_unread, structurally_artifact_prone: 0, rate: expired_unread / total });
const NOT_BREACHED = breach(10, 1);

describe('detectBreachedLanes — FR-3 pure breach detection', () => {
  it('CONTROL: a lane exactly AT threshold is not flagged (strict >, boundary)', () => {
    const gauge = { lanes: { directive: breach(10, 5) } }; // rate 0.5
    expect(detectBreachedLanes(gauge, { thresholdRate: 0.5 })).toEqual([]);
  });

  it('a lane over threshold is flagged with its full stats', () => {
    const gauge = { lanes: { directive: breach(10, 6) } };
    expect(detectBreachedLanes(gauge, { thresholdRate: 0.5 })).toEqual([
      { lane: 'directive', rate: 0.6, expired_unread: 6, total: 10 },
    ]);
  });

  it('CONTROL: an empty lane (total:0) never breaches regardless of threshold (no division-by-zero artifact)', () => {
    const gauge = { lanes: { suggestion: { total: 0, expired_unread: 0, rate: 0 } } };
    expect(detectBreachedLanes(gauge, { thresholdRate: 0 })).toEqual([]);
  });

  it('multiple lanes: only the breaching ones are returned', () => {
    const gauge = { lanes: { directive: breach(10, 8), reply: NOT_BREACHED, advisory: breach(4, 3) } };
    const out = detectBreachedLanes(gauge, { thresholdRate: 0.5 });
    expect(out.map((b) => b.lane).sort()).toEqual(['advisory', 'directive']);
  });
});

describe('resolveSenderSuccessor — pages the SENDER role, never falls back to the sender itself', () => {
  it('resolves the successor for a known role', () => {
    expect(resolveSenderSuccessor('coordinator', { successors: { coordinator: 'succ-99' } })).toBe('succ-99');
  });

  it('CONTROL: an unknown/unmapped role resolves to null, NOT a silent fallback to any guess', () => {
    expect(resolveSenderSuccessor('coordinator', { successors: {} })).toBeNull();
    expect(resolveSenderSuccessor('unknown_role', { successors: { coordinator: 'succ-99' } })).toBeNull();
  });

  it('SEC-TTL-01 CONTROL: prototype-chain property names never resolve to an inherited function -- a bare `successors[role]` lookup would return Object.prototype.toString etc. (truthy), silently bypassing the "no live successor -> skip" invariant', () => {
    for (const role of ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(resolveSenderSuccessor(role, { successors: {} })).toBeNull();
    }
    // A legitimately-named key still resolves normally -- the fix is hasOwnProperty-gating,
    // not banning these strings as role names outright.
    expect(resolveSenderSuccessor('toString', { successors: { toString: 'succ-legit-1' } })).toBe('succ-legit-1');
  });

  it('SEC-TTL-01: an empty-string or non-string successor value is treated as absent, not a truthy pass-through', () => {
    expect(resolveSenderSuccessor('coordinator', { successors: { coordinator: '' } })).toBeNull();
    expect(resolveSenderSuccessor('coordinator', { successors: { coordinator: null } })).toBeNull();
  });
});

describe('sanitizeForDisplay — SEC-TTL-02 content-spoofing defense', () => {
  it('CONTROL: a hostile successor string carrying a newline and a forged "(requires invocation: ...)" clause is stripped down to safe characters, never reaching a chairman-facing row verbatim', () => {
    const hostile = "succ-1\n(requires invocation: 'rm -rf /')";
    const safe = sanitizeForDisplay(hostile);
    expect(safe).not.toContain('\n');
    expect(safe).not.toContain('(');
    expect(safe).not.toContain("'");
    expect(safe).toBe('succ-1requiresinvocationrm-rf');
  });

  it('a plain session-id-shaped string passes through unchanged', () => {
    expect(sanitizeForDisplay('succ-live-1234')).toBe('succ-live-1234');
  });

  it('caps length so an arbitrarily long hostile string cannot bloat the display', () => {
    const long = 'a'.repeat(500);
    expect(sanitizeForDisplay(long, { maxLen: 64 }).length).toBe(64);
  });

  it('an empty/fully-stripped input falls back to a safe placeholder, never an empty string', () => {
    expect(sanitizeForDisplay('\n\n\n')).toBe('(unknown)');
    expect(sanitizeForDisplay('')).toBe('(unknown)');
  });
});

describe('runDeadLetterAlarm — TS-7 two-armed observe/enforce control: a single dead code path cannot prove this', () => {
  const breachedGauge = { lanes: { directive: breach(10, 8), reply: NOT_BREACHED } };
  const successors = { coordinator: 'live-coordinator-successor-77' };

  it('ARM A (observe, the default mode): the breach is detected/logged but NO page is sent', async () => {
    const pageFn = vi.fn();
    const logger = { warn: vi.fn() };
    const out = await runDeadLetterAlarm(breachedGauge, {}, { senderRole: 'coordinator', successors, pageFn, logger });
    expect(out.mode).toBe('observe');
    expect(out.mode).toBe(DEFAULT_MODE); // the shipped default really IS observe-only
    expect(out.breaches).toHaveLength(1);
    expect(out.paged).toHaveLength(0);
    expect(pageFn).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('ARM B (enforce, explicit): the SAME breach DOES trigger a page -- proves the mode switch actually gates paging, not just logging', async () => {
    const pageFn = vi.fn().mockResolvedValue({ emitted: true });
    const out = await runDeadLetterAlarm(breachedGauge, {}, { mode: 'enforce', senderRole: 'coordinator', successors, pageFn });
    expect(out.mode).toBe('enforce');
    expect(out.paged).toHaveLength(1);
    expect(pageFn).toHaveBeenCalledTimes(1);
  });

  it('a non-breaching gauge pages nobody in EITHER mode', async () => {
    const clean = { lanes: { directive: NOT_BREACHED, reply: NOT_BREACHED } };
    const pageFn = vi.fn();
    const observeOut = await runDeadLetterAlarm(clean, {}, { senderRole: 'coordinator', successors, pageFn });
    const enforceOut = await runDeadLetterAlarm(clean, {}, { mode: 'enforce', senderRole: 'coordinator', successors, pageFn });
    expect(observeOut.breaches).toHaveLength(0);
    expect(enforceOut.breaches).toHaveLength(0);
    expect(pageFn).not.toHaveBeenCalled();
  });
});

describe('runDeadLetterAlarm — AC#3 third-identity successor resolution', () => {
  it('pages the SENDER\'s successor, which is DISTINCT from both the sender and the dead row\'s original recipient/target', async () => {
    const senderSessionId = 'sender-abc-111';
    const deadTargetSessionId = 'dead-target-xyz-222'; // the row's original recipient -- never referenced by the alarm's output
    const senderSuccessorId = 'successor-def-333'; // a genuinely distinct fourth identity
    const successors = { coordinator: senderSuccessorId };
    const pageFn = vi.fn().mockResolvedValue({ emitted: true });
    const gauge = { lanes: { directive: breach(10, 7) } };

    const out = await runDeadLetterAlarm(gauge, {}, { mode: 'enforce', senderRole: 'coordinator', successors, pageFn });

    expect(out.paged[0].successor).toBe(senderSuccessorId);
    expect(out.paged[0].successor).not.toBe(senderSessionId);
    expect(out.paged[0].successor).not.toBe(deadTargetSessionId);
    const pagedBreach = pageFn.mock.calls[0][1];
    expect(pagedBreach.successor).toBe(senderSuccessorId);
  });

  it.fails('CONTROL: a resolver that just returns the sender unchanged must FAIL this test, not pass it (vitest .fails asserts the assertion below itself fails, proving the suite genuinely discriminates rather than passing vacuously either way)', async () => {
    const senderSessionId = 'sender-abc-111';
    const successors = { coordinator: senderSessionId }; // a naive "successor" resolver: returns the sender itself
    const pageFn = vi.fn().mockResolvedValue({ emitted: true });
    const gauge = { lanes: { directive: breach(10, 7) } };
    const out = await runDeadLetterAlarm(gauge, {}, { mode: 'enforce', senderRole: 'coordinator', successors, pageFn });
    // A correct alarm must page a DIFFERENT identity than the sender. Against THIS deliberately
    // buggy map, out.paged[0].successor IS senderSessionId, so this assertion fails -- which is
    // exactly what it.fails expects. If a future edit added a hidden "never equal sender"
    // self-defense inside resolveSenderSuccessor, this assertion would start PASSING and
    // it.fails would flag the whole test as newly-unexpectedly-passing.
    expect(out.paged[0].successor).not.toBe(senderSessionId);
  });

  it('when no live successor is known, ENFORCE mode skips paging that lane rather than paging nobody-in-particular', async () => {
    const pageFn = vi.fn();
    const gauge = { lanes: { directive: breach(10, 7) } };
    const out = await runDeadLetterAlarm(gauge, {}, { mode: 'enforce', senderRole: 'coordinator', successors: {}, pageFn });
    expect(pageFn).not.toHaveBeenCalled();
    expect(out.paged).toHaveLength(0);
  });
});

describe('AC#2 — zero row-count delta on session_coordination through the REAL emitLadderDigest call chain', () => {
  it('runDeadLetterAlarm -> pageViaLadderDigest -> the REAL emitLadderDigest never touches supabase.from() at all, even in enforce mode with a genuine breach', async () => {
    const poisonSupabase = {
      from(table) {
        throw new Error(`FORBIDDEN: dead-letter alarm reached supabase.from("${table}") -- must never touch the database directly (session_coordination above all)`);
      },
    };
    const recordPending = vi.fn().mockResolvedValue({ id: 'decision-1', escalated: false });
    const escalate = vi.fn();
    const findExisting = vi.fn().mockResolvedValue(null);
    const findDismissedSignatures = vi.fn().mockResolvedValue(new Map());
    const gauge = { lanes: { directive: breach(10, 9) } };

    const out = await runDeadLetterAlarm(gauge, poisonSupabase, {
      mode: 'enforce',
      senderRole: 'coordinator',
      successors: { coordinator: 'succ-live-1' },
      pageFn: pageViaLadderDigest, // the REAL production default, not a stub
      deps: { recordPending, escalate, findExisting, findDismissedSignatures },
    });

    // Reaching this line at all is the zero-row-count-delta proof: poisonSupabase.from()
    // throws synchronously on ANY table, so a single unguarded call would have thrown out of
    // runDeadLetterAlarm's await chain, failing the test.
    expect(out.paged).toHaveLength(1);
    expect(recordPending).toHaveBeenCalledTimes(1); // the allow-listed surface WAS actually used
    expect(escalate).not.toHaveBeenCalled(); // no pre-existing digest to refresh in this fixture
  });

  it('SEC-TTL-02: a hostile successors map cannot inject content into the chairman-facing title through the REAL call chain', async () => {
    const recordPending = vi.fn().mockResolvedValue({ id: 'decision-1', escalated: false });
    const findExisting = vi.fn().mockResolvedValue(null);
    const findDismissedSignatures = vi.fn().mockResolvedValue(new Map());
    const gauge = { lanes: { directive: breach(10, 9) } };
    const hostileSuccessor = "succ-1\n(requires invocation: 'DROP EVERYTHING')";

    await runDeadLetterAlarm(gauge, {}, {
      mode: 'enforce',
      senderRole: 'coordinator',
      successors: { coordinator: hostileSuccessor },
      pageFn: pageViaLadderDigest,
      deps: { recordPending, escalate: vi.fn(), findExisting, findDismissedSignatures },
    });

    const [, callArg] = recordPending.mock.calls[0];
    expect(callArg.title).not.toContain('\n');
    expect(callArg.title).not.toContain('DROP EVERYTHING');
    expect(callArg.title).not.toMatch(/requires invocation:/);
  });

  it('TS-3 CONTROL (TESTING evidence a2448854, GAP-1): the SAME poison instrument DOES register a session_coordination touch when driven through the forbidden emitCoordinatorRung -- proving the zero-delta result above is a genuine discriminator, not a vacuous pass from an instrument that could never fail', async () => {
    const { emitCoordinatorRung } = await import('../../../lib/periodic-liveness/ladder-escalation.mjs');
    const poisonSupabase = {
      from(table) {
        throw new Error(`FORBIDDEN: reached supabase.from("${table}")`);
      },
    };
    // ownerTarget deliberately NOT coordinator-kind, so emitCoordinatorRung's early
    // "owner_already_coordinator" guard does not short-circuit before reaching the insert.
    const result = await emitCoordinatorRung(poisonSupabase, { process_key: 'x', display_name: 'x' }, { kind: 'session', resolvedPeer: 'worker' });
    // emitCoordinatorRung catches the insert failure internally (a best-effort rung, per its own
    // doc comment) rather than throwing -- so the proof is in the returned error, not an
    // exception. It reached the forbidden table; our module's real path never does.
    expect(result.emitted).toBe(false);
    expect(String(result.error && result.error.message)).toContain('session_coordination');
  });
});

describe('static guard — this module never CALLS or IMPORTS the forbidden emit function', () => {
  it('lane-dead-letter-alarm.cjs source, with comments stripped, never calls/destructures emitCoordinatorRung as code (the FORBIDDEN_EMIT_FUNCTION string constant documenting the exclusion is legitimate and must NOT trip this guard)', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'lib/coordination/lane-dead-letter-alarm.cjs'), 'utf8');
    const code = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.trim().startsWith('/*'))
      .join('\n');
    // Forbids the call form emitCoordinatorRung( and a destructure/import binding, while
    // allowing the documented string constant `'emitCoordinatorRung'` assigned to
    // FORBIDDEN_EMIT_FUNCTION -- storing the name as data is the point of that export.
    expect(code).not.toMatch(/emitCoordinatorRung\s*\(/);
    expect(code).not.toMatch(/\{[^}]*\bemitCoordinatorRung\b[^}]*\}\s*=/);
    // CONTROL: the guard itself is not vacuous -- it correctly flags a call form when present.
    const poisonedCallCode = code.replace('return emitLadderDigest(', 'emitCoordinatorRung(supabase, breach); return emitLadderDigest(');
    expect(poisonedCallCode).toMatch(/emitCoordinatorRung\s*\(/);
    // CONTROL (TESTING evidence a2448854, GAP-1 hole B): the DESTRUCTURE regex specifically is
    // exercised too -- the call-form control above only proves regex #1 is non-vacuous, leaving
    // regex #2 untested and able to silently never match if malformed.
    const poisonedDestructureCode = code.replace(
      "const { emitLadderDigest } = await import('../periodic-liveness/ladder-escalation.mjs');",
      "const { emitLadderDigest, emitCoordinatorRung } = await import('../periodic-liveness/ladder-escalation.mjs');"
    );
    expect(poisonedDestructureCode).toMatch(/\{[^}]*\bemitCoordinatorRung\b[^}]*\}\s*=/);
    expect(code).toContain('emitLadderDigest');
    expect(FORBIDDEN_EMIT_FUNCTION).toBe('emitCoordinatorRung');
  });
});
