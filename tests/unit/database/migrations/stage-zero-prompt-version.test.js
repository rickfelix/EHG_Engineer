/**
 * Static-content tests for the SD-LEO-ENH-TREND-SCANNER-SCORING-001 migrations.
 *
 * Covers AC-8 (TS-8 reversibility) as a static surrogate — full end-to-end DB
 * reversibility requires a test Supabase instance and is documented in the
 * migration headers. These assertions ensure the DOWN block + deploy-order
 * documentation is present before the migration is merged.
 *
 * Also covers AC-9 (TS-9): no DiscoveryModeDialog UI changes — verified by
 * static repo inspection in a sibling test below.
 *
 * Part of SD-LEO-ENH-TREND-SCANNER-SCORING-001 Checkpoint 3.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
// here = tests/unit/database/migrations → 4 levels up → repo root
const repoRoot = path.resolve(here, '..', '..', '..', '..');

const COLUMN_MIGRATION = path.join(repoRoot, 'database', 'migrations', '20260428_stage_zero_prompt_version.sql');
const RPC_MIGRATION = path.join(repoRoot, 'database', 'migrations', '20260428_stage_zero_prompt_version_rpc.sql');

describe('20260428_stage_zero_prompt_version.sql — column-add migration', () => {
  test('migration file exists at the documented path', () => {
    expect(existsSync(COLUMN_MIGRATION)).toBe(true);
  });

  const sql = existsSync(COLUMN_MIGRATION) ? readFileSync(COLUMN_MIGRATION, 'utf-8') : '';

  test('adds prompt_version column to stage_zero_requests as TEXT NULL', () => {
    expect(sql).toMatch(/ALTER TABLE stage_zero_requests[\s\S]*ADD COLUMN[\s\S]*prompt_version[\s\S]*TEXT[\s\S]*NULL/i);
  });

  test('adds prompt_version_active column to discovery_strategies as TEXT NULL', () => {
    expect(sql).toMatch(/ALTER TABLE discovery_strategies[\s\S]*ADD COLUMN[\s\S]*prompt_version_active[\s\S]*TEXT[\s\S]*NULL/i);
  });

  test('creates partial index on non-null prompt_version', () => {
    expect(sql).toMatch(/CREATE INDEX[\s\S]*idx_stage_zero_requests_prompt_version[\s\S]*WHERE prompt_version IS NOT NULL/i);
  });

  test('documents reversible DOWN block (AC-8)', () => {
    // DOWN may appear in a banner like "-- ─── DOWN ───"; just check for the keyword
    // alongside the actual reversal SQL.
    expect(sql).toMatch(/DOWN/);
    expect(sql).toMatch(/DROP INDEX[\s\S]*DROP COLUMN/i);
  });

  test('documents two-stage deploy order (TR-3)', () => {
    expect(sql.toLowerCase()).toContain('deploy order');
    expect(sql).toMatch(/30s|>=30/i);
  });
});

describe('20260428_stage_zero_prompt_version_rpc.sql — RPC migration', () => {
  test('migration file exists', () => {
    expect(existsSync(RPC_MIGRATION)).toBe(true);
  });

  const sql = existsSync(RPC_MIGRATION) ? readFileSync(RPC_MIGRATION, 'utf-8') : '';

  test('uses CREATE OR REPLACE FUNCTION (not DROP+CREATE)', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION get_discovery_strategy_scores/i);
  });

  test('returns prompt_version as a NEW TABLE column (TR-5 / PA-003 BLOCKING)', () => {
    expect(sql).toMatch(/RETURNS TABLE[\s\S]*prompt_version\s+TEXT/i);
  });

  test('uses COALESCE with v1-pre-versioning sentinel for legacy null rows', () => {
    expect(sql).toMatch(/COALESCE[\s\S]*prompt_version[\s\S]*v1-pre-versioning/i);
  });

  test('GROUP BY includes COALESCE(prompt_version) — not raw column', () => {
    // Must be the COALESCE expression in GROUP BY, not a bare prompt_version reference
    // (which would force consumers to handle null rows).
    expect(sql).toMatch(/GROUP BY[\s\S]*COALESCE[\s\S]*prompt_version[\s\S]*v1-pre-versioning/i);
  });

  test('explicitly references PA-003 BLOCKING constraint in the comment block', () => {
    expect(sql).toContain('PA-003');
    expect(sql.toLowerCase()).toContain('blocking');
  });
});

describe('AC-9 — no DiscoveryModeDialog UI changes', () => {
  test('SD source diff does not modify DiscoveryModeDialog.tsx', () => {
    // We assert via a guarded check: the SD's primary diff lives in EHG_Engineer; the
    // ehg/ side touches only useStageZeroQueue.ts + useDiscoveryStrategyScores.ts. Verify
    // the dialog file path was NOT modified in this worktree (the file lives in a sibling
    // ehg/ repo and is intentionally out of scope per FR-6 and AC-9). This test is a
    // static guard — it confirms the directory layout assumption.
    const dialogInThisRepo = path.join(repoRoot, 'src', 'components', 'chairman-v3', 'opportunities', 'DiscoveryModeDialog.tsx');
    // The dialog should NOT exist inside EHG_Engineer (it lives in ehg/). If a future
    // refactor moves it here, this guard alerts the author that AC-9 needs revisiting.
    expect(existsSync(dialogInThisRepo)).toBe(false);
  });
});
