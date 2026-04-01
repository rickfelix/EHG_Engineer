#!/usr/bin/env node
/**
 * Brainstorm Deliberation CLI Runner
 *
 * Bridge between the /brainstorm skill command and the programmatic
 * deliberation engine. This script is invoked FROM Claude Code — the
 * invokeAgent callback must be provided by the caller (the brainstorm
 * command spec passes Claude's Agent tool as the callback).
 *
 * This script handles:
 * - CLI argument parsing (--topic, --keywords, --session-id, --dry-run)
 * - Panel selection preview (--dry-run)
 * - Orchestration: executeDeliberation() + synthesizeVerdict()
 * - Timeout enforcement (3-minute budget)
 * - Quorum failure detection
 * - Result formatting and printing
 *
 * The invokeAgent function is NOT built into this script. It is injected
 * by the brainstorm command which wraps Claude's Agent tool. For standalone
 * testing, pass --dry-run to verify panel selection without LLM calls.
 *
 * Usage (from brainstorm command):
 *   Called programmatically with invokeAgent injected
 *
 * Usage (standalone):
 *   node scripts/brainstorm-deliberate.js --topic "..." --dry-run
 *   node scripts/brainstorm-deliberate.js --topic "..." --keywords "auth,security" --dry-run
 *
 * SD: SD-MAN-INFRA-DELIBERATION-ENGINE-BRIDGE-001
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { executeDeliberation, synthesizeVerdict, DELIBERATION_TIMEOUT_MS } from '../lib/brainstorm/deliberation-engine.js';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const { values: args } = parseArgs({
  options: {
    topic: { type: 'string' },
    keywords: { type: 'string', default: '' },
    'session-id': { type: 'string', default: '' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false }
  },
  strict: true
});

if (args.help || !args.topic) {
  console.log(`
Brainstorm Deliberation Runner

Usage:
  node scripts/brainstorm-deliberate.js --topic "Your topic here" --dry-run

Options:
  --topic          The deliberation topic (required)
  --keywords       Comma-separated keywords for panel selection
  --session-id     Brainstorm session ID (auto-generated if omitted)
  --dry-run        Show panel selection without running deliberation
  --help           Show this help

Note: Full deliberation requires an invokeAgent callback (provided by
the /brainstorm command via Claude's Agent tool). Use --dry-run for
standalone panel selection testing.
`);
  process.exit(args.help ? 0 : 1);
}

const topic = args.topic;
const keywords = args.keywords ? args.keywords.split(',').map(k => k.trim()).filter(Boolean) : [];
const sessionId = args['session-id'] || `deliberation-${Date.now()}`;

// ---------------------------------------------------------------------------
// Main execution
// ---------------------------------------------------------------------------
async function main() {
  console.log('');
  console.log('Board Deliberation Engine');
  console.log('========================');
  console.log(`Topic:    ${topic}`);
  console.log(`Keywords: ${keywords.length > 0 ? keywords.join(', ') : '(none)'}`);
  console.log(`Session:  ${sessionId}`);
  console.log(`Budget:   ${DELIBERATION_TIMEOUT_MS / 1000}s`);
  console.log('');

  // --dry-run: panel selection only (no LLM needed)
  const { selectPanel } = await import('../lib/brainstorm/panel-selector.js');
  const panel = await selectPanel(topic, keywords);
  console.log(`Panel (${panel.length} seats):`);
  for (const seat of panel) {
    const floor = seat.isGovernanceFloor ? ' [GOV]' : '';
    console.log(`  ${seat.code.padEnd(8)} ${seat.title}${floor}  (relevance: ${(seat.relevanceScore * 100).toFixed(0)}%, authority: ${seat.authorityScore || 50})`);
  }

  if (args['dry-run']) {
    console.log('');
    console.log('Dry run complete. Panel selected but deliberation not executed.');
    console.log('Full deliberation runs via /brainstorm command (Claude Agent tool provides invokeAgent).');
    process.exit(0);
  }

  // Full deliberation requires invokeAgent — not available in standalone CLI
  console.error('');
  console.error('ERROR: Full deliberation requires an invokeAgent callback.');
  console.error('');
  console.error('The invokeAgent function is provided by the /brainstorm command,');
  console.error('which wraps Claude\'s Agent tool to invoke board seats and specialists.');
  console.error('');
  console.error('To run a full deliberation:');
  console.error('  1. Use /brainstorm in Claude Code (invokes this engine at Step 6D.1a)');
  console.error('');
  console.error('To test panel selection standalone:');
  console.error('  node scripts/brainstorm-deliberate.js --topic "..." --dry-run');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Exported API for programmatic invocation from brainstorm command
// ---------------------------------------------------------------------------

/**
 * Run a full deliberation with an injected invokeAgent callback.
 * Called by the /brainstorm command which provides Claude's Agent tool.
 *
 * @param {object} params
 * @param {string} params.topic - Deliberation topic
 * @param {string[]} params.keywords - Topic keywords
 * @param {string} params.sessionId - Brainstorm session ID
 * @param {Function} params.invokeAgent - (systemPrompt, userPrompt) => string
 * @returns {Promise<object>} { result, verdict }
 */
