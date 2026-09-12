/**
 * QF-20260912-924 — venture-deploy watcher coverage.
 *
 * Fixtures mirror the MEASURED shapes from the QF (rickfelix/altifyai deploy.yml, 09-11 run):
 * a credential-class red step ("CHAIRMAN_UAT_SESSION_TOKEN is not configured") and a code-class
 * red step (a generic assertion failure naming no secret/permission). Per the QF's own test
 * requirement: "a fixture of the two measured runs (one credential-class, one code-class)
 * asserting exactly one keystroke row and one tick line respectively, and no duplicate on a
 * second pass".
 */
import { describe, it, expect, vi } from 'vitest';
import {
  isCredentialClassError, extractErrorMessage, buildDedupeKey, parseRepoSlug,
  classifyDeployRun, runVentureDeployWatcher, DECISION_TYPE,
} from '../../../lib/adam/venture-deploy-watcher.mjs';

const CREDENTIAL_LOG = '2026-09-11T21:44:10Z ::error::CHAIRMAN_UAT_SESSION_TOKEN is not configured\nexit 1';
const SCOPE_LOG = '2026-09-11T21:44:05Z ::error::Workers AI Read missing (HTTP 401)';
const CODE_LOG = '2026-09-11T21:43:00Z ::error::AssertionError: expected 200 to equal 500 at test/deploy.spec.js:42';

