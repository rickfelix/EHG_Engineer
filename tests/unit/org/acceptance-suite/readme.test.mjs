/**
 * SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001 -- TS-9: README.md names every deferred
 * check/fixture with its owning SD, and states E6's deferral explicitly.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const README_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../../../lib/org/acceptance-suite/README.md');
const readme = readFileSync(README_PATH, 'utf8');

describe('TS-9: README documents the deferred-checks coverage boundary', () => {
  const owningSdKeys = [
    'SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001',
    'SD-LEO-INFRA-REGRESSION-GATED-SELF-001',
    'SD-LEO-INFRA-AGENT-MEMORY-WORKING-001',
    'SD-LEO-INFRA-DUTY-LEDGER-TRACING-001',
    'SD-LEO-INFRA-DEFINITION-HANDOFF-ASSURANCE-001',
  ];

  for (const sdKey of owningSdKeys) {
    it(`names ${sdKey} as the owner of a deferred item`, () => {
      expect(readme).toContain(sdKey);
    });
  }

  it('states E6 is a Phase-2 commissioning predicate outside this SD\'s completable scope', () => {
    expect(readme).toMatch(/E6/);
    expect(readme).toMatch(/3c4a6781/);
    expect(readme.toLowerCase()).toMatch(/not claimed as met by this sd|not this sd's completion criterion/);
  });
});
