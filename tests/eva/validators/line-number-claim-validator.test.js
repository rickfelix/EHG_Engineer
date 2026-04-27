import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { validate } from '../../../scripts/eva/validators/line-number-claim-validator.mjs';

const FIXTURE = `line one
line two
gateType: 'none',
line four
`;

const tmpRoot = resolve(tmpdir(), `line-num-test-${Date.now()}`);
const fixturePath = 'fixture.txt';

describe('LineNumberClaimValidator', () => {
  beforeAll(() => {
    mkdirSync(tmpRoot, { recursive: true });
    writeFileSync(resolve(tmpRoot, fixturePath), FIXTURE, 'utf-8');
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('passes when expected_excerpt is at line', async () => {
    const result = await validate(
      { path: fixturePath, line: 3, expected_excerpt: "gateType: 'none'" },
      { repo_root: tmpRoot },
    );
    expect(result.passed).toBe(true);
  });

  it('fails when excerpt is at a different line', async () => {
    const result = await validate(
      { path: fixturePath, line: 1, expected_excerpt: 'gateType' },
      { repo_root: tmpRoot },
    );
    expect(result.passed).toBe(false);
    expect(result.severity).toBe('warning');
  });

  it('out-of-bounds line returns error', async () => {
    const result = await validate(
      { path: fixturePath, line: 99, expected_excerpt: 'whatever' },
      { repo_root: tmpRoot },
    );
    expect(result.passed).toBe(false);
    expect(result.observed).toContain('only');
  });

  it('rejects malformed claim', async () => {
    const result = await validate({ path: fixturePath }, { repo_root: tmpRoot });
    expect(result.passed).toBe(false);
    expect(result.expected).toContain('line:int');
  });
});
