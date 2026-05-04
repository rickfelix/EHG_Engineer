import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const GUARDIAN = resolve(dirname(fileURLToPath(import.meta.url)), 'orchestrator-completion-guardian.js');
const SRC = readFileSync(GUARDIAN, 'utf8');

describe('orchestrator-completion-guardian children count gate (QF-20260504-921)', () => {
  it('declares CHILDREN_COUNT and reads parent.metadata.child_count', () => {
    expect(SRC).toMatch(/check:\s*'CHILDREN_COUNT'/);
    expect(SRC).toMatch(/this\.parentData\.metadata\?\.child_count/);
  });

  it('fails validation when delivered count is below expected', () => {
    expect(SRC).toMatch(/children\?\.length\s*<\s*expectedCount/);
  });
});
