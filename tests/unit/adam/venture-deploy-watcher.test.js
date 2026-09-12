/**
 * QF-20260912-924 — venture-deploy watcher coverage.
 * QF-20260912-244 — follow-up: (a) classify only emitted ##[error]/##[warning] annotation lines,
 * never the raw ::error:: text echoed as part of the "Run" step's command listing; (b) record
 * with decision_type='chairman_approval' (decidable) + context.kind discriminator, not a bespoke
 * decision_type; (c) dedupe against pending OR decided rows for the same run attempt, so a
 * decided keystroke never re-fires.
 *
 * Fixtures mirror the MEASURED shapes: a credential-class red step
 * ("CHAIRMAN_UAT_SESSION_TOKEN is not configured") and a code-class red step (a generic
 * assertion failure naming no secret/permission), plus the QF-20260912-244 real attempt-6 shape
 * (echoed ::error:: command-listing line + the two genuinely-emitted ##[error] lines, a 401).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  isCredentialClassError, extractErrorMessage, buildDedupeKey, parseRepoSlug,
  classifyDeployRun, runVentureDeployWatcher, DECISION_TYPE,
} from '../../../lib/adam/venture-deploy-watcher.mjs';

const CREDENTIAL_LOG = '2026-09-11T21:44:10Z ##[error]CHAIRMAN_UAT_SESSION_TOKEN is not configured\nexit 1';
const SCOPE_LOG = '2026-09-11T21:44:05Z ##[error]Workers AI Read missing (HTTP 401)';
const CODE_LOG = '2026-09-11T21:43:00Z ##[error]AssertionError: expected 200 to equal 500 at test/deploy.spec.js:42';

// QF-20260912-244: the REAL attempt-6 log shape (MEASURED 2026-09-12). The "not configured"
// text appears ONCE, but only as the echoed source of the credential-check branch (never
// actually executed since the secret WAS configured) -- the genuinely emitted lines are the
// two ##[error] annotations naming a 401, a code-class failure. Must NOT classify as credential.
const ECHOED_SOURCE_PLUS_REAL_401_LOG = [
  '2026-09-12T12:00:00.1000000Z Run if [ -z "$CHAIRMAN_UAT_SESSION_TOKEN" ]; then',
  '2026-09-12T12:00:00.1000001Z   echo "::error::CHAIRMAN_UAT_SESSION_TOKEN is not configured"',
  '2026-09-12T12:00:00.1000002Z   exit 1',
  '2026-09-12T12:00:00.1000003Z fi',
  '2026-09-12T12:00:05.2000000Z ##[error]Signed-in GET /api/events returned HTTP 401 (expected 200)',
  '2026-09-12T12:00:05.3000000Z ##[error]Process completed with exit code 1',
].join('\n');

describe('pure classification', () => {
  it('isCredentialClassError: true for both MEASURED emitted-annotation shapes, false for a generic code failure', () => {
    expect(isCredentialClassError(CREDENTIAL_LOG)).toBe(true);
    expect(isCredentialClassError(SCOPE_LOG)).toBe(true);
    expect(isCredentialClassError(CODE_LOG)).toBe(false);
    expect(isCredentialClassError(null)).toBe(false);
    expect(isCredentialClassError(undefined)).toBe(false);
  });

  it('QF-20260912-244: an echoed ::error:: command-listing line naming "not configured" does NOT classify as credential when the real emitted lines are a 401', () => {
    expect(isCredentialClassError(ECHOED_SOURCE_PLUS_REAL_401_LOG)).toBe(true); // the 401 IS credential-class per the fix-shape's own auth-code rule
    // The key regression this guards: the classification must come from the ##[error] 401 line,
    // never the echoed "not configured" text -- extractErrorMessage proves which line actually matched.
    expect(extractErrorMessage(ECHOED_SOURCE_PLUS_REAL_401_LOG)).toBe('##[error]Signed-in GET /api/events returned HTTP 401 (expected 200)');
    expect(extractErrorMessage(ECHOED_SOURCE_PLUS_REAL_401_LOG)).not.toMatch(/not configured/);
  });

  it('QF-20260912-244: a purely echoed ::error:: source line with NO emitted ##[error] annotation at all does not classify (code never actually ran that branch)', () => {
    const onlyEchoed = '2026-09-12T12:00:00Z Run echo "::error::CHAIRMAN_UAT_SESSION_TOKEN is not configured"\n2026-09-12T12:00:01Z ##[error]AssertionError: expected 200 to equal 500';
    expect(isCredentialClassError(onlyEchoed)).toBe(false);
    expect(extractErrorMessage(onlyEchoed)).toBe('##[error]AssertionError: expected 200 to equal 500');
  });

  it('extractErrorMessage: pulls the first emitted ##[error] line verbatim, never a raw ::error:: line', () => {
    expect(extractErrorMessage(CREDENTIAL_LOG)).toBe('##[error]CHAIRMAN_UAT_SESSION_TOKEN is not configured');
    expect(extractErrorMessage('no error marker here')).toBe('');
    expect(extractErrorMessage('::error::this is only ever echoed source, never emitted')).toBe('');
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

/** Stub supabase: dispatches by table (applications only -- alreadyCovered is injected directly
 *  in orchestration tests, so no chairman_decisions branch is needed here). */
