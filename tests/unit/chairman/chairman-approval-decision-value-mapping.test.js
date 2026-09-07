/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-VALUE-001 FR-1/FR-3 — writer-vs-mapping conformance for
 * chairman_approval.
 *
 * WHY THIS EXISTS: fn_chairman_decision_value had no chairman_approval branch, so every
 * chairman_approval row lib/chairman/classifier-denial-guard.mjs mints was permanently unclosable
 * via the sanctioned decide path (live specimen 644a861f, 2026-09-07). Mirrors the extraction
 * pattern in tests/unit/eva-decisions-verb-alignment.test.js's last test (pin the ACTUAL IN(...)
 * clause text, not prose that can drift independently of the executable branch) — static half,
 * pure, no DB. The behavioural half (does the live function actually return 'approve') lives in
 * tests/database/chairman-decision-queue-null-safe.db.test.js, gated on the migration being
 * chairman-applied.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = 'database/chairman-gated/20260907_add_chairman_approval_to_decision_value.sql';

describe('chairman_approval is in fn_chairman_decision_value\'s APPROVAL-SHAPED mapping (FR-1)', () => {
  const migration = fs.readFileSync(path.resolve(process.cwd(), MIGRATION_PATH), 'utf8');

  it('the migration file exists and is staged under database/chairman-gated/', () => {
    expect(migration.length).toBeGreaterThan(0);
    expect(migration).toMatch(/requires-chairman-apply/);
  });

  it('chairman_approval is a member of the APPROVAL-SHAPED IN(...) clause specifically (not just prose elsewhere in the file)', () => {
    // Anchored on the branch's own distinguishing comment + its CASE p_action pair, mirroring
    // eva-decisions-verb-alignment.test.js's extraction technique -- so an edit that removes
    // chairman_approval from the executable IN-list (while leaving header prose intact) fails.
    const branchMatch = migration.match(
      /-- APPROVAL-SHAPED types:[\s\S]*?WHEN p_decision_type IN \(([\s\S]*?)\)\s*THEN CASE p_action WHEN 'approved' THEN 'approve' ELSE 'reject' END/
    );
    expect(branchMatch, 'APPROVAL-SHAPED IN(...) clause not found — extraction regex is stale').toBeTruthy();
    expect(branchMatch[1]).toMatch(/'chairman_approval'/);
  });

  it('the migration preserves every previously-mapped type this SD must not touch (regression: migration_apply, credential_scope, and the 4 original approval-shaped types)', () => {
    const branchMatch = migration.match(
      /-- APPROVAL-SHAPED types:[\s\S]*?WHEN p_decision_type IN \(([\s\S]*?)\)\s*THEN CASE p_action WHEN 'approved' THEN 'approve' ELSE 'reject' END/
    );
    const inListText = branchMatch[1];
    for (const type of ['ddl_approval', 'gate_approval', 'outbound_publish_approval', 'ratified_deviation', 'migration_apply', 'credential_scope']) {
      expect(inListText, `${type} must remain mapped — this SD adds chairman_approval, it does not replace the bucket`).toMatch(new RegExp(`'${type}'`));
    }
  });

  it('the migration also preserves the VENTURE-SCOPED and OVERRIDE branches unmodified (full-function CREATE OR REPLACE regression guard)', () => {
    for (const type of ['venture_disposition', 'stage_gate', 'launch_gate', 'gate_decision', 'vision_approval', 'strategy_selection', 'product_review', 'distribution_block', 'thesis_kill_tier_b', 'distribution_skip']) {
      expect(migration).toMatch(new RegExp(`'${type}'`));
    }
    expect(migration).toMatch(/gate_override/);
  });
});
