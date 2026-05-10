// SD-LEO-INFRA-BLOCK-CLAIMS-CANCELLED-001 — defense-in-depth tests
// Covers FR-1 (claim-guard cancelled refusal), FR-2 (claim-validity-gate
// cancelled assertion), FR-3 (cancel-sd global sweep + post-condition),
// FR-6 (static guard pinning is_working_on=true writers), FR-7 (import-meta-url
// guard for session-check-concurrency.js — RCA d24766eb).
//
// FR-4 (sd-start re-check) and FR-5 (PG trigger) are integration-level and
// covered by source-file regex pins here; full integration tests deferred per
// the SD's deferral list (FR-5 needs the migration applied to a test schema).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf-8');
}

describe('SD-LEO-INFRA-BLOCK-CLAIMS-CANCELLED-001', () => {
  describe('FR-1: claim-guard.mjs refuses cancelled SDs pre-acquire', () => {
    const src = read('lib/claim-guard.mjs');

    it('claimGuard performs a pre-acquire SELECT for status=cancelled before any claim_sd RPC', () => {
      // The cancelled-status check must appear inside claimGuard between the
      // "await fetchClaimTTL()" call and the existing claude_sessions claims query.
      const claimGuardStart = src.indexOf('export async function claimGuard');
      expect(claimGuardStart).toBeGreaterThan(0);
      const fetchTtlIdx = src.indexOf('await fetchClaimTTL()', claimGuardStart);
      expect(fetchTtlIdx).toBeGreaterThan(0);
      const cancelledCheckIdx = src.indexOf("status === 'cancelled'", fetchTtlIdx);
      expect(cancelledCheckIdx).toBeGreaterThan(fetchTtlIdx);
      // Must appear BEFORE the claude_sessions query
      const sessionQueryIdx = src.indexOf("from('claude_sessions')", fetchTtlIdx);
      expect(cancelledCheckIdx).toBeLessThan(sessionQueryIdx);
    });

    it('cancelled refusal returns { success:false, error:/sd_cancelled/i } shape', () => {
      expect(src).toMatch(/error:\s*[`'"]sd_cancelled/);
      expect(src).toMatch(/cancellation_reason/);
    });

    it('skips cancelled-status check for QF-* keys (different table)', () => {
      expect(src).toMatch(/!sdKey\.startsWith\(['"]QF-['"]\)/);
    });

    it('formatClaimFailure renders a distinct sd_cancelled banner', () => {
      expect(src).toMatch(/SD HAS BEEN CANCELLED/);
      expect(src).toMatch(/result\.error\.startsWith\(['"]sd_cancelled['"]\)/);
    });
  });

  describe('FR-2: claim-validity-gate.js assertValidClaim cancelled assertion', () => {
    const src = read('lib/claim-validity-gate.js');

    it('SELECT in CHECK 2 includes status and cancellation_reason columns', () => {
      const idx = src.indexOf('CHECK 2: SD claim ownership');
      expect(idx).toBeGreaterThan(0);
      const block = src.slice(idx, idx + 800);
      expect(block).toMatch(/select\(['"][^'"]*\bstatus\b/);
      expect(block).toMatch(/cancellation_reason/);
    });

    it('throws ClaimIdentityError with reason="sd_cancelled" before worktree validation', () => {
      const idx = src.indexOf("sd.status === 'cancelled'");
      expect(idx).toBeGreaterThan(0);
      const block = src.slice(idx, idx + 400);
      expect(block).toMatch(/reason:\s*['"]sd_cancelled['"]/);
      expect(block).toMatch(/throw new ClaimIdentityError/);
    });

    it('cancelled-status throw appears AFTER sd_not_found check and BEFORE worktree validation', () => {
      const sdNotFoundIdx = src.indexOf("reason: 'sd_not_found'");
      const cancelledIdx = src.indexOf("reason: 'sd_cancelled'");
      const worktreeCheckIdx = src.indexOf('CHECK 2: SD claim ownership');
      expect(sdNotFoundIdx).toBeGreaterThan(0);
      expect(cancelledIdx).toBeGreaterThan(sdNotFoundIdx);
      // cancelled check is inside CHECK 2 so should be after CHECK 2 header
      expect(cancelledIdx).toBeGreaterThan(worktreeCheckIdx);
    });
  });

  describe('FR-3: cancel-sd.js global is_working_on sweep + post-condition', () => {
    const src = read('scripts/cancel-sd.js');

    it('post-condition SELECT verifies is_working_on=false and status=cancelled', () => {
      expect(src).toMatch(/POST_CONDITION_FAILED/);
      expect(src).toMatch(/postSweep\.is_working_on !== false/);
      expect(src).toMatch(/postSweep\.status !== ['"]cancelled['"]/);
      expect(src).toMatch(/process\.exit\(2\)/);
    });

    it('global is_working_on sweep is idempotent (filter by is_working_on=true)', () => {
      const sweepIdx = src.indexOf('FR-3: defensive global is_working_on');
      expect(sweepIdx).toBeGreaterThan(0);
      const block = src.slice(sweepIdx, sweepIdx + 600);
      expect(block).toMatch(/is_working_on:\s*false/);
      expect(block).toMatch(/\.eq\(['"]is_working_on['"],\s*true\)/);
    });

    it('claude_sessions release is global (matches all rows for sd_key, not scoped to claimedSessionId only)', () => {
      const releaseIdx = src.indexOf('release ALL claude_sessions rows');
      expect(releaseIdx).toBeGreaterThan(0);
      const block = src.slice(releaseIdx, releaseIdx + 1500);
      // Must filter by sd_key AND select session_id for counting
      expect(block).toMatch(/\.eq\(['"]sd_key['"],\s*sd\.sd_key\)/);
      expect(block).toMatch(/\.select\(['"]session_id['"]\)/);
      expect(block).toMatch(/Released \$\{n\} claude_sessions row/);
    });
  });

  describe('FR-4: sd-start.js post-render cancellation re-check', () => {
    const src = read('scripts/sd-start.js');

    it('re-check exists between session creation and assertValidClaim call', () => {
      const recheckIdx = src.indexOf('FR-4: post-render cancellation');
      const assertCallIdx = src.indexOf('await assertValidClaim(supabase, effectiveId, {');
      expect(recheckIdx).toBeGreaterThan(0);
      expect(assertCallIdx).toBeGreaterThan(recheckIdx);
    });

    it('re-check exits with code 2 and stderr contains SD_CANCELLED_DURING_STARTUP', () => {
      const recheckIdx = src.indexOf('FR-4: post-render cancellation');
      const block = src.slice(recheckIdx, recheckIdx + 1500);
      expect(block).toMatch(/SD_CANCELLED_DURING_STARTUP/);
      expect(block).toMatch(/process\.exit\(2\)/);
    });

    it('re-check fails open on query error (non-blocking warn)', () => {
      const recheckIdx = src.indexOf('FR-4: post-render cancellation');
      const block = src.slice(recheckIdx, recheckIdx + 1800);
      expect(block).toMatch(/cancellation re-check soft-failed/);
    });
  });

  describe('FR-5: PG trigger migration 393', () => {
    const sql = read('database/migrations/393_enforce_no_claim_on_cancelled_sd.sql');

    it('defines enforce_no_claim_on_cancelled_sd function with SQLSTATE P0001', () => {
      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION enforce_no_claim_on_cancelled_sd/);
      expect(sql).toMatch(/USING ERRCODE = ['"]P0001['"]/);
    });

    it('refuses claiming_session_id NULL → NOT-NULL transition only (allows release)', () => {
      expect(sql).toMatch(/OLD\.status = ['"]cancelled['"]/);
      expect(sql).toMatch(/NEW\.claiming_session_id IS NOT NULL/);
      expect(sql).toMatch(/OLD\.claiming_session_id IS NULL/);
    });

    it('refuses is_working_on flip false → true on cancelled SDs', () => {
      expect(sql).toMatch(/NEW\.is_working_on = true/);
      expect(sql).toMatch(/COALESCE\(OLD\.is_working_on, false\) = false/);
    });

    it('idempotent: DROP TRIGGER IF EXISTS before CREATE', () => {
      expect(sql).toMatch(/DROP TRIGGER IF EXISTS tr_enforce_no_claim_on_cancelled_sd/);
      expect(sql).toMatch(/CREATE TRIGGER tr_enforce_no_claim_on_cancelled_sd\s+BEFORE UPDATE/);
    });
  });

  describe('FR-6: static guard — is_working_on=true writer pinning', () => {
    // Pinned canonical writers per SD scope. Adding/removing a writer requires
    // a conscious update to this list (the friction is the point).
    const PINNED_WRITERS = [
      { file: 'lib/claim-guard.mjs', minMatches: 1, maxMatches: 1 },
      { file: 'lib/drain-orchestrator.mjs', minMatches: 1, maxMatches: 1 },
      { file: 'scripts/modules/handoff/executors/plan-to-exec/state-transitions.js', minMatches: 1, maxMatches: 1 },
      { file: 'scripts/stale-session-sweep.cjs', minMatches: 2, maxMatches: 2 },
      { file: 'scripts/leo-continuous.js', minMatches: 1, maxMatches: 1 }
    ];

    function countWriters(src) {
      // Match: `is_working_on: true` in object literals (the canonical UPDATE shape).
      // Exclude the `=true` form because that pattern appears in log strings
      // (e.g. `'CLAIM_FIX: set is_working_on=true on '`) which are not writes.
      const re = /is_working_on:\s*true\b/g;
      const matches = src.match(re);
      return matches ? matches.length : 0;
    }

    for (const { file, minMatches, maxMatches } of PINNED_WRITERS) {
      it(`${file} has between ${minMatches} and ${maxMatches} writers (pinned)`, () => {
        const src = read(file);
        const n = countWriters(src);
        expect(n).toBeGreaterThanOrEqual(minMatches);
        expect(n).toBeLessThanOrEqual(maxMatches);
      });
    }

    it('global writer count across pinned files matches expected total', () => {
      const total = PINNED_WRITERS.reduce((acc, { file }) => acc + countWriters(read(file)), 0);
      const expected = PINNED_WRITERS.reduce((acc, w) => acc + w.minMatches, 0);
      expect(total).toBe(expected);
    });
  });

  describe('FR-7 (RCA d24766eb): session-check-concurrency.js import-meta-url guard', () => {
    const src = read('scripts/session-check-concurrency.js');

    it('imports pathToFileURL from "url"', () => {
      expect(src).toMatch(/import\s*\{\s*pathToFileURL\s*\}\s*from\s*['"]url['"]/);
    });

    it('main() invocation guarded by import.meta.url === pathToFileURL(process.argv[1])', () => {
      expect(src).toMatch(/if\s*\(\s*import\.meta\.url\s*===\s*pathToFileURL\(process\.argv\[1\][^)]*\)\.href\s*\)/);
    });

    it('guards the main().catch() block (not the function definition itself)', () => {
      // Locate the guard line and verify the next non-blank lines are the main().catch invocation
      const guardIdx = src.indexOf('import.meta.url === pathToFileURL');
      expect(guardIdx).toBeGreaterThan(0);
      const block = src.slice(guardIdx, guardIdx + 400);
      expect(block).toMatch(/main\(\)\.catch/);
      expect(block).toMatch(/process\.exit\(2\)/);
    });
  });
});
