#!/usr/bin/env node
/**
 * Diff-scoping decision for the Layer 4.3 "Migration File Validation" CI job
 * (.github/workflows/retrospective-quality-gates.yml). SD-LEO-FIX-DIFF-SCOPE-LAYER-001.
 *
 * Before this, the job ran `find database/migrations -name "*retrospective*.sql"` —
 * repo-wide and diff-independent — so it false-flagged on any pre-existing migration
 * missing BEGIN;/COMMIT; (e.g. 20260528_retrospective_type_default_null.sql, merged
 * months ago), failing EVERY future PR regardless of what it actually touched.
 *
 * This module's pure functions decide WHICH files to check; the git/find calls that
 * produce their inputs happen in main() below and in the workflow YAML. Modeled on
 * scripts/lint/schema-lint-exit.mjs (pure decision, tested; execSync glue, untested).
 *
 * Fail-safe design: when the diff base can't be resolved (fetch failure, or a push
 * event's `before` SHA is the all-zeros sentinel for a new branch/force-push), this
 * falls back to the full repo-wide file set — i.e. the ORIGINAL pre-fix behavior —
 * rather than silently skipping validation. This is a hard-blocking correctness gate,
 * not an advisory lint, so "can't tell what changed" must never mean "check nothing."
 */
import { execSync } from 'node:child_process';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const ALL_ZEROS_SHA = '0000000000000000000000000000000000000000';
const RETRO_MIGRATION_PATHSPEC = 'database/migrations/*retrospective*.sql';

/**
 * Resolve what to diff against for a given GitHub Actions event. Pure — takes
 * only the event fields, makes no git calls.
 * @param {{eventName: string, baseRef?: string, before?: string}} params
 * @returns {{range: string[]|null, resolvable: boolean, reason: string}}
 */
export function resolveDiffBase({ eventName, baseRef, before }) {
  if (eventName === 'pull_request') {
    if (!baseRef) {
      return { range: null, resolvable: false, reason: 'pull_request event missing base_ref' };
    }
    return { range: [`origin/${baseRef}...HEAD`], resolvable: true, reason: `diffing against origin/${baseRef}` };
  }
  if (eventName === 'push') {
    if (!before || before === ALL_ZEROS_SHA) {
      return {
        range: null,
        resolvable: false,
        reason: 'push event.before is empty/all-zeros (new branch or force-push) — no prior state to diff against',
      };
    }
    return { range: [before, 'HEAD'], resolvable: true, reason: `diffing against pre-push SHA ${before}` };
  }
  return { range: null, resolvable: false, reason: `unrecognized event "${eventName}"` };
}

/**
 * Decide the final file set to validate. Pure — takes already-computed file lists.
 * @param {{diffResolvable: boolean, changedFiles?: string[], allRetroMigrationFiles?: string[]}} params
 * @returns {{filesToCheck: string[], scoped: boolean, reason: string}}
 */
export function computeFilesToCheck({ diffResolvable, changedFiles = [], allRetroMigrationFiles = [] }) {
  if (!diffResolvable) {
    return {
      filesToCheck: allRetroMigrationFiles,
      scoped: false,
      reason: 'diff base unresolvable — falling back to the full repo-wide file set (fail-safe; matches pre-fix behavior)',
    };
  }
  if (changedFiles.length === 0) {
    return {
      filesToCheck: [],
      scoped: true,
      reason: 'no retrospective migration files changed in this diff — nothing to validate (pre-existing files grandfathered)',
    };
  }
  return {
    filesToCheck: changedFiles,
    scoped: true,
    reason: `${changedFiles.length} retrospective migration file(s) changed in this diff`,
  };
}

function gitDiffChangedFiles(range) {
  const out = execSync(`git diff --name-only --diff-filter=ACMR ${range.join(' ')} -- '${RETRO_MIGRATION_PATHSPEC}'`, {
    encoding: 'utf8',
  });
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

function findAllRetroMigrations() {
  const out = execSync('find database/migrations -name "*retrospective*.sql"', { encoding: 'utf8' });
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

function main() {
  const eventName = process.env.GITHUB_EVENT_NAME || '';
  const baseRef = process.env.GITHUB_BASE_REF || '';
  const before = process.env.GITHUB_EVENT_BEFORE || '';

  const base = resolveDiffBase({ eventName, baseRef, before });

  let result;
  if (base.resolvable) {
    let changedFiles;
    try {
      changedFiles = gitDiffChangedFiles(base.range);
    } catch (err) {
      // git diff itself failed (e.g. base ref not actually fetched) — fail-safe to full sweep.
      result = computeFilesToCheck({ diffResolvable: false, allRetroMigrationFiles: findAllRetroMigrations() });
      console.error(`[compute-changed-retro-migrations] git diff failed (${err.message.split('\n')[0]}); ${result.reason}`);
      process.stdout.write(result.filesToCheck.join('\n') + (result.filesToCheck.length ? '\n' : ''));
      return;
    }
    result = computeFilesToCheck({ diffResolvable: true, changedFiles });
  } else {
    result = computeFilesToCheck({ diffResolvable: false, allRetroMigrationFiles: findAllRetroMigrations() });
  }

  console.error(`[compute-changed-retro-migrations] ${base.reason}; ${result.reason}`);
  process.stdout.write(result.filesToCheck.join('\n') + (result.filesToCheck.length ? '\n' : ''));
}

if (isMainModule(import.meta.url)) {
  main();
}