describe('pure classification', () => {
  it('isCredentialClassError: true for both MEASURED shapes, false for a generic code failure', () => {
    expect(isCredentialClassError(CREDENTIAL_LOG)).toBe(true);
    expect(isCredentialClassError(SCOPE_LOG)).toBe(true);
    expect(isCredentialClassError(CODE_LOG)).toBe(false);
    expect(isCredentialClassError(null)).toBe(false);
    expect(isCredentialClassError(undefined)).toBe(false);
  });

  it('extractErrorMessage: pulls the first ::error:: line verbatim', () => {
    expect(extractErrorMessage(CREDENTIAL_LOG)).toBe('::error::CHAIRMAN_UAT_SESSION_TOKEN is not configured');
    expect(extractErrorMessage('no error marker here')).toBe('');
  });

  it('buildDedupeKey: deterministic for identical inputs, distinct for a different step', () => {
    const a = buildDedupeKey('rickfelix/altifyai', 'post-deploy-signed-in-uat', 'msg');
    const b = buildDedupeKey('rickfelix/altifyai', 'post-deploy-signed-in-uat', 'msg');
    const c = buildDedupeKey('rickfelix/altifyai', 'other-step', 'msg');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('parseRepoSlug: full GitHub URL, .git suffix, trailing slash, bare slug, and invalid input', () => {
    expect(parseRepoSlug('https://github.com/rickfelix/altifyai')).toBe('rickfelix/altifyai');
    expect(parseRepoSlug('https://github.com/rickfelix/altifyai.git')).toBe('rickfelix/altifyai');
    expect(parseRepoSlug('https://github.com/rickfelix/altifyai/')).toBe('rickfelix/altifyai');
    expect(parseRepoSlug('rickfelix/altifyai')).toBe('rickfelix/altifyai');
    expect(parseRepoSlug('not-a-repo-url')).toBeNull();
    expect(parseRepoSlug(null)).toBeNull();
    expect(parseRepoSlug('')).toBeNull();
  });

  it('classifyDeployRun: the credential-class fixture yields exactly one keystroke candidate, no code-class', () => {
    const steps = [{ step: 'post-deploy-signed-in-uat', conclusion: 'failure' }, { step: 'wrangler-deploy', conclusion: 'success' }];
    const failedLogsByStep = new Map([['post-deploy-signed-in-uat', CREDENTIAL_LOG]]);
    const { keystrokes, codeClass } = classifyDeployRun({ repo: 'rickfelix/altifyai', runId: 111, steps, failedLogsByStep });
    expect(keystrokes).toHaveLength(1);
    expect(codeClass).toHaveLength(0);
    expect(keystrokes[0]).toMatchObject({ repo: 'rickfelix/altifyai', runId: 111, step: 'post-deploy-signed-in-uat' });
  });

  it('classifyDeployRun: the code-class fixture yields exactly one tick-only row, no keystroke', () => {
    const steps = [{ step: 'run-tests', conclusion: 'failure' }];
    const failedLogsByStep = new Map([['run-tests', CODE_LOG]]);
    const { keystrokes, codeClass } = classifyDeployRun({ repo: 'rickfelix/altifyai', runId: 222, steps, failedLogsByStep });
    expect(keystrokes).toHaveLength(0);
    expect(codeClass).toHaveLength(1);
    expect(codeClass[0]).toMatchObject({ repo: 'rickfelix/altifyai', runId: 222, step: 'run-tests' });
  });

  it('a step with conclusion other than failure is ignored entirely (success/skipped/cancelled)', () => {
    const steps = [{ step: 'wrangler-deploy', conclusion: 'success' }, { step: 'lint', conclusion: 'skipped' }];
    const { keystrokes, codeClass } = classifyDeployRun({ repo: 'r', runId: 1, steps, failedLogsByStep: new Map() });
    expect(keystrokes).toHaveLength(0);
    expect(codeClass).toHaveLength(0);
  });
});

/** Stub supabase: dispatches by table (applications / chairman_decisions), mirrors the
 *  table-branching stub convention in outbound-silence-watchdog.test.js. */
function makeStub({ apps = [], pendingDecisions = [] } = {}) {
  return {
    from(table) {
      if (table === 'applications') {
        return { select: () => ({ not: async () => ({ data: apps, error: null }) }) };
      }
      if (table === 'chairman_decisions') {
        return { select: () => ({ eq: () => ({ eq: async () => ({ data: pendingDecisions, error: null }) }) }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('runVentureDeployWatcher orchestration', () => {
  const app = { id: 'app-1', name: 'AltifyAI', repo_url: 'https://github.com/rickfelix/altifyai' };

  it('a credential-class run records exactly one keystroke via the injected recordDecision', async () => {
    const sb = makeStub({ apps: [app] });
    const recordDecision = vi.fn(async () => ({ recorded: true, id: 'dec-1' }));
    const deps = {
      latestRun: async () => ({ databaseId: 999, status: 'completed', conclusion: 'failure' }),
      runSteps: async () => [{ step: 'post-deploy-signed-in-uat', conclusion: 'failure' }],
      failedLogs: async () => new Map([['post-deploy-signed-in-uat', CREDENTIAL_LOG]]),
      recordDecision,
    };
    const result = await runVentureDeployWatcher(sb, deps);
    expect(result.recorded).toHaveLength(1);
    expect(result.codeClassRed).toHaveLength(0);
    expect(result.skippedDuplicate).toHaveLength(0);
    expect(recordDecision).toHaveBeenCalledTimes(1);
    expect(recordDecision.mock.calls[0][1]).toMatchObject({ decisionType: DECISION_TYPE, blocking: true });
  });

  it('a code-class run yields exactly one codeClassRed row and calls recordDecision zero times', async () => {
    const sb = makeStub({ apps: [app] });
    const recordDecision = vi.fn(async () => ({ recorded: true, id: 'dec-2' }));
    const deps = {
      latestRun: async () => ({ databaseId: 888, status: 'completed', conclusion: 'failure' }),
      runSteps: async () => [{ step: 'run-tests', conclusion: 'failure' }],
      failedLogs: async () => new Map([['run-tests', CODE_LOG]]),
      recordDecision,
    };
    const result = await runVentureDeployWatcher(sb, deps);
    expect(result.recorded).toHaveLength(0);
    expect(result.codeClassRed).toHaveLength(1);
    expect(result.codeClassRed[0]).toMatchObject({ repo: 'rickfelix/altifyai', step: 'run-tests', ventureName: 'AltifyAI' });
    expect(recordDecision).not.toHaveBeenCalled();
  });

  it('a successful latest run (conclusion=success) is a no-op — never reads steps/logs', async () => {
    const sb = makeStub({ apps: [app] });
    const runSteps = vi.fn();
    const failedLogs = vi.fn();
    const deps = { latestRun: async () => ({ databaseId: 1, status: 'completed', conclusion: 'success' }), runSteps, failedLogs };
    const result = await runVentureDeployWatcher(sb, deps);
    expect(result.recorded).toHaveLength(0);
    expect(result.codeClassRed).toHaveLength(0);
    expect(runSteps).not.toHaveBeenCalled();
    expect(failedLogs).not.toHaveBeenCalled();
  });

  it('NO DUPLICATE on a second pass: a matching PENDING decision already on file skips recording and is reported as skippedDuplicate', async () => {
    const dedupeKey = buildDedupeKey('rickfelix/altifyai', 'post-deploy-signed-in-uat', extractErrorMessage(CREDENTIAL_LOG));
    const sb = makeStub({ apps: [app], pendingDecisions: [{ brief_data: { context: { dedupe_key: dedupeKey } } }] });
    const recordDecision = vi.fn(async () => ({ recorded: true, id: 'dec-3' }));
    const deps = {
      latestRun: async () => ({ databaseId: 999, status: 'completed', conclusion: 'failure' }),
      runSteps: async () => [{ step: 'post-deploy-signed-in-uat', conclusion: 'failure' }],
      failedLogs: async () => new Map([['post-deploy-signed-in-uat', CREDENTIAL_LOG]]),
      recordDecision,
    };
    const result = await runVentureDeployWatcher(sb, deps);
    expect(result.recorded).toHaveLength(0);
    expect(result.skippedDuplicate).toHaveLength(1);
    expect(recordDecision).not.toHaveBeenCalled();
  });

  it('an unparseable repo_url is reported as an error and never throws', async () => {
    const sb = makeStub({ apps: [{ id: 'app-2', name: 'Bad', repo_url: 'not a url' }] });
    const result = await runVentureDeployWatcher(sb, {});
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/unparseable_repo_url/);
  });

  it('a per-venture read failure is fail-soft — reported in errors, never thrown, other ventures unaffected', async () => {
    const app2 = { id: 'app-2', name: 'Other', repo_url: 'https://github.com/rickfelix/other' };
    const sb = makeStub({ apps: [app, app2] });
    const recordDecision = vi.fn(async () => ({ recorded: true, id: 'dec-4' }));
    const deps = {
      latestRun: vi.fn(async (repo) => {
        if (repo === 'rickfelix/altifyai') throw new Error('gh timeout');
        return { databaseId: 1, status: 'completed', conclusion: 'success' };
      }),
      runSteps: async () => [],
      failedLogs: async () => new Map(),
      recordDecision,
    };
    const result = await runVentureDeployWatcher(sb, deps);
    expect(result.errors.some((e) => e.includes('gh timeout'))).toBe(true);
  });
});
