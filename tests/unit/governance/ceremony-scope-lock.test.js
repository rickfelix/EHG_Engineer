/**
 * SD-LEO-INFRA-CAPTURE-CHANNEL-DISPOSITION-001 (FR-5) — ceremony scope-lock, pure core.
 *
 * Pure tier: no git subprocess, no filesystem. The CLI (scripts/lint/capture-channel-ceremony-
 * scope-lock-lint.mjs) is the thin IO shell that supplies real `git diff` output to these functions.
 */
import { describe, it, expect } from 'vitest';
import {
  PATH_BAN, WITNESS_CONTENT_FILE, SETTINGS_JSON_PATH, findBannedTouches, hasNetWitnessMarkerLoss,
  evaluateCeremonyScopeLock, evaluateSettingsJsonChange,
} from '../../../lib/governance/ceremony-scope-lock.js';

const BASE_SETTINGS = JSON.stringify({
  env: { FOO: 'bar' },
  statusLine: { type: 'command', command: 'node statusline.cjs' },
  hooks: {
    Stop: [{ hooks: [{ type: 'command', command: 'node scripts/hooks/post-completion-tail-enforcement.cjs', timeout: 10 }] }],
    PostToolUse: [{ hooks: [{ type: 'command', command: 'node scripts/hooks/foo.cjs', timeout: 5 }] }],
  },
  permissions: { allow: [] },
});

describe('findBannedTouches', () => {
  it('names every ceremony surface -- TESTING-found gap items included, not just the original 2 files', () => {
    // Confirms the surface actually covers the dispatcher gap TESTING evidence 8c4733fd found.
    // .claude/settings.json moved off this path-level list onto a content-level check
    // (QF-20260830-283, ratification 0daf3bd8/iii) -- see evaluateSettingsJsonChange below.
    expect(PATH_BAN).toContain('scripts/hooks/post-completion-tail-enforcement.cjs');
    expect(PATH_BAN).toContain('scripts/hooks/stop-subagent-enforcement/post-completion-validator.js');
    expect(PATH_BAN).toContain('scripts/hooks/stop-subagent-enforcement.js');
    expect(PATH_BAN).not.toContain(SETTINGS_JSON_PATH);
  });

  it('flags a diff that touches the tail-enforcement hook', () => {
    const touches = findBannedTouches(['README.md', 'scripts/hooks/post-completion-tail-enforcement.cjs']);
    expect(touches).toEqual(['scripts/hooks/post-completion-tail-enforcement.cjs']);
  });

  it('flags a diff that touches the dispatcher (a second TESTING-found gap)', () => {
    const touches = findBannedTouches(['scripts/hooks/stop-subagent-enforcement.js']);
    expect(touches).toEqual(['scripts/hooks/stop-subagent-enforcement.js']);
  });

  it('passes on an unrelated diff -- this SD\'s own real EXEC changes', () => {
    const touches = findBannedTouches([
      'lib/governance/gauge-registry.js',
      'lib/governance/drain-inventory.js',
      'lib/coordinator/feedback-sla-gauge.cjs',
      'scripts/lint/capture-channel-ceremony-scope-lock-lint.mjs',
      'docs/architecture/invariant-gauge-finding-disposition-proposal.md',
    ]);
    expect(touches).toEqual([]);
  });

  it('returns [] for a non-array input rather than throwing', () => {
    expect(findBannedTouches(undefined)).toEqual([]);
    expect(findBannedTouches(null)).toEqual([]);
  });
});

