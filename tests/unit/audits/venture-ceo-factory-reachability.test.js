/**
 * SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-G (FR-1/FR-2/FR-3, TS-1/TS-2).
 *
 * TS-1: the audit script produces a BUILD-ON or RETIRE verdict consistent with the
 * FR-1/FR-2 findings. TS-2: a separate invocation reads back the persisted verdict
 * record without re-running the audit trace.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, partition, runAudit } from '../../../scripts/audits/venture-ceo-factory-reachability.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('classify()', () => {
  it('classifies archive/ paths as archive', () => {
    expect(classify({ file: 'archive/scripts/foo.js' })).toBe('archive');
  });
  it('classifies tests/ paths and *.test.js/*.spec.ts as test', () => {
    expect(classify({ file: 'tests/unit/eva/venture-state-machine.test.js' })).toBe('test');
    expect(classify({ file: 'tests/e2e/agents/venture-ceo-verify-first.spec.ts' })).toBe('test');
  });
  it('classifies .md files as doc', () => {
    expect(classify({ file: 'docs/design/spine-system-architecture-review.md' })).toBe('doc');
  });
  it('classifies .sql files as migration_literal', () => {
    expect(classify({ file: 'database/migrations/20251213_vision_v2_reset_and_seed.sql' })).toBe('migration_literal');
  });
  it('classifies everything else as live', () => {
    expect(classify({ file: 'lib/eva/eva-orchestrator.js' })).toBe('live');
  });
});

describe('partition()', () => {
  it('buckets a mixed hit list by classification', () => {
    const hits = [
      { file: 'lib/agents/venture-state-machine.js', line: 238 },
      { file: 'tests/unit/eva/venture-state-machine.test.js', line: 399 },
      { file: 'archive/scripts/foo.js', line: 1 },
      { file: 'docs/design/spec.md', line: 1 },
      { file: 'database/migrations/x.sql', line: 1 },
    ];
    const p = partition(hits);
    expect(p.live).toHaveLength(1);
    expect(p.test).toHaveLength(1);
    expect(p.archive).toHaveLength(1);
    expect(p.doc).toHaveLength(1);
    expect(p.migration_literal).toHaveLength(1);
  });
});

describe('runAudit() — TS-1: verdict consistent with FR-1/FR-2 findings', () => {
  it('produces a BUILD-ON or RETIRE verdict against the current repo state', () => {
    const record = runAudit(REPO_ROOT);
    expect(['BUILD-ON', 'RETIRE']).toContain(record.verdict);
    expect(record.fr1.verdict).toMatch(/^(CONFIRMED|REFUTED)/);
    expect(record.fr2.verdict).toMatch(/^(CONFIRMED|REFUTED)/);
    // RETIRE requires both FRs confirmed; verdict logic must not contradict itself.
    if (record.verdict === 'RETIRE') {
      expect(record.fr1.verdict.startsWith('CONFIRMED')).toBe(true);
      expect(record.fr2.verdict.startsWith('CONFIRMED')).toBe(true);
    }
  });

  it('onboardVenture has zero external callers on the live repo (grounds FR-1)', () => {
    const record = runAudit(REPO_ROOT);
    expect(record.fr1.onboard_venture_live_callers).toHaveLength(0);
  });

  it('commitStageTransition has zero live callers on the live repo (grounds FR-2)', () => {
    const record = runAudit(REPO_ROOT);
    expect(record.fr2.commit_stage_transition_live_callers).toHaveLength(0);
  });
});

describe('persisted verdict record — TS-2: readable without re-running the audit', () => {
  const verdictPath = path.join(REPO_ROOT, 'docs/audits/venture-ceo-factory-reachability-verdict.json');

  it('exists and is valid JSON with the required shape', () => {
    expect(existsSync(verdictPath)).toBe(true);
    const record = JSON.parse(readFileSync(verdictPath, 'utf8'));
    expect(record.sd_key).toBe('SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-G');
    expect(['BUILD-ON', 'RETIRE']).toContain(record.verdict);
    expect(typeof record.generated_at).toBe('string');
    expect(record.fr1).toBeTruthy();
    expect(record.fr2).toBeTruthy();
  });
});
