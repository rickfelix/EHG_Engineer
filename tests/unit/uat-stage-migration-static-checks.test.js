import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(
  __dirname,
  '../../database/chairman-gated/20260825_dedicated_venture_uat_stage_insert_and_renumber.sql'
);
const migrationSql = readFileSync(MIGRATION_PATH, 'utf8');
const STAGE_EXECUTION_WORKER_PATH = join(__dirname, '../../lib/eva/stage-execution-worker.js');
const workerSource = readFileSync(STAGE_EXECUTION_WORKER_PATH, 'utf8');

// TS-11: static check -- new UAT stage writer is registered in the writer-policy registry.
describe('migration static check: writer registration (FR-7, TS-11)', () => {
  it("registers 'dedicated-venture-uat-stage' in ventures_canonical_writer_policy()'s VALUES list", () => {
    expect(migrationSql).toMatch(/\('dedicated-venture-uat-stage',/);
  });
});

// TS-12: static check -- census citation + chairman-gated unapproved header.
describe('migration static check: census citation + PENDING header (FR-8, TS-12)', () => {
  it('references docs/audits/stage-21-26-census.md by path', () => {
    expect(migrationSql).toContain('docs/audits/stage-21-26-census.md');
  });

  it('carries an @approved-by: PENDING header', () => {
    expect(migrationSql).toMatch(/@approved-by:[ \t]*PENDING/);
  });

  it('carries a DO NOT APPLY / DO NOT RUN banner', () => {
    expect(migrationSql).toMatch(/DO NOT (APPLY|RUN THIS FILE)/);
  });
});

// TS-13: static check -- the migration never UPDATEs eva_stage_gate_attempts or
// venture_stage_transitions directly; historical rows are read through the shim only.
describe('migration static check: no direct UPDATE of historical tables (FR-4 AC-3, TS-13)', () => {
  it('contains no UPDATE statement targeting venture_stage_transitions', () => {
    expect(migrationSql).not.toMatch(/UPDATE[ \t]+(public\.)?venture_stage_transitions\b/i);
  });

  it('contains no UPDATE statement targeting eva_stage_gate_attempts', () => {
    expect(migrationSql).not.toMatch(/UPDATE[ \t]+(public\.)?eva_stage_gate_attempts\b/i);
  });

  it('does update venture_stages (the actual target of this renumber, sanity check)', () => {
    expect(migrationSql).toMatch(/UPDATE[ \t]+public\.venture_stages\b/i);
  });
});

// TS-8: stage-execution-worker.js's literal fromStage/toStage check -- this SD's disposition is
// "explicitly documented as intentionally stale-named" (not fixed), per TS-8's own contract.
describe('TS-8 disposition: stage-execution-worker.js literal is documented, not silently dropped', () => {
  it('the migration explains why the p_from_stage=23/p_to_stage=24 literal was left unchanged', () => {
    expect(migrationSql).toMatch(/DOCUMENTED, NOT FIXED/);
    expect(migrationSql).toContain('lib/eva/stage-execution-worker.js:2971');
  });

  it('the literal check named by TS-8 still exists at the documented location (no silent drift)', () => {
    expect(workerSource).toContain('if (fromStage === 23 && toStage === 24)');
  });
});

// FR-9 AC-1: both RPCs are updated to accept the new max stage (27) in the SAME migration.
describe('migration static check: FR-9 upper-bound fix applied to both RPCs', () => {
  it('advance_venture_stage and fn_advance_venture_stage both check p_to_stage > 27', () => {
    const occurrences = migrationSql.match(/p_to_stage[ \t]*>[ \t]*27/g) || [];
    expect(occurrences.length).toBe(2);
  });

  it('neither RPC in this migration still executes the stale p_to_stage > 26 bound check', () => {
    // Matches the functional IF-condition shape only, not descriptive prose in the file's
    // header comments (which legitimately narrate "26 -> 27" as history/rationale).
    expect(migrationSql).not.toMatch(/IF p_to_stage < 1 OR p_to_stage > 26 THEN/);
  });
});
