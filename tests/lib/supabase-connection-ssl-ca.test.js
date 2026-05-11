/**
 * QF-20260511-917 — closes feedback e97a791f
 *
 * Verifies getSSLConfig() honors SUPABASE_SSL_CA env var so Windows pg-direct
 * connections to the Supabase pooler can use the Supabase-signed CA bundle
 * (e.g. supabase-root-2021-ca.pem) instead of falling back to
 * DISABLE_SSL_VERIFY=true.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getSSLConfig } from '../../scripts/lib/supabase-connection.js';

const SAVED_ENV = {};
const ENV_KEYS = ['SUPABASE_SSL_CA', 'DISABLE_SSL_VERIFY', 'NODE_ENV'];

function snapshotEnv() {
  for (const k of ENV_KEYS) SAVED_ENV[k] = process.env[k];
}
function restoreEnv() {
  for (const k of ENV_KEYS) {
    if (SAVED_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED_ENV[k];
  }
}

describe('getSSLConfig — SUPABASE_SSL_CA env (QF-20260511-917)', () => {
  let tmpDir;
  let caPath;

  beforeEach(() => {
    snapshotEnv();
    tmpDir = mkdtempSync(join(tmpdir(), 'qf917-'));
    caPath = join(tmpDir, 'fake-ca.pem');
    writeFileSync(caPath, '-----BEGIN CERTIFICATE-----\nFAKE-FOR-TEST\n-----END CERTIFICATE-----\n');
    delete process.env.SUPABASE_SSL_CA;
    delete process.env.DISABLE_SSL_VERIFY;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    restoreEnv();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads CA bundle when SUPABASE_SSL_CA points at a readable PEM file', () => {
    process.env.SUPABASE_SSL_CA = caPath;
    const cfg = getSSLConfig();
    expect(cfg.rejectUnauthorized).toBe(true);
    expect(typeof cfg.ca).toBe('string');
    expect(cfg.ca).toContain('FAKE-FOR-TEST');
  });

  it('falls through to default-strict when SUPABASE_SSL_CA is unset', () => {
    const cfg = getSSLConfig();
    expect(cfg).toEqual({ rejectUnauthorized: true });
    expect(cfg.ca).toBeUndefined();
  });

  it('falls through when SUPABASE_SSL_CA points at a missing file', () => {
    process.env.SUPABASE_SSL_CA = join(tmpDir, 'does-not-exist.pem');
    const cfg = getSSLConfig();
    expect(cfg).toEqual({ rejectUnauthorized: true });
    expect(cfg.ca).toBeUndefined();
  });

  it('SUPABASE_SSL_CA takes precedence over DISABLE_SSL_VERIFY=true', () => {
    process.env.SUPABASE_SSL_CA = caPath;
    process.env.DISABLE_SSL_VERIFY = 'true';
    const cfg = getSSLConfig();
    expect(cfg.rejectUnauthorized).toBe(true);
    expect(cfg.ca).toContain('FAKE-FOR-TEST');
  });

  it('SUPABASE_SSL_CA takes precedence over NODE_ENV=production', () => {
    process.env.SUPABASE_SSL_CA = caPath;
    process.env.NODE_ENV = 'production';
    const cfg = getSSLConfig();
    expect(cfg.rejectUnauthorized).toBe(true);
    expect(cfg.ca).toContain('FAKE-FOR-TEST');
  });

  it('preserves DISABLE_SSL_VERIFY=true escape hatch when SUPABASE_SSL_CA unset', () => {
    process.env.DISABLE_SSL_VERIFY = 'true';
    const cfg = getSSLConfig();
    expect(cfg).toEqual({ rejectUnauthorized: false });
  });
});
