/**
 * Hardened-runner suite — SD-LEO-INFRA-PUBLISH-SHELL-INJECTION-001-A (TS-1..TS-5, TS-8, TS-9,
 * R-6, R-7). Spy-based: a fake spawnSync captures exactly what would reach git, so the tests
 * assert the WIRE (argv, env, opts) without launching processes. The two real-git effect tests
 * for the scrub live in tests/unit/fleet/scrub-wire.test.js and remain authoritative for
 * behavior-through-a-real-git; this suite owns the runner CONTRACT.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const {
  VALID_BASE_REF, validateBaseRef, OPT_OUTS, assertOptOutReasons,
  makeHardenedGitRunner, makeScrubbedGitRunner,
} = require_('./hardened-runner.cjs');

/** Spy spawnSync returning a configurable result and capturing every call. */
function makeSpy(result = { status: 0, stdout: 'ok', stderr: '' }) {
  const calls = [];
  const fn = (cmd, args, opts) => { calls.push({ cmd, args, opts }); return { ...result }; };
  return { calls, fn };
}

describe('TS-1: hostile ref refused before any spawn', () => {
  it('validateBaseRef throws on option-shaped refs', () => {
    expect(() => validateBaseRef('--upload-pack=touch pwn')).toThrow(/HOSTILE_BASE_REF/);
    expect(() => validateBaseRef('-c core.pager=calc')).toThrow(/HOSTILE_BASE_REF/);
    expect(() => validateBaseRef('')).toThrow(/HOSTILE_BASE_REF/);
    expect(validateBaseRef('origin/main')).toBe('origin/main');
    expect(validateBaseRef('v1.2.3')).toBe('v1.2.3');
  });

  it('runner validateRefs callOpt refuses BEFORE spawnSync runs', () => {
    const spy = makeSpy();
    const run = makeHardenedGitRunner('/repo', { spawnSync: spy.fn });
    expect(() => run(['merge-base', 'HEAD', '--evil'], { validateRefs: ['--evil'] }))
      .toThrow(/HOSTILE_BASE_REF/);
    expect(spy.calls.length, 'no git process may be spawned after refusal').toBe(0);
  });
});

describe('default hardening flags (FR-1)', () => {
  it('injects global flags before the verb; --literal-pathspecs is DEFAULT ON (R-5)', () => {
    const spy = makeSpy();
    const run = makeHardenedGitRunner('/repo', { spawnSync: spy.fn });
    run(['status', '--porcelain']);
    const args = spy.calls[0].args;
    expect(args[0]).toBe('--literal-pathspecs');
    expect(args).toContain('--no-optional-locks');
    const fsmonIdx = args.indexOf('core.fsmonitor=');
    expect(fsmonIdx).toBeGreaterThan(-1);
    expect(args[fsmonIdx - 1]).toBe('-c');
    expect(args.indexOf('status'), 'globals precede the verb').toBeGreaterThan(args.indexOf('--no-optional-locks'));
  });

  it('literalPathspecs: false is an OPT-OUT that removes only that flag', () => {
    const spy = makeSpy();
    const run = makeHardenedGitRunner('/repo', { spawnSync: spy.fn, literalPathspecs: false });
    run(['status']);
    expect(spy.calls[0].args).not.toContain('--literal-pathspecs');
    expect(spy.calls[0].args).toContain('--no-optional-locks');
  });

  it('diff-family verbs get --no-ext-diff --no-textconv AFTER the verb', () => {
    const spy = makeSpy();
    const run = makeHardenedGitRunner('/repo', { spawnSync: spy.fn });
    run(['diff', '--name-only', 'HEAD']);
    const args = spy.calls[0].args;
    const d = args.indexOf('diff');
    expect(args[d + 1]).toBe('--no-ext-diff');
    expect(args[d + 2]).toBe('--no-textconv');
    spy.calls.length = 0;
    run(['status']);
    expect(spy.calls[0].args).not.toContain('--no-ext-diff');
  });

  it('verb detection skips -c/-C option VALUES', () => {
    const spy = makeSpy();
    const run = makeHardenedGitRunner('/repo', { spawnSync: spy.fn });
    run(['-c', 'diff.noprefix=true', 'status']);
    const args = spy.calls[0].args;
    expect(args).not.toContain('--no-ext-diff');
  });

  it('argv-only: a string command is refused outright', () => {
    const spy = makeSpy();
    const run = makeHardenedGitRunner('/repo', { spawnSync: spy.fn });
    expect(() => run('status --porcelain')).toThrow(/HARDENED_RUNNER_ARGV_ONLY/);
    expect(spy.calls.length).toBe(0);
  });
});

describe('TS-3: non-throwing result mode (FR-0)', () => {
  it('returns {status,stdout,stderr} on non-zero instead of throwing', () => {
    const spy = makeSpy({ status: 1, stdout: '', stderr: 'dirty' });
    const run = makeHardenedGitRunner('/repo', { spawnSync: spy.fn, result: true });
    const r = run(['diff', '--quiet']);
    expect(r.status).toBe(1);
    expect(r.stderr).toBe('dirty');
  });

  it('default (strict) mode still throws on non-zero — byte-compatible', () => {
    const spy = makeSpy({ status: 128, stdout: '', stderr: 'boom' });
    const run = makeScrubbedGitRunner('/repo', { spawnSync: spy.fn });
    expect(() => run(['status'])).toThrow(/failed: boom/);
  });
});

