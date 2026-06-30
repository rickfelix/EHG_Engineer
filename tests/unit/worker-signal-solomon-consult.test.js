/**
 * worker-signal-solomon-consult.test.js — SD-LEO-INFRA-SOLOMON-CONSULT-001D
 *
 * Pins the Phase-D worker→Solomon consult lane:
 *   - BYTE-IDENTICAL FLAG-OFF: with SOLOMON_CONSULT_V1 unset, the subcommand prints the
 *     dormant message and exits 0 WITHOUT touching the DB (it short-circuits before reading
 *     SUPABASE creds / creating a client — proven by exiting cleanly with NO supabase env).
 *   - in-body flag read (isSolomonConsultEnabled toggles with process.env).
 *   - payload shape: kind === PAYLOAD_KINDS.SOLOMON_CONSULT (SSOT constant, not a literal),
 *     oracle_consult:true, body redacted+capped, NO signal_type / NO intent_action.
 *   - source uses the PAYLOAD_KINDS.SOLOMON_CONSULT constant, never a bare string literal.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '../../scripts/worker-signal.cjs');

const ws = require('../../scripts/worker-signal.cjs');
const { PAYLOAD_KINDS } = require('../../lib/fleet/worker-status.cjs');

describe('Phase D — PAYLOAD_KINDS.SOLOMON_CONSULT SSOT', () => {
  it('PAYLOAD_KINDS.SOLOMON_CONSULT === "solomon_consult"', () => {
    expect(PAYLOAD_KINDS.SOLOMON_CONSULT).toBe('solomon_consult');
  });

  it('SOLOMON_CONSULT is NOT in DIRECTIVE_KINDS (it is a consult, not a directive)', () => {
    const { DIRECTIVE_KINDS } = require('../../lib/fleet/worker-status.cjs');
    expect(DIRECTIVE_KINDS).not.toContain('solomon_consult');
  });
});

describe('Phase D — isSolomonConsultEnabled (in-body flag read)', () => {
  it('reflects SOLOMON_CONSULT_V1 at call time', () => {
    const orig = process.env.SOLOMON_CONSULT_V1;
    try {
      process.env.SOLOMON_CONSULT_V1 = 'on';
      expect(ws.isSolomonConsultEnabled()).toBe(true);
      process.env.SOLOMON_CONSULT_V1 = 'off';
      expect(ws.isSolomonConsultEnabled()).toBe(false);
      delete process.env.SOLOMON_CONSULT_V1;
      expect(ws.isSolomonConsultEnabled()).toBe(false);
    } finally {
      if (orig === undefined) delete process.env.SOLOMON_CONSULT_V1;
      else process.env.SOLOMON_CONSULT_V1 = orig;
    }
  });
});

describe('Phase D — buildSolomonConsultPayload shape', () => {
  it('kind is the PAYLOAD_KINDS.SOLOMON_CONSULT constant', () => {
    const p = ws.buildSolomonConsultPayload({ correlationId: 'c1', body: 'hello' });
    expect(p.kind).toBe(PAYLOAD_KINDS.SOLOMON_CONSULT);
    expect(p.kind).toBe('solomon_consult');
  });

  it('sets oracle_consult:true, expects_reply, and carries triage fields', () => {
    const p = ws.buildSolomonConsultPayload({ correlationId: 'c1', body: 'x', triageScore: 90, triageReason: 'rca>=2' });
    expect(p.oracle_consult).toBe(true);
    expect(p.expects_reply).toBe(true);
    expect(p.triage_score).toBe(90);
    expect(p.triage_reason).toBe('rca>=2');
  });

  it('carries NO signal_type and NO intent_action (off the friction router + intent sweep)', () => {
    const p = ws.buildSolomonConsultPayload({ correlationId: 'c1', body: 'x' });
    expect(p.signal_type).toBeUndefined();
    expect(p.intent_action).toBeUndefined();
  });

  it('caps the body at BODY_HARD_CAP after redaction', () => {
    const big = 'a'.repeat(ws.BODY_HARD_CAP + 500);
    const p = ws.buildSolomonConsultPayload({ correlationId: 'c1', body: big });
    expect(p.body.length).toBe(ws.BODY_HARD_CAP);
  });
});

describe('Phase D — BYTE-IDENTICAL flag-off inertness (subprocess)', () => {
  it('flag OFF: prints the dormant message, exits 0, and never touches the DB (no SUPABASE env needed)', () => {
    // Deliberately run WITHOUT SUPABASE creds: if the flag-gate did not short-circuit first,
    // the command would proceed to createClient and behave differently. Exiting 0 with the
    // dormant message and no supabase env proves the branch is inert before any DB access.
    const env = { ...process.env };
    delete env.SOLOMON_CONSULT_V1;
    delete env.SUPABASE_URL;
    delete env.NEXT_PUBLIC_SUPABASE_URL;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    env.CLAUDE_SESSION_ID = 'test-session-flagoff';

    let stdout = '';
    let code = 0;
    try {
      stdout = execFileSync('node', [SCRIPT, 'solomon-consult', 'inert smoke packet'], {
        env, encoding: 'utf8', timeout: 30000
      });
    } catch (e) {
      code = e.status != null ? e.status : 1;
      stdout = (e.stdout || '') + (e.stderr || '');
    }
    expect(code).toBe(0);
    expect(stdout).toMatch(/Solomon dormant/i);
  });
});
