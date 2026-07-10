/**
 * validate-doc-naming.js — path-scoped exception tests
 * (SD-LEO-INFRA-PAYMENT-RAIL-ATTRIBUTION-002 doc PR: DOCMON's naming gate
 * flagged auto-generated schema-reference docs, which are intentionally
 * named after literal DB table identifiers like ops_payment_events.md.)
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = process.cwd();
const SCHEMA_FIXTURE = path.join(REPO_ROOT, 'docs/reference/schema/test_fixture_table.md');
const OTHER_FIXTURE = path.join(REPO_ROOT, 'docs/test_fixture_underscore.md');

function runNaming(relPath) {
  try {
    const out = execSync(`node scripts/validate-doc-naming.js --path=${relPath} --format=json`, { encoding: 'utf-8' });
    return { exitCode: 0, report: JSON.parse(out) };
  } catch (error) {
    return { exitCode: error.status, report: JSON.parse(error.stdout) };
  }
}

beforeAll(() => {
  fs.writeFileSync(SCHEMA_FIXTURE, '# fixture\n');
  fs.writeFileSync(OTHER_FIXTURE, '# fixture\n');
});

afterAll(() => {
  fs.rmSync(SCHEMA_FIXTURE, { force: true });
  fs.rmSync(OTHER_FIXTURE, { force: true });
});

describe('validate-doc-naming path-scoped exceptions', () => {
  test('an underscore filename under docs/reference/schema/ is excepted (mirrors a literal DB table name)', () => {
    const { exitCode, report } = runNaming('docs/reference/schema/test_fixture_table.md');
    expect(exitCode).toBe(0);
    expect(report.results.valid).toContain('docs/reference/schema/test_fixture_table.md');
    expect(report.results.invalid).toEqual([]);
  });

  test('the same underscore pattern OUTSIDE docs/reference/schema/ is NOT excepted — the path_prefix scope does not leak repo-wide', () => {
    const { exitCode, report } = runNaming('docs/test_fixture_underscore.md');
    expect(exitCode).toBe(2);
    expect(report.results.valid).toEqual([]);
    expect(report.results.invalid[0].rule_id).toBe('NAMING-UNDERSCORE');
  });

  test('backward compatibility: a basename-only exception (no path_prefix) still matches anywhere', () => {
    const { exitCode, report } = runNaming('CLAUDE.md');
    expect(exitCode).toBe(0);
    expect(report.results.valid).toContain('CLAUDE.md');
    expect(report.results.invalid).toEqual([]);
  });
});
