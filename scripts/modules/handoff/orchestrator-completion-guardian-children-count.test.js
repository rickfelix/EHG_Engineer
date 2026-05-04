import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GUARDIAN = resolve(__dirname, 'orchestrator-completion-guardian.js');

describe('orchestrator-completion-guardian children count gate (QF-20260504-921)', () => {
  const src = readFileSync(GUARDIAN, 'utf8');

  it('declares the CHILDREN_COUNT validation check', () => {
    expect(src).toMatch(/check:\s*'CHILDREN_COUNT'/);
  });

  it('reads expected count from parent.metadata.child_count', () => {
    expect(src).toMatch(/this\.parentData\.metadata\?\.child_count/);
  });

  it('fails validation when delivered count is below expected', () => {
    expect(src).toMatch(/children\?\.length\s*<\s*expectedCount/);
    expect(src).toMatch(/passed:\s*false[\s\S]{0,200}CHILDREN_COUNT|CHILDREN_COUNT[\s\S]{0,200}passed:\s*false/);
  });

  it('check runs inside validateChildren (after the existing all-complete check)', () => {
    const validateChildrenIdx = src.indexOf('async validateChildren');
    const childrenCountIdx = src.indexOf("check: 'CHILDREN_COUNT'");
    const nextMethodIdx = src.indexOf('async validateCrossChildIntegration');
    expect(validateChildrenIdx).toBeGreaterThan(0);
    expect(childrenCountIdx).toBeGreaterThan(validateChildrenIdx);
    expect(childrenCountIdx).toBeLessThan(nextMethodIdx);
  });
});
