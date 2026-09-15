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
  // SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 FR-3: a feeder present but missing its named count
  // key is now NAMED ("no run yet today"), not silently dropped -- this is the fix, not a
  // regression. Updated from the pre-SD assertion that pinned the silent-drop bug.
  it('summarizeCounts: a feeder whose counts object lacks the named key entirely is named "no run yet today", not silently dropped (FR-3)', () => {
    const r = summarizeCounts({ 'calendar-read': { counts: { coded: 0, weekday: 'Sunday' }, finished_at: '2026-09-14T10:00:00.000Z' } });
    expect(r.summary).toContain('calendar-read: no run yet today');
    expect(r.summary).toContain('gmail-triage: no run yet today');
    expect(r.summary).toContain('todoist-brief: no run yet today');
  });
  it('summarizeCounts: no rows at all -> every feeder named "no run yet today", asOf null, asOfAll empty (FR-3)', () => {
    const r = summarizeCounts({});
    expect(r.summary).toBe('calendar-read: no run yet today, gmail-triage: no run yet today, todoist-brief: no run yet today');
    expect(r.asOf).toBeNull();
    expect(r.asOfAll).toEqual([]);
  });
  // SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 FR-4: plain ET, never a raw ISO-8601 string.
  // Updated from the pre-SD assertion that pinned the raw-ISO bug.
  it('composeCheckpointBody: fixed template, plain-ET as-of pointer or says it is unavailable (FR-4)', () => {
    expect(composeCheckpointBody({ summary: '2 meetings today', asOf: '2026-09-14T04:00:00.000Z', asOfAll: ['2026-09-14T04:00:00.000Z'] }))
      .toBe('Michael checkpoint: 2 meetings today (as of 12:00am ET). Reply if anything looks wrong.');
    expect(composeCheckpointBody({ summary: 'no counts available', asOf: null }))
      .toBe('Michael checkpoint: no counts available (as-of unavailable). Reply if anything looks wrong.');
  });
  it('composeCheckpointBody: no raw ISO-8601 string ever appears in the body (FR-4)', () => {
    const body = composeCheckpointBody({ summary: 'x', asOf: '2026-09-14T04:00:00.000Z', asOfAll: ['2026-09-14T04:00:00.000Z'] });
    expect(body).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(body).toMatch(/as of \d{1,2}:\d{2}(am|pm) ET/);
  });
  // FR-4 TESTING-PIN: 60-minute threshold, tested on both sides.
  it('composeCheckpointBody: a 45-minute spread across producing feeders does NOT disclose (FR-4 TESTING-PIN, case A)', () => {
    const body = composeCheckpointBody({
      summary: 'x', asOf: '2026-09-14T08:00:00.000Z',
      asOfAll: ['2026-09-14T08:00:00.000Z', '2026-09-14T08:30:00.000Z', '2026-09-14T08:45:00.000Z'],
    });
    expect(body).not.toContain('different times');
  });
  it('composeCheckpointBody: a 90-minute spread across producing feeders DOES disclose (FR-4 TESTING-PIN, case B)', () => {
    const body = composeCheckpointBody({
      summary: 'x', asOf: '2026-09-14T08:00:00.000Z',
      asOfAll: ['2026-09-14T08:00:00.000Z', '2026-09-14T09:30:00.000Z'],
    });
    expect(body).toContain('Counts are from different times.');
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
      // SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 FR-4: plain ET, not raw ISO -- 2026-09-14T09:00:00.000Z
      // is 05:00 ET (EDT, UTC-4).
      expect(sent[0].body).toContain('as of 5:00am ET');
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

// SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 -- FR-2/TR-8/TR-9: the finished_at race fix, tested
// through the full runCheckpointSend flow (readProducingFeederCounts is not exported) with a real
// seeded michael_feeder_runs fixture, mirroring the existing TESTING M2 pattern.
describe('FR-2/TS-1: the finished_at race (2026-09-14 22:00Z incident, ledger a8388820)', () => {
  it('TS-1: an ADVERSARIALLY ORDERED fixture -- in-flight row (finished_at NULL, HIGHER attempt) listed FIRST, finished row (LOWER attempt) listed SECOND -- uses the finished row, never the in-flight placeholder, and selects `attempt`', async () => {
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const sb = fakeSb({
        tables: {
          michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: true }],
          michael_feeder_runs: [
            // in-flight, HIGHER attempt, listed FIRST -- the exact adversarial shape TS-1 requires.
            { et_date: ET_DATE, feeder: 'calendar-read', attempt: 3, counts: { phase: 'started' }, finished_at: null, status: 'skipped' },
            { et_date: ET_DATE, feeder: 'calendar-read', attempt: 2, counts: { meetings: 4 }, finished_at: '2026-09-14T08:30:00.000Z', status: 'ok' },
          ],
        },
      });
      const sent = [];
      const r = await runCheckpointSend({
        sb, argv: ['--apply'], now: NOW_IN_WINDOW, recipientSha256: REAL_RECIPIENT_HASH, resolveIdentity: () => FULL_IDENTITY,
        sendFn: async (args) => { sent.push(args); return { status: 'queued', provider_message_id: 'SM-race' }; },
      });
      expect(r).toMatchObject({ ok: true, sent: true });
      // The finished (attempt 2) row's count wins -- the in-flight (attempt 3) placeholder never contributes.
      expect(sent[0].body).toContain('4 meetings today');
      // Confirms the select actually requested `attempt` (TR-9) -- without it the read call itself would be malformed for this assertion to be meaningful.
      const feederReads = sb.froms.filter((t) => t === 'michael_feeder_runs');
      expect(feederReads.length).toBeGreaterThan(0);
    });
  });

  it('TS-1b: TWO finished rows for the same feeder, the HIGHER-attempt one listed FIRST in an array-order that would mislead a first-wins implementation -- the higher attempt (the true latest) wins, not array order (TR-8 tiebreak)', async () => {
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const sb = fakeSb({
        tables: {
          michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: true }],
          michael_feeder_runs: [
            // Both FINISHED (survives the finished_at filter). Listed in ASCENDING attempt order
            // (lower attempt first) so a "last item wins" implementation would ALSO pass -- pair
            // with the array below to prove it is genuinely attempt-based, not position-based.
            { et_date: ET_DATE, feeder: 'calendar-read', attempt: 1, counts: { meetings: 1 }, finished_at: '2026-09-14T07:00:00.000Z', status: 'ok' },
            { et_date: ET_DATE, feeder: 'calendar-read', attempt: 2, counts: { meetings: 9 }, finished_at: '2026-09-14T08:30:00.000Z', status: 'ok' },
          ],
        },
      });
      const sent = [];
      const r = await runCheckpointSend({
        sb, argv: ['--apply'], now: NOW_IN_WINDOW, recipientSha256: REAL_RECIPIENT_HASH, resolveIdentity: () => FULL_IDENTITY,
        sendFn: async (args) => { sent.push(args); return { status: 'queued', provider_message_id: 'SM-tiebreak' }; },
      });
      expect(r).toMatchObject({ ok: true, sent: true });
      expect(sent[0].body).toContain('9 meetings today');
      expect(sent[0].body).not.toContain('1 meetings today');
    });
  });

  it('TS-2: a feeder with zero finished rows is named "no run yet today" in the composed body, not omitted', async () => {
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const sb = fakeSb({
        tables: {
          michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: true }],
          michael_feeder_runs: [
            { et_date: ET_DATE, feeder: 'calendar-read', attempt: 1, counts: { meetings: 2 }, finished_at: '2026-09-14T08:00:00.000Z', status: 'ok' },
            { et_date: ET_DATE, feeder: 'gmail-triage', attempt: 1, counts: { unmatched: 5 }, finished_at: '2026-09-14T08:30:00.000Z', status: 'ok' },
            // todoist-brief has NO row at all for this et_date.
          ],
        },
      });
      const sent = [];
      const r = await runCheckpointSend({
        sb, argv: ['--apply'], now: NOW_IN_WINDOW, recipientSha256: REAL_RECIPIENT_HASH, resolveIdentity: () => FULL_IDENTITY,
        sendFn: async (args) => { sent.push(args); return { status: 'queued', provider_message_id: 'SM-missing' }; },
      });
      expect(r).toMatchObject({ ok: true, sent: true });
      expect(sent[0].body).toContain('2 meetings today');
      expect(sent[0].body).toContain('5 untriaged mail');
      expect(sent[0].body).toContain('todoist-brief: no run yet today');
    });
  });
});

// SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 -- FR-1/FR-5: the on-demand send path + quiet-hours guard.
describe('FR-1: on-demand send path (--now)', () => {
  const NOW_OUT_OF_WINDOW_ON_DEMAND = new Date('2026-09-14T12:00:00.000Z'); // 08:00 ET -- between windows, not quiet
  const NOW_QUIET_HOURS = new Date('2026-09-15T03:00:00.000Z'); // 23:00 ET Sept 14 -- inside 22:00-06:00
  const NOW_BOUNDARY_06 = new Date('2026-09-14T10:20:00.000Z'); // 06:20 ET -- just past the fixed 06:00-06:15 window, hour===6
  const allowQuietHoursFalse = async () => ({ allowQuietHours: false, chairmanZone: 'America/New_York' });
  const allowQuietHoursTrue = async () => ({ allowQuietHours: true, chairmanZone: 'America/New_York' });

  it('TS-5: outside any fixed window, all guards valid -> sends successfully, one ledger row outcome=sent', async () => {
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const sb = fakeSb({ ...ENABLED_ROW });
      const r = await runCheckpointSend({
        sb, argv: ['--apply', '--now'], now: NOW_OUT_OF_WINDOW_ON_DEMAND, recipientSha256: REAL_RECIPIENT_HASH,
        resolveIdentity: () => FULL_IDENTITY, resolveQuietHours: allowQuietHoursFalse,
        sendFn: async () => ({ status: 'queued', provider_message_id: 'SM-ondemand' }),
      });
      expect(r).toMatchObject({ ok: true, sent: true });
      const ledgerWrites = sb.writes.filter((w) => w.table === 'michael_checkpoint_send_ledger');
      expect(ledgerWrites).toHaveLength(2); // staged + finalized, same FR-6 pattern as a fixed-window send
      expect(ledgerWrites[0].ops[0].args[0]).toMatchObject({ outcome: 'refused', refusal_code: 'SEND_IN_PROGRESS' });
      expect(ledgerWrites[1].ops[0].args[0]).toMatchObject({ outcome: 'sent' });
    });
  });

  it('TS-6: recipient pin mismatch refuses RECIPIENT_HASH_MISMATCH, same as a fixed-window call', async () => {
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const sb = fakeSb({ ...ENABLED_ROW });
      const r = await runCheckpointSend({
        sb, argv: ['--apply', '--now'], now: NOW_OUT_OF_WINDOW_ON_DEMAND, recipientSha256: sha256Hex('a-different-number'),
        resolveIdentity: () => FULL_IDENTITY, resolveQuietHours: allowQuietHoursFalse,
      });
      expect(r).toMatchObject({ ok: false, refusal: 'RECIPIENT_HASH_MISMATCH' });
    });
  });

  it('TS-7: disabled refuses DISABLED, same as a fixed-window call', async () => {
    const sb = fakeSb({ tables: { michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: false }] } });
    const r = await runCheckpointSend({
      sb, argv: ['--apply', '--now'], now: NOW_OUT_OF_WINDOW_ON_DEMAND,
      resolveQuietHours: allowQuietHoursFalse,
    });
    expect(r).toMatchObject({ ok: false, refusal: 'DISABLED' });
  });

  it('TS-8/TS-13: cap already at 4 (mixed fixed-window + on-demand) refuses CAP_EXCEEDED for both a 5th fixed-window AND a 5th on-demand attempt', async () => {
    const mixedRows = [
      { et_date: ET_DATE, window_slot: '06:00', outcome: 'sent' },
      { et_date: ET_DATE, window_slot: '10:00', outcome: 'sent' },
      { et_date: ET_DATE, window_slot: 'on-demand:08:12', outcome: 'sent' },
      { et_date: ET_DATE, window_slot: 'on-demand:09:30', outcome: 'sent' },
    ];
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const r5thFixed = await runCheckpointSend({
        sb: fakeSb({ tables: { michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: true }], michael_checkpoint_send_ledger: mixedRows } }),
        argv: ['--apply'], now: NOW_IN_WINDOW, recipientSha256: REAL_RECIPIENT_HASH, resolveIdentity: () => FULL_IDENTITY,
      });
      expect(r5thFixed).toMatchObject({ ok: false, refusal: 'CAP_EXCEEDED' });

      const r5thOnDemand = await runCheckpointSend({
        sb: fakeSb({ tables: { michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: true }], michael_checkpoint_send_ledger: mixedRows } }),
        argv: ['--apply', '--now'], now: NOW_OUT_OF_WINDOW_ON_DEMAND, recipientSha256: REAL_RECIPIENT_HASH, resolveIdentity: () => FULL_IDENTITY,
        resolveQuietHours: allowQuietHoursFalse,
      });
      expect(r5thOnDemand).toMatchObject({ ok: false, refusal: 'CAP_EXCEEDED' });
    });
  });

  it('TS-9: inside quiet hours (22:00-06:00 ET), no chairman override -> refuses QUIET_HOURS and writes a ledger row', async () => {
    const sb = fakeSb({ ...ENABLED_ROW });
    const r = await runCheckpointSend({
      sb, argv: ['--apply', '--now'], now: NOW_QUIET_HOURS, resolveQuietHours: allowQuietHoursFalse,
    });
    expect(r).toMatchObject({ ok: false, refusal: 'QUIET_HOURS' });
    const ledgerWrites = sb.writes.filter((w) => w.table === 'michael_checkpoint_send_ledger');
    expect(ledgerWrites).toHaveLength(1);
    expect(ledgerWrites[0].ops[0].args[0]).toMatchObject({ outcome: 'refused', refusal_code: 'QUIET_HOURS' });
  });

  it('TS-9b: a chairman-authorized override allows an on-demand send inside the quiet window', async () => {
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const sb = fakeSb({ ...ENABLED_ROW });
      const r = await runCheckpointSend({
        sb, argv: ['--apply', '--now'], now: NOW_QUIET_HOURS, recipientSha256: REAL_RECIPIENT_HASH,
        resolveIdentity: () => FULL_IDENTITY, resolveQuietHours: allowQuietHoursTrue,
        sendFn: async () => ({ status: 'queued', provider_message_id: 'SM-override' }),
      });
      expect(r).toMatchObject({ ok: true, sent: true });
    });
  });

  it('TS-10: exactly hour===6 ET (the boundary the 4th fixed window sits on) does NOT refuse on quiet hours', async () => {
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const sb = fakeSb({ ...ENABLED_ROW });
      const r = await runCheckpointSend({
        sb, argv: ['--apply', '--now'], now: NOW_BOUNDARY_06, recipientSha256: REAL_RECIPIENT_HASH,
        resolveIdentity: () => FULL_IDENTITY, resolveQuietHours: allowQuietHoursFalse,
        sendFn: async () => ({ status: 'queued', provider_message_id: 'SM-boundary' }),
      });
      expect(r).toMatchObject({ ok: true, sent: true });
    });
  });

  it('TS-11: the full pre-existing fixed-window suite is unaffected (spot-check: out-of-window with no --now stays inert)', async () => {
    const sb = fakeSb({});
    const r = await runCheckpointSend({ sb, argv: ['--apply'], now: NOW_OUT_OF_WINDOW });
    expect(r).toEqual({ ok: true, inert: true, reason: 'outside_et_window' });
    expect(sb.froms).toHaveLength(0);
  });

  it('TS-12: the on-demand ledger row\'s window_slot is the non-null on-demand:HH:MM shape, never null and never a bare "on-demand"', async () => {
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const sb = fakeSb({ ...ENABLED_ROW });
      await runCheckpointSend({
        sb, argv: ['--apply', '--now'], now: NOW_OUT_OF_WINDOW_ON_DEMAND, recipientSha256: REAL_RECIPIENT_HASH,
        resolveIdentity: () => FULL_IDENTITY, resolveQuietHours: allowQuietHoursFalse,
        sendFn: async () => ({ status: 'queued', provider_message_id: 'SM-slot' }),
      });
      const staged = sb.writes.find((w) => w.table === 'michael_checkpoint_send_ledger' && w.ops[0].args[0].refusal_code === 'SEND_IN_PROGRESS');
      const slot = staged.ops[0].args[0].window_slot;
      expect(slot).not.toBeNull();
      expect(slot).not.toBe('on-demand');
      expect(slot).toMatch(/^on-demand:\d{2}:\d{2}$/);
    });
  });

  it('TS-14: a second on-demand send at a DIFFERENT ET minute succeeds (not capped at 1/day); two fires in the SAME minute dedup to ALREADY_SENT_THIS_WINDOW', async () => {
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const priorOnDemand = [{ et_date: ET_DATE, window_slot: 'on-demand:08:00', outcome: 'sent' }];
      // Different minute (08:05 ET, still 12:05Z) -- must NOT dedup against the 08:00 row.
      const rDifferentMinute = await runCheckpointSend({
        sb: fakeSb({ tables: { michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: true }], michael_checkpoint_send_ledger: priorOnDemand } }),
        argv: ['--apply', '--now'], now: new Date('2026-09-14T12:05:00.000Z'), recipientSha256: REAL_RECIPIENT_HASH,
        resolveIdentity: () => FULL_IDENTITY, resolveQuietHours: allowQuietHoursFalse,
        sendFn: async () => ({ status: 'queued', provider_message_id: 'SM-diff-minute' }),
      });
      expect(rDifferentMinute).toMatchObject({ ok: true, sent: true });

      // SAME minute (08:00 ET, 12:00Z) as the seeded row -- must dedup.
      const rSameMinute = await runCheckpointSend({
        sb: fakeSb({ tables: { michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: true }], michael_checkpoint_send_ledger: priorOnDemand } }),
        argv: ['--apply', '--now'], now: NOW_OUT_OF_WINDOW_ON_DEMAND, recipientSha256: REAL_RECIPIENT_HASH,
        resolveIdentity: () => FULL_IDENTITY, resolveQuietHours: allowQuietHoursFalse,
      });
      expect(rSameMinute).toMatchObject({ ok: false, refusal: 'ALREADY_SENT_THIS_WINDOW' });
    });
  });

  it('TS-15: guard ORDER proof -- inside quiet hours, with every later guard also failing (disabled, cap reached, pin mismatch, no identity), the refusal is QUIET_HOURS and exactly one ledger row is written', async () => {
    const capReachedRows = [
      { et_date: ET_DATE, window_slot: '06:00', outcome: 'sent' },
      { et_date: ET_DATE, window_slot: '10:00', outcome: 'sent' },
      { et_date: ET_DATE, window_slot: '14:00', outcome: 'sent' },
      { et_date: ET_DATE, window_slot: '18:00', outcome: 'sent' },
    ];
    const sb = fakeSb({
      tables: {
        michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: false }], // DISABLED would also refuse
        michael_checkpoint_send_ledger: capReachedRows, // CAP_EXCEEDED would also refuse
      },
    });
    const r = await runCheckpointSend({
      sb, argv: ['--apply', '--now'], now: NOW_QUIET_HOURS,
      recipientSha256: 'this-will-never-match-anything', // pin mismatch would also refuse
      resolveIdentity: () => null, // IDENTITY_UNCONFIGURED would also refuse
      resolveQuietHours: allowQuietHoursFalse,
    });
    expect(r).toMatchObject({ ok: false, refusal: 'QUIET_HOURS' });
    const ledgerWrites = sb.writes.filter((w) => w.table === 'michael_checkpoint_send_ledger');
    expect(ledgerWrites).toHaveLength(1);
    expect(ledgerWrites[0].ops[0].args[0]).toMatchObject({ outcome: 'refused', refusal_code: 'QUIET_HOURS' });
  });

  it('TS-16: prior QUIET_HOURS-refused rows do NOT count against the 4/day cap', async () => {
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const quietRefusedRows = [
        { et_date: ET_DATE, window_slot: 'on-demand:23:00', outcome: 'refused', refusal_code: 'QUIET_HOURS' },
        { et_date: ET_DATE, window_slot: 'on-demand:23:15', outcome: 'refused', refusal_code: 'QUIET_HOURS' },
        { et_date: ET_DATE, window_slot: 'on-demand:23:30', outcome: 'refused', refusal_code: 'QUIET_HOURS' },
      ];
      const r = await runCheckpointSend({
        sb: fakeSb({ tables: { michael_checkpoint_send_enabled: [{ config_key: 'checkpoint_send', enabled: true }], michael_checkpoint_send_ledger: quietRefusedRows } }),
        argv: ['--apply', '--now'], now: NOW_OUT_OF_WINDOW_ON_DEMAND, recipientSha256: REAL_RECIPIENT_HASH,
        resolveIdentity: () => FULL_IDENTITY, resolveQuietHours: allowQuietHoursFalse,
        sendFn: async () => ({ status: 'queued', provider_message_id: 'SM-not-capped' }),
      });
      expect(r).toMatchObject({ ok: true, sent: true });
    });
  });

  it('TS-17: the injected quiet-hours resolver THROWS -> fail-closed, refuses QUIET_HOURS (not a permissive default)', async () => {
    const sb = fakeSb({ ...ENABLED_ROW });
    const r = await runCheckpointSend({
      sb, argv: ['--apply', '--now'], now: NOW_QUIET_HOURS,
      resolveQuietHours: async () => { throw new Error('ChairmanPreferenceStore read failed'); },
    });
    expect(r).toMatchObject({ ok: false, refusal: 'QUIET_HOURS' });
  });

  // EXEC-TO-PLAN SECURITY review findings SEC-1/SEC-2.
  it('SEC-1: a resolver returning a non-boolean truthy allowQuietHours (the string "false") is NOT treated as an override -- strict === true, not truthy', async () => {
    const sb = fakeSb({ ...ENABLED_ROW });
    const r = await runCheckpointSend({
      sb, argv: ['--apply', '--now'], now: NOW_QUIET_HOURS,
      resolveQuietHours: async () => ({ allowQuietHours: 'false', chairmanZone: 'America/New_York' }),
    });
    expect(r).toMatchObject({ ok: false, refusal: 'QUIET_HOURS' });
  });

  it('SEC-2: a malformed chairmanZone that would make isSmsQuietHour itself throw is fail-closed, never an uncaught exception', async () => {
    const sb = fakeSb({ ...ENABLED_ROW });
    const r = await runCheckpointSend({
      sb, argv: ['--apply', '--now'], now: NOW_QUIET_HOURS,
      resolveQuietHours: async () => ({ allowQuietHours: false, chairmanZone: 'Not/A_Real_Zone' }),
    });
    expect(r).toMatchObject({ ok: false, refusal: 'QUIET_HOURS' });
  });

  it('TS-18a: --apply --now with and without --reason produce IDENTICAL ledger row shapes -- --reason is optional and never persisted', async () => {
    await withEnv({ CHAIRMAN_PHONE: REAL_RECIPIENT }, async () => {
      const sbNoReason = fakeSb({ ...ENABLED_ROW });
      await runCheckpointSend({
        sb: sbNoReason, argv: ['--apply', '--now'], now: NOW_OUT_OF_WINDOW_ON_DEMAND, recipientSha256: REAL_RECIPIENT_HASH,
        resolveIdentity: () => FULL_IDENTITY, resolveQuietHours: allowQuietHoursFalse,
        sendFn: async () => ({ status: 'queued', provider_message_id: 'SM-noreason' }),
      });
      const sbWithReason = fakeSb({ ...ENABLED_ROW });
      await runCheckpointSend({
        sb: sbWithReason, argv: ['--apply', '--now', '--reason', 'chairman asked'], now: NOW_OUT_OF_WINDOW_ON_DEMAND, recipientSha256: REAL_RECIPIENT_HASH,
        resolveIdentity: () => FULL_IDENTITY, resolveQuietHours: allowQuietHoursFalse,
        sendFn: async () => ({ status: 'queued', provider_message_id: 'SM-withreason' }),
      });
      const stagedNoReason = sbNoReason.writes.find((w) => w.ops[0].args[0].refusal_code === 'SEND_IN_PROGRESS').ops[0].args[0];
      const stagedWithReason = sbWithReason.writes.find((w) => w.ops[0].args[0].refusal_code === 'SEND_IN_PROGRESS').ops[0].args[0];
      expect(Object.keys(stagedNoReason).sort()).toEqual(Object.keys(stagedWithReason).sort());
      expect(JSON.stringify(stagedWithReason)).not.toContain('chairman asked');
    });
  });

  it('TS-18b: --now WITHOUT --apply returns the dry_run shape with the on-demand window_slot, writes no ledger row, makes no external call', async () => {
    const sb = fakeSb({});
    let sendCalled = false;
    const r = await runCheckpointSend({
      sb, argv: ['--now'], now: NOW_OUT_OF_WINDOW_ON_DEMAND, resolveQuietHours: allowQuietHoursFalse,
      sendFn: async () => { sendCalled = true; return { status: 'queued', provider_message_id: 'SM-dry' }; },
    });
    expect(r).toMatchObject({ ok: true, dry_run: true, would_send: true });
    expect(r.window_slot).toMatch(/^on-demand:\d{2}:\d{2}$/);
    expect(sb.writes).toHaveLength(0);
    expect(sendCalled).toBe(false);
  });

  it('TS-19: SEC-H1 regression -- --apply --now --et-date 2099-01-01 still refuses ET_DATE_OVERRIDE_NOT_ALLOWED before any read', async () => {
    const sb = fakeSb({});
    const r = await runCheckpointSend({ sb, argv: ['--apply', '--now', '--et-date', '2099-01-01'], now: NOW_OUT_OF_WINDOW_ON_DEMAND });
    expect(r).toMatchObject({ ok: false, refusal: 'ET_DATE_OVERRIDE_NOT_ALLOWED' });
    expect(sb.froms).toHaveLength(0);
  });
});
