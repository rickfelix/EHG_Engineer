/**
 * SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001, FR-5 -- unit coverage for the chokepoint lint's
 * write-detection regex (the actual file-walking/allowlist logic is exercised via the CLI's
 * --all full-sweep run, verified live during EXEC: 4670 files checked, 0 violations).
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LINT_SCRIPT = join(process.cwd(), 'scripts/lint/stage-advancement-chokepoint-lint.mjs');

describe('stage-advancement-chokepoint-lint: full-sweep sanity', () => {
  it('the current codebase state has zero violations (allowlist covers the full census)', () => {
    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: process.cwd() });
    expect(output).toMatch(/0 violations/);
  });
});

describe('stage-advancement-chokepoint-lint: fixture detection (isolated tmp repo)', () => {
  it('flags a NEW file with a raw SQL SET current_lifecycle_stage write outside the allowlist', () => {
    // --all mode walks RUNTIME_DIRS directly (readdirSync), no git involved -- no repo setup needed.
    const dir = mkdtempSync(join(tmpdir(), 'stage-lint-fixture-'));
    writeFileSync(join(dir, 'new_bypass.sql'), `
CREATE OR REPLACE FUNCTION public.new_uncensused_advance(p_venture_id uuid, p_to_stage int)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ventures SET current_lifecycle_stage = p_to_stage WHERE id = p_venture_id;
END;
$$;
`);
    // Mirror the lint's own RUNTIME_DIRS expectation by nesting under database/migrations/.
    const dbDir = join(dir, 'database', 'migrations');
    mkdirSync(dbDir, { recursive: true });
    writeFileSync(join(dbDir, 'new_bypass.sql'), `
UPDATE ventures SET current_lifecycle_stage = 5 WHERE id = 'x';
`);

    let output = '';
    let failed = false;
    try {
      output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    } catch (err) {
      failed = true;
      output = err.stdout?.toString() || err.message;
    }

    rmSync(dir, { recursive: true, force: true });

    expect(failed).toBe(true);
    expect(output).toMatch(/violation/);
    expect(output).toMatch(/new_bypass\.sql/);
  });

  it('does NOT flag a read-only JOIN condition referencing current_lifecycle_stage', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stage-lint-fixture-read-'));
    const dbDir = join(dir, 'database', 'migrations');
    mkdirSync(dbDir, { recursive: true });
    writeFileSync(join(dbDir, 'read_only.sql'), `
SELECT v.id FROM ventures v
LEFT JOIN venture_stages vs ON v.current_lifecycle_stage = vs.stage_number;
`);

    const output = execSync(`node "${LINT_SCRIPT}" --all`, { encoding: 'utf8', cwd: dir });
    rmSync(dir, { recursive: true, force: true });

    expect(output).toMatch(/0 violations/);
  });
});
