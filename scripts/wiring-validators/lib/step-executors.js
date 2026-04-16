/**
 * Step executors for e2e-demo-recorder.
 *
 * SD-LEO-WIRING-VERIFICATION-FRAMEWORK-ORCH-001-E (FR-3)
 *
 * Three executors keyed by instruction prefix:
 *   - shell (default): child_process.spawn with per-step timeout
 *   - sql (instruction starts with SELECT/WITH): supabase rpc/.from
 *   - http (instruction starts with GET / POST ): node-native fetch
 *
 * Selection is deterministic by instruction prefix — no LLM in the runtime path.
 *
 * Each executor returns { exit_code, stdout, stderr, duration_ms, timed_out }.
 * Stdout/stderr are NOT truncated here — truncation is the caller's concern
 * so the matcher always sees the full value.
 */

import { spawn } from 'node:child_process';

const DEFAULT_STEP_TIMEOUT_MS = 60000;

/**
 * Decide which executor handles this step.
 * @param {string} instruction
 * @returns {'sql' | 'http' | 'shell'}
 */
export function chooseExecutor(instruction) {
  if (typeof instruction !== 'string') return 'shell';
  const trimmed = instruction.trim();
  const upper = trimmed.toUpperCase();
  if (upper.startsWith('SELECT ') || upper.startsWith('WITH ')) return 'sql';
  if (upper.startsWith('GET ') || upper.startsWith('POST ') ||
      upper.startsWith('PUT ') || upper.startsWith('DELETE ')) return 'http';
  return 'shell';
}

/**
 * Execute a shell command and capture output.
 * Uses platform-aware shell invocation: cmd.exe on Windows, bash elsewhere.
 *
 * @param {string} instruction - shell command line
 * @param {object} opts - { timeout_ms, cwd, env }
 * @returns {Promise<{exit_code, stdout, stderr, duration_ms, timed_out}>}
 */
export async function executeShell(instruction, opts = {}) {
  const timeout_ms = opts.timeout_ms ?? Number(process.env.STEP_TIMEOUT_MS ?? DEFAULT_STEP_TIMEOUT_MS);
  const cwd = opts.cwd ?? process.cwd();
  const env = opts.env ?? process.env;
  const isWindows = process.platform === 'win32';
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const child = isWindows
      ? spawn('cmd.exe', ['/c', instruction], { cwd, env })
      : spawn('bash', ['-c', instruction], { cwd, env });

    let stdout = '';
    let stderr = '';
    let timed_out = false;

    const timer = setTimeout(() => {
      timed_out = true;
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      // Force-kill 1s later if still alive
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, 1000);
    }, timeout_ms);

    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exit_code: code,
        stdout,
        stderr: timed_out ? stderr + `\n[step exceeded timeout ${timeout_ms}ms]` : stderr,
        duration_ms: Date.now() - startedAt,
        timed_out
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        exit_code: null,
        stdout,
        stderr: stderr + `\nspawn error: ${err.message}`,
        duration_ms: Date.now() - startedAt,
        timed_out: false
      });
    });
  });
}

/**
 * Execute a SQL SELECT/WITH statement against supabase.
 * Uses .rpc('exec_readonly_sql', { sql }) if the helper RPC exists,
 * otherwise falls back to logging an explanatory error to stderr.
 *
 * @param {string} instruction - SQL string starting with SELECT or WITH
 * @param {object} opts - { supabase, timeout_ms }
 * @returns {Promise<{exit_code, stdout, stderr, duration_ms, timed_out}>}
 */
export async function executeSql(instruction, opts = {}) {
  const supabase = opts.supabase;
  const timeout_ms = opts.timeout_ms ?? Number(process.env.STEP_TIMEOUT_MS ?? DEFAULT_STEP_TIMEOUT_MS);
  const startedAt = Date.now();

  if (!supabase) {
    return {
      exit_code: 1,
      stdout: '',
      stderr: 'No supabase client provided to executeSql; cannot run SQL step',
      duration_ms: Date.now() - startedAt,
      timed_out: false
    };
  }

  try {
    const result = await Promise.race([
      supabase.rpc('exec_readonly_sql', { sql: instruction }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout_ms))
    ]);
    if (result?.error) {
      return {
        exit_code: 1,
        stdout: '',
        stderr: `SQL error: ${result.error.message ?? JSON.stringify(result.error)}`,
        duration_ms: Date.now() - startedAt,
        timed_out: false
      };
    }
    return {
      exit_code: 0,
      stdout: JSON.stringify(result?.data ?? null, null, 2),
      stderr: '',
      duration_ms: Date.now() - startedAt,
      timed_out: false
    };
  } catch (err) {
    const isTimeout = err?.message === 'timeout';
    return {
      exit_code: isTimeout ? null : 1,
      stdout: '',
      stderr: isTimeout ? `[step exceeded timeout ${timeout_ms}ms]` : `SQL exception: ${err.message}`,
      duration_ms: Date.now() - startedAt,
      timed_out: isTimeout
    };
  }
}

/**
 * Execute an HTTP request. Instruction format: "METHOD url [body]".
 * Body, if present, is the rest of the line and may be JSON.
 *
 * @param {string} instruction
 * @param {object} opts - { timeout_ms, headers }
 * @returns {Promise<{exit_code, stdout, stderr, duration_ms, timed_out}>}
 */
export async function executeHttp(instruction, opts = {}) {
  const timeout_ms = opts.timeout_ms ?? 30000;
  const startedAt = Date.now();

  const trimmed = instruction.trim();
  const firstSpace = trimmed.indexOf(' ');
  const method = trimmed.slice(0, firstSpace).toUpperCase();
  const rest = trimmed.slice(firstSpace + 1).trim();
  // url is up to next whitespace; body is anything after
  const urlEnd = rest.search(/\s/);
  const url = urlEnd === -1 ? rest : rest.slice(0, urlEnd);
  const body = urlEnd === -1 ? null : rest.slice(urlEnd + 1).trim();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout_ms);

  try {
    const fetchOpts = {
      method,
      headers: opts.headers ?? { 'Content-Type': 'application/json' },
      signal: controller.signal
    };
    if (body && method !== 'GET') fetchOpts.body = body;

    const res = await fetch(url, fetchOpts);
    clearTimeout(timer);
    const text = await res.text();
    return {
      exit_code: res.ok ? 0 : 1,
      stdout: `HTTP ${res.status} ${res.statusText}\n${text}`,
      stderr: '',
      duration_ms: Date.now() - startedAt,
      timed_out: false
    };
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err.name === 'AbortError';
    return {
      exit_code: null,
      stdout: '',
      stderr: isTimeout ? `[HTTP step exceeded timeout ${timeout_ms}ms]` : `HTTP error: ${err.message}`,
      duration_ms: Date.now() - startedAt,
      timed_out: isTimeout
    };
  }
}

/**
 * Top-level executor dispatcher.
 */
export async function executeStep(instruction, opts = {}) {
  const kind = chooseExecutor(instruction);
  if (kind === 'sql') return executeSql(instruction, opts);
  if (kind === 'http') return executeHttp(instruction, opts);
  return executeShell(instruction, opts);
}
