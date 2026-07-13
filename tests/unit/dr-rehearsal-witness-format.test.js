/**
 * QF-20260712-917 (D6): unit tests for the runbook §7 witness-block formatter.
 */
import { describe, it, expect } from 'vitest';
import { buildWitnessBlock, RUNBOOK_BLOCK_REGEX } from '../../scripts/dr/rehearsal-witness-format.mjs';

const PASS_REPORT = {
  overall: 'PASS',
  scratchSchema: 'dr_rehearsal_20260713_0306',
  startedAt: '2026-07-13T03:06:16.081Z',
  finishedAt: '2026-07-13T03:06:17.381Z',
  drills: {
    A: { status: 'PASS', restored: 500, fieldChecks: 8500, mismatchCount: 0, schemaDriftKeys: [], missingRestored: [] },
    B: { status: 'PASS', copied: 500, sampled: 500 },
  },
  statementAudit: { total: 13, reads: 5, scratchWrites: 8, forbidden: 0 },
  cleanup: { schemaDropped: true },
};

const FAIL_REPORT = {
  overall: 'FAIL',
  scratchSchema: 'dr_rehearsal_20260713_0400',
  finishedAt: '2026-07-13T04:00:00.000Z',
  drills: {
    A: { status: 'FAIL', error: 'schema drift: column removed' },
    B: { status: 'NOT_RUN' },
  },
  statementAudit: { total: 2, reads: 1, scratchWrites: 1, forbidden: 0 },
  cleanup: { schemaDropped: false },
};

describe('RUNBOOK_BLOCK_REGEX', () => {
  it('matches the existing runbook witness block shape', () => {
    const runbook = `## 7. Restore rehearsal\n\n**Latest live run — 2026-06-10T23:31:44Z: \`PASS\`** (scratch schema\n\`dr_rehearsal_20260610_2331\`, 2.5 s):\n\n| Drill | Result |\n|---|---|\n| A — x | PASS |\n| B — y | PASS |\n| Statement audit | 11 statements |\n| Cleanup | scratch schema dropped |\n\n## 8. Next section`;
    expect(RUNBOOK_BLOCK_REGEX.test(runbook)).toBe(true);
  });
});

describe('buildWitnessBlock', () => {
  it('formats a PASS report with thousands-separators and drill detail', () => {
    const block = buildWitnessBlock(PASS_REPORT);
    expect(block).toContain('**Latest live run — 2026-07-13T03:06:17.381Z: `PASS`**');
    expect(block).toContain('dr_rehearsal_20260713_0306');
    expect(block).toContain('1.3 s'); // (17.381 - 16.081)s duration
    expect(block).toContain('500 rows restored');
    expect(block).toContain('8,500 field checks'); // comma-formatted
    expect(block).toContain('0 mismatches');
    expect(block).toContain('500/500 rows, md5 sets identical');
    expect(block).toContain('13 statements: 5 reads, 8 scratch-writes, **0 forbidden**');
    expect(block).toContain('scratch schema dropped');
  });

  it('formats a FAIL report with drill errors and no duration (no startedAt)', () => {
    const block = buildWitnessBlock(FAIL_REPORT);
    expect(block).toContain('`FAIL`');
    expect(block).toContain('schema drift: column removed');
    expect(block).toContain('B — quarantine copy md5 identity | NOT_RUN');
    expect(block).toContain('NOT CONFIRMED DROPPED — manual check needed');
    expect(block).not.toMatch(/\d+\.\d s\)/); // no duration suffix when startedAt is absent
  });

  it('round-trips through RUNBOOK_BLOCK_REGEX.replace() cleanly against a realistic runbook fragment', () => {
    const runbook = `preamble\n\n**Latest live run — 2026-06-10T23:31:44Z: \`PASS\`** (scratch schema\n\`dr_rehearsal_20260610_2331\`, 2.5 s):\n\n| Drill | Result |\n|---|---|\n| A — old | PASS |\n| B — old | PASS |\n| Statement audit | 11 statements |\n| Cleanup | scratch schema dropped |\n\n## 8. next`;
    const updated = runbook.replace(RUNBOOK_BLOCK_REGEX, buildWitnessBlock(PASS_REPORT));
    expect(updated).toContain('2026-07-13T03:06:17.381Z');
    expect(updated).not.toContain('2026-06-10T23:31:44Z');
    expect(updated).toContain('## 8. next'); // content after the block is preserved
    expect(updated).toContain('preamble'); // content before the block is preserved
  });
});
