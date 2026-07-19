#!/usr/bin/env node
/**
 * LEO Protocol Enforcement Hook (PreToolUse)
 *
 * Replaces text-based rules in CLAUDE.md with programmatic enforcement:
 * 1. Background execution ban (NC-006) - HARD BLOCK (exit 2)
 * 2. Tool policy profile validation - LOG-ONLY (stdout warning, exit 0)
 * 3. Sub-agent routing advisory - SOFT HINT (stdout, exit 0)
 *
 * 4. Worktree claim guard (PAT-CLMMULTI-001) - HARD BLOCK (exit 2)
 * 5. DB-only strategic artifacts (SD-LEO-INFRA-ONLY-ENFORCEMENT-STRATEGIC-002) - HARD BLOCK (exit 2)
 * 6. MCP write operation block (SD-LEO-INFRA-MCP-READ-WRITE-001) - HARD BLOCK (exit 2)
 * 7. Schema pre-flight validation (SD-LEO-ORCH-SELF-HEALING-DATABASE-001-C) - TIERED (blocking/advisory/skip)
 * 8. Permission audit trail (SD-LEO-INFRA-LEO-PRIMITIVE-PARITY-001-C) - ASYNC WRITE (fire-and-forget)
 * 9. SD creation skill enforcement (ENF-SD-CREATE-SKILL) - HARD BLOCK (exit 2)
 * 10. D1 Bugfix TDD Prove-It Gate - HARD BLOCK (exit 2)
 * 11. RCA Tiered Enforcement (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-129) - TIERED (warn on 2nd, block on 3rd)
 * 12. npm install Concurrency Guard (QF-20260426-822) - HARD BLOCK (exit 2)
 * 13. Worktree Hygiene Guard (SD-LEO-INFRA-PRE-TOOL-WORKTREE-GUARD-001) - HARD BLOCK on main/master + WARN-ONCE on inherited dirt
 * 15. Force-Push Gate (SD-FDBK-INFRA-ALLOW-FORCE-LEASE-001) - HARD BLOCK by default; OVERRIDE on solo SD/QF feature branches when LEO_FORCE_PUSH_OWN_BRANCH=allow
 * 17. Shared-Tree Hijack Guard (SD-LEO-FEAT-SHARED-TREE-HIJACK-001) - HARD BLOCK on HEAD-moving git op (checkout/switch/reset --hard) in the shared ROOT while a foreign coordinator is active; fail-open
 *
 * Hook API:
 *   Input:  CLAUDE_TOOL_INPUT (JSON), CLAUDE_TOOL_NAME (string)
 *   Output: exit(0) = allow, exit(2) = block (stderr = rejection message)
 *           stdout = advisory feedback shown to model
 */

// QF-20260504-932: Read PreToolUse stdin payload synchronously at module load.
// Per RCA #2 (2026-05-04), Claude Code does NOT propagate CLAUDE_TOOL_NAME,
// CLAUDE_TOOL_INPUT, or CLAUDE_SESSION_ID env vars to PreToolUse hook
// subprocesses — the canonical source is the JSON {session_id, tool_name,
// tool_input, hook_event_name, ...} payload passed via stdin (verified contract
// in lib/hooks/session-id.cjs JSDoc). Pre-fix, all 13 enforcement rules in
// this file silently no-op'd because TOOL_NAME/TOOL_INPUT_RAW resolved to ''.
//
// fs.readFileSync(0) reads stdin sync to EOF. Claude Code closes stdin before
// the hook process gets control, so this won't hang. Wrapped in try/catch:
// any failure (no stdin, malformed JSON, etc) falls through to env vars.
const _stdinPayload = (() => {
  try {
    const raw = require('fs').readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
})();

const TOOL_NAME = _stdinPayload.tool_name || process.env.CLAUDE_TOOL_NAME || '';
const TOOL_INPUT_RAW = _stdinPayload.tool_input != null
  ? (typeof _stdinPayload.tool_input === 'string'
      ? _stdinPayload.tool_input
      : JSON.stringify(_stdinPayload.tool_input))
  : (process.env.CLAUDE_TOOL_INPUT || '');

// --- ENFORCEMENT 8: Permission Audit Trail (SD-LEO-INFRA-LEO-PRIMITIVE-PARITY-001-C) ---
// Fire-and-forget async write to permission_audit_log table.
// NEVER blocks enforcement decisions. All errors swallowed.
// Uses native fetch (Node 18+) — no new dependencies.

/**
 * Generate a short hash of the tool input for audit correlation.
 * Uses crypto module (built-in Node.js) for SHA-256, truncated to 16 chars.
 * @param {string} inputRaw - Raw JSON string of tool input
 * @returns {string} 16-char hex hash
 */
function _auditContextHash(inputRaw) {
  try {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(inputRaw || '').digest('hex').slice(0, 16);
  } catch {
    return 'unknown';
  }
}

/**
 * Async write to permission_audit_log. Returns a promise so block-then-exit
 * call sites can await briefly before process.exit (otherwise the fire-and-forget
 * fetch is dropped before the network round-trip completes — QF-20260510-148).
 * Allow/warn paths still treat it as fire-and-forget (no await) and pay no latency.
 * Failures are logged to stderr but NEVER block enforcement.
 *
 * @param {string} sessionId   - Claude Code session ID
 * @param {string} toolName    - Tool being evaluated (CLAUDE_TOOL_NAME)
 * @param {string} ruleCode    - Enforcement rule code (e.g. 'NC-006', 'PAT-CLMMULTI-001')
 * @param {string} ruleDesc    - Human-readable rule description
 * @param {string} outcome     - 'allow' | 'block' | 'override' | 'warn'
 * @param {Object} [metadata]  - Additional context (never contains secrets)
 * @returns {Promise<void>}    - Resolves on POST completion (or skip/error)
 */
function auditPermissionDecision(sessionId, toolName, ruleCode, ruleDesc, outcome, metadata) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return Promise.resolve(); // Missing credentials — skip silently

    const url = supabaseUrl + '/rest/v1/permission_audit_log';
    const body = JSON.stringify({
      session_id: sessionId || 'unknown',
      tool_name: toolName || 'unknown',
      rule_code: ruleCode || 'UNKNOWN',
      rule_description: ruleDesc || null,
      outcome: outcome,
      context_hash: _auditContextHash(TOOL_INPUT_RAW),
      metadata: metadata || {}
    });

    // Returns the fetch promise: callers awaiting it (block-then-exit paths) pay
    // ~one round-trip; callers that ignore it (allow/warn) keep prior fire-and-forget.
    return fetch(url, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body
    }).catch(err => {
      // Swallow network errors — audit must never block enforcement
      process.stderr.write('[pre-tool-enforce] AUDIT WRITE FAILED (non-blocking): ' + err.message + '\n');
    });
  } catch (e) {
    // Swallow all errors — audit must never throw
    process.stderr.write('[pre-tool-enforce] AUDIT ERROR (non-blocking): ' + e.message + '\n');
    return Promise.resolve();
  }
}

/**
 * Await an audit-write promise (with timeout cap) before exiting.
 * Generalizes the QF-20260510-148 inline pattern so every block-then-exit
 * site persists its permission_audit_log row instead of dropping it under
 * fire-and-forget + immediate process.exit. Audit failures NEVER block exit.
 *
 * The setImmediate yield before process.exit is load-bearing: without it,
 * libuv on Windows can assert on src\win\async.c:76 (`!(handle->flags &
 * UV_HANDLE_CLOSING)`) when process.exit races with the in-flight fetch's
 * async-handle cleanup, surfacing as STATUS_STACK_BUFFER_OVERRUN (0xC0000409).
 *
 * @param {Promise<void>} auditPromise - Return value from auditPermissionDecision
 * @param {number} code                - process.exit() status code (typically 2)
 * @param {number} [timeoutMs=1000]    - Max wait before forcing exit
 * @returns {Promise<never>}           - Never resolves; always exits process
 */
async function auditAndExit(auditPromise, code, timeoutMs) {
  const ms = (typeof timeoutMs === 'number') ? timeoutMs : 1000;
  await Promise.race([
    auditPromise,
    new Promise(resolve => setTimeout(resolve, ms))
  ]).catch(() => { /* audit never blocks enforcement */ });
  await drainUndiciPool();
  process.exit(code);
}

/**
 * Tear down undici's keep-alive socket pool BEFORE process.exit. Without this,
 * Windows libuv asserts on src\win\async.c:76 (`!(handle->flags &
 * UV_HANDLE_CLOSING)`) when process.exit races with an in-flight HTTP socket's
 * async-handle cleanup, surfacing as STATUS_STACK_BUFFER_OVERRUN (0xC0000409).
 * EVERY exit that follows a fetch() in this hook must drain first — not just the
 * block paths. Fail-open: undici unavailable means there is no pool to drain.
 */
async function drainUndiciPool() {
  try {
    const undici = require('undici');
    if (undici && typeof undici.getGlobalDispatcher === 'function') {
      const d = undici.getGlobalDispatcher();
      if (d && typeof d.destroy === 'function') {
        await Promise.race([
          d.destroy(),
          new Promise(resolve => setTimeout(resolve, 200))
        ]).catch(() => {});
      }
    }
  } catch { /* fail-open: undici unavailable means no pool to drain */ }
}

// Derive session ID once at module load time. QF-20260504-932: stdin payload
// (Claude Code's PreToolUse contract) takes precedence over env vars, which
// are not propagated to PreToolUse subprocesses.
const _SESSION_ID = _stdinPayload.session_id ||
  process.env.SESSION_ID ||
  process.env.CLAUDE_SESSION_ID ||
  process.env.LEO_SESSION_ID ||
  'unknown';

// QF-20260504-932: test-only mode — print resolved variables and exit before
// any enforcement runs. Tests use this to verify stdin/env resolution without
// triggering side-effects (audit writes, exit-2 blocks). Production hooks
// never set TEST_DUMP_RESOLVED.
if (process.env.TEST_DUMP_RESOLVED === '1') {
  console.log(JSON.stringify({
    tool_name: TOOL_NAME,
    tool_input_raw: TOOL_INPUT_RAW,
    session_id: _SESSION_ID
  }));
  process.exit(0);
}

/**
 * SD-LEO-INFRA-WORKTREE-CONTENTION-CLEANUP-001 (FR-5/AC-6): detect whether THIS
 * session is "stranded" — it holds an active SD claim whose provisioned worktree
 * has been removed out from under it (reaped), leaving it operating on main.
 *
 * CONSERVATIVE by design: returns a strand descriptor ONLY on positive
 * confirmation (a claim row whose worktree_path is set but no longer exists on
 * disk). Missing creds, query failure, timeout, or no matching row → returns
 * null, so the caller falls through to the unchanged hard block (fail-closed —
 * the guard is never weakened for a session that genuinely chose to edit main).
 *
 * @param {string} sessionId
 * @returns {Promise<{sd_key:string, worktree_path:string}|null>}
 */
