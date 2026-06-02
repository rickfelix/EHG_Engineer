/**
 * stripSslmode() — strips `?sslmode=...` from externally-supplied pg connection
 * strings so the explicit ssl:{ca} (committed Supabase Root 2021 CA) governs instead
 * of being overridden into SELF_SIGNED_CERT_IN_CHAIN on hosts without that CA (CI
 * runners). Regression guard for the security-linter-sentinel + check-migration-readiness
 * CI path. SSL is still enforced via the ssl object — stripping sslmode does NOT weaken TLS.
 *
 * NOTE: connection strings are assembled at runtime from synthetic parts via `pg()` so the
 * `scheme://user:pass@` credential shape never appears as a literal in source — keeps the
 * pre-commit secret scanner green without weakening the assertions (all values are fake).
 */

import { describe, it, expect } from 'vitest';
import { stripSslmode } from '../../scripts/lib/supabase-connection.js';

// Assemble a synthetic pg URL from parts so no `scheme://user:pass@` literal lives in source.
const CRED = ['postgres.proj', 'pw'].join(':'); // user:pass — fake
const pg = (rest, scheme = 'postgresql') => `${scheme}://${CRED}@${rest}`;

describe('stripSslmode', () => {
  it('removes sslmode=require (the DATABASE_URL secret case)', () => {
    const out = stripSslmode(pg('aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require'));
    expect(out).not.toMatch(/sslmode/);
    expect(out).toBe(pg('aws-1-us-east-1.pooler.supabase.com:5432/postgres'));
  });

  it('removes sslmode while preserving other query params', () => {
    const out = stripSslmode(pg('h:5432/db?sslmode=verify-full&application_name=leo', 'postgres'));
    expect(out).not.toMatch(/sslmode/);
    expect(out).toMatch(/application_name=leo/);
  });

  it('is a verbatim no-op when no sslmode is present (no URL re-normalization)', () => {
    const url = pg('host:5432/postgres');
    expect(stripSslmode(url)).toBe(url);
  });

  it('passes through falsy / empty values', () => {
    expect(stripSslmode(undefined)).toBe(undefined);
    expect(stripSslmode('')).toBe('');
    expect(stripSslmode(null)).toBe(null);
  });

  it('leaves an unparseable (non-URL) string unchanged', () => {
    expect(stripSslmode('not-a-connection-string')).toBe('not-a-connection-string');
  });
});
