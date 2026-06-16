/**
 * SD-LEO-INFRA-DEP-RESOLVER-IGNORE-NON-SDKEY-001
 * Network-free unit tests for the coordinator-audit DEPENDENCY gauge's dependency
 * parsing. The gauge's depOf now delegates to the canonical parseSdDependencies
 * (lib/utils/parse-sd-dependencies.cjs) so prose strings, file paths, gate names,
 * and object placeholders no longer inflate the blocked count, while genuine
 * SD-key deps (string or sd_key/id/sd_id field) still count as unmet/blocking.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseSdDependencies } = require('../../lib/utils/parse-sd-dependencies.cjs');

// Mirror of the gauge's blocked-count predicate (scripts/coordinator-audit.mjs):
//   depOf(s) = parseSdDependencies(s.dependencies)
//   isTerminal(st) = TERMINAL.includes(st)  // unknown/missing real SD-key also unmet
//   blocked if deps.length && deps.some(k => !isTerminal(statusByKey[k]))
const TERMINAL = ['completed', 'cancelled', 'archived'];
const depOf = (s) => parseSdDependencies(s.dependencies);
function isBlocked(s, statusByKey) {
  const deps = depOf(s);
  if (!deps.length) return false;
  return deps.some((k) => !TERMINAL.includes(statusByKey[k]));
}

describe('coordinator-audit dep gauge — parseSdDependencies delegation', () => {
  it('drops prose, file-path, and gate-name entries; keeps only SD-keys (string + object)', () => {
    expect(
      parseSdDependencies([
        'scripts/foo.js',
        'USER_STORY_COVERAGE gate',
        'metadata-contract note',
        'SD-LEO-INFRA-REAL-001',
        { sd_key: 'SD-LEO-INFRA-OBJ-002' },
      ])
    ).toEqual(['SD-LEO-INFRA-REAL-001', 'SD-LEO-INFRA-OBJ-002']);
  });

  it('an SD whose only deps are prose/file-path strings is NOT counted as blocked', () => {
    const s = { dependencies: ['scripts/coordinator-audit.mjs', 'the USER_STORY_COVERAGE gate', 'a guardrail-name note'] };
    expect(depOf(s)).toEqual([]);
    expect(isBlocked(s, {})).toBe(false);
  });

  it('a genuine non-terminal SD-key dep STILL blocks', () => {
    const s = { dependencies: ['SD-LEO-INFRA-OPEN-001'] };
    expect(isBlocked(s, { 'SD-LEO-INFRA-OPEN-001': 'in_progress' })).toBe(true);
  });

  it('an unknown/missing REAL SD-key dep still counts as unmet (line-185 semantics preserved)', () => {
    const s = { dependencies: ['SD-LEO-INFRA-GHOST-999'] };
    expect(isBlocked(s, {})).toBe(true); // statusByKey has no entry -> undefined -> not terminal -> blocked
  });

  it('a terminal SD-key dep does NOT block; mixed prose+terminal is dep-satisfied', () => {
    const s = { dependencies: ['scripts/foo.js', 'SD-LEO-INFRA-DONE-001'] };
    expect(depOf(s)).toEqual(['SD-LEO-INFRA-DONE-001']);
    expect(isBlocked(s, { 'SD-LEO-INFRA-DONE-001': 'completed' })).toBe(false);
  });

  it('object dep carrying id/sd_id with an SD-key is kept', () => {
    expect(parseSdDependencies([{ id: 'SD-LEO-INFRA-ID-003' }, { sd_id: 'SD-LEO-INFRA-SDID-004' }]))
      .toEqual(['SD-LEO-INFRA-ID-003', 'SD-LEO-INFRA-SDID-004']);
  });
});
