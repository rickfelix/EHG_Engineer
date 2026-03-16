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
 *
 * Hook API:
 *   Input:  CLAUDE_TOOL_INPUT (JSON), CLAUDE_TOOL_NAME (string)
 *   Output: exit(0) = allow, exit(2) = block (stderr = rejection message)
 *           stdout = advisory feedback shown to model
 */

const TOOL_NAME = process.env.CLAUDE_TOOL_NAME || '';
const TOOL_INPUT_RAW = process.env.CLAUDE_TOOL_INPUT || '';

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

function main() {
  let input;
  try {
    input = JSON.parse(TOOL_INPUT_RAW);
  } catch {
    // Not JSON or empty - nothing to enforce
    process.exit(0);
  }

  // --- ENFORCEMENT 1: Background Execution Ban (NC-006) ---
  // Applies to Task and Bash tools
  if (TOOL_NAME === 'Task' || TOOL_NAME === 'Bash') {
    if (input.run_in_background === true) {
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
      process.stderr.write(
        'DB-ONLY ENFORCEMENT: Blocked markdown write to brainstorm/.\n' +
        'Brainstorm content must be stored in brainstorm_sessions.content column.\n' +
        'Build content in-memory and pass it to the DB insert in Step 9.\n' +
        'Do NOT use the Write tool for brainstorm documents.\n'
      );
      process.exit(2);
    }
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
        console.log(
          `[pre-tool-enforce] ROUTING HINT: Detected "${matchedKeyword}" in prompt. ` +
          `Consider using subagent_type="${route.agent}" for best results.`
        );
        break; // One hint per invocation
      }
    }
  }

  process.exit(0); // Allow
}

main();
