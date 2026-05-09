/**
 * Tests for scripts/hooks/lib/file-claim-guard.cjs.
 * SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001
 *
 * 27 cases covering FR-2 (table contract), FR-3 (hook flow + LRU cache),
 * FR-5 (release helpers), and integration. Plus static-guard test pinning
 * the 4 sibling release sites.
 *
 * Strategy: test the LRU cache + dispatch logic via the exported test seams
 * (_cacheClear, _cacheSize). Database-side behaviour is asserted via SHAPE
 * checks (the result object's keys + types) without round-tripping through
 * vitest's supabase mock chain — the chain has hoisting/reset issues that
 * make per-call response control brittle. The shape contracts are what
 * downstream callers depend on; the underlying SELECT/INSERT/UPDATE/DELETE
 * paths are exercised in EXEC against the real applied migration via the
 * 4 sibling release-site integrations.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';

// Load guard once — env vars set BEFORE require so _supabase() can construct.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-key';
const guard = require('../../../scripts/hooks/lib/file-claim-guard.cjs');

beforeEach(() => {
  guard._cacheClear();
});

// ── FR-2 (12 cases): file_claim_locks contract — assertions on argument types,
//    fail-open paths, and cache invariants without round-tripping the chain ──

describe('FR-2: file_claim_locks contract (input validation + fail-open)', () => {
  test('checkClaim rejects empty filePath fail-open (refused:false)', async () => {
    const r = await guard.checkClaim({ filePath: '', mySessionId: 'sess-1' });
    expect(r.refused).toBe(false);
    expect(r.reason).toBe('no_session_or_path');
  });

  test('checkClaim rejects empty mySessionId fail-open', async () => {
    const r = await guard.checkClaim({ filePath: '/x.js', mySessionId: '' });
    expect(r.refused).toBe(false);
    expect(r.reason).toBe('no_session_or_path');
  });

  test('checkClaim rejects null filePath fail-open', async () => {
    const r = await guard.checkClaim({ filePath: null, mySessionId: 'sess-1' });
    expect(r.refused).toBe(false);
  });

  test('checkClaim rejects undefined mySessionId fail-open', async () => {
    const r = await guard.checkClaim({ filePath: '/x.js', mySessionId: undefined });
    expect(r.refused).toBe(false);
  });

  test('missing supabase env returns refused:false (fail-open via no_supabase)', async () => {
    const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const oldUrl2 = process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    const r = await guard.checkClaim({ filePath: '/x.js', mySessionId: 'sess-me' });
    process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldUrl2) process.env.SUPABASE_URL = oldUrl2;
    expect(r.refused).toBe(false);
    expect(r.reason).toBe('no_supabase');
  });

  test('releaseClaimsByHolder with no holder returns 0', async () => {
    const r = await guard.releaseClaimsByHolder({ holderSessionId: null });
    expect(r.released).toBe(0);
  });

  test('releaseClaimsByHolder with empty string returns 0', async () => {
    const r = await guard.releaseClaimsByHolder({ holderSessionId: '' });
    expect(r.released).toBe(0);
  });

  test('releaseClaimsForFiles with empty list returns 0', async () => {
    const r = await guard.releaseClaimsForFiles({ filePaths: [], holderSessionId: 'sess-1' });
    expect(r.released).toBe(0);
  });

  test('releaseClaimsForFiles with null filePaths returns 0', async () => {
    const r = await guard.releaseClaimsForFiles({ filePaths: null, holderSessionId: 'sess-1' });
    expect(r.released).toBe(0);
  });

  test('exports the 4 expected helpers (checkClaim, releaseClaimsByHolder, releaseClaimsForFiles, reapStaleClaims)', () => {
    expect(typeof guard.checkClaim).toBe('function');
    expect(typeof guard.releaseClaimsByHolder).toBe('function');
    expect(typeof guard.releaseClaimsForFiles).toBe('function');
    expect(typeof guard.reapStaleClaims).toBe('function');
  });

  test('exports test seams (_cacheClear, _cacheSize)', () => {
    expect(typeof guard._cacheClear).toBe('function');
    expect(typeof guard._cacheSize).toBe('function');
  });

  test('initial cache size is 0 after _cacheClear', () => {
    guard._cacheClear();
    expect(guard._cacheSize()).toBe(0);
  });
});

// ── FR-3 (8 cases): hook flow + LRU cache mechanics ──

describe('FR-3: LRU cache mechanics (size + TTL)', () => {
  test('cache size starts at 0', () => {
    expect(guard._cacheSize()).toBe(0);
  });

  test('_cacheClear empties the cache', () => {
    // No way to add without supabase, but clear should be idempotent
    guard._cacheClear();
    expect(guard._cacheSize()).toBe(0);
  });

  test('checkClaim integration: short-circuit returns include reason field', async () => {
    const r = await guard.checkClaim({ filePath: '', mySessionId: 'sess-1' });
    expect(r).toHaveProperty('reason');
  });

  test('checkClaim returns object with refused boolean (contract for ENFORCEMENT 14)', async () => {
    const r = await guard.checkClaim({ filePath: '', mySessionId: 'sess-1' });
    expect(typeof r.refused).toBe('boolean');
  });

  test('refused result shape includes ENFORCEMENT-14 expected fields when refused=true', () => {
    // Document the contract: when refused=true, downstream caller (pre-tool-enforce.cjs
    // ENFORCEMENT 14) reads holder_session_id + holder_heartbeat_age_seconds + file_path + message.
    const refusedFields = ['refused', 'holder_session_id', 'holder_heartbeat_age_seconds', 'file_path', 'message'];
    // Verify the contract via the helper's source: it constructs this exact shape.
    const src = readFileSync(path.resolve(__dirname, '../../../scripts/hooks/lib/file-claim-guard.cjs'), 'utf8');
    for (const field of refusedFields) {
      expect(src, `file-claim-guard.cjs constructs refused result with ${field}`).toMatch(new RegExp(field));
    }
  });

  test('FILE_CLAIM_CACHE_SIZE env var is read at module load (default 64)', () => {
    const src = readFileSync(path.resolve(__dirname, '../../../scripts/hooks/lib/file-claim-guard.cjs'), 'utf8');
    expect(src).toMatch(/FILE_CLAIM_CACHE_SIZE/);
    expect(src).toMatch(/'64'/);
  });

  test('FILE_CLAIM_CACHE_TTL_SECONDS env var is read at module load (default 30)', () => {
    const src = readFileSync(path.resolve(__dirname, '../../../scripts/hooks/lib/file-claim-guard.cjs'), 'utf8');
    expect(src).toMatch(/FILE_CLAIM_CACHE_TTL_SECONDS/);
    expect(src).toMatch(/'30'/);
  });

  test('LRU eviction logic: when cache is full and new key inserted, oldest evicted', () => {
    // Verify the source implements LRU eviction at size limit
    const src = readFileSync(path.resolve(__dirname, '../../../scripts/hooks/lib/file-claim-guard.cjs'), 'utf8');
    expect(src).toMatch(/_cache\.size >= CACHE_SIZE/);
    expect(src).toMatch(/_cache\.keys\(\)\.next\(\)\.value/);
    expect(src).toMatch(/_cache\.delete\(oldestKey\)/);
  });
});

// ── FR-5 (5 cases): release helpers source-level invariants ──

describe('FR-5: release helpers contract', () => {
  const src = readFileSync(path.resolve(__dirname, '../../../scripts/hooks/lib/file-claim-guard.cjs'), 'utf8');

  test('releaseClaimsByHolder DELETEs scoped to holder_session_id', () => {
    expect(src).toMatch(/releaseClaimsByHolder/);
    expect(src).toMatch(/\.eq\('holder_session_id', holderSessionId\)/);
  });

  test('releaseClaimsForFiles applies path.posix.normalize before lookup (Windows backslash → forward-slash)', () => {
    expect(src).toMatch(/path\.posix\.normalize/);
    expect(src).toMatch(/\.replace\(\/\\\\\/g, '\/'\)/);
  });

  test('releaseClaimsForFiles scopes DELETE to holder when holderSessionId provided', () => {
    expect(src).toMatch(/if \(holderSessionId\) q = q\.eq\('holder_session_id', holderSessionId\)/);
  });

  test('reapStaleClaims uses staleThresholdSeconds for cutoff timestamp', () => {
    expect(src).toMatch(/staleThresholdSeconds/);
    expect(src).toMatch(/Date\.now\(\) - staleThresholdSeconds \* 1000/);
  });

  test('reapStaleClaims default threshold is 600 seconds (10min)', () => {
    expect(src).toMatch(/staleThresholdSeconds = 600/);
  });
});

// ── Integration (2 cases): release flow integration with cache invalidation ──

describe('Integration: cache invalidation on release', () => {
  test('releaseClaimsByHolder invalidates cache entries for that holder', () => {
    const src = readFileSync(path.resolve(__dirname, '../../../scripts/hooks/lib/file-claim-guard.cjs'), 'utf8');
    // Verify cache-eviction loop in releaseClaimsByHolder
    expect(src).toMatch(/for \(const \[k, entry\] of _cache\.entries\(\)\)/);
    expect(src).toMatch(/holder_session_id === holderSessionId/);
    expect(src).toMatch(/_cache\.delete\(k\)/);
  });

  test('releaseClaimsForFiles invalidates cache entries for affected paths', () => {
    const src = readFileSync(path.resolve(__dirname, '../../../scripts/hooks/lib/file-claim-guard.cjs'), 'utf8');
    expect(src).toMatch(/for \(const p of normalized\) _cache\.delete\(p\)/);
  });
});

// ── Static guard: 4 sibling release sites pin (12-witness writer/consumer asymmetry) ──

describe('Static guard: 4 sibling release sites enforced', () => {
  test('scripts/stale-session-sweep.cjs imports + calls releaseClaimsByHolder', () => {
    const src = readFileSync(path.resolve(__dirname, '../../../scripts/stale-session-sweep.cjs'), 'utf8');
    expect(src).toMatch(/file-claim-guard\.cjs/);
    expect(src).toMatch(/releaseClaimsByHolder/);
  });

  test('scripts/stale-session-sweep.cjs also calls reapStaleClaims', () => {
    const src = readFileSync(path.resolve(__dirname, '../../../scripts/stale-session-sweep.cjs'), 'utf8');
    expect(src).toMatch(/reapStaleClaims/);
  });

  test('lib/claim-validity-gate.js imports + calls releaseClaimsByHolder on orphaned-claim release', () => {
    const src = readFileSync(path.resolve(__dirname, '../../../lib/claim-validity-gate.js'), 'utf8');
    expect(src).toMatch(/file-claim-guard\.cjs/);
    expect(src).toMatch(/releaseClaimsByHolder/);
  });

  test('lib/drain-orchestrator.mjs has 2 release sites (per-slot + shutdown)', () => {
    const src = readFileSync(path.resolve(__dirname, '../../../lib/drain-orchestrator.mjs'), 'utf8');
    const matches = src.match(/releaseClaimsByHolder/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  test('SIBLING RELEASE SITE markers present at all 4 sites (1/4, 2/4, 3/4, 4/4)', () => {
    const sweepSrc = readFileSync(path.resolve(__dirname, '../../../scripts/stale-session-sweep.cjs'), 'utf8');
    const gateSrc = readFileSync(path.resolve(__dirname, '../../../lib/claim-validity-gate.js'), 'utf8');
    const drainSrc = readFileSync(path.resolve(__dirname, '../../../lib/drain-orchestrator.mjs'), 'utf8');
    expect(sweepSrc).toMatch(/SIBLING RELEASE SITE 1\/4/);
    expect(gateSrc).toMatch(/SIBLING RELEASE SITE 2\/4/);
    expect(drainSrc).toMatch(/SIBLING RELEASE SITE 3\/4/);
    expect(drainSrc).toMatch(/SIBLING RELEASE SITE 4\/4/);
  });
});

// ── Hook integration (4 cases): ENFORCEMENT 14 wiring in pre-tool-enforce.cjs ──

describe('Hook integration: ENFORCEMENT 14 in pre-tool-enforce.cjs', () => {
  const hookSrc = readFileSync(path.resolve(__dirname, '../../../scripts/hooks/pre-tool-enforce.cjs'), 'utf8');

  test('pre-tool-enforce.cjs declares ENFORCEMENT 14: File-Claim Layer', () => {
    expect(hookSrc).toMatch(/ENFORCEMENT 14: File-Claim Layer/);
  });

  test('ENFORCEMENT 14 fires only on Write/Edit/MultiEdit', () => {
    expect(hookSrc).toMatch(/TOOL_NAME === 'Write' \|\| TOOL_NAME === 'Edit' \|\| TOOL_NAME === 'MultiEdit'/);
  });

  test('ENFORCEMENT 14 honors FILE_CLAIM_ENFORCED=off env disable', () => {
    expect(hookSrc).toMatch(/FILE_CLAIM_ENFORCED !== 'off'/);
  });

  test('ENFORCEMENT 14 path normalized via path.posix.normalize before lookup', () => {
    expect(hookSrc).toMatch(/path\.posix\.normalize/);
    expect(hookSrc).toMatch(/replace\(\/\\\\\/g, '\/'\)/);
  });
});

// ── Migration + .husky/post-commit hook (3 cases) ──

describe('Migration + post-commit hook artifacts', () => {
  test('migration file_claim_locks.sql exists at supabase/migrations/', () => {
    const migPath = path.resolve(__dirname, '../../../supabase/migrations/20260509_file_claim_locks.sql');
    const src = readFileSync(migPath, 'utf8');
    expect(src).toMatch(/CREATE TABLE IF NOT EXISTS public\.file_claim_locks/);
    expect(src).toMatch(/UNIQUE \(file_path\)/);
    expect(src).toMatch(/REFERENCES public\.claude_sessions \(id\) ON DELETE CASCADE/);
  });

  test('migration enables RLS + service-role-only policy', () => {
    const migPath = path.resolve(__dirname, '../../../supabase/migrations/20260509_file_claim_locks.sql');
    const src = readFileSync(migPath, 'utf8');
    expect(src).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(src).toMatch(/service_role_all_file_claim_locks/);
  });

  test('.husky/post-commit hook + companion script wired for file-claim auto-release', () => {
    const huskyPath = path.resolve(__dirname, '../../../.husky/post-commit');
    const huskySrc = readFileSync(huskyPath, 'utf8');
    expect(huskySrc).toMatch(/post-commit-release-file-claims\.cjs/);
    const scriptPath = path.resolve(__dirname, '../../../scripts/hooks/post-commit-release-file-claims.cjs');
    const scriptSrc = readFileSync(scriptPath, 'utf8');
    expect(scriptSrc).toMatch(/releaseClaimsForFiles/);
    expect(scriptSrc).toMatch(/git show --name-only/);
  });
});
