// SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001 — TS-1..TS-9, TS-11, TS-12: the checkpoint-send
// verb's own unit suite. TS-10 (partial identity) and DB-only concerns (TS-13 DDL, TS-14 seeded
// integration) live elsewhere. sendFn is injected throughout -- these tests never touch the real
// twilio-provider.js or its fetch/test-isolation guard.
import { describe, it, expect } from 'vitest';
import { runCheckpointSend, summarizeCounts, composeCheckpointBody } from './checkpoint-send.mjs';
import { sha256Hex } from '../../lib/michael/db.mjs';

const NOW_IN_WINDOW = new Date('2026-09-14T10:03:00.000Z'); // 06:03 ET (within the 06:00-06:15 window)
const NOW_OUT_OF_WINDOW = new Date('2026-09-14T12:00:00.000Z'); // 08:00 ET -- between windows
const ET_DATE = '2026-09-14';
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };
const READ_FAILED = { data: null, error: { code: 'XX000', message: 'connection reset' } };

/** Per-table configurable fake client: reads answer from `tables`/`readErrors`, writes recorded in `writes`. */
function fakeSb({ tables = {}, readErrors = {}, answerWrite = () => ({ data: { id: 'ledger-1' }, error: null }) } = {}) {
  const writes = [];
  const froms = [];
  const client = {
    writes, froms,
    from(table) {
      froms.push(table);
      const ops = [];
      let mutating = false;
      const q = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') {
            return (res, rej) => {
              if (mutating) { writes.push({ table, ops: [...ops] }); return Promise.resolve(answerWrite(table, ops)).then(res, rej); }
              if (readErrors[table]) return Promise.resolve(readErrors[table]).then(res, rej);
              const eqs = Object.fromEntries(ops.filter((o) => o.op === 'eq').map((o) => o.args));
              const rows = (tables[table] || []).filter((r) => Object.entries(eqs).every(([k, v]) => r[k] === v));
              return Promise.resolve({ data: rows, error: null }).then(res, rej);
            };
          }
          return (...args) => { if (['insert', 'update', 'upsert', 'delete'].includes(prop)) mutating = true; ops.push({ op: prop, args }); return q; };
        },
      });
      return q;
    },
  };
  return client;
}

const ENABLED_ROW = { tables: { michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: true }] } };
const REAL_RECIPIENT = 'a-test-recipient-not-the-real-number';
const REAL_RECIPIENT_HASH = sha256Hex(REAL_RECIPIENT);
const FULL_IDENTITY = { accountSid: 'AC_m', authToken: 'tok_m', messagingService: 'MG_m' };

