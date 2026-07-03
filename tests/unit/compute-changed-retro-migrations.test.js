/**
 * SD-LEO-FIX-DIFF-SCOPE-LAYER-001
 * Pins the diff-scoping decision for the Layer 4.3 "Migration File Validation" CI job.
 * Before this fix, the job ran `find database/migrations -name "*retrospective*.sql"`
 * repo-wide and diff-independent, false-flagging on any pre-existing migration missing
 * BEGIN;/COMMIT; (e.g. 20260528_retrospective_type_default_null.sql) on EVERY PR/push.
 */
import { describe, it, expect } from 'vitest';
import { resolveDiffBase, computeFilesToCheck } from '../../scripts/lint/compute-changed-retro-migrations.mjs';

describe('resolveDiffBase', () => {
  it('TS-1: pull_request with a base_ref resolves against origin/<base>...HEAD', () => {
    const r = resolveDiffBase({ eventName: 'pull_request', baseRef: 'main' });
    expect(r).toEqual({ range: ['origin/main...HEAD'], resolvable: true, reason: 'diffing against origin/main' });
  });

  it('TS-2: pull_request missing base_ref is unresolvable', () => {
    const r = resolveDiffBase({ eventName: 'pull_request', baseRef: '' });
    expect(r.resolvable).toBe(false);
  });

  it('TS-3: push with a real before SHA resolves against [before, HEAD]', () => {
    const r = resolveDiffBase({ eventName: 'push', before: 'abc1234' });
    expect(r).toEqual({ range: ['abc1234', 'HEAD'], resolvable: true, reason: 'diffing against pre-push SHA abc1234' });
  });

  it('TS-4: push with the all-zeros sentinel before (new branch/force-push) is unresolvable', () => {
    const r = resolveDiffBase({ eventName: 'push', before: '0000000000000000000000000000000000000000' });
    expect(r.resolvable).toBe(false);
  });

  it('push with a missing/empty before is unresolvable', () => {
    const r = resolveDiffBase({ eventName: 'push', before: '' });
    expect(r.resolvable).toBe(false);
  });

  it('an unrecognized event is unresolvable', () => {
    const r = resolveDiffBase({ eventName: 'workflow_dispatch' });
    expect(r.resolvable).toBe(false);
  });
});

describe('computeFilesToCheck', () => {
  it('TS-5: diffResolvable=false falls back to the full repo-wide file set (fail-safe)', () => {
    const r = computeFilesToCheck({
      diffResolvable: false,
      allRetroMigrationFiles: ['database/migrations/20260528_retrospective_type_default_null.sql', 'database/migrations/20251015_add_retrospective_quality_score_constraint.sql'],
    });
    expect(r.filesToCheck).toEqual([
      'database/migrations/20260528_retrospective_type_default_null.sql',
      'database/migrations/20251015_add_retrospective_quality_score_constraint.sql',
    ]);
    expect(r.scoped).toBe(false);
  });

  it('TS-6: diffResolvable=true with zero changed files is a clean skip (grandfathers pre-existing files)', () => {
    const r = computeFilesToCheck({ diffResolvable: true, changedFiles: [] });
    expect(r.filesToCheck).toEqual([]);
    expect(r.scoped).toBe(true);
    expect(r.reason).toMatch(/nothing to validate/);
  });

  it('TS-7: diffResolvable=true with N changed files checks exactly those N (not the whole repo)', () => {
    const r = computeFilesToCheck({
      diffResolvable: true,
      changedFiles: ['database/migrations/20260703_new_retrospective_thing.sql'],
      allRetroMigrationFiles: ['database/migrations/20260528_retrospective_type_default_null.sql', 'database/migrations/20260703_new_retrospective_thing.sql'],
    });
    expect(r.filesToCheck).toEqual(['database/migrations/20260703_new_retrospective_thing.sql']);
    expect(r.scoped).toBe(true);
  });

  it('a grandfathered pre-existing file (not in the diff) is never re-checked even though it exists repo-wide', () => {
    const r = computeFilesToCheck({
      diffResolvable: true,
      changedFiles: ['database/migrations/20260703_unrelated_change.sql'],
      allRetroMigrationFiles: ['database/migrations/20260528_retrospective_type_default_null.sql', 'database/migrations/20260703_unrelated_change.sql'],
    });
    expect(r.filesToCheck).not.toContain('database/migrations/20260528_retrospective_type_default_null.sql');
  });

  it('defaults changedFiles/allRetroMigrationFiles to empty arrays when omitted', () => {
    expect(computeFilesToCheck({ diffResolvable: true }).filesToCheck).toEqual([]);
    expect(computeFilesToCheck({ diffResolvable: false }).filesToCheck).toEqual([]);
  });
});
