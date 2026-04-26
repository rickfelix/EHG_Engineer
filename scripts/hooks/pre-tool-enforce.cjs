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
 *
 * Hook API:
 *   Input:  CLAUDE_TOOL_INPUT (JSON), CLAUDE_TOOL_NAME (string)
 *   Output: exit(0) = allow, exit(2) = block (stderr = rejection message)
 *           stdout = advisory feedback shown to model
 */

const TOOL_NAME = process.env.CLAUDE_TOOL_NAME || '';
const TOOL_INPUT_RAW = process.env.CLAUDE_TOOL_INPUT || '';

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
 * Fire-and-forget async write to permission_audit_log.
 * Called after every enforcement decision (allow/block/override/warn).
 * Failures are logged to stderr but NEVER block enforcement.
 *
 * @param {string} sessionId   - Claude Code session ID
 * @param {string} toolName    - Tool being evaluated (CLAUDE_TOOL_NAME)
 * @param {string} ruleCode    - Enforcement rule code (e.g. 'NC-006', 'PAT-CLMMULTI-001')
 * @param {string} ruleDesc    - Human-readable rule description
 * @param {string} outcome     - 'allow' | 'block' | 'override' | 'warn'
 * @param {Object} [metadata]  - Additional context (never contains secrets)
 */
function auditPermissionDecision(sessionId, toolName, ruleCode, ruleDesc, outcome, metadata) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return; // Missing credentials — skip silently

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

    // Fire and forget — no await, intentionally. Enforcement must not wait for audit.
    fetch(url, {
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
  }
}

// Derive session ID once at module load time
const _SESSION_ID = process.env.SESSION_ID ||
  process.env.CLAUDE_SESSION_ID ||
  process.env.LEO_SESSION_ID ||
  'unknown';

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