function withEnv(vars, fn) {
  const prior = {};
  for (const k of Object.keys(vars)) { prior[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  return Promise.resolve(fn()).finally(() => { for (const k of Object.keys(prior)) { if (prior[k] === undefined) delete process.env[k]; else process.env[k] = prior[k]; } });
}

describe('pure helpers', () => {
  it('summarizeCounts: a NAMED key per feeder (TESTING L4 -- never "the first numeric key", which is JSONB-key-order-dependent and production-unstable), never raw text; as-of is the OLDEST (most conservative) finished_at', () => {
    const r = summarizeCounts({
      'calendar-read': { counts: { meetings: 3, coded: 0 }, finished_at: '2026-09-14T10:00:00.000Z' },
      'gmail-triage': { counts: { threads_seen: 9, unmatched: 5, ignored: 'text-should-never-appear' }, finished_at: '2026-09-14T04:35:00.000Z' },
    });
    expect(r.summary).toContain('3 meetings today');
    expect(r.summary).toContain('5 untriaged mail');
    expect(r.summary).not.toContain('text-should-never-appear');
    expect(r.summary).not.toContain('9'); // threads_seen is NOT the named key for gmail-triage -- confirms explicit key selection, not "any number present"
    expect(r.asOf).toBe('2026-09-14T04:35:00.000Z');
  });
  it('summarizeCounts: a feeder whose counts object lacks the named key entirely contributes nothing (not a wrong number)', () => {
    const r = summarizeCounts({ 'calendar-read': { counts: { coded: 0, weekday: 'Sunday' }, finished_at: '2026-09-14T10:00:00.000Z' } });
    expect(r.summary).toBe('no counts available');
  });
  it('summarizeCounts: no rows at all -> honest "no counts available", asOf null', () => {
    expect(summarizeCounts({})).toEqual({ summary: 'no counts available', asOf: null });
  });
  it('composeCheckpointBody: fixed template, includes the as-of pointer or says it is unavailable', () => {
    expect(composeCheckpointBody({ summary: '2 meetings today', asOf: '2026-09-14T04:00:00.000Z' }))
      .toBe('Michael checkpoint: 2 meetings today (as of 2026-09-14T04:00:00.000Z). Reply if anything looks wrong.');
    expect(composeCheckpointBody({ summary: 'no counts available', asOf: null }))
      .toBe('Michael checkpoint: no counts available (as-of unavailable). Reply if anything looks wrong.');
  });
});

describe('window gate (FR-6/M6)', () => {
  it('out-of-window: inert, no ledger row, no external call, even with --apply', async () => {
    let sendCalled = false;
    const sb = fakeSb({ ...ENABLED_ROW });
    const r = await runCheckpointSend({ sb, argv: ['--apply'], now: NOW_OUT_OF_WINDOW, sendFn: async () => { sendCalled = true; return { status: 'queued' }; } });
    expect(r).toEqual({ ok: true, inert: true, reason: 'outside_et_window' });
    expect(sb.writes).toHaveLength(0);
    expect(sendCalled).toBe(false);
  });
});

describe('TS-1: dry-run', () => {
  it('in-window, no --apply: dry_run true, no writes, no external call', async () => {
    let sendCalled = false;
    const sb = fakeSb({ ...ENABLED_ROW });
    const r = await runCheckpointSend({ sb, argv: [], now: NOW_IN_WINDOW, sendFn: async () => { sendCalled = true; return { status: 'queued' }; } });
    expect(r).toMatchObject({ ok: true, dry_run: true, et_date: ET_DATE, window_slot: '06:00', would_send: true });
    expect(sb.writes).toHaveLength(0);
    expect(sendCalled).toBe(false);
  });
});

describe('TS-3/TS-4: FR-1 fail-closed on BOTH ledger-read branches (TESTING H1... er H2/M-fix for V-3)', () => {
  it('TABLES_ABSENT on the ledger read refuses TABLES_ABSENT, never treated as 0-sent-today', async () => {
    const sb = fakeSb({ tables: { michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: true }] }, readErrors: { michael_checkpoint_send_ledger: MISSING } });
    const r = await runCheckpointSend({ sb, argv: ['--apply'], now: NOW_IN_WINDOW });
    expect(r).toMatchObject({ ok: false, refusal: 'TABLES_ABSENT' });
  });
  it('a generic read error refuses READ_FAILED, never treated as 0-sent-today', async () => {
    const sb = fakeSb({ tables: { michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: true }] }, readErrors: { michael_checkpoint_send_ledger: READ_FAILED } });
    const r = await runCheckpointSend({ sb, argv: ['--apply'], now: NOW_IN_WINDOW });
    expect(r).toMatchObject({ ok: false, refusal: 'READ_FAILED' });
  });
});

describe('TS-2: cap enforcement', () => {
  it('4 already-sent rows today: the 5th (any window) is refused CAP_EXCEEDED, ledger row written, no external call', async () => {
    let sendCalled = false;
    const sentRows = ['06:00', '10:00', '14:00', '18:00'].map((w) => ({ et_date: ET_DATE, window_slot: w, outcome: 'sent' }));
    const sb = fakeSb({ tables: { michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: true }], michael_checkpoint_send_ledger: sentRows } });
    const r = await runCheckpointSend({ sb, argv: ['--apply'], now: NOW_IN_WINDOW, sendFn: async () => { sendCalled = true; return { status: 'queued' }; } });
    expect(r).toMatchObject({ ok: false, refusal: 'CAP_EXCEEDED' });
    expect(sendCalled).toBe(false);
    const ledgerWrite = sb.writes.find((w) => w.table === 'michael_checkpoint_send_ledger');
    expect(ledgerWrite.ops[0].args[0]).toMatchObject({ et_date: ET_DATE, window_slot: '06:00', outcome: 'refused', refusal_code: 'CAP_EXCEEDED' });
  });
});

