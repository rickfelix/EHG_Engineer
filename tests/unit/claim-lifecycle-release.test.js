/**
 * SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 — unit tests for lib/claim-lifecycle-release.mjs.
 * Covers FR-1 + FR-4 + FR-5 + FR-2 (re-export) + AC-3.6 (TTL_remaining formula).
 * Closure pattern reference: lib/eva/__tests__/file-claim-detection.test.js (FR-7 from SD-CROSS-HOST).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const HELPER_PATH = resolve(REPO_ROOT, 'lib/claim-lifecycle-release.mjs');

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://test.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// ── FR-5: CLAIM_RELEASED_TTL_MS named export ─────────────────────────────

describe('FR-5: CLAIM_RELEASED_TTL_MS named constant (AC-5.1, AC-5.2, AC-5.3)', () => {
  it('exports value 300000 (5 minutes)', async () => {
    const m = await import(HELPER_PATH);
    expect(m.CLAIM_RELEASED_TTL_MS).toBe(5 * 60 * 1000);
    expect(m.CLAIM_RELEASED_TTL_MS).toBe(300000);
  });

  it('helper source uses the named constant, not inline 300000 literal (AC-5.2 sibling-parity)', () => {
    const src = readFileSync(HELPER_PATH, 'utf8');
    // hasRecentClaimReleased body should reference the const, not a magic number
    const hasRecentBody = src.match(/export async function hasRecentClaimReleased[\s\S]*?^}/m)?.[0] || '';
    expect(hasRecentBody).toMatch(/CLAIM_RELEASED_TTL_MS/);
    // No inline 300000 in the helper body (only allowed in the const declaration).
    expect(hasRecentBody).not.toMatch(/\b300000\b/);
  });

  it('source has docstring citing source feedback 8ddfe2e8 + worker-tick rationale (AC-5.3)', () => {
    const src = readFileSync(HELPER_PATH, 'utf8');
    expect(src).toMatch(/8ddfe2e8/);
    expect(src).toMatch(/worker.tick/i);
  });
});

// ── FR-2 sibling: detectSdKeyDrift re-export (AC-2.3) ────────────────────

describe('FR-2: detectSdKeyDrift is RE-EXPORTED from canonical location (AC-2.3)', () => {
  it('re-exports detectSdKeyDrift', async () => {
    const m = await import(HELPER_PATH);
    expect(typeof m.detectSdKeyDrift).toBe('function');
  });

  it('re-export resolves to canonical scripts/session-check-concurrency.js (no fork)', async () => {
    const helperSrc = readFileSync(HELPER_PATH, 'utf8');
    expect(helperSrc).toMatch(/export\s*\{\s*detectSdKeyDrift\s*\}\s*from\s*['"]\.\.\/scripts\/session-check-concurrency\.js['"]/);
    // Identity test: imports of the canonical and the re-export are the same fn.
    const canonical = await import(resolve(REPO_ROOT, 'scripts/session-check-concurrency.js'));
    const reexport = await import(HELPER_PATH);
    expect(reexport.detectSdKeyDrift).toBe(canonical.detectSdKeyDrift);
  });

  it('re-exported detectSdKeyDrift has 3-verdict signature (drift|aligned|unknown) per CROSS-HOST FR-7', async () => {
    const m = await import(HELPER_PATH);
    expect(m.detectSdKeyDrift({ sd_key: 'SD-A' }, 'SD-A')).toBe('aligned');
    expect(m.detectSdKeyDrift({ sd_key: 'SD-B' }, 'SD-A')).toBe('drift');
    expect(m.detectSdKeyDrift({ sd_key: null }, 'SD-A')).toBe('drift');
    expect(m.detectSdKeyDrift(null, 'SD-A')).toBe('unknown');
    expect(m.detectSdKeyDrift({ sd_key: 'SD-A' }, null)).toBe('unknown');
  });
});

// ── FR-3: hasRecentClaimReleased contract (AC-3.2 read-only, AC-3.6 formula) ──

describe('FR-3: hasRecentClaimReleased READ-ONLY contract (AC-3.2)', () => {
  it('helper source contains no UPDATE/INSERT/DELETE against session_coordination', () => {
    const src = readFileSync(HELPER_PATH, 'utf8');
    const fnMatch = src.match(/export async function hasRecentClaimReleased[\s\S]*?^}/m);
    expect(fnMatch).toBeTruthy();
    const body = fnMatch[0];
    // Read-only contract: only .select() against session_coordination
    expect(body).toMatch(/session_coordination/);
    expect(body).toMatch(/\.select\(/);
    expect(body).not.toMatch(/\.update\(/);
    expect(body).not.toMatch(/\.insert\(/);
    expect(body).not.toMatch(/\.delete\(/);
    expect(body).not.toMatch(/\.upsert\(/);
  });

  it('helper source pins schema columns: target_sd, message_type, created_at (validation-agent P1)', () => {
    const src = readFileSync(HELPER_PATH, 'utf8');
    expect(src).toMatch(/\.eq\(['"]target_sd['"]/);
    expect(src).toMatch(/\.eq\(['"]message_type['"]\s*,\s*['"]CLAIM_RELEASED['"]/);
    expect(src).toMatch(/\.gte\(['"]created_at['"]/);
    // NEVER use the deprecated `subject` column or `payload.event_type` as filters.
    // Match against active code only — docblock comments may legitimately reference
    // the deprecated columns to document why they were dropped.
    expect(src).not.toMatch(/\.eq\(['"]subject['"]/);
    expect(src).not.toMatch(/\.eq\(['"]payload\.event_type/);
    expect(src).not.toMatch(/\.gte\(['"]payload\.event_type/);
  });
});

// ── AC-3.6: TTL_remaining formula via formatClaimReleasedAbort ────────────

describe('AC-3.6: TTL_remaining formula', () => {
  it('formatClaimReleasedAbort returns null when not recent', async () => {
    const m = await import(HELPER_PATH);
    expect(m.formatClaimReleasedAbort('SD-X', { recent: false })).toBeNull();
    expect(m.formatClaimReleasedAbort('SD-X', null)).toBeNull();
  });

  it('formats abort message with sd-key + ago label + ttl-remaining (AC-3.1 shape)', async () => {
    const m = await import(HELPER_PATH);
    const probe = { recent: true, msSinceCreated: 90 * 1000, ttlRemainingMs: 210 * 1000 };
    const msg = m.formatClaimReleasedAbort('SD-X', probe);
    expect(msg).toMatch(/Peer is releasing claim for SD-X/);
    expect(msg).toMatch(/received 1m 30s ago/);
    expect(msg).toMatch(/retry in 210s/);
  });

  it('seconds-only label when <1 minute', async () => {
    const m = await import(HELPER_PATH);
    const probe = { recent: true, msSinceCreated: 45 * 1000, ttlRemainingMs: 255 * 1000 };
    const msg = m.formatClaimReleasedAbort('SD-X', probe);
    expect(msg).toMatch(/received 45s ago/);
    expect(msg).not.toMatch(/0m/);
  });

  it('clamps ttl-remaining at 0 when expired', async () => {
    const m = await import(HELPER_PATH);
    const probe = { recent: true, msSinceCreated: 999 * 1000, ttlRemainingMs: 0 };
    const msg = m.formatClaimReleasedAbort('SD-X', probe);
    expect(msg).toMatch(/retry in 0s/);
  });
});

// ── FR-1 + FR-4: releaseClaimOnPROpen contract via signature/source pin ───

describe('FR-1 + FR-4: releaseClaimOnPROpen contract (AC-1.2, AC-1.3, AC-1.4, AC-4.1, AC-4.2)', () => {
  const src = readFileSync(HELPER_PATH, 'utf8');
  const fnMatch = src.match(/export async function releaseClaimOnPROpen[\s\S]*?^}/m);
  const body = fnMatch?.[0] || '';

  it('exports releaseClaimOnPROpen + captureClaimSnapshot', async () => {
    const m = await import(HELPER_PATH);
    expect(typeof m.releaseClaimOnPROpen).toBe('function');
    expect(typeof m.captureClaimSnapshot).toBe('function');
  });

  it('UPDATE clause is WHERE-pinned on (id, claiming_session_id, claimed_at, heartbeat_at) — Option B compare-and-set', () => {
    expect(body).toMatch(/\.update\(\{[^}]*claiming_session_id:\s*null/);
    expect(body).toMatch(/\.eq\(['"]id['"]/);
    expect(body).toMatch(/\.eq\(['"]claiming_session_id['"]/);
    expect(body).toMatch(/\.eq\(['"]claimed_at['"]/);
    expect(body).toMatch(/\.eq\(['"]heartbeat_at['"]/);
    // NO claim_version usage (validation-agent P1 — column does not exist)
    expect(body).not.toMatch(/claim_version/);
  });

  it('idempotent: 0 rows affected returns released:false reason:already_released_or_reasserted (AC-1.2/AC-1.3)', () => {
    expect(body).toMatch(/already_released_or_reasserted/);
  });

  it('throws on RPC error — no swallow (AC-4.2)', () => {
    expect(body).toMatch(/throw new Error/);
    expect(body).toMatch(/\[claim-lifecycle-release\] release failed/);
  });

  it('returns no_snapshot when called without a snapshot (defensive guard)', async () => {
    const m = await import(HELPER_PATH);
    const r1 = await m.releaseClaimOnPROpen(null);
    expect(r1).toEqual({ released: false, reason: 'no_snapshot' });
    const r2 = await m.releaseClaimOnPROpen({ id: 'x' }); // missing claiming_session_id
    expect(r2).toEqual({ released: false, reason: 'no_snapshot' });
  });
});