describe('hasNetWitnessMarkerLoss', () => {
  it('flags a diff that REMOVES the completion_flag_witness marker with no replacement', () => {
    const diff = [
      '--- a/scripts/capture-completion-flags.js',
      '+++ b/scripts/capture-completion-flags.js',
      "-const WITNESS_TUPLE = Object.freeze({ type: 'enhancement', category: 'completion_flag_witness', status: 'backlog' });",
      "+const WITNESS_TUPLE = Object.freeze({ type: 'enhancement', category: 'harness_backlog', status: 'backlog' });",
    ].join('\n');
    expect(hasNetWitnessMarkerLoss(diff)).toBe(true);
  });

  it('does NOT flag an unrelated edit to the same file that leaves the marker count unchanged', () => {
    const diff = [
      '--- a/scripts/capture-completion-flags.js',
      '+++ b/scripts/capture-completion-flags.js',
      '-// old comment unrelated to the witness tuple',
      '+// new comment unrelated to the witness tuple, still mentions completion_flag_witness in prose',
    ].join('\n');
    // Both lines mention the marker once each -- removed(1) is not > added(1), so no net loss.
    expect(hasNetWitnessMarkerLoss(diff)).toBe(false);
  });

  it('does NOT flag a diff that only ADDS a reference to the marker (e.g. a new comment)', () => {
    const diff = [
      '--- a/scripts/capture-completion-flags.js',
      '+++ b/scripts/capture-completion-flags.js',
      '+// see completion_flag_witness below',
    ].join('\n');
    expect(hasNetWitnessMarkerLoss(diff)).toBe(false);
  });

  it('returns false for empty/null diff text', () => {
    expect(hasNetWitnessMarkerLoss('')).toBe(false);
    expect(hasNetWitnessMarkerLoss(null)).toBe(false);
  });

  it('ignores the diff header lines (---/+++) even though they carry the filename, not the marker', () => {
    const diff = '--- a/scripts/capture-completion-flags.js\n+++ b/scripts/capture-completion-flags.js\n';
    expect(hasNetWitnessMarkerLoss(diff)).toBe(false);
  });
});

describe('evaluateCeremonyScopeLock — the combined verdict', () => {
  it('[TS-6] passes on this SD\'s real, intended EXEC diff', () => {
    const result = evaluateCeremonyScopeLock([
      'lib/governance/gauge-registry.js',
      'lib/governance/drain-inventory.js',
      'lib/coordinator/feedback-sla-gauge.cjs',
      'scripts/drain-inventory.mjs',
      'scripts/lint/capture-channel-ceremony-scope-lock-lint.mjs',
      'lib/governance/ceremony-scope-lock.js',
      'docs/architecture/invariant-gauge-finding-disposition-proposal.md',
    ], null);
    expect(result.pass).toBe(true);
    expect(result.bannedTouches).toEqual([]);
    expect(result.witnessMarkerLost).toBe(false);
  });

  it('[TS-5] fails on a diff modifying the tail-enforcement hook', () => {
    const result = evaluateCeremonyScopeLock(['scripts/hooks/post-completion-tail-enforcement.cjs'], null);
    expect(result.pass).toBe(false);
    expect(result.bannedTouches).toEqual(['scripts/hooks/post-completion-tail-enforcement.cjs']);
  });

  it('[TS-5b] fails on a settings.json diff removing the Stop-hook entry, naming the protected key', () => {
    const mutated = JSON.parse(BASE_SETTINGS);
    mutated.hooks.Stop = [];
    const result = evaluateCeremonyScopeLock(
      [SETTINGS_JSON_PATH], null, { oldText: BASE_SETTINGS, newText: JSON.stringify(mutated) },
    );
    expect(result.pass).toBe(false);
    expect(result.settingsJsonProtectedKey).toBe('hooks.Stop');
  });

  it('fails closed when settings.json changed but the diff text could not be resolved', () => {
    const result = evaluateCeremonyScopeLock([SETTINGS_JSON_PATH], null, null);
    expect(result.pass).toBe(false);
    expect(result.settingsJsonProtectedKey).toMatch(/unresolvable/);
  });

  it('fails when the witness marker is net-removed, even with no banned path touched', () => {
    const diff = "-category: 'completion_flag_witness',\n+category: 'harness_backlog',";
    const result = evaluateCeremonyScopeLock(['scripts/capture-completion-flags.js'], diff);
    expect(result.pass).toBe(false);
    expect(result.bannedTouches).toEqual([]);
    expect(result.witnessMarkerLost).toBe(true);
  });

  it('passes when capture-completion-flags.js changed but the witness marker survives intact', () => {
    const result = evaluateCeremonyScopeLock(['scripts/capture-completion-flags.js'], null);
    expect(result.pass).toBe(true);
  });
});