describe('TS-8: per-slot dedup (FR-7 app-level)', () => {
  it('this exact window already sent today: refused ALREADY_SENT_THIS_WINDOW even though under the cap', async () => {
    const sb = fakeSb({ tables: { michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: true }], michael_checkpoint_send_ledger: [{ et_date: ET_DATE, window_slot: '06:00', outcome: 'sent' }] } });
    const r = await runCheckpointSend({ sb, argv: ['--apply'], now: NOW_IN_WINDOW });
    expect(r).toMatchObject({ ok: false, refusal: 'ALREADY_SENT_THIS_WINDOW' });
  });
});

describe('TS-5/TS-6: FR-5 enable/disable, fail-closed', () => {
  it('disabled row: held, ledger row written, no external call; distinct from a refusal', async () => {
    let sendCalled = false;
    const sb = fakeSb({ tables: { michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: false }] } });
    const r = await runCheckpointSend({ sb, argv: ['--apply'], now: NOW_IN_WINDOW, sendFn: async () => { sendCalled = true; return { status: 'queued' }; } });
    expect(r).toMatchObject({ ok: false, refusal: 'DISABLED' });
    expect(sendCalled).toBe(false);
    expect(sb.writes[0].ops[0].args[0]).toMatchObject({ outcome: 'held', refusal_code: 'DISABLED' });
  });
  it('enable-row read fails: treated as disabled (held), fail-closed', async () => {
    const sb = fakeSb({ readErrors: { michael_checkpoint_send_enabled: READ_FAILED } });
    const r = await runCheckpointSend({ sb, argv: ['--apply'], now: NOW_IN_WINDOW });
    expect(r).toMatchObject({ ok: false, refusal: 'READ_FAILED' });
    expect(sb.writes[0].ops[0].args[0].outcome).toBe('held');
  });
  it('missing enable row (table exists, zero rows): treated as disabled', async () => {
    const sb = fakeSb({ tables: { michael_checkpoint_send_enabled: [] } });
    const r = await runCheckpointSend({ sb, argv: ['--apply'], now: NOW_IN_WINDOW });
    expect(r).toMatchObject({ ok: false, refusal: 'DISABLED' });
  });
});

describe('TS-7: FR-2 recipient hash-pin (raw string, tamper-evidence)', () => {
  it('unset CHAIRMAN_PHONE refuses RECIPIENT_HASH_MISMATCH', async () => {
    await withEnv({ CHAIRMAN_PHONE: undefined }, async () => {
      const sb = fakeSb({ ...ENABLED_ROW });
      const r = await runCheckpointSend({ sb, argv: ['--apply'], now: NOW_IN_WINDOW });
      expect(r).toMatchObject({ ok: false, refusal: 'RECIPIENT_HASH_MISMATCH' });
    });
  });
  it('a CHAIRMAN_PHONE whose hash does not match the DB-read pin refuses (proves the pin is live, not a no-op)', async () => {
    await withEnv({ CHAIRMAN_PHONE: 'some-other-number' }, async () => {
      const sb = fakeSb({ tables: { michael_checkpoint_send_enabled: [
        { config_key: 'checkpoint_send', enabled: true },
        { config_key: 'recipient_pin', reason: sha256Hex('a-different-real-number') },
      ] } });
      const r = await runCheckpointSend({ sb, argv: ['--apply'], now: NOW_IN_WINDOW });
      expect(r).toMatchObject({ ok: false, refusal: 'RECIPIENT_HASH_MISMATCH' });
    });
  });
  it('QF-20260914-300: a missing recipient_pin row (table exists, zero rows for that key) fails closed exactly like a mismatch', async () => {
    await withEnv({ CHAIRMAN_PHONE: '+15551234567' }, async () => {
      const sb = fakeSb({ ...ENABLED_ROW });
      const r = await runCheckpointSend({ sb, argv: ['--apply'], now: NOW_IN_WINDOW });
      expect(r).toMatchObject({ ok: false, refusal: 'RECIPIENT_HASH_MISMATCH' });
    });
  });
  it('QF-20260914-300: a correct recipient_pin row read fresh from the DB resolves the recipient and proceeds past the hash check', async () => {
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const sb = fakeSb({ tables: { michael_checkpoint_send_enabled: [
        { config_key: 'checkpoint_send', enabled: true },
        { config_key: 'recipient_pin', reason: REAL_RECIPIENT_HASH },
      ] } });
      const r = await runCheckpointSend({ sb, argv: ['--apply'], now: NOW_IN_WINDOW, resolveIdentity: () => null });
      // Proceeds past FR-2 to the next fail-closed check (FR-3 identity), never RECIPIENT_HASH_MISMATCH.
      expect(r).toMatchObject({ ok: false, refusal: 'IDENTITY_UNCONFIGURED' });
    });
  });
});

