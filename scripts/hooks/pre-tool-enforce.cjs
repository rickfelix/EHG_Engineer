#!/usr/bin/env node
/**
 * LEO Protocol Enforcement Hook (PreToolUse)
 *
 * Replaces text-based rules in CLAUDE.md with programmatic enforcement:
 * 1. Background execution ban (NC-006) - HARD BLOCK (exit 2)
 * 2. Sub-agent routing advisory - SOFT HINT (stdout, exit 0)
 *
 * Hook API:
 *   Input:  CLAUDE_TOOL_INPUT (JSON), CLAUDE_TOOL_NAME (string)
 *   Output: exit(0) = allow, exit(2) = block (stderr = rejection message)
 *           stdout = advisory feedback shown to model
 */

const TOOL_NAME = process.env.CLAUDE_TOOL_NAME || '';
const TOOL_INPUT_RAW = process.env.CLAUDE_TOOL_INPUT || '';

// --- AGENT ROUTING TABLE ---
// Source of truth: lib/keyword-intent-scorer.js (primary keywords only)
// This is a lightweight subset for advisory hints. The full keyword set
// remains in the scorer for weighted scoring at runtime.
const AGENT_ROUTING = [
  { agent: 'database-agent',    keywords: ['migration', 'schema', 'alter table', 'add column', 'sql', 'postgres', 'rls', 'supabase'] },
  { agent: 'design-agent',      keywords: ['component design', 'tailwind', 'responsive', 'accessibility', 'wcag', 'figma'] },
  { agent: 'security-agent',    keywords: ['auth bypass', 'csrf', 'xss', 'injection', 'api key exposed', 'vulnerability'] },
  { agent: 'testing-agent',     keywords: ['test coverage', 'playwright', 'e2e test', 'unit test', 'vitest', 'test plan'] },
  { agent: 'performance-agent', keywords: ['bottleneck', 'load time', 'cpu usage', 'memory leak', 'latency'] },
  { agent: 'rca-agent',         keywords: ['root cause', '5 whys', 'causal analysis', 'why did', 'failure analysis'] },
  { agent: 'docmon-agent',      keywords: ['documentation update', 'stale docs', 'readme', 'api docs'] },
  { agent: 'regression-agent',  keywords: ['backward compatible', 'api signature', 'breaking change', 'refactor'] },
];

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

  // --- ENFORCEMENT 2: Sub-Agent Routing Advisory ---
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
