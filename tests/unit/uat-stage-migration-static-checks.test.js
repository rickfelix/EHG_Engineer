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
const V2_MIGRATION_PATH = join(__dirname, '../../database/chairman-gated/20260828_stage_keyed_data_config_widen_v2.sql');
const v2Sql = readFileSync(V2_MIGRATION_PATH, 'utf8');
const V2_DOWN_PATH = join(__dirname, '../../database/chairman-gated/20260828_stage_keyed_data_config_widen_v2_DOWN.sql');
const v2DownSql = readFileSync(V2_DOWN_PATH, 'utf8');

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
    // Matches the functional IF-condition shape only -- the migration also references
    // "p_to_stage > 27" inside the verify block's own LIKE string literal and inside
    // fn_validate_stage_column()'s separate bound check, which are legitimate additional uses,
    // not a third/fourth copy of the RPC's own guard clause.
    const occurrences = migrationSql.match(/IF p_to_stage < 1 OR p_to_stage > 27 THEN/g) || [];
    expect(occurrences.length).toBe(2);
  });

  it('neither RPC in this migration still executes the stale p_to_stage > 26 bound check', () => {
    // Matches the functional IF-condition shape only, not descriptive prose in the file's
    // header comments (which legitimately narrate "26 -> 27" as history/rationale).
    expect(migrationSql).not.toMatch(/IF p_to_stage < 1 OR p_to_stage > 26 THEN/);
  });
});

// SD-LEO-INFRA-STAGE-KEYED-DATA-001: v2's own static checks, same convention as v1's above.
describe('v2 migration static check: PENDING header + chairman-gated banner (v1 precedent)', () => {
  it('carries an @approved-by: PENDING header', () => {
    expect(v2Sql).toMatch(/@approved-by:[ \t]*PENDING/);
  });

  it('carries a DO NOT APPLY / DO NOT RUN banner', () => {
    expect(v2Sql).toMatch(/DO NOT (APPLY|RUN THIS FILE)/);
  });

  it('references its own committed census (docs/audits/stage-keyed-data-config-census.md)', () => {
    expect(v2Sql).toContain('docs/audits/stage-keyed-data-config-census.md');
  });

  it('is a NEW file, not an in-place edit of v1 -- both files still exist independently', () => {
    expect(migrationSql).toMatch(/@approved-by:[ \t]*PENDING/);
    expect(v2Sql).not.toBe(migrationSql);
  });
});

describe('v2 migration static check: sequencing precondition (must apply after v1)', () => {
  it('refuses to proceed unless the dedicated_venture_uat row is already present', () => {
    expect(v2Sql).toMatch(/dedicated_venture_uat/);
    expect(v2Sql).toMatch(/PRECONDITION FAILED/);
  });
});

describe('v2 migration static check: all 3 previously-missed functions are replaced', () => {
  it('replaces fn_bootstrap_venture_stages with the widened loop bound', () => {
    expect(v2Sql).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_bootstrap_venture_stages/);
    expect(v2Sql).toMatch(/FOR v_stage IN 1\.\.27 LOOP/);
  });

  it('replaces bootstrap_venture_workflow with tier_max ELSE 27', () => {
    expect(v2Sql).toMatch(/CREATE OR REPLACE FUNCTION public\.bootstrap_venture_workflow/);
    expect(v2Sql).toMatch(/ELSE 27\s*\n\s*END;/);
  });

  it('replaces approve_chairman_decision with the step-up gate shifted to stage 25 (SECURITY fix)', () => {
    // Matches the functional IF-condition shape only, not the file's own explanatory comment
    // prose above the function (which legitimately narrates "= 24" as pre-v2 history), matching
    // v1's own established convention for this exact distinction (see the FR-9 checks above).
    expect(v2Sql).toMatch(/CREATE OR REPLACE FUNCTION public\.approve_chairman_decision/);
    expect(v2Sql).toMatch(/consequence_level = 'high' OR v_decision\.lifecycle_stage = 25\)/);
    expect(v2Sql).not.toMatch(/consequence_level = 'high' OR v_decision\.lifecycle_stage = 24\)/);
  });
});

describe('v2 migration static check: eva_ventures mirror backfill (TS-7 finding)', () => {
  it('backfills eva_ventures rows exactly 1 behind their ventures row in the post-shift range', () => {
    expect(v2Sql).toMatch(/UPDATE public\.eva_ventures ev/);
    expect(v2Sql).toMatch(/ev\.current_lifecycle_stage = v\.current_lifecycle_stage - 1/);
  });

  it('verifies zero remaining 1-behind rows in its own post-apply block', () => {
    expect(v2Sql).toMatch(/ev\.current_lifecycle_stage = v\.current_lifecycle_stage - 1/g);
    expect(v2Sql).toMatch(/at least one eva_ventures row remains 1 stage behind/);
  });
});

describe('v2 migration static check: shared parked-venture preflight function (FR-5)', () => {
  it('defines fn_parked_venture_preflight and calls it from its own DO-block preflight', () => {
    expect(v2Sql).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_parked_venture_preflight/);
    expect(v2Sql).toMatch(/public\.fn_parked_venture_preflight\(24, 27, false\)/);
  });
});

describe('v2 DOWN file static check: reverses every CHECK widen and the security-relevant fix', () => {
  it('narrows chk_lifecycle_stage back to <= 26', () => {
    expect(v2DownSql).toMatch(/chk_lifecycle_stage CHECK \(\(\(current_lifecycle_stage >= 1\) AND \(current_lifecycle_stage <= 26\)\)\)/);
  });

  it('reverts approve_chairman_decision back to the pre-v2 lifecycle_stage = 24 step-up condition', () => {
    expect(v2DownSql).toMatch(/v_decision\.lifecycle_stage = 24/);
  });

  it('refuses to narrow if a real stage-27 write exists since v2 applied', () => {
    expect(v2DownSql).toMatch(/ROLLBACK REFUSED/);
  });

  it('drops fn_parked_venture_preflight', () => {
    expect(v2DownSql).toMatch(/DROP FUNCTION IF EXISTS public\.fn_parked_venture_preflight/);
  });

  it('reverses the eva_ventures backfill AFTER which it narrows the CHECK back to <= 26', () => {
    const backfillIdx = v2DownSql.indexOf('ev.current_lifecycle_stage - 1, updated_at');
    const narrowIdx = v2DownSql.indexOf('chk_lifecycle_stage CHECK');
    expect(backfillIdx).toBeGreaterThan(-1);
    expect(narrowIdx).toBeGreaterThan(-1);
    expect(backfillIdx).toBeLessThan(narrowIdx);
  });
});