describe('TS-9: successful send + FR-3 identity + FR-6 stage-then-finalize ledger (recipientSha256 injected to exercise the send path -- production always reads the live pin row, see the describe block above)', () => {
  it('a matching recipient hash and a real identity sends and finalizes outcome=sent, never storing the raw body', async () => {
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const sb = fakeSb({ ...ENABLED_ROW });
      const sent = [];
      const r = await runCheckpointSend({
        sb, argv: ['--apply'], now: NOW_IN_WINDOW,
        recipientSha256: REAL_RECIPIENT_HASH,
        resolveIdentity: () => FULL_IDENTITY,
        sendFn: async (args) => { sent.push(args); return { status: 'queued', provider_message_id: 'SM123' }; },
      });
      expect(r).toMatchObject({ ok: true, sent: true, provider_message_id: 'SM123' });
      expect(sent).toEqual([{ to: REAL_RECIPIENT, body: expect.stringContaining('Michael checkpoint:'), identity: FULL_IDENTITY }]);
      // FR-6: staged BEFORE the call (insert), then finalized (update) -- two writes, not one.
      const ledgerWrites = sb.writes.filter((w) => w.table === 'michael_checkpoint_send_ledger');
      expect(ledgerWrites).toHaveLength(2);
      expect(ledgerWrites[0].ops[0].op).toBe('insert');
      expect(ledgerWrites[0].ops[0].args[0]).toMatchObject({ et_date: ET_DATE, window_slot: '06:00', outcome: 'refused', refusal_code: 'SEND_IN_PROGRESS' });
      expect(ledgerWrites[1].ops[0].op).toBe('update');
      expect(ledgerWrites[1].ops[0].args[0]).toMatchObject({ outcome: 'sent', refusal_code: null, provider_message_id: 'SM123' });
      // SEC-M3 (mirrors todoist-act.mjs redactCall): never the raw body, only hash+length.
      expect(JSON.stringify(ledgerWrites[1].ops[0].args[0])).not.toContain('Reply if anything looks wrong');
      expect(ledgerWrites[1].ops[0].args[0].body_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof ledgerWrites[1].ops[0].args[0].body_len).toBe('number');
    });
  });

  it('TESTING M2: the composed body reflects a REAL seeded michael_feeder_runs row (pins the table/column names, not just the pure-helper tier)', async () => {
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const sb = fakeSb({
        tables: {
          michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: true }],
          michael_feeder_runs: [{ et_date: ET_DATE, feeder: 'calendar-read', attempt: 1, counts: { meetings: 2 }, finished_at: '2026-09-14T09:00:00.000Z', status: 'ok' }],
        },
      });
      const sent = [];
      const r = await runCheckpointSend({
        sb, argv: ['--apply'], now: NOW_IN_WINDOW, recipientSha256: REAL_RECIPIENT_HASH, resolveIdentity: () => FULL_IDENTITY,
        sendFn: async (args) => { sent.push(args); return { status: 'queued', provider_message_id: 'SM999' }; },
      });
      expect(r).toMatchObject({ ok: true, sent: true });
      expect(sent[0].body).toContain('2 meetings today');
      expect(sent[0].body).toContain('as of 2026-09-14T09:00:00.000Z');
    });
  });

  it('a failed provider send finalizes outcome=refused with the provider reason, ledger row still redacted', async () => {
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const sb = fakeSb({ ...ENABLED_ROW });
      const r = await runCheckpointSend({
        sb, argv: ['--apply'], now: NOW_IN_WINDOW,
        recipientSha256: REAL_RECIPIENT_HASH,
        resolveIdentity: () => FULL_IDENTITY,
        sendFn: async () => ({ status: 'failed', reason: 'twilio_not_configured' }),
      });
      expect(r).toMatchObject({ ok: false, refusal: 'twilio_not_configured' });
      const ledgerWrites = sb.writes.filter((w) => w.table === 'michael_checkpoint_send_ledger');
      expect(ledgerWrites[1].ops[0].args[0]).toMatchObject({ outcome: 'refused', refusal_code: 'twilio_not_configured' });
    });
  });

  it('FR-3: no identity configured refuses IDENTITY_UNCONFIGURED before the send call', async () => {
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const sb = fakeSb({ ...ENABLED_ROW });
      let sendCalled = false;
      const r = await runCheckpointSend({
        sb, argv: ['--apply'], now: NOW_IN_WINDOW,
        recipientSha256: REAL_RECIPIENT_HASH,
        resolveIdentity: () => null,
        sendFn: async () => { sendCalled = true; return { status: 'queued' }; },
      });
      expect(r).toMatchObject({ ok: false, refusal: 'IDENTITY_UNCONFIGURED' });
      expect(sendCalled).toBe(false);
    });
  });
});

