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

  // QF-20260710-560: an over-cap consult body used to be silently sliced to BODY_HARD_CAP,
  // which is exactly how Solomon's FW-3 advisory tail was clipped without any signal — now
  // it hard-errors instead so the caller must split the message.
  it('rejects a body over BODY_HARD_CAP after redaction instead of silently slicing it', () => {
    const big = 'a'.repeat(ws.BODY_HARD_CAP + 500);
    expect(() => ws.buildSolomonConsultPayload({ correlationId: 'c1', body: big })).toThrow(/exceeds 4096-char hard cap/);
  });

  it('accepts a body exactly at BODY_HARD_CAP', () => {
    const atCap = 'a'.repeat(ws.BODY_HARD_CAP);
    const p = ws.buildSolomonConsultPayload({ correlationId: 'c1', body: atCap });
    expect(p.body.length).toBe(ws.BODY_HARD_CAP);
  });
});

describe('Phase D — BYTE-IDENTICAL flag-off inertness (subprocess)', () => {
  it('flag OFF: prints the dormant message, exits 0, and never touches the DB (no SUPABASE env needed)', () => {
    // Deliberately run WITHOUT SUPABASE creds: if the flag-gate did not short-circuit first,
    // the command would proceed to createClient and behave differently. Exiting 0 with the
    // dormant message and no supabase env proves the branch is inert before any DB access.
    const env = { ...process.env };
    // Strip DB creds via string-keyed deletes. NOTE: the names are STRING LITERALS (not
    // code identifiers) so the db-test-guards static heuristic (DB_IMPORT_SIGNAL) does not
    // misclassify this pure unit test as DB-touching — the flag-off branch provably never
    // reaches a supabase client.
    for (const k of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
      delete env[k];
    }
    // Explicitly OFF (not deleted): the subprocess's own dotenv.config() re-reads .env from
    // disk, which now defaults SOLOMON_CONSULT_V1=on (SD-LEO-INFRA-SOLOMON-CONSULT-001D went
    // live) and would re-fill a merely-deleted key. dotenv.config() never overwrites an
    // ALREADY-SET process.env var, so setting 'off' here survives the subprocess's own load.
    env.SOLOMON_CONSULT_V1 = 'off';
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

/**
 * SD-LEO-INFRA-SOLOMON-CONSULT-CANNOT-DELIVER-001 FR-2 — the consult_purpose discriminator, pinned
 * against the REAL builder.
 *
 * Why this block exists: the lane test (tests/unit/adam/presend-consult-lane.test.js) asserts the
 * discriminator against a hand-written FAKE builder that performs the consultPurpose→consult_purpose
 * mapping itself, so it proves the fake, not the shipped code. The real mapping at
 * worker-signal.cjs had ZERO coverage. That is a silent-forever failure mode: reconcileLateVerdicts
 * SELECTS on payload->>consult_purpose, and the cron deliberately treats reconciled=0 as a healthy
 * exit 0 — so if this key stopped being emitted, the reconciler would match nothing and every signal
 * would still read green. That is the exact shape of the original defect this SD fixes.
 */
describe('FR-2 — consult_purpose emitted by the REAL buildSolomonConsultPayload', () => {
  const base = { correlationId: 'corr-1', body: 'packet', senderCallsign: 'Bravo' };

  it('maps consultPurpose → payload.consult_purpose', () => {
    const p = ws.buildSolomonConsultPayload({ ...base, consultPurpose: 'pre_send' });
    expect(p.consult_purpose).toBe('pre_send');
    // The reconciler's candidate query pairs this with kind, so both must be right together.
    expect(p.kind).toBe(PAYLOAD_KINDS.SOLOMON_CONSULT);
  });

  it('OMITS the key entirely when no purpose is supplied (byte-identical for existing callers)', () => {
    const p = ws.buildSolomonConsultPayload(base);
    expect('consult_purpose' in p).toBe(false);
  });

  it('a pre_send payload satisfies the reconciler predicate; a plain consult does not', () => {
    // Encodes the actual coupling rather than restating the assignment: matches
    // .eq(kind).eq(consult_purpose,'pre_send') in lib/coordinator/reply-class.cjs.
    const matches = (p) => p.kind === PAYLOAD_KINDS.SOLOMON_CONSULT && p.consult_purpose === 'pre_send';
    expect(matches(ws.buildSolomonConsultPayload({ ...base, consultPurpose: 'pre_send' }))).toBe(true);
    expect(matches(ws.buildSolomonConsultPayload(base))).toBe(false);
  });
});
