// SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-5 (class e): deploy-config completeness checker.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { isPlaceholderValue, scanTomlForPlaceholders, checkDeployConfigCompleteness } from '../../../lib/venture-deploy/config-completeness.js';

describe('isPlaceholderValue (pure)', () => {
  it('flags the exact known D1 scaffold placeholder', () => {
    expect(isPlaceholderValue('database_id', '00000000-0000-0000-0000-000000000000')).toBe(true);
  });

  it('does not flag a real-looking UUID as a placeholder', () => {
    expect(isPlaceholderValue('database_id', 'bdbaef59-7e73-478e-9e57-57b4bf8d853b')).toBe(false);
  });

  it('flags generic placeholder-shaped tokens regardless of key', () => {
    expect(isPlaceholderValue('api_key', 'CHANGEME')).toBe(true);
    expect(isPlaceholderValue('secret', 'your-secret-here')).toBe(true);
    expect(isPlaceholderValue('token', '<your-token>')).toBe(true);
    expect(isPlaceholderValue('id', 'xxxx')).toBe(true);
  });

  it('does not flag ordinary real values', () => {
    expect(isPlaceholderValue('name', 'altifyai')).toBe(false);
    expect(isPlaceholderValue('main', 'src/index.js')).toBe(false);
  });

  it('handles non-string values without throwing', () => {
    expect(isPlaceholderValue('flag', true)).toBe(false);
    expect(isPlaceholderValue('flag', null)).toBe(false);
    expect(isPlaceholderValue('flag', undefined)).toBe(false);
  });

  it('independent sweep finding: flags an empty value as a placeholder, for any key', () => {
    expect(isPlaceholderValue('database_id', '')).toBe(true);
    expect(isPlaceholderValue('VITE_CLERK_PUBLISHABLE_KEY', '')).toBe(true);
    expect(isPlaceholderValue('VITE_CLERK_PUBLISHABLE_KEY', '   ')).toBe(true);
  });

  it('independent sweep finding: flags realistic unfilled Clerk publishable key placeholders (the OTHER half of the AltifyAI incident, per this module\'s own header)', () => {
    expect(isPlaceholderValue('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_placeholder')).toBe(true);
    expect(isPlaceholderValue('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_YOUR_KEY_HERE')).toBe(true);
    expect(isPlaceholderValue('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_xxxxxxxxxxxx')).toBe(true);
    expect(isPlaceholderValue('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_')).toBe(true);
    expect(isPlaceholderValue('VITE_CLERK_PUBLISHABLE_KEY', 'YOUR_CLERK_PUBLISHABLE_KEY')).toBe(true);
  });

  it('does not flag a real-looking Clerk publishable key as a placeholder', () => {
    expect(isPlaceholderValue('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_Y2xlcmsuc29tZS1yZWFsLWxvb2tpbmcta2V5JA')).toBe(false);
    expect(isPlaceholderValue('VITE_CLERK_PUBLISHABLE_KEY', 'pk_live_Y2xlcmsuc29tZS1yZWFsLWxvb2tpbmcta2V5JA')).toBe(false);
  });
});

describe('scanTomlForPlaceholders (pure)', () => {
  it('finds and flags a placeholder key=value line among real ones', () => {
    const toml = [
      'name = "altifyai"',
      'database_id = "00000000-0000-0000-0000-000000000000"',
      'binding = "DB"',
    ].join('\n');
    const findings = scanTomlForPlaceholders(toml);
    const dbId = findings.find((f) => f.key === 'database_id');
    expect(dbId).toEqual({ key: 'database_id', value: '00000000-0000-0000-0000-000000000000', placeholder: true });
    const name = findings.find((f) => f.key === 'name');
    expect(name.placeholder).toBe(false);
  });

  it('ignores non-key=value lines (comments, table headers, blank lines)', () => {
    const toml = [
      '# a comment',
      '[[d1_databases]]',
      '',
      'binding = "DB"',
    ].join('\n');
    const findings = scanTomlForPlaceholders(toml);
    expect(findings).toEqual([{ key: 'binding', value: 'DB', placeholder: false }]);
  });

  it('handles an empty/undefined source without throwing', () => {
    expect(scanTomlForPlaceholders('')).toEqual([]);
    expect(scanTomlForPlaceholders(undefined)).toEqual([]);
  });
});

describe('checkDeployConfigCompleteness (I/O)', () => {
  let dir;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'crack-gate-fr5-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns checked:false with a reason when no repoPath is given', () => {
    expect(checkDeployConfigCompleteness(null)).toEqual({ checked: false, reason: 'no local clone path provided', placeholders: [] });
  });

  it('returns checked:false with a reason when the repo has no wrangler.toml', () => {
    const noWranglerDir = join(dir, 'no-wrangler');
    mkdirSync(noWranglerDir, { recursive: true });
    expect(checkDeployConfigCompleteness(noWranglerDir)).toEqual({ checked: false, reason: 'no wrangler.toml found at this path', placeholders: [] });
  });

  it('finds the real, live AltifyAI-shaped placeholder against an actual file on disk (not a fixture string)', () => {
    const realWranglerDir = join(dir, 'with-placeholder');
    mkdirSync(realWranglerDir, { recursive: true });
    writeFileSync(join(realWranglerDir, 'wrangler.toml'), [
      'name = "altifyai"',
      'compatibility_date = "2025-10-01"',
      'main = "src/index.js"',
      '',
      '[[d1_databases]]',
      'binding = "DB"',
      'database_name = "altifyai"',
      'database_id = "00000000-0000-0000-0000-000000000000"',
    ].join('\n'));

    const result = checkDeployConfigCompleteness(realWranglerDir);
    expect(result.checked).toBe(true);
    expect(result.placeholders).toEqual([{ key: 'database_id', value: '00000000-0000-0000-0000-000000000000' }]);
  });

  it('reports zero placeholders for a fully-configured wrangler.toml', () => {
    const realDir = join(dir, 'fully-configured');
    mkdirSync(realDir, { recursive: true });
    writeFileSync(join(realDir, 'wrangler.toml'), [
      'name = "some-venture"',
      'database_id = "bdbaef59-7e73-478e-9e57-57b4bf8d853b"',
    ].join('\n'));

    const result = checkDeployConfigCompleteness(realDir);
    expect(result.checked).toBe(true);
    expect(result.placeholders).toEqual([]);
  });
});
