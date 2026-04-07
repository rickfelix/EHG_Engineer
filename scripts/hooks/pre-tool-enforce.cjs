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

  // Final allow decision — audit the pass-through
  auditPermissionDecision(_SESSION_ID, TOOL_NAME, 'ALLOW', 'Tool call permitted by all enforcement rules', 'allow', {});
  process.exitCode = 0; // Allow
}

main().catch(() => { process.exitCode = 0; }); // Fail-open: async errors never block
