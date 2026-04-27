import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { runValidators, maxSeverity, VALIDATOR_REGISTRY } from '../../scripts/eva/brainstorm-pre-check.mjs';

const FIXTURE_VENTURE_WORKFLOW = `
export const stages = [
  {
    stageNumber: 22,
    stageName: 'Distribution Setup',
    gateType: 'none',
  },
  {
    stageNumber: 26,
    stageName: 'Growth Playbook',
    gateType: 'none',
  },
];
`;

const tmpRoot = resolve(tmpdir(), `pre-check-test-${Date.now()}`);
const venturePath = resolve(tmpRoot, 'venture-workflow.ts');

describe('brainstorm-pre-check.runValidators', () => {
  beforeAll(() => {
    mkdirSync(tmpRoot, { recursive: true });
    writeFileSync(venturePath, FIXTURE_VENTURE_WORKFLOW, 'utf-8');
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('registers all 5 known claim types', () => {
    expect(Object.keys(VALIDATOR_REGISTRY).sort()).toEqual([
      'column_exists',
      'file_path',
      'gate_type',
      'line_content',
      'table_exists',
    ]);
  });

  it('case-study: brainstorm 3fa31151 S22+S26 gate_type claims yield drift report citing both stages', async () => {
    const claims = [
      { type: 'gate_type', stage_number: 22, expected_gate: 'kill', source_path: venturePath },
      { type: 'gate_type', stage_number: 26, expected_gate: 'promotion', source_path: venturePath },
    ];
    const report = await runValidators(claims, {});
    expect(report.claims_total).toBe(2);
    expect(report.claims_passed).toBe(0);
    expect(report.claims_failed).toBe(2);
    expect(report.drift_entries).toHaveLength(2);
    expect(report.drift_entries[0].source_path).toBe(venturePath);
    expect(report.drift_entries[0].line_number).toBeGreaterThan(0);
    expect(report.drift_entries.every((e) => e.severity === 'error')).toBe(true);
  });

  it('unknown claim type produces warning entry not error', async () => {
    const claims = [{ type: 'never_seen_before', stuff: 'whatever' }];
    const report = await runValidators(claims, {});
    expect(report.claims_failed).toBe(1);
    expect(report.drift_entries[0].validator_id).toBe('registry');
    expect(report.drift_entries[0].severity).toBe('warning');
  });

  it('all-passing case: empty claims yields empty drift report', async () => {
    const report = await runValidators([], {});
    expect(report.claims_total).toBe(0);
    expect(report.claims_passed).toBe(0);
    expect(report.drift_entries).toEqual([]);
  });

  it('maxSeverity returns error when any error present', () => {
    expect(maxSeverity([{ severity: 'info' }, { severity: 'error' }])).toBe('error');
    expect(maxSeverity([{ severity: 'warning' }])).toBe('warning');
    expect(maxSeverity([{ severity: 'info' }])).toBe('info');
    expect(maxSeverity([])).toBe('info');
  });
});