describe('TS-4/R-6/R-9: opts passthrough (FR-0)', () => {
  it('timeout, maxBuffer and stdio reach spawnSync; call opts override factory opts', () => {
    const spy = makeSpy();
    const run = makeScrubbedGitRunner('/repo', { spawnSync: spy.fn, maxBuffer: 32 * 1024 * 1024, timeout: 30000 });
    run(['log'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const o = spy.calls[0].opts;
    expect(o.maxBuffer).toBe(32 * 1024 * 1024);
    expect(o.timeout).toBe(30000);
    expect(o.stdio).toEqual(['ignore', 'pipe', 'pipe']);
    spy.calls.length = 0;
    run(['log'], { maxBuffer: 64 * 1024 * 1024 });
    expect(spy.calls[0].opts.maxBuffer, 'call opts win').toBe(64 * 1024 * 1024);
  });

  it('defaults leave timeout/maxBuffer/stdio UNSET — byte-compatible with the original runner', () => {
    const spy = makeSpy();
    makeScrubbedGitRunner('/repo', { spawnSync: spy.fn })(['status']);
    const o = spy.calls[0].opts;
    expect('timeout' in o).toBe(false);
    expect('maxBuffer' in o).toBe(false);
    expect('stdio' in o).toBe(false);
  });
});

describe('TS-5: env passthrough (FR-0 / inflight-git-state contract)', () => {
  it('envPassthrough leaves spawn env UNDEFINED so ambient credential helpers resolve', () => {
    const spy = makeSpy();
    const run = makeScrubbedGitRunner('/repo', { spawnSync: spy.fn, envPassthrough: true });
    run(['fetch']);
    expect(spy.calls[0].opts.env, 'the contract is env === undefined, not a copy').toBeUndefined();
  });

  it('default scrubs: injected GIT_CONFIG_* and redirection keys are removed', () => {
    const spy = makeSpy();
    const hostile = { ...process.env, GIT_CONFIG_COUNT: '1', GIT_DIR: '/evil', GIT_SSH_COMMAND: 'calc' };
    makeScrubbedGitRunner('/repo', { spawnSync: spy.fn, env: hostile })(['status']);
    const env = spy.calls[0].opts.env;
    expect(env.GIT_CONFIG_COUNT).toBeUndefined();
    expect(env.GIT_DIR).toBeUndefined();
    expect(env.GIT_SSH_COMMAND).toBeUndefined();
  });
});

describe('R-7: the scrub NEGATIVE contract (migrated intent from scrub-wire)', () => {
  it('default hardened runner does NOT set GIT_CONFIG_NOSYSTEM/GLOBAL — auth must survive', () => {
    const spy = makeSpy();
    makeHardenedGitRunner('/repo', { spawnSync: spy.fn })(['fetch']);
    const env = spy.calls[0].opts.env;
    expect(env.GIT_CONFIG_NOSYSTEM, 'nulling system config breaks credential.helper (measured)').toBeUndefined();
    expect(env.GIT_CONFIG_GLOBAL).toBeUndefined();
  });

  it('noSystemConfig: true survives the scrub via post-scrub augment (never inert)', () => {
    const spy = makeSpy();
    makeHardenedGitRunner('/repo', { spawnSync: spy.fn, noSystemConfig: true })(['status']);
    expect(spy.calls[0].opts.env.GIT_CONFIG_NOSYSTEM).toBe('1');
  });
});

describe('TS-9: opt-out ledger refuses reason-less records (R-3)', () => {
  it('every shipped OPT_OUT carries a non-empty reason', () => {
    expect(OPT_OUTS.length).toBeGreaterThan(0);
    expect(() => assertOptOutReasons()).not.toThrow();
  });
  it('empty and whitespace-only reasons are refused', () => {
    expect(() => assertOptOutReasons([{ file: 'x.js', reason: '' }])).toThrow(/OPT_OUT_WITHOUT_REASON/);
    expect(() => assertOptOutReasons([{ file: 'x.js', reason: '   ' }])).toThrow(/OPT_OUT_WITHOUT_REASON/);
    expect(() => assertOptOutReasons([{ file: 'x.js' }])).toThrow(/OPT_OUT_WITHOUT_REASON/);
  });
});

describe('TS-2: hostile config neutralized through a REAL git (effect test)', () => {
  it('poisoned core.fsmonitor/pager via -c clearing: status runs clean', () => {
    // Effect, not structure: run real git status in this repo through the hardened runner with a
    // hostile env injection attempt; the scrub removes GIT_CONFIG_* so the payload never lands.
    const hostile = { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: 'node -e "process.exit(99)"' };
    const run = makeHardenedGitRunner(process.cwd(), { env: hostile, result: true });
    const r = run(['status', '--porcelain']);
    expect(r.status, 'hostile injected fsmonitor must not run (exit 99 would surface)').toBe(0);
  });
});

describe('TS-8: dual-load — ESM import and CJS require both work', () => {
  it('ESM dynamic import exposes the same named exports', async () => {
    const esm = await import('./hardened-runner.cjs');
    expect(typeof esm.makeHardenedGitRunner).toBe('function');
    expect(typeof esm.validateBaseRef).toBe('function');
    expect(esm.VALID_BASE_REF).toBeInstanceOf(RegExp);
    expect(esm.VALID_BASE_REF.source).toBe(VALID_BASE_REF.source);
  });
});