// Regex patterns to detect Supabase operations in Bash commands
const SUPABASE_PATTERNS = [
  /\.from\(\s*['"`](\w+)['"`]\s*\)/,        // .from('table_name')
  /supabase\.from\(\s*['"`](\w+)['"`]\s*\)/, // supabase.from('table_name')
  /\.rpc\(\s*['"`](\w+)['"`]/,               // .rpc('function_name')
];

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
  const mutationPattern = /\.(?:insert|update|upsert)\(\s*\{([^}]+)\}/g;
  while ((match = mutationPattern.exec(command)) !== null) {
    const objectBody = match[1];
    // Extract keys from "key: value" or "key : value" patterns
    const keyPattern = /(\w+)\s*:/g;
    let keyMatch;
    while ((keyMatch = keyPattern.exec(objectBody)) !== null) {
      params[keyMatch[1]] = 'unknown';
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
        auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'SCHEMA_PREFLIGHT', 'Schema pre-flight validation failed', 'block', { tableName, errors: result.errors });
        process.stderr.write(
          `SCHEMA VALIDATION FAILED (blocking):\n` +
          `  Table: ${tableName}\n` +
          `  Errors: ${result.errors.join('; ')}\n` +
          `  Fix the column names or types before running this command.\n`
        );
        process.exit(2);
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
    if (/leo-create-sd\.js/.test(cmd) && !/--help/.test(cmd) && !/SD_CREATE_VIA_SKILL=1/.test(cmd)) {
      auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'ENF-SD-CREATE-SKILL', 'SD creation skill enforcement', 'block', {});
      process.stderr.write(
        'PROTOCOL VIOLATION (ENF-SD-CREATE-SKILL): Direct leo-create-sd.js invocation blocked.\n' +
        'Use the /sd-create skill instead: Skill tool with skill="sd-create"\n' +
        'The skill provides description enrichment, vision readiness assessment, and post-creation chaining.\n'
      );
      process.exit(2);
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
    const NPM_INSTALL_RE = /(?:^|[\s;&|(])npm\s+(install|i|ci)(?:\s+|$)/;
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
          auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'NPM-INSTALL-RACE', 'npm install concurrency guard', 'block', { signal });
          process.stderr.write(
            `NPM INSTALL RACE GUARD (QF-20260426-822): refusing concurrent npm install.\n` +
            `  Signal: ${signal}\n` +
            `  Wait ~30-60s and retry, OR isolate via: npm run session:worktree -- --sd-key <key>\n` +
            `  If staging is stuck (no actual peer): rm -rf node_modules/.staging\n`
          );
          process.exit(2);
        }
      } catch { /* fail-open on any internal error */ }
    }
  }

  // --- ENFORCEMENT 1: Background Execution Ban (NC-006) ---
  // Applies to Task and Bash tools
  if (TOOL_NAME === 'Task' || TOOL_NAME === 'Bash') {
    if (input.run_in_background === true) {
      auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'NC-006', 'Background execution ban (AUTO-PROCEED)', 'block', {});
      process.stderr.write(
        'PROTOCOL VIOLATION (NC-006): Background execution is forbidden when AUTO-PROCEED is ON.\n' +
        'Run this command in the foreground. Background tasks break the autonomous chain of thought.\n'
      );
      process.exit(2); // Hard block
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
            auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'PAT-CLMMULTI-001', 'Worktree claim guard', 'block', { worktreeSdKey, claimedSd });
            process.stderr.write(
              `CLAIM GUARD (PAT-CLMMULTI-001): Edit/Write blocked.\n` +
              `  Target worktree: ${worktreeSdKey}\n` +
              `  Your claimed SD: ${claimedSd}\n` +
              `  You are editing files for a different SD than you have claimed.\n` +
              `  Switch to the correct worktree or release your claim.\n`
            );
            process.exit(2);
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
        auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'SD-LEO-INFRA-ONLY-ENFORCEMENT-STRATEGIC-002', 'DB-only strategic artifacts: docs/plans/', 'block', { filePath });
        process.stderr.write(
          'DB-ONLY ENFORCEMENT: Blocked new markdown file in docs/plans/.\n' +
          'Vision/architecture documents must be stored in the database.\n' +
          'Use: node scripts/eva/vision-command.mjs upsert --content "..."\n' +
          'Or:  node scripts/eva/archplan-command.mjs upsert --content "..."\n'
        );
        process.exit(2);
      }
    }

    // Block ALL markdown writes to brainstorm/ (new or existing)
    // Brainstorm content belongs in brainstorm_sessions.content column, not on disk.
    if (/brainstorm\/[^/]+\.md$/.test(filePath)) {
      auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'SD-LEO-INFRA-ONLY-ENFORCEMENT-STRATEGIC-002', 'DB-only strategic artifacts: brainstorm/', 'block', { filePath });
      process.stderr.write(
        'DB-ONLY ENFORCEMENT: Blocked markdown write to brainstorm/.\n' +
        'Brainstorm content must be stored in brainstorm_sessions.content column.\n' +
        'Build content in-memory and pass it to the DB insert in Step 9.\n' +
        'Do NOT use the Write tool for brainstorm documents.\n'
      );
      process.exit(2);
    }
  }

  // --- ENFORCEMENT 6: MCP Write Operation Block (SD-LEO-INFRA-MCP-READ-WRITE-001) ---
  // Block mcp__supabase__apply_migration — it's a write op but MCP role is read-only.
  // Read tools (execute_sql, list_tables, list_extensions, list_migrations) remain allowed.
  if (TOOL_NAME === 'mcp__supabase__apply_migration') {
    auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'SD-LEO-INFRA-MCP-READ-WRITE-001', 'MCP write operation block', 'block', {});
    process.stderr.write(
      'MCP WRITE BLOCK: mcp__supabase__apply_migration is a write operation.\n' +
      'The MCP Supabase role (supabase_read_only_user) cannot execute migrations.\n' +
      'Use the database-agent instead:\n' +
      '  Agent({ subagent_type: "database-agent", prompt: "Execute migration: <path>" })\n'
    );
    process.exit(2);
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
    if (SUPABASE_PATTERNS.some(p => p.test(command))) {
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
                      auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'D1-BUGFIX-TDD', 'Bugfix TDD prove-it gate', 'block', { sd_key: claimedSdKey, file_path: filePath });
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
                      process.exit(2);
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
      let claimedSdKey = null;
      try {
        const fs2 = require('fs');
        const path2 = require('path');
        const stateFile = path2.resolve(__dirname, '../../.claude/unified-session-state.json');
        if (fs2.existsSync(stateFile)) {
          const st = JSON.parse(fs2.readFileSync(stateFile, 'utf8'));
          claimedSdKey = st.sd?.sd_key || st.sd?.id || null;
        }
      } catch {
        // Missing state file is not fatal — reset lookup simply no-ops.
      }

      const { attempts, signature, rcaResetApplied } = await stateMgr.recordAndCount(
        _SESSION_ID, claimedSdKey, TOOL_NAME, input
      );

      if (signature && attempts >= 2) {
        const bypassed = process.env.EMERGENCY_RCA_BYPASS === 'true';
        const outcome = attempts >= 3 && !bypassed ? 'block' : 'warn';
        auditPermissionDecision(
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
          process.exit(2);
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
  process.exitCode = 0; // Allow
}

main().catch(() => { process.exitCode = 0; }); // Fail-open: async errors never block