// QF-20260830-283 (chairman ratification 0daf3bd8/iii): four required fixtures.
describe('evaluateSettingsJsonChange', () => {
  it('[fixture 1] a command-string-only edit to a non-protected hook entry passes', () => {
    const mutated = JSON.parse(BASE_SETTINGS);
    mutated.hooks.PostToolUse[0].hooks[0].command = 'node scripts/hooks/foo.cjs --verbose';
    const result = evaluateSettingsJsonChange(BASE_SETTINGS, JSON.stringify(mutated));
    expect(result).toEqual({ pass: true, protectedKey: null });
  });

  it('[fixture 2] a Stop-hook edit refuses, naming the key', () => {
    const mutated = JSON.parse(BASE_SETTINGS);
    mutated.hooks.Stop[0].hooks[0].command = 'node scripts/hooks/post-completion-tail-enforcement.cjs --loud';
    const result = evaluateSettingsJsonChange(BASE_SETTINGS, JSON.stringify(mutated));
    expect(result.pass).toBe(false);
    expect(result.protectedKey).toBe('hooks.Stop');
  });

  it('[fixture 3] adding a hook entry refuses, naming the event', () => {
    const mutated = JSON.parse(BASE_SETTINGS);
    mutated.hooks.PostToolUse[0].hooks.push({ type: 'command', command: 'node scripts/hooks/new.cjs', timeout: 5 });
    const result = evaluateSettingsJsonChange(BASE_SETTINGS, JSON.stringify(mutated));
    expect(result.pass).toBe(false);
    expect(result.protectedKey).toMatch(/hooks\.PostToolUse.*added\/removed/);
  });

  it('[fixture 4] an unrelated top-level key edit (env) refuses', () => {
    const mutated = JSON.parse(BASE_SETTINGS);
    mutated.env.FOO = 'baz';
    const result = evaluateSettingsJsonChange(BASE_SETTINGS, JSON.stringify(mutated));
    expect(result.pass).toBe(false);
    expect(result.protectedKey).toBe('env');
  });

  it('refuses a permissions edit', () => {
    const mutated = JSON.parse(BASE_SETTINGS);
    mutated.permissions.allow = ['Bash(*)'];
    const result = evaluateSettingsJsonChange(BASE_SETTINGS, JSON.stringify(mutated));
    expect(result.pass).toBe(false);
    expect(result.protectedKey).toBe('permissions');
  });

  it('refuses a statusLine edit', () => {
    const mutated = JSON.parse(BASE_SETTINGS);
    mutated.statusLine.command = 'node other.cjs';
    const result = evaluateSettingsJsonChange(BASE_SETTINGS, JSON.stringify(mutated));
    expect(result.pass).toBe(false);
    expect(result.protectedKey).toBe('statusLine');
  });

  it('refuses a non-command field change on a non-protected hook entry (e.g. timeout)', () => {
    const mutated = JSON.parse(BASE_SETTINGS);
    mutated.hooks.PostToolUse[0].hooks[0].timeout = 999;
    const result = evaluateSettingsJsonChange(BASE_SETTINGS, JSON.stringify(mutated));
    expect(result.pass).toBe(false);
    expect(result.protectedKey).toMatch(/non-command field changed/);
  });

  it('fails closed on unparseable JSON', () => {
    const result = evaluateSettingsJsonChange(BASE_SETTINGS, '{not json');
    expect(result.pass).toBe(false);
    expect(result.protectedKey).toMatch(/unparseable/);
  });

  it('passes on a byte-identical settings.json (no-op diff)', () => {
    const result = evaluateSettingsJsonChange(BASE_SETTINGS, BASE_SETTINGS);
    expect(result).toEqual({ pass: true, protectedKey: null });
  });
});
