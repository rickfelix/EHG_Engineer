/**
 * Workflow-YAML lint guard unit tests — SD-LEO-FIX-UNIT-TIER-STARTUP-001 (FR-3).
 *
 * Exercises the PURE validateWorkflowYaml() (no filesystem) + resolveWorkflowFiles()
 * arg passthrough. The bad-plain-scalar fixture reproduces the exact defect class that
 * broke unit-tier.yml (an unquoted ': ' colon-space parsed as a mapping separator).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateWorkflowYaml, resolveWorkflowFiles } from '../../scripts/check-workflow-yaml.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, '..', 'fixtures', 'workflow-yaml', 'bad-plain-scalar.yml');

const VALID_WORKFLOW = `name: Example
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: summary
        run: |
          node -e "console.log('Quarantined files: '+1)"
`;

describe('validateWorkflowYaml (pure)', () => {
  it('returns {ok:true} for a valid workflow YAML string', () => {
    expect(validateWorkflowYaml(VALID_WORKFLOW)).toEqual({ ok: true });
  });

  it('a block-scalar run: keeps the embedded colon-space literal (no parse error)', () => {
    // The same ": " content that breaks a plain scalar is safe under "run: |".
    expect(validateWorkflowYaml(VALID_WORKFLOW).ok).toBe(true);
  });

  it('returns {ok:false, error} for the bad-plain-scalar fixture (the defect class)', () => {
    const bad = readFileSync(FIXTURE, 'utf8');
    const res = validateWorkflowYaml(bad);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/mapping/i); // "bad indentation of a mapping entry"
  });

  it('never throws on garbage input — returns a structured failure', () => {
    const res = validateWorkflowYaml('foo: [unterminated');
    expect(res.ok).toBe(false);
    expect(typeof res.error).toBe('string');
  });
});

describe('resolveWorkflowFiles', () => {
  it('returns explicit args verbatim when provided', () => {
    expect(resolveWorkflowFiles(['a.yml', 'b.yaml'])).toEqual(['a.yml', 'b.yaml']);
  });

  it('returns an array when walking the default dir (no args)', () => {
    // From the repo root this finds .github/workflows/*; shape assertion only
    // (count varies). Pure-arg path is asserted above.
    expect(Array.isArray(resolveWorkflowFiles([]))).toBe(true);
  });
});
