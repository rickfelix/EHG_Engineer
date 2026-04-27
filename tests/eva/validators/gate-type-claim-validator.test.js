import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { validate, parseStages } from '../../../scripts/eva/validators/gate-type-claim-validator.mjs';

const FIXTURE = `
export const stages = [
  {
    stageNumber: 22,
    stageName: 'Distribution Setup',
    gateType: 'none',
  },
  {
    stageNumber: 23,
    stageName: 'Launch Readiness Kill Gate',
    gateType: 'kill',
    gateLabel: 'KILL GATE',
  },
  {
    stageNumber: 26,
    stageName: 'Growth Playbook',
    gateType: 'none',
  },
];
`;

const tmpRoot = resolve(tmpdir(), `gate-type-test-${Date.now()}`);
const fixturePath = resolve(tmpRoot, 'venture-workflow.ts');

describe('GateTypeClaimValidator', () => {
  beforeAll(() => {
    mkdirSync(tmpRoot, { recursive: true });
    writeFileSync(fixturePath, FIXTURE, 'utf-8');
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('parseStages extracts all stage blocks', () => {
    const stages = parseStages(FIXTURE);
    expect(stages).toHaveLength(3);
    expect(stages[0]).toMatchObject({ stageNumber: 22, gateType: 'none', stageName: 'Distribution Setup' });
    expect(stages[1]).toMatchObject({ stageNumber: 23, gateType: 'kill' });
    expect(stages[2]).toMatchObject({ stageNumber: 26, gateType: 'none' });
  });

  it('case-study: S22 claim of gateType=kill produces FAILED with line number', async () => {
    const result = await validate(
      { stage_number: 22, expected_gate: 'kill', source_path: fixturePath },
      {},
    );
    expect(result.passed).toBe(false);
    expect(result.observed).toContain("gateType='none'");
    expect(result.line_number).toBeGreaterThan(0);
    expect(result.remediation_hint).toContain('Brainstorm claim is wrong');
  });

  it('case-study: S26 claim of gateType=promotion produces FAILED', async () => {
    const result = await validate(
      { stage_number: 26, expected_gate: 'promotion', source_path: fixturePath },
      {},
    );
    expect(result.passed).toBe(false);
    expect(result.observed).toContain("gateType='none'");
  });

  it('passing case: S23 actually IS a kill gate', async () => {
    const result = await validate(
      { stage_number: 23, expected_gate: 'kill', source_path: fixturePath },
      {},
    );
    expect(result.passed).toBe(true);
    expect(result.severity).toBe('info');
  });

  it('rejects malformed claim shape', async () => {
    const result = await validate({ stage_number: 'not-a-number' }, {});
    expect(result.passed).toBe(false);
    expect(result.expected).toContain('expected_gate');
  });

  it('handles missing stage_number', async () => {
    const result = await validate(
      { stage_number: 999, expected_gate: 'kill', source_path: fixturePath },
      {},
    );
    expect(result.passed).toBe(false);
    expect(result.observed).toContain('no stage block matched');
  });
});
