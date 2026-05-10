// Tests for QF-20260504-251 — leo SD creator mapToDbType drift
// Pre-fix: testing/qa mapped to 'qa' but DB sd_type_check rejected 'qa'.
// Post-fix: testing/qa map to 'infrastructure' (valid). VALID_DB_SD_TYPES
// list aligned with actual DB constraint enum values.

import { describe, it, expect } from 'vitest';
import path from 'node:path';

// We can't easily import the function (script is a CLI entry, not a module).
// Instead spawn node and exercise the mapping via a tiny shim that requires
// the file's mapToDbType into a probe.
const SCRIPT_PATH = path.resolve(__dirname, '../leo-create-sd.js').replace(/\\/g, '/');

function probeMapper(userType) {
  const { spawnSync } = require('node:child_process');
  const fs = require('node:fs');
  // SD-FDBK-INFRA-TYPE-SOURCE-TRUTH-001 FR-4: mapToDbType now imports
  // assertValidSdType from lib/sd-type-enum.js. Inject the lib source so the
  // extracted function can resolve the dep in the child eval context.
  const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
  const enumSrc = fs.readFileSync(
    path.resolve(__dirname, '../../lib/sd-type-enum.js')
  , 'utf8').replace(/\bexport\s+(const|function)\b/g, '$1');
  const validMatch = src.match(/const VALID_DB_SD_TYPES = \[([\s\S]*?)\];/);
  const fnMatch = src.match(/function mapToDbType\(userType\)\s*\{[\s\S]*?\n\}/);
  if (!validMatch || !fnMatch) throw new Error('Could not extract mapper from script');
  const code =
    enumSrc + '\n' +
    validMatch[0] + '\n' +
    fnMatch[0] + '\n' +
    'process.stdout.write(String(mapToDbType(' + JSON.stringify(userType) + ')));';
  const r = spawnSync('node', ['-e', code], { encoding: 'utf8' });
  return r.stdout.trim();
}

describe('QF-251 MAPPER-1: testing maps to infrastructure (was qa, rejected by DB)', () => {
  it('returns infrastructure for testing input', () => {
    expect(probeMapper('testing')).toBe('infrastructure');
  });
});

describe('QF-251 MAPPER-2: qa maps to infrastructure (was qa, rejected by DB)', () => {
  it('returns infrastructure for qa input', () => {
    expect(probeMapper('qa')).toBe('infrastructure');
  });
});

describe('QF-251 MAPPER-3: spike maps to discovery_spike (newly added)', () => {
  it('returns discovery_spike', () => {
    expect(probeMapper('spike')).toBe('discovery_spike');
  });
});

describe('QF-251 MAPPER-4: ux_debt maps to ux_debt (newly added)', () => {
  it('returns ux_debt', () => {
    expect(probeMapper('ux_debt')).toBe('ux_debt');
  });
});

describe('QF-251 MAPPER-5: existing mappings preserved', () => {
  it('feature → feature', () => { expect(probeMapper('feature')).toBe('feature'); });
  it('fix → bugfix', () => { expect(probeMapper('fix')).toBe('bugfix'); });
  it('infra → infrastructure', () => { expect(probeMapper('infra')).toBe('infrastructure'); });
  it('refactor → refactor', () => { expect(probeMapper('refactor')).toBe('refactor'); });
  it('orch → orchestrator', () => { expect(probeMapper('orch')).toBe('orchestrator'); });
});

describe('QF-251 MAPPER-6: VALID_DB_SD_TYPES no longer contains stale qa/library/fix entries', () => {
  it('list aligns with DB sd_type_check constraint', () => {
    const src = require('node:fs').readFileSync(SCRIPT_PATH, 'utf8');
    const m = src.match(/const VALID_DB_SD_TYPES = \[([\s\S]*?)\];/);
    expect(m).toBeTruthy();
    const listLiteral = m[1];
    // Stale entries — must NOT appear in current list
    expect(listLiteral).not.toMatch(/'qa'/);
    expect(listLiteral).not.toMatch(/'library'/);
    expect(listLiteral).not.toMatch(/'fix'/);
    // Newly added entries — must appear
    expect(listLiteral).toMatch(/'discovery_spike'/);
    expect(listLiteral).toMatch(/'ux_debt'/);
  });
});
