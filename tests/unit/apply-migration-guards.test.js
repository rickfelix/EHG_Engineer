/**
 * SD-LEO-INFRA-CANONICAL-SCRIPTS-APPLY-001 — FR-2 / TS-2 + TS-10
 * Unit tests for scripts/lib/migration-guards.js (no DB).
 *
 * Three-factor guard: flag + token + approver. Each missing factor → reject.
 * Token check uses a mocked pg client; only the SHA-256 hash is sent to DB.
 */
import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  validateProdDeployGuards,
  checkFlagFactor,
  checkApproverFactor,
  checkTokenFactor,
  extractApprovedBy,
  generateTokenValue,
  hashToken,
} from '../../scripts/lib/migration-guards.js';

const SQL_OK = `-- @approved-by: rick@example.com\nCREATE TABLE t(x int);`;
const SQL_NO_HEADER = `CREATE TABLE t(x int);`;
const SQL_BAD_EMAIL = `-- @approved-by: someone-else@example.com\nCREATE TABLE t(x int);`;

function fakeClient({ tokenRow }) {
  return {
    query: vi.fn(async () => ({ rows: tokenRow ? [tokenRow] : [] })),
  };
}

describe('extractApprovedBy', () => {
  it('reads single-line -- @approved-by header', () => {
    expect(extractApprovedBy(SQL_OK)).toBe('rick@example.com');
  });
  it('returns null when missing', () => {
    expect(extractApprovedBy(SQL_NO_HEADER)).toBeNull();
  });
});

describe('checkFlagFactor (TS-2)', () => {
  it('rejects without --prod-deploy', () => {
    const r = checkFlagFactor(false);
    expect(r.ok).toBe(false);
    expect(r.factor).toBe('flag');
  });
  it('accepts with flag', () => {
    expect(checkFlagFactor(true).ok).toBe(true);
  });
});

describe('checkApproverFactor (TS-2 + TS-10)', () => {
  it('rejects when git user.email not configured', () => {
    const r = checkApproverFactor(SQL_OK, '');
    expect(r.ok).toBe(false);
    expect(r.factor).toBe('approver');
  });
  it('rejects when header missing', () => {
    const r = checkApproverFactor(SQL_NO_HEADER, 'rick@example.com');
    expect(r.ok).toBe(false);
    expect(r.factor).toBe('approver');
  });
  it('rejects when email mismatched', () => {
    const r = checkApproverFactor(SQL_BAD_EMAIL, 'rick@example.com');
    expect(r.ok).toBe(false);
    expect(r.factor).toBe('approver');
  });
  it('accepts when matched (case-insensitive)', () => {
    const r = checkApproverFactor(SQL_OK, 'RICK@Example.COM');
    expect(r.ok).toBe(true);
  });
});

describe('checkTokenFactor (TS-2)', () => {
  it('rejects empty token', async () => {
    const c = fakeClient({});
    const r = await checkTokenFactor(c, '');
    expect(r.ok).toBe(false);
    expect(r.factor).toBe('token');
  });
  it('rejects token not found in DB', async () => {
    const c = fakeClient({ tokenRow: null });
    const r = await checkTokenFactor(c, 'a'.repeat(64));
    expect(r.ok).toBe(false);
    expect(r.factor).toBe('token');
  });
  it('rejects already-consumed token', async () => {
    const c = fakeClient({
      tokenRow: {
        id: 'x',
        token_issued_at: new Date().toISOString(),
        token_consumed_at: new Date().toISOString(),
      },
    });
    const r = await checkTokenFactor(c, 'a'.repeat(64));
    expect(r.ok).toBe(false);
    expect(r.factor).toBe('token');
  });
  it('rejects expired (>1h) token', async () => {
    const c = fakeClient({
      tokenRow: {
        id: 'x',
        token_issued_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        token_consumed_at: null,
      },
    });
    const r = await checkTokenFactor(c, 'a'.repeat(64));
    expect(r.ok).toBe(false);
    expect(r.factor).toBe('token');
  });
  it('accepts fresh unconsumed token; sends only the hash to DB', async () => {
    const c = fakeClient({
      tokenRow: {
        id: 'row1',
        token_issued_at: new Date().toISOString(),
        token_consumed_at: null,
      },
    });
    const tok = 'b'.repeat(64);
    const r = await checkTokenFactor(c, tok);
    expect(r.ok).toBe(true);
    expect(r.tokenRowId).toBe('row1');
    const args = c.query.mock.calls[0][1];
    expect(args[0]).toBe(hashToken(tok));
    expect(args[0]).not.toBe(tok);
  });
});

describe('validateProdDeployGuards integration (TS-2)', () => {
  it('rejects with first failing factor (short-circuit)', async () => {
    const c = fakeClient({});
    const r = await validateProdDeployGuards({
      flagPresent: false,
      tokenEnv: 'irrelevant',
      sqlContent: SQL_NO_HEADER,
      gitUserEmail: '',
      client: c,
    });
    expect(r.ok).toBe(false);
    expect(r.factor).toBe('flag');
    expect(c.query).not.toHaveBeenCalled();
  });

  it('accepts when all three factors pass', async () => {
    const c = fakeClient({
      tokenRow: {
        id: 'r1',
        token_issued_at: new Date().toISOString(),
        token_consumed_at: null,
      },
    });
    const r = await validateProdDeployGuards({
      flagPresent: true,
      tokenEnv: 'c'.repeat(64),
      sqlContent: SQL_OK,
      gitUserEmail: 'rick@example.com',
      client: c,
    });
    expect(r.ok).toBe(true);
    expect(r.approver).toBe('rick@example.com');
    expect(r.tokenRowId).toBe('r1');
  });
});

describe('token primitives (SEC-C1)', () => {
  it('generateTokenValue produces 64-hex-char string (32 bytes)', () => {
    const v = generateTokenValue();
    expect(v).toMatch(/^[0-9a-f]{64}$/);
  });
  it('hashToken returns deterministic 64-hex sha256', () => {
    expect(hashToken('x')).toBe(crypto.createHash('sha256').update('x').digest('hex'));
  });
  it('different token values produce different hashes', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});
