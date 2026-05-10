/**
 * leo-create-sd.js mapToDbType — fail-loud + canonical mapping coverage.
 *
 * SD: SD-FDBK-INFRA-TYPE-SOURCE-TRUTH-001 (FR-4 + FR-7)
 *
 * 6 cases per FR-7:
 *   1. happy: feature → feature (canonical)
 *   2. happy: bugfix → bugfix (canonical)
 *   3. synonym: fix → bugfix (synonym layer preserved for backward compat)
 *   4. synonym: feat → feature
 *   5. fail-loud: garbage → throws (post-FR-4 — replaces silent default-to-feature)
 *   6. fail-loud: empty string → throws
 *
 * Probe technique: extracts `mapToDbType` source + `VALID_DB_SD_TYPES` from
 * leo-create-sd.js AND splices the lib/sd-type-enum.js exports inline so the
 * extracted function can resolve `assertValidSdType`. Mirrors the existing
 * leo-create-sd-mapper.test.js probe but with the dependency injected.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.resolve(__dirname, '../leo-create-sd.js').replace(/\\/g, '/');
const SD_TYPE_ENUM_PATH = path.resolve(__dirname, '../../lib/sd-type-enum.js').replace(/\\/g, '/');

/**
 * Run mapToDbType(userType) in a child node process. Returns { ok, stdout, stderr, code }.
 */
function runMapper(userType) {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  const enumSrc = readFileSync(SD_TYPE_ENUM_PATH, 'utf8');

  // Strip the `export ` prefix from sd-type-enum.js so the source can be eval'd in CJS.
  const enumStripped = enumSrc.replace(/\bexport\s+(const|function)\b/g, '$1');

  const validMatch = src.match(/const VALID_DB_SD_TYPES = \[([\s\S]*?)\];/);
  const fnMatch = src.match(/function mapToDbType\(userType\)\s*\{[\s\S]*?\n\}/);
  if (!validMatch || !fnMatch) throw new Error('Could not extract mapper from script');

  const code = [
    enumStripped,
    validMatch[0],
    fnMatch[0],
    'try {',
    '  const result = mapToDbType(' + JSON.stringify(userType) + ');',
    '  process.stdout.write("OK:" + String(result));',
    '} catch (e) {',
    '  process.stdout.write("THROW:" + (e && e.message ? e.message : String(e)));',
    '  process.exit(2);',
    '}',
  ].join('\n');

  const r = spawnSync('node', ['-e', code], { encoding: 'utf8' });
  return {
    code: r.status,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

describe('FR-7 mapToDbType: 6-case coverage (canonical + fail-loud)', () => {
  it('Case 1: feature → feature (happy, canonical)', () => {
    const r = runMapper('feature');
    expect(r.stdout).toBe('OK:feature');
  });

  it('Case 2: bugfix → bugfix (happy, canonical)', () => {
    const r = runMapper('bugfix');
    expect(r.stdout).toBe('OK:bugfix');
  });

  it('Case 3: fix → bugfix (synonym layer; backward-compat per TR-2)', () => {
    const r = runMapper('fix');
    expect(r.stdout).toBe('OK:bugfix');
  });

  it('Case 4: feat → feature (synonym)', () => {
    const r = runMapper('feat');
    expect(r.stdout).toBe('OK:feature');
  });

  it('Case 5: garbage (no synonym match) → throws with canonical enum list (FR-4 fail-loud)', () => {
    const r = runMapper('garbage');
    expect(r.stdout).toMatch(/^THROW:/);
    expect(r.stdout).toMatch(/Invalid sd_type/);
    // Error message must include the canonical enum list (per FR-1 AC-1.3)
    expect(r.stdout).toMatch(/feature/);
    expect(r.stdout).toMatch(/bugfix/);
    expect(r.stdout).toMatch(/infrastructure/);
    expect(r.code).toBe(2);
  });

  it('Case 6: empty string → throws (FR-4 fail-loud)', () => {
    const r = runMapper('');
    expect(r.stdout).toMatch(/^THROW:/);
    expect(r.stdout).toMatch(/Invalid sd_type/);
    expect(r.code).toBe(2);
  });
});