async function detectStrandedClaim(sessionId) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey || !sessionId) return null;
    const fs = require('fs');
    const url = supabaseUrl +
      '/rest/v1/strategic_directives_v2?claiming_session_id=eq.' +
      encodeURIComponent(sessionId) + '&select=sd_key,worktree_path';
    const resp = await Promise.race([
      fetch(url, { headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey } }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
    ]);
    if (!resp || !resp.ok) return null;
    const rows = await resp.json();
    for (const r of (Array.isArray(rows) ? rows : [])) {
      if (r && r.worktree_path && !fs.existsSync(r.worktree_path)) {
        return { sd_key: r.sd_key, worktree_path: r.worktree_path };
      }
    }
    return null;
  } catch {
    return null; // any error → not confirmed → preserve the hard block
  }
}

// PAT-CLMMULTI-002: resolve THIS session's claimed sd_key from the DB (session-scoped
// via claiming_session_id; mirrors detectStrandedClaim's query/1.5s-timeout/fail-open).
// Returns null on missing creds / no claim / failure / timeout - caller fail-opens.
async function resolveSessionClaimedSdKey(sessionId) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey || !sessionId) return null;
    const url = supabaseUrl +
      '/rest/v1/strategic_directives_v2?claiming_session_id=eq.' +
      encodeURIComponent(sessionId) + '&select=sd_key&limit=1';
    const resp = await Promise.race([
      fetch(url, { headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey } }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
    ]);
    if (!resp || !resp.ok) return null;
    const rows = await resp.json();
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    return row && row.sd_key ? row.sd_key : null;
  } catch {
    return null;
  }
}

// SD-FDBK-ENH-ENFORCEMENT-IDEA-OPERATOR-001: resolve THIS session's claude_sessions.metadata
// (mirrors resolveSessionClaimedSdKey: REST + 1.5s timeout + fail-open → null on any error).
// Used only by the AskUserQuestion guard, so the lookup happens at most once per
// AskUserQuestion call (a rare tool), never on the hot path of other tools.
const { isBlockableWorker, decideAskUserBlock, ASKUSER_DENY_MESSAGE } = require('./askuser-worker-policy.cjs');
// Resolves the calling session's { metadata, loopState } for the AskUserQuestion guard.
// loop_state is a TOP-LEVEL claude_sessions column (active|awaiting_tick|exited|unknown) — it is
// the autonomy signal that catches a /loop worker the coordinator has not yet callsigned.
// Returns { metadata:null, loopState:null } on ANY error → caller applies the positive-worker floor.
//
// SD-LEO-INFRA-ASKUSER-GUARD-FAILOPEN-HARDEN-001 (FR-3): a SINGLE 1.5s timeout previously dropped a
// KNOWN worker straight to fail-open ALLOW (the 2026-06-20 hang). One transient hiccup must not do
// that, so this does ONE bounded retry before giving up. AskUserQuestion is a rare tool, so the extra
// round-trip is never on a hot path.
async function _resolveSessionContextOnce(sessionId) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || !sessionId || sessionId === 'unknown') return { metadata: null, loopState: null, resolved: false };
  const url = supabaseUrl +
    '/rest/v1/claude_sessions?session_id=eq.' +
    encodeURIComponent(sessionId) + '&select=metadata,loop_state&limit=1';
  // clearTimeout in finally: when fetch wins the race, the timeout promise would otherwise stay
  // pending and reject at 1500ms with NO handler → an unhandled rejection. Clearing keeps it safe.
  let _timer;
  const resp = await Promise.race([
    fetch(url, { headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey } }),
    new Promise((_, reject) => { _timer = setTimeout(() => reject(new Error('timeout')), 1500); }),
  ]).finally(() => clearTimeout(_timer));
  if (!resp || !resp.ok) return { metadata: null, loopState: null, resolved: false };
  const rows = await resp.json();
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!row) return { metadata: null, loopState: null, resolved: true }; // resolved: session simply has no row
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : null;
  const loopState = typeof row.loop_state === 'string' ? row.loop_state : null;
  return { metadata, loopState, resolved: true };
}

async function resolveSessionContext(sessionId) {
  // FR-3: one bounded retry — a transient timeout/network blip must not silently fail-open a worker.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await _resolveSessionContextOnce(sessionId);
      if (r.resolved) return { metadata: r.metadata, loopState: r.loopState };
      // not resolved (timeout/non-ok/missing creds) → retry once more, then give up
    } catch {
      // transient error → retry
    }
  }
  return { metadata: null, loopState: null }; // give up → caller applies the positive-worker floor
}

// --- WORKTREE CLAIM GUARD (PAT-CLMMULTI-001) ---
// Regex to detect paths inside .worktrees/<SD-KEY>/
const WORKTREE_PATH_RE = /[/\\]\.worktrees[/\\]([^/\\]+)/;

// --- TOOL POLICY PROFILES (from lib/tool-policy.js) ---
// Inline copy for CJS hook compatibility (lib/tool-policy.js is ESM).
const PROFILE_ALLOWLISTS = {
  full: null,
  coding: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'NotebookEdit', 'Task', 'TeamCreate', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'SendMessage'],
  readonly: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
  minimal: ['Read']
};

// --- AGENT ROUTING TABLE ---
// Source of truth: config/agent-keywords-routing.json
// Loaded once via require() (cached by Node.js module system).
const path = require('path');
let AGENT_ROUTING;
try {
  const configPath = path.resolve(__dirname, '..', '..', 'config', 'agent-keywords-routing.json');
  const routingConfig = require(configPath);
  AGENT_ROUTING = Object.entries(routingConfig.agents).map(([code, kw]) => ({
    agent: code.toLowerCase() + '-agent',
    keywords: kw.primary || []
  }));
} catch (e) {
  // Fallback: if JSON config missing, use empty routing (fail-open)
  process.stderr.write('[pre-tool-enforce] Warning: agent-keywords-routing.json not found, routing disabled\n');
  AGENT_ROUTING = [];
}

// --- SCHEMA PRE-FLIGHT VALIDATION CONFIG (SD-LEO-ORCH-SELF-HEALING-DATABASE-001-C) ---
// Maps script path patterns to enforcement tiers.
// 'blocking': exit(2) on validation failure. 'advisory': warn only. 'skip': no validation.
const VALIDATION_CONFIG = {
  blocking: [
    /database\/migrations\//,
    /scripts\/handoff\.js/,
    /scripts\/unified-handoff-system\.js/,
    /scripts\/add-prd-to-database\.js/,
    /scripts\/add-sd-to-database\.js/,
  ],
  advisory: [
    /scripts\//,
    /lib\//,
  ],
  // Everything else is implicitly 'skip'
};

// Supabase operation detection + execution gate (ENF-05 / QF-20260525-658).
// SUPABASE_PATTERNS is the single source consumed here AND for the ENFORCEMENT 7
// gate; isSupabaseExecution distinguishes a real call from a quoted mention.
const { SUPABASE_PATTERNS, isSupabaseExecution } = require(path.resolve(__dirname, 'lib', 'supabase-operative.cjs'));

/**
 * Determine enforcement tier for the current Bash command context.
 * Checks CWD and command content against VALIDATION_CONFIG path patterns.
 * @param {string} command - The Bash command string
 * @returns {'blocking'|'advisory'|'skip'}
 */
function getEnforcementTier(command) {
  for (const pattern of VALIDATION_CONFIG.blocking) {
    if (pattern.test(command)) return 'blocking';
  }
  for (const pattern of VALIDATION_CONFIG.advisory) {
    if (pattern.test(command)) return 'advisory';
  }
  return 'skip';
}

/**
 * Extract table name from a Bash command containing Supabase patterns.
 * @param {string} command
 * @returns {string|null}
 */