describe('TESTING M9: raw-string hashing, not normalized', () => {
  it('a value differing only by surrounding whitespace does not match the pin', () => {
    const pinned = sha256Hex(REAL_RECIPIENT);
    expect(sha256Hex(`${REAL_RECIPIENT} `)).not.toBe(pinned);
    expect(sha256Hex(` ${REAL_RECIPIENT}`)).not.toBe(pinned);
  });
});

describe('argument handling', () => {
  it('SEC-H1: --et-date under --apply is refused ET_DATE_OVERRIDE_NOT_ALLOWED, even a well-formed date, before any read', async () => {
    const sb = fakeSb();
    const r = await runCheckpointSend({ sb, argv: ['--apply', '--et-date', '2099-01-01'], now: NOW_IN_WINDOW });
    expect(r).toMatchObject({ ok: false, refusal: 'ET_DATE_OVERRIDE_NOT_ALLOWED' });
    expect(sb.froms).toHaveLength(0);
  });
  it('SEC-H1: a MALFORMED --et-date under --apply is ALSO refused ET_DATE_OVERRIDE_NOT_ALLOWED (presence is the problem, not just validity)', async () => {
    const sb = fakeSb();
    const r = await runCheckpointSend({ sb, argv: ['--apply', '--et-date', 'not-a-date'], now: NOW_IN_WINDOW });
    expect(r).toMatchObject({ ok: false, refusal: 'ET_DATE_OVERRIDE_NOT_ALLOWED' });
    expect(sb.froms).toHaveLength(0);
  });
  it('--et-date is still usable WITHOUT --apply (dry-run only) and a malformed one is DATE_INVALID', async () => {
    const sb = fakeSb({ ...ENABLED_ROW });
    const ok = await runCheckpointSend({ sb, argv: ['--et-date', '2026-09-14'], now: NOW_IN_WINDOW });
    expect(ok).toMatchObject({ ok: true, dry_run: true, et_date: '2026-09-14' });
    const bad = await runCheckpointSend({ sb, argv: ['--et-date', 'nope'], now: NOW_IN_WINDOW });
    expect(bad).toMatchObject({ ok: false, refusal: 'DATE_INVALID' });
  });
});

