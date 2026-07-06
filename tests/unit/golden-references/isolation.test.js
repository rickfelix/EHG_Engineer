import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scanContent, scanReferencesDir, classifySpecifier, ALLOWED_NPM } from '../../../lib/governance/golden-reference-isolation.js';
import { checkGuide, REQUIRED_GUIDE_SECTIONS } from '../../../lib/governance/golden-reference-rubric.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('isolation law (TS-1)', () => {
  it('MISS: the planted violation fixture is flagged (repo-internal + non-literal imports)', () => {
    const content = readFileSync(join(REPO_ROOT, 'tests', 'fixtures', 'golden-references', 'planted-violation.mjs'), 'utf8');
    const violations = scanContent(content, 'planted-violation.mjs');
    expect(violations.some((v) => v.kind === 'violation:relative_or_absolute' && v.specifier.includes('lib/supabase-client'))).toBe(true);
    expect(violations.some((v) => v.kind === 'violation:relative_or_absolute' && v.specifier.includes('scripts/gauge-runner'))).toBe(true);
    expect(violations.some((v) => v.kind === 'violation:non_literal_import')).toBe(true);
  });

  it('PASS: the clean golden-references/ tree has zero violations', () => {
    const result = scanReferencesDir(REPO_ROOT);
    expect(result.violations).toEqual([]);
  });

  it('allowlist admits both builtin forms and the vetted npm set only', () => {
    expect(classifySpecifier('fs')).toBe('builtin');
    expect(classifySpecifier('node:fs')).toBe('builtin');
    for (const p of ALLOWED_NPM) expect(classifySpecifier(p)).toBe('vetted_npm');
    expect(classifySpecifier('@supabase/supabase-js/dist/main')).toBe('vetted_npm');
    expect(classifySpecifier('lodash')).toBe('violation:unvetted_package');
    expect(classifySpecifier('../lib/anything.js')).toBe('violation:relative_or_absolute');
  });

  it('CRLF-safe: violations detected in CRLF-ending content', () => {
    const v = scanContent("import x from '../../lib/x.js';\r\nconst y = 1;\r\n", 'crlf.mjs');
    expect(v).toHaveLength(1);
  });
});

describe('application-guide rubric (TS-2)', () => {
  const compliant = ['# Guide', '## Inputs', 'a', '## Adaptation points', 'b', '## Invariants', 'c', '## Acceptance (both directions)', 'd'].join('\n');

  it('PASS: a compliant guide passes with all sections found', () => {
    const r = checkGuide(compliant);
    expect(r.ok).toBe(true);
    expect(r.found).toEqual([...REQUIRED_GUIDE_SECTIONS]);
  });

  it('MISS: a guide missing a section is rejected naming the section', () => {
    const r = checkGuide(compliant.replace('## Invariants', '## Notes'));
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['Invariants']);
  });

  it('heading depth and case are tolerated; body mentions are not headings', () => {
    expect(checkGuide(compliant.replace('## Inputs', '### INPUTS')).ok).toBe(true);
    expect(checkGuide(compliant.replace('## Inputs', 'the inputs are listed below')).ok).toBe(false);
  });
});

describe('gauge arming (TS-4)', () => {
  it('DEFAULT_SCAN_DIRS includes golden-references (source pin on the sanctioned 1-line edit)', () => {
    const src = readFileSync(join(REPO_ROOT, 'lib', 'governance', 'revisit-tags.js'), 'utf8');
    expect(src).toMatch(/DEFAULT_SCAN_DIRS\s*=\s*\[[^\]]*'golden-references'/);
  });

  it('README doctrine examples contribute zero parsed tags (no gauge self-trip)', async () => {
    const { parseRevisitTags } = await import('../../../lib/governance/revisit-tags.js');
    const readme = readFileSync(join(REPO_ROOT, 'golden-references', 'README.md'), 'utf8');
    expect(parseRevisitTags(readme, 'golden-references/README.md')).toEqual([]);
  });
});
