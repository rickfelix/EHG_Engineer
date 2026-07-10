/**
 * APA Sandbox Harness (SD-LEO-INFRA-AUTOMATED-PRODUCT-ASSESSMENT-001-A).
 *
 * Layer A of Automated Product Assessment (design doc §11): boot / seed /
 * instrument / teardown of a venture app, plus real side-effect-sink
 * capture. Per §11.1, this is the declared-INTERIM local-sandbox
 * instance-acquisition path (no per-venture preview-deploy machinery exists
 * yet) — every handle is stamped `instanceSource: 'local-sandbox-interim'`
 * so it is never silently presented as the eventual deploy-path source. The
 * boot() signature already accepts buildSha/seedState (§11.2) so a future
 * deploy-path swap only changes that stamp's value, never this module's
 * public shape.
 *
 * instrument-not-mock (§1.1): the app's own code always executes for real.
 * The harness never stubs app source files — it swaps only the transport
 * boundary (env-var driven, per the enumerated test-mode axes below) and
 * owns a real local capture-sink HTTP endpoint the app can POST evidence to
 * when it detects test mode. Absence of a posted event is itself the
 * failing signal downstream (Child B's side-effect-honesty assertion), not
 * something this harness fabricates.
 *
 * @module lib/apa/sandbox-harness
 */