describe('SEC-H2: an unresolved SEND_IN_PROGRESS row counts against the cap and per-slot dedup', () => {
  it('4 already-staged-but-unresolved rows (never finalized) trip CAP_EXCEEDED exactly like 4 confirmed sends', async () => {
    const inProgressRows = ['06:00', '10:00', '14:00', '18:00'].map((w) => ({ et_date: ET_DATE, window_slot: w, outcome: 'refused', refusal_code: 'SEND_IN_PROGRESS' }));
    const sb = fakeSb({ tables: { michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: true }], michael_checkpoint_send_ledger: inProgressRows } });
    const r = await runCheckpointSend({ sb, argv: ['--apply'], now: NOW_IN_WINDOW });
    expect(r).toMatchObject({ ok: false, refusal: 'CAP_EXCEEDED' });
  });
  it('an in-progress row for THIS exact window is ALREADY_SENT_THIS_WINDOW even though outcome is not yet "sent"', async () => {
    const sb = fakeSb({ tables: { michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: true }], michael_checkpoint_send_ledger: [{ et_date: ET_DATE, window_slot: '06:00', outcome: 'refused', refusal_code: 'SEND_IN_PROGRESS' }] } });
    const r = await runCheckpointSend({ sb, argv: ['--apply'], now: NOW_IN_WINDOW });
    expect(r).toMatchObject({ ok: false, refusal: 'ALREADY_SENT_THIS_WINDOW' });
  });
  it('a genuinely refused (not in-progress) row does NOT count against the cap -- only sent/SEND_IN_PROGRESS do', async () => {
    const refusedRows = ['06:00', '10:00', '14:00'].map((w) => ({ et_date: ET_DATE, window_slot: w, outcome: 'refused', refusal_code: 'CAP_EXCEEDED' }));
    const sb = fakeSb({ tables: { michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: true }], michael_checkpoint_send_ledger: refusedRows } });
    let sendCalled = false;
    const r = await runCheckpointSend({
      sb, argv: ['--apply'], now: NOW_IN_WINDOW, recipientSha256: REAL_RECIPIENT_HASH, resolveIdentity: () => FULL_IDENTITY,
      sendFn: async () => { sendCalled = true; return { status: 'queued', provider_message_id: 'SM1' }; },
    });
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const r2 = await runCheckpointSend({
        sb: fakeSb({ tables: { michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: true }], michael_checkpoint_send_ledger: refusedRows } }),
        argv: ['--apply'], now: NOW_IN_WINDOW, recipientSha256: REAL_RECIPIENT_HASH, resolveIdentity: () => FULL_IDENTITY,
        sendFn: async () => ({ status: 'queued', provider_message_id: 'SM1' }),
      });
      expect(r2).toMatchObject({ ok: true, sent: true });
    });
  });
});

describe('SEC-M1: provider error reasons are sanitized before touching the ledger or stdout', () => {
  it('a raw Twilio-style free-text reason (which could embed the recipient number) is replaced with PROVIDER_ERROR', async () => {
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const sb = fakeSb({ ...ENABLED_ROW });
      const r = await runCheckpointSend({
        sb, argv: ['--apply'], now: NOW_IN_WINDOW, recipientSha256: REAL_RECIPIENT_HASH, resolveIdentity: () => FULL_IDENTITY,
        sendFn: async () => ({ status: 'failed', reason: "The 'To' number +15551234567 is not a valid phone number." }),
      });
      expect(r).toMatchObject({ ok: false, refusal: 'PROVIDER_ERROR' });
      const ledgerWrites = sb.writes.filter((w) => w.table === 'michael_checkpoint_send_ledger');
      const finalRow = ledgerWrites[ledgerWrites.length - 1].ops[0].args[0];
      expect(finalRow.refusal_code).toBe('PROVIDER_ERROR');
      expect(JSON.stringify(finalRow)).not.toContain('+15551234567');
    });
  });
  it('known coded reasons (twilio_not_configured, http_NNN) pass through as-is', async () => {
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      for (const reason of ['twilio_not_configured', 'http_500', 'test_env_guard']) {
        const sb = fakeSb({ ...ENABLED_ROW });
        const r = await runCheckpointSend({
          sb, argv: ['--apply'], now: NOW_IN_WINDOW, recipientSha256: REAL_RECIPIENT_HASH, resolveIdentity: () => FULL_IDENTITY,
          sendFn: async () => ({ status: 'failed', reason }),
        });
        expect(r).toMatchObject({ ok: false, refusal: reason });
      }
    });
  });
});

describe('SEC-M2: a throwing sendFn is caught, never escapes, and finalizes the staged row as SEND_THREW', () => {
  it('a network-level rejection from sendFn is caught and refused SEND_THREW, not an uncaught throw', async () => {
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const sb = fakeSb({ ...ENABLED_ROW });
      const r = await runCheckpointSend({
        sb, argv: ['--apply'], now: NOW_IN_WINDOW, recipientSha256: REAL_RECIPIENT_HASH, resolveIdentity: () => FULL_IDENTITY,
        sendFn: async () => { throw new Error('ECONNRESET'); },
      });
      expect(r).toMatchObject({ ok: false, refusal: 'SEND_THREW' });
      const ledgerWrites = sb.writes.filter((w) => w.table === 'michael_checkpoint_send_ledger');
      expect(ledgerWrites[ledgerWrites.length - 1].ops[0].args[0]).toMatchObject({ outcome: 'refused', refusal_code: 'SEND_THREW' });
    });
  });
});
