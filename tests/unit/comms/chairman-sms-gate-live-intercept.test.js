import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sendChairmanSMS } from '../../../lib/comms/adam-outbound/chairman-sms-gate/index.js';
import { escalateChairmanDecision } from '../../../lib/chairman/record-pending-decision.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// A rubric evaluate() stub — pass/blocked/throw, injectable via opts.evaluate.
const passEval = async () => ({ verdict: 'pass', effectiveType: 'decision', authorityClass: 'sms', blockedReasons: [] });
const blockEval = async () => ({ verdict: 'blocked', effectiveType: 'decision', authorityClass: 'sms', blockedReasons: ['bad_format'] });
const throwEval = async () => { throw new Error('rubric down'); };

describe('chairman-SMS gate — fail-closed guarantee (acceptance b / TS-1, TS-3)', () => {
  it('HOLDS a rubric-FAILING decision — no send (fail-closed)', async () => {
    const sender = { send: vi.fn().mockResolvedValue({ sid: 'x' }) };
    const r = await sendChairmanSMS({ type: 'decision', body: 'unformatted' }, {}, { evaluate: blockEval, sender });
    expect(r.sent).toBe(false);
    expect(r.held).toBe(true);
    expect(sender.send).not.toHaveBeenCalled(); // never reached the sender
  });
  it('HOLDS a decision when the rubric THROWS (fail-closed, NOT fail-open)', async () => {
    const sender = { send: vi.fn().mockResolvedValue({ sid: 'x' }) };
    const r = await sendChairmanSMS({ type: 'decision', body: 'x' }, {}, { evaluate: throwEval, sender });
    expect(r.held).toBe(true);
    expect(r.reason).toBe('gate_unavailable');
    expect(sender.send).not.toHaveBeenCalled();
  });
  it('SENDS a rubric-PASS decision via the injected sender', async () => {
    const sender = { send: vi.fn().mockResolvedValue({ sid: 'obl-1' }) };
    const r = await sendChairmanSMS({ type: 'decision', body: 'ok' }, {}, { evaluate: passEval, sender });
    expect(r.sent).toBe(true);
    expect(sender.send).toHaveBeenCalledOnce();
  });
});

describe('makeDefaultSender delegation (FR-2) — durable path, fail-soft, no Twilio', async () => {
  // Read the gate source to prove makeDefaultSender delegates to enqueueChairmanSms (the -B durable
  // path) and does NOT construct a Twilio client — the two-stack hazard guard.
  const gateSrc = readFileSync(resolve(__dirname, '../../../lib/comms/adam-outbound/chairman-sms-gate/index.js'), 'utf8');
  it('delegates to enqueueChairmanSms and never references a Twilio client', () => {
    expect(gateSrc).toMatch(/enqueueChairmanSms/);
    expect(gateSrc).not.toMatch(/new\s+twilio|require\(['"]twilio|from ['"]twilio/i);
  });
  it('a rubric-PASS with no recipient phone fails SOFT (no throw) and reports sent:false honestly', async () => {
    // No opts.sender -> makeDefaultSender is used; no recipient -> early soft-fail (no durable import).
    // QF-20260719-509 LIVE INCIDENT (2026-07-19): this test previously asserted sent:true on a
    // soft-failed transport, claiming "email is the guaranteed fallback" — proven false in
    // production (no email ever fired). The gate must not throw AND must not lie about delivery.
    const prev = process.env.CHAIRMAN_PHONE;
    delete process.env.CHAIRMAN_PHONE;
    const fallbackSend = vi.fn(async () => ({ fired: true }));
    const r = await sendChairmanSMS({ type: 'decision', body: 'ok' }, {}, { evaluate: passEval, fallbackSend });
    expect(r.sent).toBe(false); // did not throw, but honestly reports the transport drop
    expect(r.transportFailed).toBe(true);
    expect(r.reason).toBe('no_recipient_phone');
    expect(fallbackSend).toHaveBeenCalledOnce(); // the real fallback now fires instead of the phantom one
    if (prev !== undefined) process.env.CHAIRMAN_PHONE = prev;
  });
});

describe('escalateChairmanDecision — LIVE intercept wires the gate without regressing email (TS-1, TS-2)', () => {
  // Minimal chainable supabase mock: every builder method returns the builder; awaiting it resolves
  // to a low-count / CAS-won result; maybeSingle resolves the brief_data read.
  function mockSupabase() {
    const builder = {
      select: () => builder, eq: () => builder, is: () => builder, gte: () => builder, update: () => builder,
      maybeSingle: async () => ({ data: { brief_data: { question: 'Approve X?', decision_type: 'decision' } }, error: null }),
      then: (res) => res({ data: [{ id: 'd1' }], error: null }), // awaited chains (counts + CAS select)
    };
    return { from: () => builder };
  }

  it('fires the email (spawn) AND routes through the gate; a HELD gated-SMS does not block email', async () => {
    const spawn = vi.fn();
    const gatedSms = vi.fn().mockResolvedValue({ attempted: true, sent: false, held: true, reason: 'blocked' });
    const r = await escalateChairmanDecision(mockSupabase(), 'd1', { spawn, quietWindow: () => false, gatedSms });
    expect(spawn).toHaveBeenCalledWith('d1'); // email escalation still fired (no regression)
    expect(gatedSms).toHaveBeenCalledOnce();   // the gate intercept ran
    expect(r.escalated).toBe(true);
    expect(r.smsGate.held).toBe(true);         // held SMS surfaced, email unaffected
  });

  it('surfaces a sent gated-SMS in the return', async () => {
    const spawn = vi.fn();
    const gatedSms = vi.fn().mockResolvedValue({ attempted: true, sent: true, held: false });
    const r = await escalateChairmanDecision(mockSupabase(), 'd1', { spawn, quietWindow: () => false, gatedSms });
    expect(r.smsGate.sent).toBe(true);
    expect(spawn).toHaveBeenCalledOnce();
  });
});

describe('WIRE_CHECK scoping (FR-3 / TS-4)', () => {
  it('gate + rubric exempts REMOVED (now have a live caller); away-bridge stays UNWIRED for Part 2', () => {
    const gate = readFileSync(resolve(__dirname, '../../../lib/comms/adam-outbound/chairman-sms-gate/index.js'), 'utf8');
    const rubric = readFileSync(resolve(__dirname, '../../../lib/comms/adam-outbound/rubric-engine/index.js'), 'utf8');
    const liveCaller = readFileSync(resolve(__dirname, '../../../lib/chairman/record-pending-decision.mjs'), 'utf8');
    expect(gate).not.toMatch(/@wire-check-exempt/);   // now referenced by the live escalateChairmanDecision caller
    expect(rubric).not.toMatch(/@wire-check-exempt/);
    expect(liveCaller).toMatch(/adam-outbound\/chairman-sms-gate/); // the live caller reference exists
    expect(liveCaller).not.toMatch(/away-bridge/);    // Part-1 does NOT wire away-bridge (Part-2 follow-on)
  });
});
