/**
 * Unit tests for lib/governance/hold-state-contract.js.
 * SD-LEO-INFRA-HOLD-STATE-CONTRACT-001 — covers TS-1, TS-2, TS-6 (pure portions).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  readHoldStateMode,
  validateHoldStamp,
  checkHoldStamp,
  buildProvenancedStamp,
  logHoldStateViolation,
} from '../../../lib/governance/hold-state-contract.js';

const VALID_STAMP = {
  reason: 'coordinating sibling child B',
  owner: 'coordinator',
  review_at: '2026-08-01T00:00:00Z',
  release_condition: 'sibling child B reaches EXEC',
};

describe('readHoldStateMode', () => {
  const ORIGINAL = process.env.HOLD_STATE_CONTRACT_MODE;
  afterEach(() => { process.env.HOLD_STATE_CONTRACT_MODE = ORIGINAL; });

  it('defaults to observe when unset', () => {
    delete process.env.HOLD_STATE_CONTRACT_MODE;
    expect(readHoldStateMode()).toBe('observe');
  });

  it('defaults to observe on an unrecognized value (fail-open toward observe, never enforce)', () => {
    process.env.HOLD_STATE_CONTRACT_MODE = 'typo-value';
    expect(readHoldStateMode()).toBe('observe');
  });

  it('resolves to enforce only on the exact string "enforce"', () => {
    process.env.HOLD_STATE_CONTRACT_MODE = 'enforce';
    expect(readHoldStateMode()).toBe('enforce');
  });

  it('is case-insensitive for enforce', () => {
    process.env.HOLD_STATE_CONTRACT_MODE = 'ENFORCE';
    expect(readHoldStateMode()).toBe('enforce');
  });
});

describe('validateHoldStamp', () => {
  it('passes a fully-populated stamp', () => {
    expect(validateHoldStamp(VALID_STAMP)).toEqual({ valid: true, errors: [] });
  });

  it('flags a missing reason', () => {
    const { valid, errors } = validateHoldStamp({ ...VALID_STAMP, reason: '' });
    expect(valid).toBe(false);
    expect(errors).toContain('reason is required');
  });

  it('flags a missing owner', () => {
    const { valid, errors } = validateHoldStamp({ ...VALID_STAMP, owner: undefined });
    expect(valid).toBe(false);
    expect(errors).toContain('owner is required');
  });

  it('flags a missing review_at', () => {
    const { valid, errors } = validateHoldStamp({ ...VALID_STAMP, review_at: null });
    expect(valid).toBe(false);
    expect(errors).toContain('review_at is required');
  });

  it('flags an unparseable review_at', () => {
    const { valid, errors } = validateHoldStamp({ ...VALID_STAMP, review_at: 'not-a-date' });
    expect(valid).toBe(false);
    expect(errors).toContain('review_at must be a parseable timestamp');
  });

  it('flags a missing release_condition', () => {
    const { valid, errors } = validateHoldStamp({ ...VALID_STAMP, release_condition: '   ' });
    expect(valid).toBe(false);
    expect(errors).toContain('release_condition is required');
  });

  it('flags all four when the stamp is entirely empty', () => {
    const { valid, errors } = validateHoldStamp({});
    expect(valid).toBe(false);
    expect(errors).toHaveLength(4);
  });
});

describe('checkHoldStamp — mode-gated', () => {
  const ORIGINAL = process.env.HOLD_STATE_CONTRACT_MODE;
  afterEach(() => { process.env.HOLD_STATE_CONTRACT_MODE = ORIGINAL; });

  it('TS-6: observe mode (default) never throws on an invalid stamp, and reports mode', () => {
    delete process.env.HOLD_STATE_CONTRACT_MODE;
    const result = checkHoldStamp({});
    expect(result.ok).toBe(false);
    expect(result.mode).toBe('observe');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('TS-1/TS-2: enforce mode throws HOLD_STATE_CONTRACT_VIOLATION on an invalid stamp', () => {
    process.env.HOLD_STATE_CONTRACT_MODE = 'enforce';
    expect(() => checkHoldStamp({})).toThrow(/Hold-state contract violation/);
    try {
      checkHoldStamp({});
    } catch (e) {
      expect(e.code).toBe('HOLD_STATE_CONTRACT_VIOLATION');
      expect(e.mode).toBe('enforce');
    }
  });

  it('enforce mode does not throw on a valid stamp', () => {
    process.env.HOLD_STATE_CONTRACT_MODE = 'enforce';
    const result = checkHoldStamp(VALID_STAMP);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('enforce');
    expect(result.errors).toEqual([]);
  });

  it('security Q1: mode is always present on the return value so observe/enforce is never ambiguous', () => {
    delete process.env.HOLD_STATE_CONTRACT_MODE;
    expect(checkHoldStamp(VALID_STAMP).mode).toBe('observe');
  });
});

describe('buildProvenancedStamp', () => {
  it('security Q3: strips ASCII control/ANSI characters from reason/owner/release_condition', () => {
    const dirty = {
      reason: 'bad\x1b[31mreason\x07',
      owner: 'coord\x00inator',
      release_condition: 'clear\x7fed',
      review_at: VALID_STAMP.review_at,
    };
    const clean = buildProvenancedStamp(dirty, 'session-abc');
    expect(clean.reason).toBe('bad[31mreason');
    expect(clean.owner).toBe('coordinator');
    expect(clean.release_condition).toBe('cleared');
  });

  it('security Q5: sets stamped_by_session from the writing session, not the caller payload', () => {
    const stamped = buildProvenancedStamp({ ...VALID_STAMP }, 'real-writing-session-id');
    expect(stamped.stamped_by_session).toBe('real-writing-session-id');
  });

  it('security Q5 (PAT-PROVENANCE-SPOOF-VIA-SPREAD-ORDER-001): a caller cannot spoof stamped_by_session by including it in its own payload', () => {
    const spoofed = { ...VALID_STAMP, stamped_by_session: 'attacker-claimed-session' };
    const stamped = buildProvenancedStamp(spoofed, 'real-writing-session-id');
    expect(stamped.stamped_by_session).toBe('real-writing-session-id');
  });

  it('leaves review_at untouched (not a free-text field to sanitize)', () => {
    const stamped = buildProvenancedStamp(VALID_STAMP, 's1');
    expect(stamped.review_at).toBe(VALID_STAMP.review_at);
  });
});

describe('logHoldStateViolation', () => {
  it('is a no-op when supabaseClient is falsy (never throws)', async () => {
    await expect(logHoldStateViolation(null, { surface: 'sd_park', stamp: {}, errors: ['x'] })).resolves.toBeUndefined();
  });

  it('inserts a row shaped for hold_state_contract_violations', async () => {
    const inserted = [];
    const fakeClient = {
      from: () => ({
        insert: async (row) => { inserted.push(row); return { error: null }; },
      }),
    };
    await logHoldStateViolation(fakeClient, { surface: 'exec_boundary_hold', stamp: VALID_STAMP, errors: ['owner is required'] });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      surface: 'exec_boundary_hold',
      reason: VALID_STAMP.reason,
      owner: VALID_STAMP.owner,
      review_at: VALID_STAMP.review_at,
      release_condition: VALID_STAMP.release_condition,
      errors: ['owner is required'],
    });
  });

  it('never throws even when the insert itself throws (fail-soft observe logging)', async () => {
    const throwingClient = { from: () => ({ insert: async () => { throw new Error('DB down'); } }) };
    await expect(logHoldStateViolation(throwingClient, { surface: 'sd_park', stamp: {}, errors: [] })).resolves.toBeUndefined();
  });
});
