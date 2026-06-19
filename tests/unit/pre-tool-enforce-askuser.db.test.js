/**
 * SD-FDBK-INFRA-CREDS-FREE-ASKUSER-001 — CREDS-FREE fallback for the AskUserQuestion
 * worker-block (ENFORCEMENT 12 in scripts/hooks/pre-tool-enforce.cjs).
 *
 * BUG: resolveSessionContext() reads SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY and fail-OPENS
 * (meta=null) when creds are absent. Live worker hooks currently run WITHOUT those creds,
 * so the DB-only guard fail-opened and workers successfully called AskUserQuestion, hanging
 * their /loop (the #1 attrition cause).
 *
 * FIX: a creds-free worker signal — cwd inside .worktrees/ — blocks EVEN WHEN meta=null,
 * while the DB path stays authoritative when creds ARE present, and a RESOLVED
 * coordinator/Adam is never false-blocked even inside a worktree.
 *
 * These spawn the REAL hook subprocess feeding the PreToolUse stdin payload (which carries
 * `cwd`). Cases that need a resolved metadata row stand up a tiny local HTTP server that
 * mimics the Supabase REST claude_sessions endpoint and point SUPABASE_URL at it.
 *
 * NOTE: each case uses a UNIQUE session_id and (where Bash) a UNIQUE command so the
 * stateful RCA repeat-blocker (ENFORCEMENT 11) can never pollute a control case.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { resolve } from 'path';
import http from 'http';

const HOOK_PATH = resolve(process.cwd(), 'scripts/hooks/pre-tool-enforce.cjs');

// A fabricated worktree cwd (fleet WORKER signal) and a repo-root cwd (privileged sessions).
const WORKTREE_CWD = resolve(process.cwd(), '.worktrees', 'SD-TEST-CREDS-FREE-001');
const ROOT_CWD = process.cwd();

let _servers = [];
afterEach(() => {
  for (const s of _servers) { try { s.close(); } catch { /* ignore */ } }
  _servers = [];
});

/**
 * Spawn the hook ASYNCHRONOUSLY with a PreToolUse stdin payload. Returns a promise of
 * { status, stdout, stderr }.
 *
 * MUST be async (not spawnSync): the DB-path cases stand up an in-process HTTP mock server
 * in THIS Node process, so the parent event loop must stay free to serve the child's fetch
 * while the hook runs — spawnSync would block the loop and the mock would never answer.
 *
 * env overrides are merged onto a CLEANED base that strips any inherited Supabase creds so
 * "credless" cases are genuinely credless regardless of the runner's environment.
 */
