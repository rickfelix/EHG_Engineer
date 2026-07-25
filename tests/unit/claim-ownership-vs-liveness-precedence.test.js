/**
 * SD-LEO-INFRA-PARKED-WORKER-CLAIM-LAPSE-001 FR-5 — the ownership/liveness precedence rule.
 *
 * Three sites disagreed in comments about which surface "wins":
 *   - worker-checkin.cjs findOwnSdClaim: "claude_sessions.sd_key is only ever a cache of this"
 *   - coordinator-email-summary.mjs:      "sd_key is the reliable build signal"
 *   - claim-validity-gate.js:             "sd_key is the source-of-truth, NOT claiming_session_id"
 *
 * They were each right about their OWN question and wrong as a universal rule. The ambiguity is
 * load-bearing, not cosmetic: FR-4 makes dispatch depend on the session surface being authoritative
 * for LIVENESS, while claim release depends on SDv2 being authoritative for OWNERSHIP. A future
 * edit that "resolves" the disagreement by picking one winner globally would reopen either the
 * claim-lapse (this SD's root cause) or a claim leak.
 *
 * These are source-invariant assertions because the artifact under test IS the stated rule.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const read = (p) => readFileSync(resolve(REPO_ROOT, p), 'utf8');

const DOC = 'docs/protocol/claim-ownership-vs-liveness.md';

describe('FR-5: the rule is stated once, in a place all three sites can reference', () => {
  it('the ratified doc exists', () => {
    expect(existsSync(resolve(REPO_ROOT, DOC))).toBe(true);
  });

  it('it assigns OWNERSHIP to SDv2 and CURRENTLY-BUILDING to the session surface', () => {
    const doc = read(DOC);
    expect(doc).toMatch(/strategic_directives_v2\.claiming_session_id/);
    expect(doc).toMatch(/claude_sessions\.sd_key/);
    expect(doc).toMatch(/OWNS/);
    expect(doc).toMatch(/CURRENTLY BUILDING/);
  });

  it('it records that the surfaces diverge in BOTH directions (neither is a cache)', () => {
    const doc = read(DOC);
    expect(doc).toMatch(/Claim set, `sd_key` NULL/);
    expect(doc).toMatch(/`sd_key` set, claim NULL/);
    expect(doc).toMatch(/Neither is a cache of the other/i);
  });

  it('it preserves the empty-vs-failed distinction that this SD was caused by', () => {
    const doc = read(DOC);
    expect(doc).toMatch(/An \*\*empty\*\* result is a real answer/);
    expect(doc).toMatch(/A \*\*failed\*\* query is not an answer/);
  });
});

describe('FR-5: the contradicting universal claims are gone from all three call sites', () => {
  it('claim-validity-gate no longer asserts sd_key is the source-of-truth over claiming_session_id', () => {
    const src = read('lib/claim-validity-gate.js');
    // The exact phrasing that contradicted worker-checkin. Its removal is the fix.
    expect(src).not.toMatch(/sd_key is the source-of-truth, NOT claiming_session_id\s*\./);
    expect(src).toContain(DOC);
  });

  it('worker-checkin no longer calls sd_key a mere cache, and points at the rule', () => {
    const src = read('scripts/worker-checkin.cjs');
    expect(src).not.toMatch(/claude_sessions\.sd_key is only ever a cache of this; this is the source of truth/);
    expect(src).toContain(DOC);
  });

  it('coordinator-email-summary keeps its build-signal rule but scopes it to liveness', () => {
    const src = read('scripts/coordinator-email-summary.mjs');
    // The behaviour it documents is correct and must NOT be reverted…
    expect(src).toMatch(/claude_sessions\.sd_key is the reliable build signal/);
    // …but it must no longer read as a global precedence claim.
    expect(src).toMatch(/Do NOT generalize this into/);
    expect(src).toContain(DOC);
  });
});

describe('FR-5: each site still reads the surface matching its OWN question', () => {
  it('findOwnSdClaim (an ownership question) queries SDv2, not claude_sessions', () => {
    const src = read('scripts/worker-checkin.cjs');
    const start = src.indexOf('async function findOwnSdClaim');
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, start + 700);
    expect(body).toMatch(/from\('strategic_directives_v2'\)/);
    expect(body).toMatch(/\.eq\('claiming_session_id', sessionId\)/);
    expect(body).not.toMatch(/from\('claude_sessions'\)/);
  });

  it('selectAvailableSds (a liveness question) keys on the session surface, not on SDv2', () => {
    const src = read('scripts/hooks/coordination-inbox.cjs');
    const start = src.indexOf('function selectAvailableSds');
    expect(start).toBeGreaterThan(0);

    // Bounding this slice has now gone wrong twice, so it is worth stating what the bound must do.
    // v1 used a fixed `start + 900` and broke within the hour when a comment grew past it. v2 used
    // `indexOf('\nfunction ', start+1)` and claimed to be "structural" — but selectAvailableSds is
    // the LAST function declaration in the file, so that returns -1 and silently fell back to EOF.
    // It passed for a reason unrelated to the stated one, and would have silently NARROWED the
    // moment any function was appended below. Bind to the real terminator instead, and assert the
    // bound actually resolved rather than trusting a fallback.
    const end = src.indexOf('\nmodule.exports', start);
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);

    expect(body).toMatch(/\bsd_key\b/);
    // Liveness is DELEGATED to the read-time SSOT rather than re-derived here. Pinning the
    // individual column names would now be wrong: the whole point of DEFECT-7 was that a local
    // re-derivation covered 2 of 5 signals and forked its own thresholds.
    expect(body).toMatch(/isSessionAlive\(/);
    // It must NOT reach for the ownership surface to answer a liveness question.
    expect(body).not.toMatch(/claiming_session_id/);
    // …and it must not quietly re-derive liveness locally again.
    expect(body).not.toMatch(/Date\.parse\(\s*s\.heartbeat_at/);
  });

  it('the dispatch query selects every column the liveness SSOT reads', () => {
    // A delegated liveness check degrades silently if the caller under-selects: the SSOT would see
    // undefined for is_alive / terminal_id / process_alive_at and fall back to whatever happens to
    // be present. That is DEFECT-7 re-entering through the query rather than the predicate.
    const src = read('scripts/hooks/coordination-inbox.cjs');
    const q = src.match(/\.from\('claude_sessions'\)\s*\.select\('([^']*)'\)\s*\.not\('sd_key'/);
    expect(q).toBeTruthy();
    for (const col of ['sd_key', 'heartbeat_at', 'expected_silence_until', 'is_alive', 'terminal_id', 'process_alive_at']) {
      expect(q[1]).toContain(col);
    }
  });
});
