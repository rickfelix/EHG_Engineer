#!/usr/bin/env node
/**
 * Brainstorm Deliberation CLI Runner
 *
 * Bridge between the /brainstorm skill command and the programmatic
 * deliberation engine. Invokes executeDeliberation() with an Agent-tool
 * wrapper, then synthesizes the judiciary verdict.
 *
 * Usage:
 *   node scripts/brainstorm-deliberate.js --topic "Should we add OAuth2?"
 *   node scripts/brainstorm-deliberate.js --topic "..." --keywords "auth,security"
 *   node scripts/brainstorm-deliberate.js --topic "..." --session-id <brainstorm-session-id>
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
  node scripts/brainstorm-deliberate.js --topic "Your topic here"

Options:
  --topic          The deliberation topic (required)
  --keywords       Comma-separated keywords for panel selection
  --session-id     Brainstorm session ID (auto-generated if omitted)
  --dry-run        Show panel selection without running deliberation
  --help           Show this help
`);
  process.exit(args.help ? 0 : 1);
}

const topic = args.topic;
const keywords = args.keywords ? args.keywords.split(',').map(k => k.trim()).filter(Boolean) : [];
const sessionId = args['session-id'] || `deliberation-${Date.now()}`;

// ---------------------------------------------------------------------------
// invokeAgent wrapper
// ---------------------------------------------------------------------------
// In CLI mode, we use a simple LLM call via the client factory.
// In Claude Code mode, the brainstorm skill invokes Agent tool directly.
// This wrapper provides a consistent interface for both paths.
let invokeAgentFn;

try {
  const { createLLMClient } = await import('../lib/llm/client-factory.js');
  const llm = createLLMClient();

  invokeAgentFn = async (systemPrompt, userPrompt) => {
    const response = await llm.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });
    return response?.choices?.[0]?.message?.content || response?.content || '';
  };
} catch {
  // Fallback: if no LLM client available, provide a stub that explains the gap
  console.warn('[deliberate] LLM client not available — using echo stub');
  console.warn('[deliberate] Set ANTHROPIC_API_KEY or USE_LOCAL_LLM=true for real LLM calls');
  invokeAgentFn = async (systemPrompt, userPrompt) => {
    return `[Stub response — LLM not configured]\nSystem: ${systemPrompt.slice(0, 200)}...\nUser: ${userPrompt.slice(0, 200)}...`;
  };
}

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

  if (args['dry-run']) {
    const { selectPanel } = await import('../lib/brainstorm/panel-selector.js');
    const panel = await selectPanel(topic, keywords);
    console.log(`Panel (${panel.length} seats):`);
    for (const seat of panel) {
      const floor = seat.isGovernanceFloor ? ' [GOV]' : '';
      console.log(`  ${seat.code.padEnd(8)} ${seat.title}${floor}  (relevance: ${(seat.relevanceScore * 100).toFixed(0)}%, authority: ${seat.authorityScore || 50})`);
    }
    process.exit(0);
  }

  // Timeout wrapper
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('DELIBERATION_TIMEOUT')), DELIBERATION_TIMEOUT_MS);
  });

  let result;
  try {
    result = await Promise.race([
      executeDeliberation({
        topic,
        brainstormSessionId: sessionId,
        keywords,
        invokeAgent: invokeAgentFn,
        topicContext: { domain: keywords[0] || 'general' }
      }),
      timeoutPromise
    ]);
  } catch (err) {
    if (err.message === 'DELIBERATION_TIMEOUT') {
      console.error('');
      console.error(`TIMEOUT: Deliberation exceeded ${DELIBERATION_TIMEOUT_MS / 1000}s budget`);
      console.error('Partial results may be available in the database.');
      console.error(`Session: ${sessionId}`);
      process.exit(2);
    }
    throw err;
  }

  // Check quorum
  if (!result.quorumMet) {
    console.error('');
    console.error('QUORUM NOT MET');
    console.error(result.error?.message || 'Insufficient seats responded');
    console.error('');
    console.error('Available Round 1 positions:');
    for (const pos of result.round1Positions) {
      const hasContent = pos.position && pos.position.length > 50;
      console.error(`  ${pos.seatCode}: ${hasContent ? 'responded' : 'NO RESPONSE'}`);
    }
    console.error('');
    console.error('Falling back to partial results. Consider using --override-quorum or legacy 3-persona flow.');
    // Still print whatever we have
    printResults(result, null);
    process.exit(3);
  }

  // Synthesize verdict
  console.log('Synthesizing judiciary verdict...');
  const verdict = await synthesizeVerdict(result, invokeAgentFn);
  result.verdict = verdict;

  printResults(result, verdict);

  // Summary
  console.log('');
  console.log('Summary');
  console.log('-------');
  console.log(`Debate Session:  ${result.debateSessionId}`);
  console.log(`Panel Size:      ${result.panelSize}`);
  console.log(`Quorum Met:      ${result.quorumMet}`);
  console.log(`Round 1:         ${result.round1Positions.length} positions`);
  console.log(`Specialists:     ${result.specialistTestimony.length} summoned`);
  console.log(`Round 2:         ${result.round2Rebuttals.length} rebuttals`);
  console.log(`Escalation:      ${verdict.escalationRequired ? 'YES — chairman review needed' : 'No'}`);
  console.log(`Total Time:      ${(result.totalTimeMs / 1000).toFixed(1)}s`);
  console.log(`Verdict ID:      ${verdict.verdictId}`);
}

function printResults(result, verdict) {
  // Round 1
  console.log('');
  console.log('ROUND 1 — Initial Positions');
  console.log('---------------------------');
  for (const pos of result.round1Positions) {
    console.log(`\n[${pos.seatCode}] ${pos.seatTitle}`);
    console.log(pos.position?.slice(0, 600) || '(no response)');
    if (pos.position?.length > 600) console.log('...(truncated)');
  }

  // Specialist testimony
  if (result.specialistTestimony.length > 0) {
    console.log('');
    console.log('SPECIALIST TESTIMONY');
    console.log('--------------------');
    for (const spec of result.specialistTestimony) {
      console.log(`\n[${spec.agentCode}] Gap: ${spec.gap}`);
      console.log(spec.testimony?.slice(0, 400) || '(no testimony)');
      if (spec.testimony?.length > 400) console.log('...(truncated)');
    }
  }

  // Round 2
  if (result.round2Rebuttals.length > 0) {
    console.log('');
    console.log('ROUND 2 — Rebuttals');
    console.log('--------------------');
    for (const reb of result.round2Rebuttals) {
      console.log(`\n[${reb.seatCode}] ${reb.seatTitle}`);
      console.log(reb.rebuttal?.slice(0, 600) || '(no rebuttal)');
      if (reb.rebuttal?.length > 600) console.log('...(truncated)');
    }
  }

  // Verdict
  if (verdict) {
    console.log('');
    console.log('JUDICIARY VERDICT');
    console.log('=================');
    console.log(verdict.verdictText || '(no verdict)');
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