function runHook({ payload, env = {} }) {
  return new Promise((resolveP) => {
    const baseEnv = { ...process.env };
    delete baseEnv.SUPABASE_URL;
    delete baseEnv.SUPABASE_SERVICE_ROLE_KEY;
    // Disable the RCA tiered enforcement so it can never interfere with control cases.
    baseEnv.LEO_RCA_ENFORCEMENT = 'off';
    const child = spawn(process.execPath, [HOOK_PATH], {
      env: { ...baseEnv, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    const killer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, 15000);
    child.on('close', (status) => {
      clearTimeout(killer);
      resolveP({ status, stdout, stderr });
    });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

/**
 * Stand up a local HTTP server that mimics the Supabase REST API the hook calls:
 *  - GET  /rest/v1/claude_sessions?...  → returns [metadataRow] (or [] for none)
 *  - POST /rest/v1/permission_audit_log → 201 (audit sink; body ignored)
 * Returns { url } and registers it for afterEach teardown.
 */
function startSupabaseMock({ metadataRow }) {
  return new Promise((resolveP) => {
    const server = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url.includes('/rest/v1/claude_sessions')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(metadataRow ? [metadataRow] : []));
        return;
      }
      // Drain & accept everything else (audit POSTs, etc.)
      req.resume();
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
    server.listen(0, '127.0.0.1', () => {
      _servers.push(server);
      const { port } = server.address();
      resolveP({ url: `http://127.0.0.1:${port}` });
    });
  });
}

describe('ENFORCEMENT 12 — CREDS-FREE AskUserQuestion worker block (SD-FDBK-INFRA-CREDS-FREE-ASKUSER-001)', () => {
  // (a) THE KEY NEW CASE: worker cwd in .worktrees/ + meta=null (credless) → BLOCK (exit 2)
  it('(a) BLOCKS a credless worker whose cwd is inside .worktrees/ (exit 2)', async () => {
    const r = await runHook({
      payload: {
        session_id: 'creds-free-test-a-worker',
        tool_name: 'AskUserQuestion',
        tool_input: { questions: [{ question: 'a-unique?', options: ['X'] }] },
        hook_event_name: 'PreToolUse',
        cwd: WORKTREE_CWD,
      },
      // intentionally NO SUPABASE creds → resolveSessionContext returns meta=null
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/ENF-NO-ASKUSER-WORKER/);
  });

  // (b) coordinator cwd in repo root + meta=null (credless) → ALLOW (exit 0)
  it('(b) ALLOWS a credless session whose cwd is the repo root (exit 0)', async () => {
    const r = await runHook({
      payload: {
        session_id: 'creds-free-test-b-root',
        tool_name: 'AskUserQuestion',
        tool_input: { questions: [{ question: 'b-unique?', options: ['X'] }] },
        hook_event_name: 'PreToolUse',
        cwd: ROOT_CWD,
      },
    });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/ENF-NO-ASKUSER-WORKER/);
  });

  // (c) cwd in .worktrees/ but meta RESOLVES is_coordinator:true → ALLOW (exit 0)
  //     edge: never false-block a RESOLVED coordinator even when it runs inside a worktree
  it('(c) ALLOWS a RESOLVED coordinator even with a .worktrees/ cwd (exit 0)', async () => {
    const { url } = await startSupabaseMock({
      metadataRow: { metadata: { is_coordinator: true }, loop_state: 'active' },
    });
    const r = await runHook({
      payload: {
        session_id: 'creds-free-test-c-coordinator',
        tool_name: 'AskUserQuestion',
        tool_input: { questions: [{ question: 'c-unique?', options: ['X'] }] },
        hook_event_name: 'PreToolUse',
        cwd: WORKTREE_CWD,
      },
      env: { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: 'test-key' },
    });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/ENF-NO-ASKUSER-WORKER/);
  });

  // (d) existing DB path still blocks a worker WITH creds (loop_state=active, no callsign)
  it('(d) DB path still BLOCKS a resolved /loop worker with creds (exit 2)', async () => {
    const { url } = await startSupabaseMock({
      metadataRow: { metadata: { source: 'startup' }, loop_state: 'active' },
    });
    const r = await runHook({
      payload: {
        session_id: 'creds-free-test-d-dbworker',
        tool_name: 'AskUserQuestion',
        tool_input: { questions: [{ question: 'd-unique?', options: ['X'] }] },
        hook_event_name: 'PreToolUse',
        // cwd at ROOT so the ONLY block signal is the DB path, proving it still works
        cwd: ROOT_CWD,
      },
      env: { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: 'test-key' },
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/ENF-NO-ASKUSER-WORKER/);
  });

  // (e) worker cwd in .worktrees/ + a non-AskUserQuestion tool (Bash) → ALLOW (untouched)
  it('(e) does NOT touch a non-AskUserQuestion tool (Bash) from a worktree cwd (exit 0)', async () => {
    const r = await runHook({
      payload: {
        session_id: 'creds-free-test-e-bash',
        tool_name: 'Bash',
        tool_input: { command: 'echo creds-free-test-e-unique-command' },
        hook_event_name: 'PreToolUse',
        cwd: WORKTREE_CWD,
      },
    });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/ENF-NO-ASKUSER-WORKER/);
  });

  // (f) cwd undefined / garbage → no throw, ALLOW (fail-safe)
  it('(f) cwd undefined → no throw, ALLOW (fail-safe, exit 0)', async () => {
    const r = await runHook({
      payload: {
        session_id: 'creds-free-test-f-nocwd',
        tool_name: 'AskUserQuestion',
        tool_input: { questions: [{ question: 'f-unique?', options: ['X'] }] },
        hook_event_name: 'PreToolUse',
        // cwd intentionally OMITTED → _CWD falls back to process.cwd() (repo root) → not worktree
      },
    });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/ENF-NO-ASKUSER-WORKER/);
  });

  it('(f2) garbage non-string cwd → no throw, ALLOW (fail-safe, exit 0)', async () => {
    const r = await runHook({
      payload: {
        session_id: 'creds-free-test-f2-garbage',
        tool_name: 'AskUserQuestion',
        tool_input: { questions: [{ question: 'f2-unique?', options: ['X'] }] },
        hook_event_name: 'PreToolUse',
        cwd: { not: 'a-string' }, // non-string → guarded → falls back to process.cwd()
      },
    });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/ENF-NO-ASKUSER-WORKER/);
  });
});