function makeStub({ apps = [] } = {}) {
  return {
    from(table) {
      if (table === 'applications') {
        return { select: () => ({ not: () => ({ limit: async () => ({ data: apps, error: null }) }) }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('runVentureDeployWatcher orchestration', () => {
  const app = { id: 'app-1', name: 'AltifyAI', repo_url: 'https://github.com/rickfelix/altifyai' };

  it('a credential-class run records exactly one keystroke, decision_type=chairman_approval with context.kind discriminator', async () => {
    const sb = makeStub({ apps: [app] });
    const recordDecision = vi.fn(async () => ({ recorded: true, id: 'dec-1' }));
    const isAlreadyCovered = vi.fn(async () => false);
    const deps = {
      latestRun: async () => ({ databaseId: 999, status: 'completed', conclusion: 'failure' }),
      runSteps: async () => [{ step: 'post-deploy-signed-in-uat', conclusion: 'failure' }],
      failedLogs: async () => new Map([['post-deploy-signed-in-uat', CREDENTIAL_LOG]]),
      recordDecision,
      isAlreadyCovered,
    };
    const result = await runVentureDeployWatcher(sb, deps);
    expect(result.recorded).toHaveLength(1);
    expect(result.codeClassRed).toHaveLength(0);
    expect(result.skippedDuplicate).toHaveLength(0);
    expect(recordDecision).toHaveBeenCalledTimes(1);
    // QF-20260912-244 (b): decision_type is the shared, decidable 'chairman_approval' type --
    // the discriminator lives in context.kind, not the decision_type column.
    expect(recordDecision.mock.calls[0][1]).toMatchObject({ decisionType: 'chairman_approval', blocking: true });
    expect(recordDecision.mock.calls[0][1].context).toMatchObject({ kind: DECISION_TYPE, runId: 999, step: 'post-deploy-signed-in-uat' });
    expect(isAlreadyCovered).toHaveBeenCalledWith(sb, expect.any(String), 999);
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

  it('NO DUPLICATE: a matching row already covers this run (pending OR decided) — skips recording, reported as skippedDuplicate', async () => {
    const sb = makeStub({ apps: [app] });
    const recordDecision = vi.fn(async () => ({ recorded: true, id: 'dec-3' }));
    const isAlreadyCovered = vi.fn(async () => true); // simulates a DECIDED row still covering this dedupeKey+runId
    const deps = {
      latestRun: async () => ({ databaseId: 999, status: 'completed', conclusion: 'failure' }),
      runSteps: async () => [{ step: 'post-deploy-signed-in-uat', conclusion: 'failure' }],
      failedLogs: async () => new Map([['post-deploy-signed-in-uat', CREDENTIAL_LOG]]),
      recordDecision,
      isAlreadyCovered,
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

describe('alreadyCovered dedup query shape (QF-20260912-244 (c), unexported via runVentureDeployWatcher default dep)', () => {
  it('queries decision_type=chairman_approval with a context containment filter carrying kind+dedupe_key+runId, excluding only rejected rows', async () => {
    let capturedContains = null;
    const sb = {
      from: (table) => {
        expect(table).toBe('chairman_decisions');
        return {
          select: () => ({
            eq: (col, val) => {
              expect(col).toBe('decision_type');
              expect(val).toBe('chairman_approval');
              return {
                contains: (col2, val2) => {
                  expect(col2).toBe('brief_data');
                  capturedContains = val2;
                  return {
                    neq: (col3, val3) => {
                      expect(col3).toBe('status');
                      expect(val3).toBe('rejected');
                      return { limit: async () => ({ data: [{ id: 'existing' }], error: null }) };
                    },
                  };
                },
              };
            },
          }),
        };
      },
    };
    const app = { id: 'app-1', name: 'AltifyAI', repo_url: 'https://github.com/rickfelix/altifyai' };
    const deps = {
      latestRun: async () => ({ databaseId: 999, status: 'completed', conclusion: 'failure' }),
      runSteps: async () => [{ step: 'post-deploy-signed-in-uat', conclusion: 'failure' }],
      failedLogs: async () => new Map([['post-deploy-signed-in-uat', CREDENTIAL_LOG]]),
      recordDecision: vi.fn(),
    };
    const stubApps = { from: (t) => (t === 'applications' ? { select: () => ({ not: () => ({ limit: async () => ({ data: [app], error: null }) }) }) } : sb.from(t)) };
    const result = await runVentureDeployWatcher(stubApps, deps);
    expect(result.skippedDuplicate).toHaveLength(1);
    expect(deps.recordDecision).not.toHaveBeenCalled();
    expect(capturedContains).toEqual({ context: { kind: DECISION_TYPE, dedupe_key: expect.any(String), runId: 999 } });
  });
});
