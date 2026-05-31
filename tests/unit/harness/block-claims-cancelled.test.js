// SD-LEO-INFRA-SHIP-UNMERGED-LAYERS-001 (FR-6): source-pin guards for the cancelled-SD
// claim defense. The original SD-LEO-INFRA-BLOCK-CLAIMS-CANCELLED-001 was marked completed
// but FR-1 (claim-guard.mjs refusal) + FR-5 (migration 393 trigger) never merged (stale
// PR #3672). These tests pin both layers so the gap cannot silently re-open.
// Static source assertions (matches cancel-sd-accountability.test.js convention); CI-runnable, no DB.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const guardPath = path.join(repoRoot, 'lib/claim-guard.mjs');
const migrationPath = path.join(repoRoot, 'database/migrations/393_enforce_no_claim_on_cancelled_sd.sql');
const guardSrc = fs.readFileSync(guardPath, 'utf-8');

describe('FR-1: claim-guard.mjs refuses claims on cancelled SDs', () => {
  it('reads strategic_directives_v2.status (+ cancellation_reason) by sd_key before acquiring', () => {
    // Anchor on the FR-1-specific select (there is an earlier sd_type select in the TTL resolver).
    const selIdx = guardSrc.indexOf(".select('status, cancellation_reason')");
    expect(selIdx).toBeGreaterThan(0);
    const block = guardSrc.slice(selIdx - 80, selIdx + 200);
    expect(block).toMatch(/from\(['"]strategic_directives_v2['"]\)/);
    expect(block).toMatch(/\.eq\(['"]sd_key['"],\s*sdKey\)/);
    expect(block).toMatch(/\.maybeSingle\(\)/);
  });

  it('returns a distinct sd_cancelled refusal when status === cancelled', () => {
    expect(guardSrc).toMatch(/sdStatusRow\.status === ['"]cancelled['"]/);
    expect(guardSrc).toMatch(/error:\s*['"]sd_cancelled['"]/);
    expect(guardSrc).toMatch(/cancelled:\s*true/);
  });

  it('is FAIL-OPEN: only a definite cancelled status blocks (missing row / query error does not)', () => {
    // The refusal must be gated on (no error) AND (row present) AND (status === cancelled),
    // so a Supabase hiccup or a missing row falls through to the existing claim logic.
    expect(guardSrc).toMatch(/!sdStatusError\s*&&\s*sdStatusRow\s*&&\s*sdStatusRow\.status === ['"]cancelled['"]/);
  });

  it('the status check runs BEFORE the claude_sessions claim query (pre-acquire)', () => {
    const statusIdx = guardSrc.indexOf(".select('status, cancellation_reason')");
    const sessionsIdx = guardSrc.indexOf("from('claude_sessions')");
    expect(statusIdx).toBeGreaterThan(0);
    expect(sessionsIdx).toBeGreaterThan(statusIdx);
  });

  it('formatClaimFailure renders a distinct cancelled banner (not the foreign-claim one)', () => {
    expect(guardSrc).toMatch(/result\.cancelled\s*\|\|\s*result\.error === ['"]sd_cancelled['"]/);
    expect(guardSrc).toMatch(/SD IS CANCELLED/);
  });
});

describe('FR-5: migration 393 is the DB-level fail-closed backstop', () => {
  it('the migration file exists', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  const migSrc = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf-8') : '';

  it('defines a BEFORE UPDATE trigger on strategic_directives_v2', () => {
    expect(migSrc).toMatch(/CREATE OR REPLACE FUNCTION enforce_no_claim_on_cancelled_sd\(\)/);
    expect(migSrc).toMatch(/BEFORE UPDATE ON strategic_directives_v2/);
  });

  it('keys on OLD.status (cancellation UPDATE itself stays allowed) with an enum-cast-safe fallback', () => {
    expect(migSrc).toMatch(/COALESCE\(OLD\.status::text,\s*''\)\s*=\s*'cancelled'/);
    // Must NOT key on NEW.status (that would block the active->cancelled transition).
    expect(migSrc).not.toMatch(/NEW\.status::text\)?\s*=\s*'cancelled'/);
  });

  it('blocks both claim transitions (claiming_session_id NULL->set and is_working_on false->true)', () => {
    expect(migSrc).toMatch(/NEW\.claiming_session_id IS NOT NULL AND OLD\.claiming_session_id IS NULL/);
    expect(migSrc).toMatch(/COALESCE\(NEW\.is_working_on,\s*false\)\s*=\s*true AND COALESCE\(OLD\.is_working_on,\s*false\)\s*=\s*false/);
    expect(migSrc).toMatch(/RAISE EXCEPTION/);
  });

  it('documents a reversible rollback (DROP TRIGGER + DROP FUNCTION)', () => {
    expect(migSrc).toMatch(/DROP TRIGGER IF EXISTS tr_enforce_no_claim_on_cancelled_sd/);
    expect(migSrc).toMatch(/DROP FUNCTION IF EXISTS enforce_no_claim_on_cancelled_sd/);
  });
});

describe('is_working_on writer guard: claim acquisition routes through claim-guard', () => {
  it('the canonical claim writer (reaffirmClaimColumns) is the one setting is_working_on: true', () => {
    // claimGuard delegates the claim-column write to reaffirmClaimColumns, which is the
    // single is_working_on:true writer in claim-guard.mjs. Pinning this keeps the FR-1
    // status check on the same path as the acquire (the DB trigger backstops other writers).
    const idx = guardSrc.indexOf('function reaffirmClaimColumns');
    expect(idx).toBeGreaterThan(0);
    const block = guardSrc.slice(idx, idx + 600);
    expect(block).toMatch(/is_working_on:\s*true/);
  });
});
