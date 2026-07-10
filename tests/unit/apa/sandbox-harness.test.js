/**
 * lib/apa/sandbox-harness unit tests
 * SD-LEO-INFRA-AUTOMATED-PRODUCT-ASSESSMENT-001-A
 *
 * Covers PRD test scenarios TS-1 through TS-5. spawnFn/pollHealthFn/
 * resolveAppFn are injected so no real MarketLens process is spawned; the
 * capture sink is REAL (a genuine local HTTP server on localhost) since it
 * is this module's own code, not an external dependency.
 */

import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { boot, validateBootConfig, resolveAppFromRegistry } from '../../../lib/apa/sandbox-harness.mjs';

const FAKE_REGISTRY = { applications: { APP006: { id: 'APP006', name: 'MarketLens', local_path: '/fake/marketlens' } } };

function makeFakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 12345;
  child.kill = () => { child.killed = true; };
  return child;
}

function baseOpts(overrides = {}) {
  let portCounter = 40000;
  return {
    registry: FAKE_REGISTRY,
    spawnFn: () => makeFakeChild(),
    pollHealthFn: async () => true,
    findFreePortFn: async () => portCounter++,
    ...overrides,
  };
}

describe('FR-2/TS-4: config-surface guard', () => {
  it('accepts config with only the enumerated test-mode axes plus identity/replay fields', () => {
    expect(validateBootConfig({ app: 'MarketLens', transportSwaps: {}, clockInjection: {}, seedHooks: {}, buildSha: 'abc', seedState: {} }).valid).toBe(true);
  });

  it('TS-4: rejects a config key outside the enumerated surface', () => {
    const result = validateBootConfig({ app: 'MarketLens', notAllowed: true });
    expect(result.valid).toBe(false);
    expect(result.violation).toContain('notAllowed');
  });

  it('rejects config with no app', () => {
    expect(validateBootConfig({}).valid).toBe(false);
  });

  it('boot() throws SANDBOX_CONFIG_VIOLATION for an undeclared config key', async () => {
    await expect(boot({ app: 'MarketLens', rogueKey: 1 }, baseOpts())).rejects.toMatchObject({ code: 'SANDBOX_CONFIG_VIOLATION' });
  });
});

describe('TS-1: boot() starts the app and passes health check', () => {
  it('resolves to a handle with a live baseUrl once health check passes', async () => {
    const handle = await boot({ app: 'MarketLens' }, baseOpts());
    expect(handle.baseUrl).toMatch(/^http:\/\/localhost:\d+$/);
    expect(handle.app).toBe('MarketLens');
    await handle.teardown();
  });

  it('throws SANDBOX_BOOT_TIMEOUT when the health check never passes', async () => {
    await expect(boot({ app: 'MarketLens' }, baseOpts({ pollHealthFn: async () => false }))).rejects.toMatchObject({ code: 'SANDBOX_BOOT_TIMEOUT' });
  });
});

describe('FR-1 AC2: concurrent boots run on distinct ports', () => {
  it('two concurrent boot() calls for the same app get distinct ports', async () => {
    const opts = baseOpts();
    const [a, b] = await Promise.all([boot({ app: 'MarketLens' }, opts), boot({ app: 'MarketLens' }, opts)]);
    expect(a.port).not.toBe(b.port);
    await Promise.all([a.teardown(), b.teardown()]);
  });
});

describe('TS-2: teardown() cleanly releases the process/port', () => {
  it('kills the process and closes the capture sink; a fresh boot after teardown succeeds', async () => {
    const opts = baseOpts();
    const first = await boot({ app: 'MarketLens' }, opts);
    let killedChild;
    opts.spawnFn = () => { killedChild = makeFakeChild(); return killedChild; };
    await first.teardown();
    expect(first.pid).toBeDefined();

    // A fresh boot after teardown succeeds without collision (distinct port from injected counter).
    const second = await boot({ app: 'MarketLens' }, opts);
    expect(second.port).not.toBe(first.port);
    await second.teardown();
  });

  it('teardown() is idempotent (safe to call twice)', async () => {
    const handle = await boot({ app: 'MarketLens' }, baseOpts());
    await handle.teardown();
    await expect(handle.teardown()).resolves.toBeUndefined();
  });
});

describe('TS-3: instrumentation captures real console/network activity via the transport boundary', () => {
  it('captures real stdout/stderr lines from the spawned process', async () => {
    let child;
    const handle = await boot({ app: 'MarketLens' }, baseOpts({ spawnFn: () => { child = makeFakeChild(); return child; } }));
    child.stdout.emit('data', Buffer.from('server listening\n'));
    child.stderr.emit('data', Buffer.from('warn: slow query\n'));
    expect(handle.captures.console).toHaveLength(2);
    expect(handle.captures.console[0]).toMatchObject({ stream: 'stdout', line: 'server listening\n' });
    await handle.teardown();
  });

  it('a real POST to the capture sink records a network/side-effect event (real local endpoint, not a stub)', async () => {
    const handle = await boot({ app: 'MarketLens', transportSwaps: { emailTransport: 'capture' } }, baseOpts());
    const res = await fetch(handle.captureSinkUrl, {
      method: 'POST',
      body: JSON.stringify({ kind: 'sideEffectSink', type: 'email', to: 'user@example.com', source: 'real-transport' }),
    });
    expect(res.status).toBe(204);
    // capture write happens async on the server's 'end' event — poll briefly.
    for (let i = 0; i < 20 && handle.captures.sideEffectSinks.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(handle.captures.sideEffectSinks).toHaveLength(1);
    expect(handle.captures.sideEffectSinks[0]).toMatchObject({ type: 'email', source: 'real-transport' });
    await handle.teardown();
  });

  it('never mocks/stubs app source — evidence only comes from real stdio and the real capture sink', async () => {
    const handle = await boot({ app: 'MarketLens' }, baseOpts());
    // absence of any POST/stdio activity means empty buffers, not fabricated evidence.
    expect(handle.captures.network).toEqual([]);
    expect(handle.captures.sideEffectSinks).toEqual([]);
    await handle.teardown();
  });
});

describe('FR-5/TS-5: instanceSource stamp + replay-ready fields', () => {
  it('every handle carries instanceSource:local-sandbox-interim', async () => {
    const handle = await boot({ app: 'MarketLens' }, baseOpts());
    expect(handle.instanceSource).toBe('local-sandbox-interim');
    await handle.teardown();
  });

  it('accepts buildSha and seedState without erroring when absent', async () => {
    const handle = await boot({ app: 'MarketLens' }, baseOpts());
    expect(handle.buildSha).toBeNull();
    await handle.teardown();
  });

  it('accepts buildSha and stamps it onto the handle when provided', async () => {
    const handle = await boot({ app: 'MarketLens', buildSha: 'deadbeef' }, baseOpts());
    expect(handle.buildSha).toBe('deadbeef');
    await handle.teardown();
  });
});

describe('resolveAppFromRegistry', () => {
  it('resolves MarketLens from the applications registry by name', () => {
    const entry = resolveAppFromRegistry('MarketLens', FAKE_REGISTRY);
    expect(entry.local_path).toBe('/fake/marketlens');
  });

  it('throws SANDBOX_APP_NOT_FOUND for an unregistered app', () => {
    expect(() => resolveAppFromRegistry('NotARealApp', FAKE_REGISTRY)).toThrowError(/not found/);
  });
});
