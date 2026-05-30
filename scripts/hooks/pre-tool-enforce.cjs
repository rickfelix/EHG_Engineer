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
  // Tear down undici's keep-alive socket pool BEFORE process.exit. Without
  // this, Windows libuv asserts on src\win\async.c:76 when process.exit races
  // with in-flight HTTP socket cleanup, surfacing as STATUS_STACK_BUFFER_OVERRUN.
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
  process.exit(code);
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
 * Extract column names from a Bash command (best-effort).
 * Detects columns from Supabase client method patterns.
 * @param {string} command
 * @returns {Object<string, *>}
 */
// SD-FDBK-INFRA-HARDEN-ORCHESTRATOR-CHILD-001: literal coercion for mutation values lives in
// a small shared, unit-tested module (this hook runs main() at load, so it cannot be required
// from a test — the pure coercion logic is extracted to be testable).
const { coerceLiteral } = require(path.resolve(__dirname, 'lib', 'coerce-literal.cjs'));

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
  const mutationPattern = /\.(?:insert|update|upsert)\(\s*\{([^}]+)\}/g;
  while ((match = mutationPattern.exec(command)) !== null) {
    const objectBody = match[1];
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
  const tableName = extractTableName(command);
  if (!tableName) return; // No Supabase pattern detected

  const tier = getEnforcementTier(command);
  if (tier === 'skip') return;

  const params = extractParams(command);
  if (Object.keys(params).length === 0) return; // No extractable params

  try {
    const { validateOperation } = require(path.resolve(__dirname, '..', '..', 'lib', 'schema-preflight.cjs'));
    const result = await validateOperation(tableName, 'query', params);

    if (!result.valid) {
      if (tier === 'blocking') {
        const auditPromise = auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'SCHEMA_PREFLIGHT', 'Schema pre-flight validation failed', 'block', { tableName, errors: result.errors });
        process.stderr.write(
          `SCHEMA VALIDATION FAILED (blocking):\n` +
          `  Table: ${tableName}\n` +
          `  Errors: ${result.errors.join('; ')}\n` +
          `  Fix the column names or types before running this command.\n`
        );
        await auditAndExit(auditPromise, 2);
      } else {
        // Advisory: warn but allow
        auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'SCHEMA_PREFLIGHT_ADVISORY', 'Schema pre-flight validation warning', 'warn', { tableName, errors: result.errors });
        console.log(
          `[schema-preflight] WARNING: ${result.errors.join('; ')} (table: ${tableName})`
        );
      }
    }

    if (result.warnings.length > 0) {
      console.log(`[schema-preflight] ${result.warnings.join('; ')}`);
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
          await Promise.race([
            Promise.resolve(auditPromise),
            new Promise(resolve => setTimeout(resolve, 1000))
          ]).catch(() => { /* audit never blocks enforcement */ });
          process.exit(2);
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
        await Promise.race([
          Promise.resolve(auditPromise),
          new Promise(resolve => setTimeout(resolve, 1000))
        ]).catch(() => { /* audit never blocks enforcement */ });
        process.exit(2);
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

          // (a) HARD BLOCK on main/master
          if (branch === 'main' || branch === 'master') {
            const auditPromise = auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'WORKTREE-HYGIENE-MAIN', 'Edit/Write blocked on main/master', 'block', { branch, gitRoot });
            process.stderr.write(
              `WORKTREE HYGIENE GUARD: Edit/Write blocked on '${branch}'.\n` +
              `  Run \`npm run session:worktree\` to create an isolated branch off origin/main.\n` +
              `  If intentional (e.g., one-off doc fix), set LEO_WORKTREE_GUARD=off and retry.\n` +
              `  Why: edits on main bypass branch isolation and force stash gymnastics at /ship.\n`
            );
            await auditAndExit(auditPromise, 2);
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

  // --- ENFORCEMENT 4: Worktree Claim Guard (PAT-CLMMULTI-001) ---
  // Blocks Edit/Write to worktree files when this session is working on a
  // DIFFERENT SD. Prevents cross-worktree edits from parallel sessions.
  // Uses local state file (no DB call) for speed. Fail-open on errors.
  if (TOOL_NAME === 'Edit' || TOOL_NAME === 'Write') {
    const filePath = input.file_path || '';
    const match = filePath.match(WORKTREE_PATH_RE);
    if (match) {
      const worktreeSdKey = match[1];
      try {
        const fs = require('fs');
        const path = require('path');
        const stateFile = path.resolve(__dirname, '../../.claude/unified-session-state.json');
        if (fs.existsSync(stateFile)) {
          const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
          const claimedSd = state.sd?.id;
          if (claimedSd && claimedSd !== worktreeSdKey) {
            const auditPromise = auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'PAT-CLMMULTI-001', 'Worktree claim guard', 'block', { worktreeSdKey, claimedSd });
            process.stderr.write(
              `CLAIM GUARD (PAT-CLMMULTI-001): Edit/Write blocked.\n` +
              `  Target worktree: ${worktreeSdKey}\n` +
              `  Your claimed SD: ${claimedSd}\n` +
              `  You are editing files for a different SD than you have claimed.\n` +
              `  Switch to the correct worktree or release your claim.\n`
            );
            await auditAndExit(auditPromise, 2);
          }
        }
        // No state file = no claim info = fail-open
      } catch {
        // Fail-open: file read errors don't block edits
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
      try {
        const fs2 = require('fs');
        const path2 = require('path');
        const stateFile = path2.resolve(__dirname, '../../.claude/unified-session-state.json');
        if (fs2.existsSync(stateFile)) {
          const st = JSON.parse(fs2.readFileSync(stateFile, 'utf8'));
          claimedSdKey = st.sd?.id || st.sd?.sd_key || null;
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

      const { attempts, signature, rcaResetApplied } = await stateMgr.recordAndCount(
        _SESSION_ID, claimedSdKey, TOOL_NAME, input, { lastOutcome }
      );

      if (signature && attempts >= 2) {
        const bypassed = process.env.EMERGENCY_RCA_BYPASS === 'true';
        const outcome = attempts >= 3 && !bypassed ? 'block' : 'warn';
        const auditPromise = auditPermissionDecision(
          _SESSION_ID, TOOL_NAME, 'RCA-TIERED-ENFORCEMENT',
          'Repeated tool invocation without intervening RCA',
          outcome,
          { attempts, signature, sd_key: claimedSdKey, rca_reset_applied: rcaResetApplied, bypassed }
        );

        if (attempts >= 3 && !bypassed) {
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
    // QF-20260525-345 (RCA 6188492f): match `git push … --force` only when it is the
    // OPERATIVE command — at start-of-command or after a true shell separator
    // (; | & ( newline, && ||) — NOT after a bare space or a backtick. The previous
    // boundary class `[\s;&|`]` admitted a space AND a backtick, so any command that
    // merely MENTIONED the phrase inside a quoted argument false-positived: gh pr/issue
    // `--body "… `git push --force-with-lease` …"` (markdown code-span → backtick),
    // `git commit -m "… git push --force …"`, `echo`, `grep`. Same class QF-484 fixed
    // for ENF-SD-CREATE-SKILL. Dropping backtick forgoes catching a `` `git push --force` ``
    // command-substitution — not a real force-push vector (substitution captures stdout);
    // all realistic vectors (bare, ; && || | & (, leading-ws, flag-after-positional) still block.
    const FORCE_PUSH_RE = /(?:^|[;&|(\n]|&&|\|\|)\s*git\s+push\b[^\n]*--force\b/;
    if (FORCE_PUSH_RE.test(cmd) && !/--help/.test(cmd)) {
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
      const { writeTelemetry } = require('./lib/session-telemetry-writer.cjs');

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

      writeTelemetry(_sessId, patch);
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
  process.exit(0);
}

main().catch(() => process.exit(0)); // Fail-open: async errors never block