function extractTableName(command) {
  for (const pattern of SUPABASE_PATTERNS) {
    const match = command.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * QF-20260609-547: split a command into per-`.from('table')` segments so column checks are scoped (schema-lint-disable-line: doc comment, not a real table reference)
 * to the NEAREST preceding `.from()`. Previously a compound `node -e` touching two tables attributed
 * every extracted column to ONE table → cross-table false blocks (e.g. user_stories columns blamed
 * on product_requirements_v2). Falls back to extractTableName (rpc / other Supabase patterns) when no
 * `.from()` is present, preserving the prior single-table behavior.
 * @param {string} command
 * @returns {Array<{table: string, text: string}>}
 */
function extractTableSegments(command) {
  const fromRe = /\.from\(\s*['"`](\w+)['"`]\s*\)/g;
  const matches = [...command.matchAll(fromRe)];
  if (matches.length === 0) {
    const t = extractTableName(command);
    return t ? [{ table: t, text: command }] : [];
  }
  const segments = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : command.length;
    segments.push({ table: matches[i][1], text: command.slice(start, end) });
  }
  return segments;
}

/**
 * Extract column names from a Bash command (best-effort).
 * Detects columns from Supabase client method patterns.
 * @param {string} command
 * @returns {Object<string, *>}
 */
// SD-FDBK-INFRA-HARDEN-ORCHESTRATOR-CHILD-001: literal coercion for mutation values lives in
// a small shared, unit-tested module (this hook runs main() at load, so it cannot be required
// from a test — the pure coercion logic is extracted to be testable).
const { coerceLiteral } = require(path.resolve(__dirname, 'lib', 'coerce-literal.cjs'));

// QF-20260609-547: helpers for TOP-LEVEL-ONLY key extraction from a mutation object, so a
// jsonb-array/nested column value's inner keys are never mistaken for table columns.
function balancedBody(s, openIdx) {
  // Substring between the brace at openIdx and its matching close (exclusive); to end-of-string
  // if unbalanced (truncated command) — best-effort, advisory hook.
  if (openIdx < 0 || s[openIdx] !== '{') return '';
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return s.slice(openIdx + 1, i); }
  }
  return s.slice(openIdx + 1);
}
function stripNestedGroups(body) {
  // Collapse innermost {..}/[..] groups to a scalar placeholder, repeatedly, so only top-level
  // `key: value` pairs remain — prevents descent into nested objects/arrays (e.g. jsonb columns).
  let prev;
  do { prev = body; body = body.replace(/\{[^{}]*\}/g, 'null').replace(/\[[^\[\]]*\]/g, 'null'); } while (body !== prev);
  return body;
}

function extractParams(command) {
  const params = {};
  let match;

  // .eq('col', value), .neq('col', value), .gt('col', value), .lt('col', value), .gte/.lte
  const filterPattern = /\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|contains|containedBy)\(\s*['"`](\w+)['"`]/g;
  while ((match = filterPattern.exec(command)) !== null) {
    params[match[1]] = 'unknown';
  }

  // .select('col1, col2') — extract column names
  const selectMatch = command.match(/\.select\(\s*['"`]([^'"`]+)['"`]\s*\)/);
  if (selectMatch && selectMatch[1] !== '*') {
    selectMatch[1].split(',').forEach(col => {
      const clean = col.trim().split(':')[0].trim(); // handle aliases
      if (clean && clean !== '*') params[clean] = 'unknown';
    });
  }

  // .order('col') / .order('col', { ascending: true })
  const orderPattern = /\.order\(\s*['"`](\w+)['"`]/g;
  while ((match = orderPattern.exec(command)) !== null) {
    params[match[1]] = 'unknown';
  }

  // .in('col', [...])
  const inPattern = /\.in\(\s*['"`](\w+)['"`]/g;
  while ((match = inPattern.exec(command)) !== null) {
    params[match[1]] = 'unknown';
  }

  // .insert({ col: val, ... }) / .update({ col: val, ... }) / .upsert({ col: val, ... })
  // Extract object keys from simple { key: val } patterns
  // SD-FDBK-INFRA-HARDEN-ORCHESTRATOR-CHILD-001: extract keys AND coerce literal values
  // (true/false/number/quoted-string). Previously every value was stamped 'unknown', which
  // the schema-preflight then type-checked against the real column udt_name — falsely flagging
  // every non-string column (e.g. .update({ is_working_on: true }) → "Type mismatch" → BLOCK).
  // Non-literal values stay 'unknown' (the schema-preflight type-check-skip sentinel; the
  // unknown-column check still runs). Quoted-string alternative is first so values containing
  // commas/colons are captured whole before the [^,]+ fallback.
  // QF-20260609-547: the prior `\{([^}]+)\}` + flat kvPattern descended into nested objects/arrays
  // (e.g. a jsonb-array column like `success_metrics: [{ metric, target, acceptance }]`) and stamped
  // the INNER keys as columns of the table → false unknown-column BLOCK on valid commands. Now: grab
  // the BALANCED top-level object body, strip nested {..}/[..] groups to a scalar, then read only
  // top-level keys.
  const mutHeadPattern = /\.(?:insert|update|upsert)\(\s*\{/g;
  while ((match = mutHeadPattern.exec(command)) !== null) {
    const openIdx = command.indexOf('{', match.index);
    const objectBody = stripNestedGroups(balancedBody(command, openIdx));
    const kvPattern = /(\w+)\s*:\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|true|false|-?\d+(?:\.\d+)?|[^,]+)/g;
    let kvMatch;
    while ((kvMatch = kvPattern.exec(objectBody)) !== null) {
      params[kvMatch[1]] = coerceLiteral(kvMatch[2]);
    }
  }

  // .delete() doesn't have column params but may follow .eq() which is already handled

  return params;
}

/**
 * Run schema pre-flight validation on a Bash command.
 * Async — must be awaited. Fail-open on any error.
 * @param {string} command
 * @returns {Promise<void>}
 */
async function validateBeforeExecution(command) {
  // QF-20260609-547: validate each `.from()` segment against ITS OWN table + columns (scoped),
  // instead of attributing every column in the command to a single table.
  const segments = extractTableSegments(command);
  if (segments.length === 0) return; // No Supabase pattern detected

  const tier = getEnforcementTier(command);
  if (tier === 'skip') return;

  try {
    const { validateOperation } = require(path.resolve(__dirname, '..', '..', 'lib', 'schema-preflight.cjs'));
    for (const seg of segments) {
      const params = extractParams(seg.text);
      if (Object.keys(params).length === 0) continue; // No extractable params for this table
      const result = await validateOperation(seg.table, 'query', params);

      if (!result.valid) {
        if (tier === 'blocking') {
          const auditPromise = auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'SCHEMA_PREFLIGHT', 'Schema pre-flight validation failed', 'block', { tableName: seg.table, errors: result.errors });
          process.stderr.write(
            `SCHEMA VALIDATION FAILED (blocking):\n` +
            `  Table: ${seg.table}\n` +
            `  Errors: ${result.errors.join('; ')}\n` +
            `  Fix the column names or types before running this command.\n`
          );
          await auditAndExit(auditPromise, 2);
        } else {
          // Advisory: warn but allow
          auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'SCHEMA_PREFLIGHT_ADVISORY', 'Schema pre-flight validation warning', 'warn', { tableName: seg.table, errors: result.errors });
          console.log(
            `[schema-preflight] WARNING: ${result.errors.join('; ')} (table: ${seg.table})`
          );
        }
      }

      if (result.warnings.length > 0) {
        console.log(`[schema-preflight] ${result.warnings.join('; ')}`);
      }
    }
  } catch {
    // Fail-open: validation errors never block execution
  }
}

async function main() {
  let input;
  try {
    input = JSON.parse(TOOL_INPUT_RAW);
  } catch {
    // Not JSON or empty - nothing to enforce
    process.exit(0);
  }

  // --- ENFORCEMENT 12: Block AskUserQuestion in autonomous fleet-worker sessions ---
  // SD-FDBK-ENH-ENFORCEMENT-IDEA-OPERATOR-001: AskUserQuestion pauses the /loop forever
  // waiting for an absent human, stalling the SD + holding a worker slot. Workers must
  // escalate via /signal (options + recommendation + default-proceed) instead. Detection is
  // POSITIVE (only a confirmed fleet worker is blocked — has a fleet callsign and is not
  // coordinator/Adam/non_fleet); operator/chairman/coordinator/Adam and any unresolved
  // session are EXEMPT. The metadata lookup runs ONLY for this (rare) tool, and fail-OPEN
  // (any resolution error → meta=null → not blockable) so it can never wedge a tool call.
  if (TOOL_NAME === 'AskUserQuestion') {
    const { metadata: meta, loopState } = await resolveSessionContext(_SESSION_ID);
    // SD-LEO-INFRA-ASKUSER-GUARD-FAILOPEN-HARDEN-001 (FR-2): positive-worker FLOOR. If metadata is
    // momentarily unresolvable (timeout/post-completion/sub-agent), a session that PROVABLY holds an
    // sd_key claim is still a worker and must block — operator/chairman/Adam/coordinator never hold
    // SD claims, so the floor can never block them. resolveSessionClaimedSdKey is session-scoped
    // (claiming_session_id) + fail-soft. (Skip the claim lookup when meta already proves a worker.)
    let hasClaim = false;
    if (!isBlockableWorker(meta, loopState)) {
      try { hasClaim = !!(await resolveSessionClaimedSdKey(_SESSION_ID)); } catch { hasClaim = false; }
    }
    const decision = decideAskUserBlock({ meta, loopState, hasClaim });
    if (decision.block) {
      const callsign = (meta && ((meta.fleet_identity && meta.fleet_identity.callsign) || meta.callsign)) || null;
      const auditPromise = auditPermissionDecision(
        _SESSION_ID, TOOL_NAME, 'ENF-NO-ASKUSER-WORKER',
        'AskUserQuestion blocked for autonomous fleet worker (' + decision.reason + ')', 'block',
        { callsign, reason: decision.reason, hasClaim }
      );
      process.stderr.write(ASKUSER_DENY_MESSAGE + '\n');
      await auditAndExit(auditPromise, 2, 800);
    }
    // EXEMPT (coordinator/Adam/operator, or no positive worker evidence): allow. No other enforcement
    // applies to AskUserQuestion, so exit now — but drain undici FIRST. The
    // resolveSessionContext fetch above leaves a keep-alive socket whose libuv
    // async-handle is still closing; a raw process.exit here races it and trips
    // src\win\async.c:76 → STATUS_STACK_BUFFER_OVERRUN (verified: bare exit/fall-
    // through both crashed exempt sessions; draining the pool fixes it).
    await drainUndiciPool();
    process.exit(0);
  }

  // --- ENFORCEMENT 9: SD Creation Must Use /sd-create Skill ---
  // Blocks direct invocation of leo-create-sd.js via Bash.
  // SD creation must go through the /sd-create skill (Skill tool) to ensure
  // full wizard workflow: description enrichment, vision readiness, post-creation chaining.
  // Ref: feedback_always_use_sd_create_skill.md (2026-04-07)
  if (TOOL_NAME === 'Bash') {
    const cmd = input.command || '';
    // QF-20260504-484: Anchor matcher to actual `node ` invocations (program
    // boundary), not bare substring. Previous /leo-create-sd\.js/ false-
    // positived on (a) commands MENTIONING the script name in argument
    // strings (log-harness-bug.js descriptions, gh search, comments), and
    // (b) the /sd-create skill's own bash invocations following its
    // documented pattern — circular block. Pattern requires `node ` at
    // start-of-cmd or after ; && | ` , followed by optional path then
    // `leo-create-sd.js` at a word boundary. SD_CREATE_VIA_SKILL=1 prefix
    // and --help still bypass.
    const DIRECT_INVOCATION = /(^|[\s;&|`])node\s+\S*\bleo-create-sd\.js\b/;
    if (DIRECT_INVOCATION.test(cmd) && !/--help/.test(cmd) && !/SD_CREATE_VIA_SKILL=1/.test(cmd)) {
      const auditPromise = auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'ENF-SD-CREATE-SKILL', 'SD creation skill enforcement', 'block', {});
      process.stderr.write(
        'PROTOCOL VIOLATION (ENF-SD-CREATE-SKILL): Direct leo-create-sd.js invocation blocked.\n' +
        'Use the /sd-create skill instead: Skill tool with skill="sd-create"\n' +
        'The skill provides description enrichment, vision readiness assessment, and post-creation chaining.\n' +
        '(If invoking from inside the /sd-create skill, prefix with SD_CREATE_VIA_SKILL=1 — see .claude/commands/sd-create.md)\n'
      );
      await auditAndExit(auditPromise, 2);
    }
  }

  // --- ENFORCEMENT 12: npm install Concurrency Guard (QF-20260426-822) ---
  // Refuses Bash invocations of `npm install` / `npm i` / `npm ci` when a
  // sibling session is mid-extract. Two detection signals:
  //   (a) node_modules/.staging/ exists and is non-empty (npm's own
  //       extraction-staging dir; only present DURING tarball extraction)
  //   (b) another npm/node process is running an install/ci command
  // Either signal blocks (exit 2) with a recovery hint.
  // Disable in tests via LEO_NPM_INSTALL_GUARD=off.
  if (TOOL_NAME === 'Bash' && process.env.LEO_NPM_INSTALL_GUARD !== 'off') {
    const cmd = (input.command || '').trim();
    // QF-20260525-889 (sibling of QF-20260525-345 / RCA 6188492f): match `npm
    // install|i|ci` only as the OPERATIVE command — at start or after a true shell
    // separator (; | & ( newline, && ||), NOT after a bare space. The prior boundary
    // class `[\s;&|(]` admitted a space, so a mention of the phrase inside a quoted
    // argument (echo "run npm install first", git commit -m, docs) false-positived
    // and was blocked. Trailing `(?:\s+|$)` is unchanged (avoids "npm installation").
    const NPM_INSTALL_RE = /(?:^|[;&|(\n]|&&|\|\|)\s*npm\s+(install|i|ci)(?:\s+|$)/;
    if (NPM_INSTALL_RE.test(cmd) && !/--help/.test(cmd)) {
      try {
        const fs = require('fs');
        const path = require('path');
        const cwd = input.cwd || process.cwd();
        const stagingPath = path.join(cwd, 'node_modules', '.staging');
        let signal = null;
        try {
          if (fs.existsSync(stagingPath) && fs.readdirSync(stagingPath).length > 0) {
            signal = 'node_modules/.staging/ active';
          }
        } catch { /* unreadable = treat as inactive */ }
        if (!signal && process.env.LEO_NPM_INSTALL_GUARD_PS !== 'off') {
          try {
            const { execSync } = require('child_process');
            const out = process.platform === 'win32'
              ? execSync('wmic process where "name=\'node.exe\'" get ProcessId,CommandLine /FORMAT:CSV', { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] })
              : execSync('ps -eo pid,command', { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] });
            const myPid = String(process.pid);
            const peer = out.split('\n').find(l => /(npm-cli\.js|npm)\s.*(install|\bi\b|\bci\b)/.test(l) && !l.includes(myPid));
            if (peer) signal = `npm install peer process detected`;
          } catch { /* ps/wmic failure = no peer detected (fail-open) */ }
        }
        if (signal) {
          // QF-20260510-148: await audit before exit. Fire-and-forget + immediate
          // process.exit(2) was dropping the POST mid-flight — table had 0 rows for
          // NPM-INSTALL-RACE despite the rule firing. 1s timeout caps user-visible delay.
          const auditPromise = auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'NPM-INSTALL-RACE', 'npm install concurrency guard', 'block', { signal });
          process.stderr.write(
            `NPM INSTALL RACE GUARD (QF-20260426-822): refusing concurrent npm install.\n` +
            `  Signal: ${signal}\n` +
            `  Wait ~30-60s and retry, OR isolate via: npm run session:worktree -- --sd-key <key>\n` +
            `  If staging is stuck (no actual peer): rm -rf node_modules/.staging\n`
          );
          // QF-20260719-120: auditAndExit (same 1s audit cap) so this post-fetch exit
          // drains the undici pool — raw exit(2) here races the audit POST's async
          // handle and trips the src\win\async.c:76 libuv assertion.
          await auditAndExit(auditPromise, 2, 1000);
        }
      } catch { /* fail-open on any internal error */ }
    }
  }

  // --- ENFORCEMENT 12c: Destructive `npm ci` shared-store wipe guard (harness 95022758) ---
  // `npm ci` does `rm -rf node_modules` first. Through a worktree junction, or in
  // the main repo root while worktrees junction to it, that rm -rf wipes the
  // SHARED store and bricks every parallel session (root cause verified
  // 2026-05-21: NOT worktree-removal). Redirect to the additive `npm install`.
  // Same LEO_NPM_INSTALL_GUARD=off escape as ENFORCEMENT 12. Fail-open.
  if (TOOL_NAME === 'Bash' && process.env.LEO_NPM_INSTALL_GUARD !== 'off') {
    try {
      const { npmCiWouldWipeSharedStore } = require('../../lib/npm-ci-junction-guard.cjs');
      const verdict = npmCiWouldWipeSharedStore({ command: input.command || '', cwd: input.cwd || process.cwd() });
      if (verdict.wipes) {
        const auditPromise = auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'NPM-CI-SHARED-WIPE', `npm ci would wipe shared node_modules (${verdict.reason})`, 'block', { reason: verdict.reason });
        process.stderr.write(
          `NPM CI SHARED-STORE WIPE GUARD (harness 95022758): refusing \`npm ci\`.\n` +
          `  Reason: ${verdict.reason} — npm ci's \`rm -rf node_modules\` would wipe the SHARED store and brick every parallel session.\n` +
          `  Use the additive install instead:  npm install --ignore-scripts --no-audit --no-fund\n` +
          `  Override (single-session only):    LEO_NPM_INSTALL_GUARD=off\n`
        );
        // QF-20260719-120: auditAndExit (same 1s audit cap) drains before exit — see
        // NPM-INSTALL-RACE block above for the libuv assertion this prevents.
        await auditAndExit(auditPromise, 2, 1000);
      }
    } catch { /* fail-open on any internal error */ }
  }

  // --- ENFORCEMENT 13: Worktree Hygiene Guard (SD-LEO-INFRA-PRE-TOOL-WORKTREE-GUARD-001) ---
  // PreToolUse check on Edit/Write — catches the most common parallel-session
  // failure mode at the moment of first damage:
  //   (a) HARD BLOCK if branch is main/master (edits never belong on main)
  //   (b) WARN-ONCE per session if branch is non-feature-prefixed AND the
  //       working tree carries >25 inherited modifications (signal: session
  //       inherited a dirty tree from a prior session — predicts /ship pain)
  // Goal: surface the issue before the first edit accumulates, independent of
  // SD context. Existing triggers (sd-start.js, sd:next reminder, SessionStart
  // hook) all assume an SD claim — non-SD work bypasses them entirely.
  // Off-switch: LEO_WORKTREE_GUARD=off (also for tests / known-clean cases)
  if ((TOOL_NAME === 'Edit' || TOOL_NAME === 'Write') && process.env.LEO_WORKTREE_GUARD !== 'off') {
    try {
      const fs = require('fs');
      const path = require('path');
      const filePath = input.file_path || '';
      if (filePath) {
        // Walk up from the file's dir to find the git root (via the .git
        // marker — file in worktrees, dir in main repo). Pure fs, ~1ms.
        let gitRoot = null;
        let gitDir = null;
        {
          let dir = path.resolve(path.dirname(filePath));
          for (let i = 0; i < 40 && dir; i++) {
            const marker = path.join(dir, '.git');
            try {
              const st = fs.statSync(marker);
              gitRoot = dir;
              if (st.isFile()) {
                // Worktree: .git is a file containing "gitdir: <path>"
                const c = fs.readFileSync(marker, 'utf8').trim();
                const m = c.match(/^gitdir:\s*(.+)$/);
                gitDir = m ? path.resolve(dir, m[1].trim()) : null;
              } else {
                gitDir = marker;
              }
              break;
            } catch { /* keep walking */ }
            const parent = path.dirname(dir);
            if (parent === dir) break;
            dir = parent;
          }
        }

        if (gitRoot && gitDir) {
          let branch = '';
          try {
            const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
            const m = head.match(/^ref:\s*refs\/heads\/(.+)$/);
            branch = m ? m[1] : '';
          } catch { /* fail-open */ }

          // (a) HARD BLOCK on main/master — with FR-5 graceful strand recovery.
          if (branch === 'main' || branch === 'master') {
            // SD-LEO-INFRA-WORKTREE-CONTENTION-CLEANUP-001 (FR-5/AC-6): if THIS
            // session holds an active claim whose provisioned worktree was reaped
            // out from under it, it is stranded on main through no fault of its
            // own — degrade to a WARNING so it can recover (write helpers, re-run
            // sd-start) instead of being hard-locked into heredoc/bypass
            // workarounds. The strand check runs ONLY here, on the already-
            // exceptional main-branch edit path (the happy path — a feature branch
            // inside a worktree — never reaches it), and degrades ONLY on positive
            // confirmation; any uncertainty preserves the hard block.
            // Flag-gated (FR-6): LEO_WORKTREE_STRAND_RECOVERY=off disables it.
            const stranded = (process.env.LEO_WORKTREE_STRAND_RECOVERY !== 'off')
              ? await detectStrandedClaim(_SESSION_ID)
              : null;
            if (stranded) {
              auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'WORKTREE-HYGIENE-STRANDED', 'Stranded on main after worktree reaped — degraded to warn', 'warn', { branch, sd_key: stranded.sd_key, missing_worktree: stranded.worktree_path });
              process.stderr.write(
                `[worktree-hygiene] STRANDED-RECOVERY: your claimed worktree for ${stranded.sd_key} is gone\n` +
                `  (${stranded.worktree_path}) — reaped out from under this session. Allowing this edit so\n` +
                `  you can recover. Re-provision a fresh worktree with: node scripts/sd-start.js ${stranded.sd_key}\n`
              );
              // Fall through — do NOT block a session stranded through no fault of its own.
            } else {
              const auditPromise = auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'WORKTREE-HYGIENE-MAIN', 'Edit/Write blocked on main/master', 'block', { branch, gitRoot });
              process.stderr.write(
                `WORKTREE HYGIENE GUARD: Edit/Write blocked on '${branch}'.\n` +
                `  Run \`npm run session:worktree\` to create an isolated branch off origin/main.\n` +
                `  If intentional (e.g., one-off doc fix), set LEO_WORKTREE_GUARD=off and retry.\n` +
                `  Why: edits on main bypass branch isolation and force stash gymnastics at /ship.\n`
              );
              await auditAndExit(auditPromise, 2);
            }
          }

          // (b) WARN-ONCE on inherited dirt + non-feature branch
          // Any branch with a conventional feature prefix is treated as
          // already-isolated; warn only on truly bare names ('wip-experiment',
          // 'scratch'). Counts modifications via porcelain index/status files
          // for speed — `git status --porcelain` on an 11k-file repo takes
          // ~1s on Windows and trips short-timeout tests.
          const FEATURE_BRANCH_RE = /^(feat|fix|refactor|chore|docs|test|hotfix|qf|quick-fix)\//;
          if (branch && !FEATURE_BRANCH_RE.test(branch) && _SESSION_ID) {
            const markerDir = path.join(gitRoot, '.claude', 'pids');
            const markerFile = path.join(markerDir, `worktree-hygiene-warned-${_SESSION_ID}.flag`);
            if (!fs.existsSync(markerFile)) {
              let dirtyCount = 0;
              try {
                const { execSync } = require('child_process');
                const out = execSync(`git -C "${gitRoot}" status --porcelain`, {
                  encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000,
                });
                dirtyCount = out.split('\n').filter(l => l.length > 0).length;
              } catch { /* fail-open */ }
              if (dirtyCount > 25) {
                auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'WORKTREE-HYGIENE-DIRT', 'Inherited dirty tree on non-feature branch', 'warn', { branch, dirtyCount });
                console.log(
                  `[worktree-hygiene] WARNING: ${dirtyCount} inherited modifications on non-feature branch '${branch}'.\n` +
                  `  Consider \`npm run session:worktree\` before adding more work — mid-stream isolation\n` +
                  `  requires stash gymnastics at /ship time. Warning fires once per session.\n` +
                  `  Suppress with LEO_WORKTREE_GUARD=off if intentional.`
                );
                try {
                  fs.mkdirSync(markerDir, { recursive: true });
                  fs.writeFileSync(markerFile, new Date().toISOString());
                } catch { /* fail-open */ }
              }
            }
          }
        }
      }
    } catch { /* fail-open on any internal error */ }
  }

  // --- ENFORCEMENT 1: Background Execution Ban (NC-006) ---
  // Applies to Task and Bash tools
  if (TOOL_NAME === 'Task' || TOOL_NAME === 'Bash') {
    if (input.run_in_background === true) {
      const auditPromise = auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'NC-006', 'Background execution ban (AUTO-PROCEED)', 'block', {});
      process.stderr.write(
        'PROTOCOL VIOLATION (NC-006): Background execution is forbidden when AUTO-PROCEED is ON.\n' +
        'Run this command in the foreground. Background tasks break the autonomous chain of thought.\n'
      );
      await auditAndExit(auditPromise, 2); // Hard block
    }
  }

  // --- ENFORCEMENT 4: Worktree Claim Guard (PAT-CLMMULTI-001 / PAT-CLMMULTI-002) ---
  // PAT-CLMMULTI-002: the prior version compared the SHARED last-writer-wins
  // unified-session-state.json (state.sd.id, a UUID) to the worktree SD-KEY and
  // false-blocked the rightful owner. Now DB-corroborate THIS session's sd_key
  // (session-scoped); block only on positive mismatch; fail-open; LEO_CLAIM_GUARD=off disables.
  if (TOOL_NAME === 'Edit' || TOOL_NAME === 'Write') {
    if (process.env.LEO_CLAIM_GUARD !== 'off') {
      const filePath = input.file_path || '';
      const match = filePath.match(WORKTREE_PATH_RE);
      // match[1] is the first .worktrees/ segment; "qf" is the container, not an sd_key.
      if (match && match[1] !== 'qf') {
        const worktreeSdKey = match[1];
        try {
          const claimedSdKey = await resolveSessionClaimedSdKey(_SESSION_ID);
          if (claimedSdKey && claimedSdKey !== worktreeSdKey) {
            const auditPromise = auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'PAT-CLMMULTI-002', 'Worktree claim guard (DB-corroborated)', 'block', { worktreeSdKey, claimedSdKey });
            process.stderr.write(
              `CLAIM GUARD (PAT-CLMMULTI-002): Edit/Write blocked.\n` +
              `  Target worktree SD: ${worktreeSdKey}\n` +
              `  Your DB-confirmed claim: ${claimedSdKey}\n` +
              `  You are editing a worktree for an SD you do not hold.\n` +
              `  Switch to your worktree, release your claim, or set LEO_CLAIM_GUARD=off.\n`
            );
            await auditAndExit(auditPromise, 2);
          }
          // claimedSdKey null (no claim / missing creds / timeout) or equal => fail-open
        } catch {
          // Fail-open: never block legitimate work on a guard error.
        }
      }
    }
  }

  // --- ENFORCEMENT 5: DB-Only Strategic Artifacts ---
  // Blocks creation of NEW markdown files in docs/plans/ (excluding archived/)
  // and brainstorm/. Vision/architecture/brainstorm content must go to database.
  // Allows edits to existing files (needed for migration/archival).
  if (TOOL_NAME === 'Write') {
    const filePath = (input.file_path || '').replace(/\\/g, '/');
    const fs = require('fs');

    // Block new file creation in docs/plans/ (excluding archived/)
    if (/docs\/plans\/(?!archived\/)/.test(filePath) && filePath.endsWith('.md')) {
      if (!fs.existsSync(input.file_path)) {
        const auditPromise = auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'SD-LEO-INFRA-ONLY-ENFORCEMENT-STRATEGIC-002', 'DB-only strategic artifacts: docs/plans/', 'block', { filePath });
        process.stderr.write(
          'DB-ONLY ENFORCEMENT: Blocked new markdown file in docs/plans/.\n' +
          'Vision/architecture documents must be stored in the database.\n' +
          'Use: node scripts/eva/vision-command.mjs upsert --content "..."\n' +
          'Or:  node scripts/eva/archplan-command.mjs upsert --content "..."\n'
        );
        await auditAndExit(auditPromise, 2);
      }
    }

    // Block ALL markdown writes to brainstorm/ (new or existing)
    // Brainstorm content belongs in brainstorm_sessions.content column, not on disk.
    if (/brainstorm\/[^/]+\.md$/.test(filePath)) {
      const auditPromise = auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'SD-LEO-INFRA-ONLY-ENFORCEMENT-STRATEGIC-002', 'DB-only strategic artifacts: brainstorm/', 'block', { filePath });
      process.stderr.write(
        'DB-ONLY ENFORCEMENT: Blocked markdown write to brainstorm/.\n' +
        'Brainstorm content must be stored in brainstorm_sessions.content column.\n' +
        'Build content in-memory and pass it to the DB insert in Step 9.\n' +
        'Do NOT use the Write tool for brainstorm documents.\n'
      );
      await auditAndExit(auditPromise, 2);
    }
  }

  // --- ENFORCEMENT 6: MCP Write Operation Block (SD-LEO-INFRA-MCP-READ-WRITE-001) ---
  // Block mcp__supabase__apply_migration — it's a write op but MCP role is read-only.
  // Read tools (execute_sql, list_tables, list_extensions, list_migrations) remain allowed.
  if (TOOL_NAME === 'mcp__supabase__apply_migration') {
    const auditPromise = auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'SD-LEO-INFRA-MCP-READ-WRITE-001', 'MCP write operation block', 'block', {});
    process.stderr.write(
      'MCP WRITE BLOCK: mcp__supabase__apply_migration is a write operation.\n' +
      'The MCP Supabase role (supabase_read_only_user) cannot execute migrations.\n' +
      'Use the database-agent instead:\n' +
      '  Agent({ subagent_type: "database-agent", prompt: "Execute migration: <path>" })\n'
    );
    await auditAndExit(auditPromise, 2);
  }

  // --- ENFORCEMENT 2: Tool Policy Profile (Log-Only) ---
  // Compile-time enforcement via generate-agent-md-from-db.js filters the YAML tools list.
  // This runtime check provides advisory warnings when an agent type has a restricted profile.
  // Mode: LOG-ONLY — warns but does not block. Switch to exit(2) for enforcement mode.
  if (TOOL_NAME === 'Task' && input.subagent_type) {
    const agentType = input.subagent_type;
    // Read agent profile from compiled YAML if available
    const fs = require('fs');
    const path = require('path');
    const agentFile = path.join(__dirname, '..', '..', '.claude', 'agents', agentType + '.md');
    try {
      if (fs.existsSync(agentFile)) {
        const content = fs.readFileSync(agentFile, 'utf8');
        // Extract tools from YAML frontmatter
        const toolsMatch = content.match(/^tools:\s*(.+)$/m);
        if (toolsMatch) {
          const declaredTools = toolsMatch[1].split(',').map(t => t.trim());
          // Check if the spawned agent requests tools not in its declared list
          // This is informational — the YAML frontmatter already restricts what Claude sees
          const profile = content.match(/^# tool_policy_profile:\s*(\w+)/m);
          if (profile && profile[1] !== 'full') {
            auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'TOOL_POLICY_PROFILE', 'Tool policy profile advisory', 'warn', { agentType, profile: profile[1], toolCount: declaredTools.length });
            console.log(
              `[pre-tool-enforce] POLICY: Agent "${agentType}" uses profile "${profile[1]}" ` +
              `(${declaredTools.length} tools allowed)`
            );
          }
        }
      }
    } catch {
      // Non-blocking — policy check failure should never block tool use
    }
  }

  // --- ENFORCEMENT 3: Sub-Agent Routing Advisory ---
  // Only applies to Task tool. Advisory only (stdout, exit 0).
  if (TOOL_NAME === 'Task') {
    const promptLower = (input.prompt || '').toLowerCase();
    const currentType = (input.subagent_type || '').toLowerCase();

    for (const route of AGENT_ROUTING) {
      const matchedKeyword = route.keywords.find(k => promptLower.includes(k));
      if (matchedKeyword && currentType !== route.agent) {
        // Don't block - advise. The model may have a good reason for its choice.
        auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'ROUTING_ADVISORY', 'Sub-agent routing advisory', 'warn', { matchedKeyword, suggestedAgent: route.agent, actualAgent: currentType });
        console.log(
          `[pre-tool-enforce] ROUTING HINT: Detected "${matchedKeyword}" in prompt. ` +
          `Consider using subagent_type="${route.agent}" for best results.`
        );
        break; // One hint per invocation
      }
    }
  }

  // --- ENFORCEMENT 7: Schema Pre-Flight Validation (SD-LEO-ORCH-SELF-HEALING-DATABASE-001-C) ---
  // Validates Supabase operations in Bash commands against live schema.
  // Tiered: blocking for migrations/handoffs, advisory for general scripts, skip otherwise.
  if (TOOL_NAME === 'Bash') {
    const command = input.command || '';
    // ENF-05 (QF-20260525-658): validate only when the call is actually executed
    // by a JS runner — not when it is a quoted MENTION inside echo/git commit/gh pr.
    if (isSupabaseExecution(command)) {
      await validateBeforeExecution(command);
    }
  }

  // --- ENFORCEMENT 10: D1 Bugfix TDD Prove-It Gate (SD-LEO-INFRA-LEO-UPSTREAM-DECISION-001) ---
  // Blocks Edit/Write/MultiEdit on src/|lib/ paths for sd_type='bugfix' SDs
  // until a failing test commit exists in __tests__/ since claim_started_at.
  // Enforces TDD red-before-green discipline for bugfix work.
  //
  // Exemptions:
  // - Non-bugfix SDs (feature, infrastructure, refactor, etc.)
  // - SDs claimed BEFORE D1 ship date (no claim_started_at recorded yet)
  // - Edits to non-src/lib paths (docs, tests, scripts, etc.)
  // - Errors fail OPEN (allow Edit) — bug in hook MUST NOT block legitimate work
  if (TOOL_NAME === 'Edit' || TOOL_NAME === 'Write' || TOOL_NAME === 'MultiEdit') {
    try {
      const filePath = (input.file_path || '').replace(/\\/g, '/');
      // Only enforce on src/|lib/ paths (skip __tests__, docs, scripts, .claude, etc.)
      const isProductionPath = /(^|\/)(src|lib)\//.test(filePath);
      if (isProductionPath) {
        const fs = require('fs');
        const path = require('path');
        const { execSync } = require('child_process');
        const stateFile = path.resolve(__dirname, '../../.claude/unified-session-state.json');
        if (fs.existsSync(stateFile)) {
          const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
          const claimedSdKey = state.sd?.id || state.sd?.sd_key;
          if (claimedSdKey && /^SD-/.test(claimedSdKey)) {
            // Fetch sd_type and claim metadata via Supabase REST (timeout-safe)
            const supabaseUrl = process.env.SUPABASE_URL;
            const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            if (supabaseUrl && serviceKey) {
              const restUrl = `${supabaseUrl}/rest/v1/strategic_directives_v2?sd_key=eq.${encodeURIComponent(claimedSdKey)}&select=sd_type,metadata,created_at`;
              const ctrl = new AbortController();
              const timeoutId = setTimeout(() => ctrl.abort(), 1500); // 1.5s budget — fail open if slower
              try {
                const resp = await fetch(restUrl, {
                  headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey },
                  signal: ctrl.signal
                });
                clearTimeout(timeoutId);
                if (resp.ok) {
                  const rows = await resp.json();
                  const sd = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
                  if (sd && sd.sd_type === 'bugfix') {
                    // SD is a bugfix — check for failing test commit since claim
                    const claimStartedAt = state.sd?.claimed_at || state.sd?.heartbeat_at || null;
                    let hasTestCommit = false;
                    try {
                      // Use git plumbing to check for any test file added/modified since claim
                      // (3s timeout, fail open on errors)
                      const sinceArg = claimStartedAt ? `--since="${claimStartedAt}"` : '--max-count=20';
                      const gitOut = execSync(
                        `git log ${sinceArg} --name-only --diff-filter=AM --pretty=format: -- "__tests__/*" "*test*.cjs" "*test*.mjs" "*.test.js" "*.test.ts" "*.spec.js" "*.spec.ts"`,
                        { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }
                      );
                      hasTestCommit = gitOut.trim().length > 0;
                    } catch {
                      hasTestCommit = true; // Fail open on git errors
                    }
                    if (!hasTestCommit) {
                      const auditPromise = auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'D1-BUGFIX-TDD', 'Bugfix TDD prove-it gate', 'block', { sd_key: claimedSdKey, file_path: filePath });
                      process.stderr.write(
                        `\nD1 BUGFIX TDD GATE (SD-LEO-INFRA-LEO-UPSTREAM-DECISION-001):\n` +
                        `  Blocked: Edit on production path "${filePath}"\n` +
                        `  Active SD: ${claimedSdKey} (sd_type=bugfix)\n` +
                        `  Reason: No failing test commit found in __tests__/ since claim_started_at.\n` +
                        `  Required: Commit a failing test that demonstrates the bug BEFORE editing src/|lib/.\n` +
                        `\n` +
                        `  Workflow:\n` +
                        `    1. Write a test in __tests__/ that reproduces the bug\n` +
                        `    2. Run the test, confirm it FAILS (red)\n` +
                        `    3. git add __tests__/ && git commit -m "test(${claimedSdKey}): reproduce bug"\n` +
                        `    4. NOW you can edit src/|lib/ to fix the bug (green)\n` +
                        `\n` +
                        `  Exemptions:\n` +
                        `    - Non-bugfix SDs (feature, infrastructure, etc.) bypass this gate\n` +
                        `    - QFs (Tier 1) do not claim SDs and are not affected\n` +
                        `    - This gate fails OPEN on errors — if you see this message, it intentionally fired\n`
                      );
                      await auditAndExit(auditPromise, 2);
                    }
                  }
                  // Non-bugfix or test-commit-present: allow
                }
                // Non-200 response: fail open
              } catch (fetchErr) {
                clearTimeout(timeoutId);
                // Network error or timeout: fail open (do NOT block on hook errors)
              }
            }
            // Missing credentials: fail open
          }
          // No claimed SD: fail open
        }
        // No state file: fail open
      }
      // Not a production path: skip check
    } catch (d1Err) {
      // Catch-all fail-open: ANY error in D1 logic must NOT block edits
      process.stderr.write('[pre-tool-enforce] D1 hook errored (fail-open): ' + d1Err.message + '\n');
    }
  }

  // --- ENFORCEMENT 11: RCA Tiered Enforcement (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-129) ---
  // Detects repeated execution of the same tool on the same target within a
  // 10-minute window and applies tiered enforcement:
  //   attempt 2 → stdout warning, exit 0
  //   attempt 3+ → hard block (exit 2), nudging the caller to invoke rca-agent
  //
  // Counters are session-scoped (.claude/retry-state-<session>.json) and reset
  // whenever a new rca-agent execution row appears in sub_agent_execution_results
  // for the claimed SD (FR-3). Emergency bypass via EMERGENCY_RCA_BYPASS=true (FR-5).
  //
  // Fail-open: any error in this block exits early without affecting the tool call.
  try {
    const rcaEnabled = process.env.LEO_RCA_ENFORCEMENT !== 'off';
    const trackedTools = new Set(['Bash', 'Edit', 'Write', 'MultiEdit']);
    if (rcaEnabled && _SESSION_ID && _SESSION_ID !== 'unknown' && trackedTools.has(TOOL_NAME)) {
      const stateMgr = require('./retry-state-manager.cjs');

      // Resolve the claimed SD key (used for RCA reset lookup).
      // SD-LEO-INFRA-RCA-TIERED-SIGNATURE-001: prefer st.sd?.id (UUID) over
      // st.sd?.sd_key (string). sub_agent_execution_results.sd_id is UUID-typed;
      // stateMgr.fetchRcaInvocationSince now also UUID-resolves as a safety net.
      let claimedSdKey = null;
      let progressFingerprint; // Control 3: phase/percent snapshot for auto-signal re-scope
      try {
        const fs2 = require('fs');
        const path2 = require('path');
        const stateFile = path2.resolve(__dirname, '../../.claude/unified-session-state.json');
        if (fs2.existsSync(stateFile)) {
          const st = JSON.parse(fs2.readFileSync(stateFile, 'utf8'));
          claimedSdKey = st.sd?.id || st.sd?.sd_key || null;
          // SD-LEO-INFRA-RCA-AUTOSIGNAL-FALSE-POSITIVE-001 (Control 3): a stable progress
          // fingerprint (claimed SD + phase + percent), already on disk so no extra I/O.
          // recordAndCount compares it across the repetition; a change means the session is
          // advancing → the auto-signal is suppressed (not a stuck loop).
          progressFingerprint = `${claimedSdKey || ''}:${st.sd?.phase ?? ''}:${st.sd?.progress ?? ''}`;
        }
      } catch {
        // Missing state file is not fatal — reset lookup simply no-ops.
      }

      // SD-LEO-INFRA-RCA-TIERED-SIGNATURE-001: read prior tool's outcome (captured
      // by post-tool-rca-outcome.cjs PostToolUse hook) and thread into recordAndCount
      // so signatureFor can mix the outcome digest. Different exit_code or stderr_sha
      // → different signature → iterative TDD does not trip the 3-strikes counter.
      let lastOutcome = null;
      try {
        const fs2 = require('fs');
        const path2 = require('path');
        const outcomeFile = path2.resolve(
          __dirname,
          `../../.claude/last-outcome-${_SESSION_ID}.json`
        );
        if (fs2.existsSync(outcomeFile)) {
          const raw = fs2.readFileSync(outcomeFile, 'utf8');
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') lastOutcome = parsed;
        }
      } catch {
        // Missing/malformed outcome file → fall through to command-only signature (back-compat).
      }

      const { attempts, signature, rcaResetApplied, progressStalled } = await stateMgr.recordAndCount(
        _SESSION_ID, claimedSdKey, TOOL_NAME, input, { lastOutcome, progressFingerprint }
      );

      if (signature && attempts >= 2) {
        const bypassed = process.env.EMERGENCY_RCA_BYPASS === 'true';
        // SD-LEO-INFRA-RCA-ENFORCEMENT-PROGRESS-STALL-NOT-REPETITION-001: the audit-log outcome
        // label must match the actual block decision below (shouldHardBlock), else a
        // progressStalled===false suppression (tool proceeds) gets mis-recorded as outcome='block'.
        const { shouldHardBlock } = require('../../lib/hooks/auto-signal-threshold.cjs');
        const outcome = shouldHardBlock({ attempts, bypassed, progressStalled }) ? 'block' : 'warn';
        const auditPromise = auditPermissionDecision(
          _SESSION_ID, TOOL_NAME, 'RCA-TIERED-ENFORCEMENT',
          'Repeated tool invocation without intervening RCA',
          outcome,
          { attempts, signature, sd_key: claimedSdKey, rca_reset_applied: rcaResetApplied, bypassed }
        );

        // SD-LEO-INFRA-THRESHOLD-AUTO-SIGNAL-OVERFIRE-001 (a): AUTO-EMIT a /signal at the 3rd
        // same-signature repeat (a genuine stuck-retry), not the 2nd crossing (which over-fired and
        // drowned real signals). This MUST run BEFORE the attempts>=3 hard-block exit below, else the
        // signal would never fire. (b): exempt the coordinator session (local active-coordinator marker)
        // so its own monitoring loops never flood its inbox; named cadence scripts are already exempt
        // from counting (retry-state-manager EXEMPT_PATTERNS). FIRE-AND-FORGET, env-disableable
        // (LEO_AUTO_SIGNAL=off), FAIL-OPEN (any error swallowed — auto-signal must never block a tool call).
        try {
          const { shouldEmitAutoSignal, buildAutoSignalArgs } = require('../../lib/hooks/auto-signal-threshold.cjs');
          let isCoordinatorSession = false;
          try {
            const coordRaw = require('fs').readFileSync(require('path').resolve(__dirname, '../../.claude/active-coordinator.json'), 'utf8');
            const coord = JSON.parse(coordRaw);
            if (coord && coord.session_id && coord.session_id === _SESSION_ID) isCoordinatorSession = true;
          } catch { /* no marker / unreadable → treat as worker (fail-open, never suppress a real worker signal) */ }
          if (shouldEmitAutoSignal({ attempts, sessionId: _SESSION_ID, progressStalled, isCoordinatorSession, env: process.env })) {
            const path = require('path');
            const { spawn } = require('child_process');
            const args = buildAutoSignalArgs({ toolName: TOOL_NAME, signature, attempts, sdKey: claimedSdKey });
            const child = spawn(
              process.execPath,
              [path.join(__dirname, '..', 'worker-signal.cjs'), ...args],
              { detached: true, stdio: 'ignore', env: { ...process.env, CLAUDE_SESSION_ID: _SESSION_ID } }
            );
            child.unref();
          }
        } catch { /* fail-open: auto-signal must never block tool execution */ }

        // SD-LEO-INFRA-RCA-ENFORCEMENT-PROGRESS-STALL-NOT-REPETITION-001: gate the hard block on
        // PROGRESS-STALL, not bare repetition count (reuses the same shouldHardBlock() verdict
        // already computed above for the audit-log outcome label, so the two never diverge).
        if (outcome === 'block') {
          process.stderr.write(
            `\nRCA TIERED ENFORCEMENT (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-129):\n` +
            `  Blocked: ${TOOL_NAME} invoked ${attempts}x on the same target within 10 minutes.\n` +
            `  Signature: ${signature}\n` +
            `  Policy: After 3 consecutive attempts, invoke rca-agent before retrying.\n` +
            `    Task({ subagent_type: 'rca-agent', prompt: '<Symptom / Location / Frequency / Prior Attempts / Desired Outcome>' })\n` +
            `  Once rca-agent records a result in sub_agent_execution_results, the counter resets automatically.\n` +
            `  Emergency override: set EMERGENCY_RCA_BYPASS=true for the single retry.\n`
          );
          await auditAndExit(auditPromise, 2);
        }

        // Tier 1 warning (2nd attempt or bypassed): advisory only.
        console.log(
          `[pre-tool-enforce] RCA-TIERED-ENFORCEMENT: attempt ${attempts} on ${signature} — ` +
          `next repeat ${bypassed ? '(bypass active)' : 'will be blocked'}. ` +
          `Consider invoking rca-agent if this indicates a persistent failure.`
        );
      }
    }
  } catch (rcaErr) {
    // Fail-open: any internal error must not block tool execution.
    if (process.env.LEO_TELEMETRY_DEBUG === '1') {
      process.stderr.write(`[pre-tool-enforce] RCA enforcement errored (fail-open): ${rcaErr.message}\n`);
    }
  }

  // --- ENFORCEMENT 14: File-Claim Layer (SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001) ---
  // For Write/Edit/MultiEdit calls: consult file_claim_locks for the target path.
  // REFUSE if a peer holds a fresh claim (<10min heartbeat); auto-claim if unclaimed
  // or stale. Local LRU cache (size 64, TTL 30s) keeps p95 latency <50ms.
  // Set FILE_CLAIM_ENFORCED=off in .env for emergency disable.
  if (
    process.env.FILE_CLAIM_ENFORCED !== 'off' &&
    (TOOL_NAME === 'Write' || TOOL_NAME === 'Edit' || TOOL_NAME === 'MultiEdit')
  ) {
    try {
      const filePath = (input && (input.file_path || input.filePath || input.path)) || null;
      if (filePath) {
        const path = require('path');
        const normalizedPath = path.posix.normalize(filePath.replace(/\\/g, '/'));
        const fileClaimGuard = require('./lib/file-claim-guard.cjs');
        const result = await fileClaimGuard.checkClaim({
          filePath: normalizedPath,
          mySessionId: _SESSION_ID,
          staleThresholdSeconds: parseInt(process.env.FILE_CLAIM_STALE_THRESHOLD_SECONDS || '600', 10),
        });
        if (result.refused) {
          const auditPromise = auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'ENF-FILE-CLAIM', result.message, 'block', { filePath: normalizedPath, holder_session_id: result.holder_session_id });
          process.stderr.write(`ENF-FILE-CLAIM: ${result.message}\n`);
          await auditAndExit(auditPromise, 2);
        }
        // Otherwise: claim acquired or already mine — proceed.
      }
    } catch (claimErr) {
      // Fail-open: file-claim layer outage must NOT block tool execution.
      if (process.env.LEO_TELEMETRY_DEBUG === '1') {
        process.stderr.write(`[pre-tool-enforce] file-claim guard errored (fail-open): ${claimErr.message}\n`);
      }
    }
  }

  // --- ENFORCEMENT 15: Force-Push Gate (SD-FDBK-INFRA-ALLOW-FORCE-LEASE-001) ---
  // Replaces the Claude Code interactive permission prompt for `git push --force-with-lease`
  // (which is sandbox-denied under auto-proceed) with a programmatic 5-condition AND gate:
  //   (1) bare `--force` (no `--with-lease`) → block, regardless of env var
  //   (2) protected branch (main|master|develop|release/*) → block, regardless of env var
  //   (3) LEO_FORCE_PUSH_OWN_BRANCH !== 'allow' → block (default deny — flag-OFF)
  //   (4) branch not in allowlist (feat/SD-*, qf/QF-*, quick-fix/QF-*, eng/SD-*) → block
  //   (5) commits reachable from origin/main..HEAD include any non-self author/committer email → block
  //   override: all checks pass → audit row outcome='override' rule_code='ENF-15' + fall through
  //
  // Audit row is constructed BEFORE await/exit (proactively closes the 44c5b834 audit-row-drop
  // class for this rule per QF-20260510-148 auditAndExit pattern).
  //
  // Test seam: TEST_OVERRIDE_BRANCH and TEST_OVERRIDE_GIT_LOG env vars short-circuit
  // git subprocess calls during vitest runs (the hook is spawned as a CJS subprocess so
  // module-level mocking does not apply).
  if (TOOL_NAME === 'Bash') {
    const cmd = (input && input.command || '').trim();
    // QF-20260525-345 (RCA 6188492f) matched `git push … --force` only at start-of-command
    // or after a true shell separator (incl. newline — deliberately KEPT so an operative
    // push on its own line of a multi-line block still blocks). QF-20260610-541 (feedback
    // 00934869): that newline made a commit-message/heredoc body LINE starting `git push
    // --force` look operative too. lib/force-push-operative.cjs strips documentary content
    // (-m/-F/-c quoted strings + heredoc bodies not fed to a shell) BEFORE the same match.
    // Fail-open to the verbatim legacy regex if the lib errs — the gate stays intact.
    let forcePushDetected;
    try {
      forcePushDetected = require('./lib/force-push-operative.cjs').isOperativeForcePush(cmd);
    } catch {
      forcePushDetected = /(?:^|[;&|(\n]|&&|\|\|)\s*git\s+push\b[^\n]*--force\b/.test(cmd);
    }
    if (forcePushDetected && !/--help/.test(cmd)) {
      try {
        const { execSync } = require('child_process');
        const HAS_WITH_LEASE = /--force-with-lease\b/.test(cmd);
        const envVarSet = process.env.LEO_FORCE_PUSH_OWN_BRANCH === 'allow';

        // Resolve the branch the push WRITES (dbcd817c, QF-20260529-492): from the refspec
        // destination, else the current branch in the push cwd — NOT the hook checkout (which
        // is ~always main and false-blocked a topic-branch push from a worktree / via `git -C`).
        // A protected destination in a multi-refspec push still wins. Test seam: TEST_OVERRIDE_BRANCH.
        let branch = process.env.TEST_OVERRIDE_BRANCH || '';
        if (!branch) {
          try {
            const { forcePushTargetBranches, effectiveForcePushBranch } = require('./lib/force-push-branch.cjs');
            branch = effectiveForcePushBranch(forcePushTargetBranches(cmd, input && input.cwd));
          } catch { branch = ''; }
        }

        const PROTECTED_RE = /^(main|master|develop|release\/.*)$/;
        const ALLOW_RE = /^(feat\/SD-|qf\/QF-|quick-fix\/QF-|eng\/SD-)/;

        let decision = null; // null = pass-through; set to {outcome, reason} to act
        if (!HAS_WITH_LEASE) {
          decision = { outcome: 'block', reason: 'bare_force_disallowed' };
        } else if (PROTECTED_RE.test(branch)) {
          decision = { outcome: 'block', reason: 'protected_branch_denylist' };
        } else if (!envVarSet) {
          decision = { outcome: 'block', reason: 'env_var_unset' };
        } else if (!ALLOW_RE.test(branch)) {
          decision = { outcome: 'block', reason: 'branch_not_allowlisted' };
        } else {
          // Sole-contributor check via author+committer email (test seams: TEST_OVERRIDE_USER_EMAIL, TEST_OVERRIDE_GIT_LOG)
          let userEmail = process.env.TEST_OVERRIDE_USER_EMAIL || '';
          if (!userEmail) {
            try { userEmail = execSync('git config user.email', { encoding: 'utf8', timeout: 1000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { userEmail = ''; }
          }
          let logOut = process.env.TEST_OVERRIDE_GIT_LOG;
          if (logOut === undefined) {
            try {
              logOut = execSync('git log --format=%ae,%ce origin/main..HEAD --max-count=500', { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
            } catch { logOut = null; }
          }
          if (logOut === null || !userEmail) {
            decision = { outcome: 'block', reason: 'git_error' };
          } else {
            const lines = logOut.split('\n').map(l => l.trim()).filter(Boolean);
            let commitCount = 0;
            let foundForeign = false;
            for (const line of lines) {
              commitCount++;
              const [ae, ce] = line.split(',').map(s => s.trim());
              if ((ae && ae !== userEmail) || (ce && ce !== userEmail)) {
                foundForeign = true;
                break;
              }
            }
            if (foundForeign) {
              decision = { outcome: 'block', reason: 'multi_author_branch', commit_count_checked: commitCount };
            } else {
              decision = { outcome: 'override', reason: 'override_granted', commit_count_checked: commitCount };
            }
          }
        }

        const meta = { branch, env_var_set: envVarSet, decision_path: decision.reason };
        if (decision.commit_count_checked !== undefined) meta.commit_count_checked = decision.commit_count_checked;
        const auditPromise = auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'ENF-15', 'Force-push gate: env-var + sole-contributor + branch-allowlist + protected-branch denylist', decision.outcome, meta);

        if (decision.outcome === 'block') {
          process.stderr.write(`[ENF-15] BLOCKED reason=${decision.reason} branch=${branch || '<unknown>'} env_var_set=${envVarSet}\n`);
          await auditAndExit(auditPromise, 2);
        }
        // override path: don't await — let it fire-and-forget like the final ALLOW; fall through
      } catch (forcePushErr) {
        // Fail-open: any internal error in ENF-15 must NOT block tool execution.
        if (process.env.LEO_TELEMETRY_DEBUG === '1') {
          process.stderr.write(`[pre-tool-enforce] ENF-15 errored (fail-open): ${forcePushErr.message}\n`);
        }
      }
    }

    // --- ENFORCEMENT 16: --no-verify / --no-gpg-sign Bypass Gate (QF-20260609-774) ---
    // `git push --force` is gated by ENF-15, but --no-verify / --no-gpg-sign had NO programmatic
    // block — a single flag skips the local pre-commit secret scan (Supabase JWT / OpenAI /
    // Resend / Gemini key detection) and the CLAUDE.md-edit protection → data-leak exposure.
    // Block by default; ONE audited override LEO_ALLOW_NO_VERIFY="<reason>" (single env var whose
    // non-empty VALUE is the reason, mirroring EMERGENCY_PUSH). Decision logic + the operative-
    // command regex live in lib/no-verify-guard.cjs (unit-tested); this owns audit + exit. Fail-open.
    try {
      const { decideNoVerify } = require('./lib/no-verify-guard.cjs');
      const d = decideNoVerify(cmd, process.env);
      if (d.matched) {
        const meta = { flag: d.flag, decision_path: d.reason, override_reason: d.overrideReason };
        const auditPromise = auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'ENF-16', 'no-verify/no-gpg-sign bypass gate: blocks pre-commit secret-scan / commit-signing bypass unless LEO_ALLOW_NO_VERIFY="<reason>"', d.outcome, meta);
        if (d.outcome === 'block') {
          process.stderr.write(`[ENF-16] BLOCKED --${d.flag} bypasses the pre-commit secret scan (Supabase/OpenAI/Resend/Gemini key detection) + CLAUDE.md-edit protection. Override: LEO_ALLOW_NO_VERIFY="<ticket: reason>" <your git command>\n`);
          await auditAndExit(auditPromise, 2);
        }
        // override path: fire-and-forget audit (don't await); fall through
      }
    } catch (noVerifyErr) {
      // Fail-open: any internal error in ENF-16 must NOT block tool execution.
      if (process.env.LEO_TELEMETRY_DEBUG === '1') {
        process.stderr.write(`[pre-tool-enforce] ENF-16 errored (fail-open): ${noVerifyErr.message}\n`);
      }
    }

    // --- ENFORCEMENT 17: Shared-Tree Hijack Guard (SD-LEO-FEAT-SHARED-TREE-HIJACK-001) ---
    // Blocks a HEAD-moving git op (checkout/switch to a branch, or `reset --hard`) run in the
    // SHARED operator/coordinator ROOT working tree while a DIFFERENT session holds the
    // active-coordinator pointer. Live HIGH incident 2026-06-11: a QF worker's `git checkout`
    // in the shared root un-deployed the coordinator's branch, reverting its scripts/hooks on
    // disk mid-tick while loaded skills kept running. The pointer was only RESTORED after the
    // fact (post-checkout-role-restore.cjs); this defends BEFORE the destructive checkout.
    // Decision logic is pure + unit-tested in lib/shared-tree-guard.cjs; this owns pointer-read,
    // cwd resolution, audit + exit. Fail-OPEN (no coordinator / self / any error → allow), so a
    // solo operator is never locked out. Disable with LEO_SHARED_TREE_GUARD=off.
    try {
      const { decideSharedTreeCheckout } = require('./lib/shared-tree-guard.cjs');
      let coordinatorSessionId = null;
      try {
        const pointer = require('../../lib/coordinator/resolve.cjs').readPointerFile();
        coordinatorSessionId = pointer && pointer.session_id ? pointer.session_id : null;
      } catch { coordinatorSessionId = null; }
      const verdict = decideSharedTreeCheckout(cmd, {
        cwd: (input && input.cwd) || process.cwd(),
        sessionId: _SESSION_ID,
        coordinatorSessionId,
        env: process.env,
      });
      if (verdict.block) {
        const auditPromise = auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'ENF-17', 'Shared-tree hijack guard: HEAD-moving git op in shared root while a foreign coordinator is active', 'block', { kind: verdict.kind, coordinator_session_id: coordinatorSessionId });
        process.stderr.write(
          `[ENF-17] SHARED-TREE HIJACK BLOCKED: a '${verdict.kind === 'reset' ? 'git reset --hard' : 'git checkout/switch'}' in the SHARED ROOT tree\n` +
          `  would revert coordinator ${coordinatorSessionId}'s branch on disk (scripts/hooks vanish mid-tick — the 2026-06-11 incident).\n` +
          `  Work in an isolated worktree instead: node scripts/sd-start.js <SD>  (or: npm run session:worktree)\n` +
          `  A branch op INSIDE .worktrees/<sd>/ (or via 'git -C <worktree>') is allowed. Override: LEO_SHARED_TREE_GUARD=off\n`
        );
        await auditAndExit(auditPromise, 2);
      }
    } catch (sharedTreeErr) {
      // Fail-open: any internal error in ENF-17 must NOT block tool execution.
      if (process.env.LEO_TELEMETRY_DEBUG === '1') {
        process.stderr.write(`[pre-tool-enforce] ENF-17 errored (fail-open): ${sharedTreeErr.message}\n`);
      }
    }
  }

  // --- ENFORCEMENT 10: Source-Side Telemetry Writer (SD-LEO-INFRA-WORKER-SOURCE-SIDE-001) ---
  // Non-blocking write of tool/timeout/silence signals to claude_sessions.
  // Fire-and-forget — never waits, never blocks, swallows all errors.
  try {
    const _sessId = process.env.CLAUDE_SESSION_ID || '';
    if (_sessId) {
      const {
        computeExpectedSilenceMs,
        computeExpectedEndMs,
        classifyActivityKind,
      } = require('./lib/tool-timeout.cjs');
      const { writeTelemetry, writeTelemetryAwait } = require('./lib/session-telemetry-writer.cjs');

      const silenceMs = computeExpectedSilenceMs(TOOL_NAME, input);
      const endMs = computeExpectedEndMs(TOOL_NAME, input);
      const kind = classifyActivityKind(TOOL_NAME);
      const now = Date.now();
      const argsHash = _auditContextHash(TOOL_INPUT_RAW);

      const patch = {
        heartbeat_at: new Date(now).toISOString(),
      };
      if (TOOL_NAME) patch.current_tool = TOOL_NAME;
      patch.current_tool_args_hash = argsHash;
      if (endMs !== null) {
        patch.current_tool_expected_end_at = new Date(now + endMs).toISOString();
      }
      if (silenceMs !== null) {
        patch.expected_silence_until = new Date(now + silenceMs).toISOString();
      }
      if (kind) patch.last_activity_kind = kind;

      // SD-FDBK-INFRA-CLAIM-SWEEP-LIVENESS-001 FR-1: on a long Task/Agent dispatch, AWAIT
      // the telemetry write so expected_silence_until actually persists before the ALLOW-path
      // process.exit(0) below. Otherwise the fire-and-forget PATCH is killed mid-flight
      // (the smoking gun: expected_silence_until stays NULL during a 15-19min sub-agent run)
      // and the stale-session-sweep / cleanup_stale_sessions STALE-release the session mid-run.
      //
      // SD-FDBK-ENH-CLAIM-SWEEP-REAPS-001: the original opt-IN env gate (SWEEP_RESPECT_INFLIGHT_AGENT=1)
      // is NOT deployed in pre-deploy worker settings, so the writer never fired and ACTIVE
      // in-flight claims were still reaped (worker ec3f9fbd swept mid-PLAN). The CONSUMER side
      // (chairman_dashboard_config.sweep_respect_inflight_agent) is now live=true and the feature
      // is proven, so complete the writer side: AWAIT by DEFAULT for Task/Agent dispatches
      // (opt-OUT via SWEEP_RESPECT_INFLIGHT_AGENT=0/false). Scoped to Task/Agent only — they are
      // already long operations, so the single awaited PATCH adds negligible latency. Fail-open
      // preserved; non-Task/Agent tools keep byte-identical fire-and-forget behaviour.
      const _respectInflightDisabled = process.env.SWEEP_RESPECT_INFLIGHT_AGENT === '0'
        || process.env.SWEEP_RESPECT_INFLIGHT_AGENT === 'false';
      if (!_respectInflightDisabled && silenceMs !== null && (TOOL_NAME === 'Task' || TOOL_NAME === 'Agent')) {
        try { await writeTelemetryAwait(_sessId, patch); } catch { /* fail-open: never block enforcement */ }
      } else {
        writeTelemetry(_sessId, patch);
      }
    }
  } catch (telErr) {
    // Never block on telemetry errors. Debug-only log.
    if (process.env.LEO_TELEMETRY_DEBUG === '1') {
      process.stderr.write(`[pre-tool-enforce] telemetry write swallowed: ${telErr.message}\n`);
    }
  }

  // Final allow decision — audit the pass-through
  auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'ALLOW', 'Tool call permitted by all enforcement rules', 'allow', {});
  // QF-20260509-199: process.exit(0) instead of process.exitCode=0 so fire-and-forget
  // audit/telemetry/RCA-counter timers don't pin the event loop. BLOCK paths above
  // already use process.exit(2); the ALLOW path was the asymmetric outlier — caused
  // ~5s hangs in CI where Supabase fetches don't resolve. Documented contract for all
  // those async writes is "fire and forget — never block enforcement".
  // QF-20260719-120: drain first — the ALLOW audit fetch just fired, and a raw exit
  // races its async-handle setup (the same src\win\async.c:76 window as the block paths).
  await drainUndiciPool();
  process.exit(0);
}

// QF-20260719-120: the fail-open catch must ALSO drain — any throw after a
// fire-and-forget fetch landed here and exited un-drained, which was the last
// remaining path to the libuv UV_HANDLE_CLOSING assertion (crash = PreToolUse
// aborted = enforcement silently skipped). drainUndiciPool never throws.
main().catch(async () => { await drainUndiciPool(); process.exit(0); }); // Fail-open: async errors never block