export async function runDeliberation({ topic, keywords = [], sessionId, invokeAgent }) {
  if (!invokeAgent) throw new Error('invokeAgent callback is required');

  // Timeout wrapper
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('DELIBERATION_TIMEOUT')), DELIBERATION_TIMEOUT_MS);
  });

  const result = await Promise.race([
    executeDeliberation({
      topic,
      brainstormSessionId: sessionId || `deliberation-${Date.now()}`,
      keywords,
      invokeAgent,
      topicContext: { domain: keywords[0] || 'general' }
    }),
    timeoutPromise
  ]);

  let verdict = null;
  if (result.quorumMet) {
    verdict = await synthesizeVerdict(result, invokeAgent);
    result.verdict = verdict;
  }

  return { result, verdict };
}

/**
 * Format deliberation results as structured text for output.
 */
export function formatResults(result, verdict) {
  const lines = [];

  lines.push('ROUND 1 — Initial Positions');
  lines.push('---------------------------');
  for (const pos of result.round1Positions) {
    lines.push(`\n[${pos.seatCode}] ${pos.seatTitle}`);
    lines.push(pos.position?.slice(0, 600) || '(no response)');
    if (pos.position?.length > 600) lines.push('...(truncated)');
  }

  if (result.specialistTestimony?.length > 0) {
    lines.push('\nSPECIALIST TESTIMONY');
    lines.push('--------------------');
    for (const spec of result.specialistTestimony) {
      lines.push(`\n[${spec.agentCode}] Gap: ${spec.gap}`);
      lines.push(spec.testimony?.slice(0, 400) || '(no testimony)');
      if (spec.testimony?.length > 400) lines.push('...(truncated)');
    }
  }

  if (result.round2Rebuttals?.length > 0) {
    lines.push('\nROUND 2 — Rebuttals');
    lines.push('--------------------');
    for (const reb of result.round2Rebuttals) {
      lines.push(`\n[${reb.seatCode}] ${reb.seatTitle}`);
      lines.push(reb.rebuttal?.slice(0, 600) || '(no rebuttal)');
      if (reb.rebuttal?.length > 600) lines.push('...(truncated)');
    }
  }

  if (verdict) {
    lines.push('\nJUDICIARY VERDICT');
    lines.push('=================');
    lines.push(verdict.verdictText || '(no verdict)');
  }

  lines.push('\nSummary');
  lines.push('-------');
  lines.push(`Debate Session:  ${result.debateSessionId}`);
  lines.push(`Panel Size:      ${result.panelSize}`);
  lines.push(`Quorum Met:      ${result.quorumMet}`);
  lines.push(`Round 1:         ${result.round1Positions.length} positions`);
  lines.push(`Specialists:     ${result.specialistTestimony?.length || 0} summoned`);
  lines.push(`Round 2:         ${result.round2Rebuttals?.length || 0} rebuttals`);
  if (verdict) {
    lines.push(`Escalation:      ${verdict.escalationRequired ? 'YES — chairman review needed' : 'No'}`);
    lines.push(`Verdict ID:      ${verdict.verdictId}`);
  }
  lines.push(`Total Time:      ${(result.totalTimeMs / 1000).toFixed(1)}s`);

  return lines.join('\n');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