import { spawn as defaultSpawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';

// FR-2: the test-mode config surface is enumerated to exactly these 3 axes
// (plus the non-test-mode identity/replay fields below) so a producer can
// never quietly grow a second, drifted config surface.
const TEST_MODE_AXES = Object.freeze(['transportSwaps', 'clockInjection', 'seedHooks']);
const ALLOWED_CONFIG_KEYS = Object.freeze(['app', 'buildSha', 'seedState', ...TEST_MODE_AXES]);

/**
 * @param {object} config
 * @returns {{valid: boolean, violation?: string}}
 */
export function validateBootConfig(config) {
  const cfg = config || {};
  const unknown = Object.keys(cfg).filter((k) => !ALLOWED_CONFIG_KEYS.includes(k));
  if (unknown.length > 0) {
    return { valid: false, violation: `unrecognized config key(s): ${unknown.join(', ')} — allowed: ${ALLOWED_CONFIG_KEYS.join(', ')}` };
  }
  if (!cfg.app) {
    return { valid: false, violation: 'config.app is required' };
  }
  return { valid: true };
}

/** Resolve an app entry from the applications registry by name. */
export function resolveAppFromRegistry(appName, registry) {
  const entry = Object.values((registry && registry.applications) || {}).find((a) => a.name === appName);
  if (!entry) {
    const e = new Error(`app "${appName}" not found in applications registry`);
    e.code = 'SANDBOX_APP_NOT_FOUND';
    throw e;
  }
  return entry;
}

/** Bind an ephemeral listener to get a free port, then release it. */
export async function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Poll baseUrl until it responds or timeoutMs elapses. */
export async function pollHealth(baseUrl, { timeoutMs = 30000, intervalMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseUrl);
      if (res.status >= 200 && res.status < 500) return true;
    } catch { /* not up yet — keep polling */ }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Start a real local HTTP capture sink. The booted app POSTs evidence here
 * (JSON body: {kind: 'network'|'sideEffectSink'|'console', ...}) when its
 * transport boundary is swapped to test mode — this is a real endpoint, not
 * a stub, so absence of a POST for a claimed side effect is a genuine signal.
 * @returns {Promise<{url: string, close: () => Promise<void>}>}
 */
async function startCaptureSink(captures) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const event = JSON.parse(body || '{}');
        const bucket = event.kind === 'network' ? captures.network
          : event.kind === 'sideEffectSink' ? captures.sideEffectSinks
            : captures.console;
        bucket.push({ ...event, receivedAt: Date.now() });
      } catch { /* malformed capture POST — drop, never crash the sandbox */ }
      res.writeHead(204);
      res.end();
    });
  });
  const port = await findFreePort();
  await new Promise((resolve) => server.listen(port, resolve));
  return {
    url: `http://localhost:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function buildTransportSwapEnv(transportSwaps) {
  if (!transportSwaps || typeof transportSwaps !== 'object') return {};
  const env = {};
  for (const [key, value] of Object.entries(transportSwaps)) {
    env[`SANDBOX_TRANSPORT_SWAP_${key.toUpperCase()}`] = String(value);
  }
  return env;
}

let instanceCounter = 0;

/**
 * Boot a sandbox instance of a registry-resolved venture app (FR-1), with
 * real transport-boundary instrumentation (FR-3) and a real teardown (FR-4).
 *
 * @param {{app: string, buildSha?: string, seedState?: object, transportSwaps?: object, clockInjection?: object, seedHooks?: object}} config
 * @param {object} [opts] injectable seams (tests never need a live app/process)
 * @param {object} [opts.registry] applications registry object ({applications: {...}})
 * @param {Function} [opts.spawnFn] child_process.spawn-shaped function
 * @param {Function} [opts.findFreePortFn]
 * @param {Function} [opts.pollHealthFn]
 * @param {Function} [opts.resolveAppFn]
 * @param {Function} [opts.startCaptureSinkFn]
 * @param {number} [opts.timeoutMs=30000]
 * @param {string} [opts.healthPath='/']
 * @returns {Promise<object>} boot handle
 */
export async function boot(config, opts = {}) {
  const validation = validateBootConfig(config);
  if (!validation.valid) {
    const e = new Error(`boot() config rejected: ${validation.violation}`);
    e.code = 'SANDBOX_CONFIG_VIOLATION';
    throw e;
  }

  const {
    registry = { applications: {} },
    spawnFn = defaultSpawn,
    findFreePortFn = findFreePort,
    pollHealthFn = pollHealth,
    resolveAppFn = resolveAppFromRegistry,
    startCaptureSinkFn = startCaptureSink,
    timeoutMs = 30000,
    healthPath = '/',
  } = opts;

  const appEntry = resolveAppFn(config.app, registry);
  const port = await findFreePortFn();
  const baseUrl = `http://localhost:${port}`;

  const captures = { console: [], network: [], sideEffectSinks: [] };
  const sink = await startCaptureSinkFn(captures);

  const env = {
    ...process.env,
    PORT: String(port),
    SANDBOX_CAPTURE_SINK_URL: sink.url,
    ...buildTransportSwapEnv(config.transportSwaps),
    ...(config.clockInjection ? { SANDBOX_CLOCK_INJECTED: '1', SANDBOX_CLOCK_FIXED_AT: config.clockInjection.fixedAt || '' } : {}),
    ...(config.seedHooks || config.seedState ? { SEED_HOOKS: 'enabled', SANDBOX_SEED_STATE: JSON.stringify(config.seedState || config.seedHooks || {}) } : {}),
  };

  const child = spawnFn('npm', ['run', 'dev'], { cwd: appEntry.local_path, env });
  if (child.stdout) child.stdout.on('data', (d) => captures.console.push({ stream: 'stdout', line: d.toString(), at: Date.now() }));
  if (child.stderr) child.stderr.on('data', (d) => captures.console.push({ stream: 'stderr', line: d.toString(), at: Date.now() }));

  const healthy = await pollHealthFn(`${baseUrl}${healthPath}`, { timeoutMs });
  if (!healthy) {
    child.kill();
    await sink.close();
    const e = new Error(`sandbox boot() timed out waiting for ${baseUrl}${healthPath} to become healthy`);
    e.code = 'SANDBOX_BOOT_TIMEOUT';
    throw e;
  }

  instanceCounter += 1;
  const instanceId = `sandbox-${Date.now()}-${instanceCounter}`;
  let torndown = false;

  return {
    instanceId,
    app: config.app,
    port,
    baseUrl,
    pid: child.pid,
    instanceSource: 'local-sandbox-interim',
    buildSha: config.buildSha || null,
    captures,
    captureSinkUrl: sink.url,
    async teardown() {
      if (torndown) return;
      torndown = true;
      child.kill();
      await sink.close();
    },
  };
}
