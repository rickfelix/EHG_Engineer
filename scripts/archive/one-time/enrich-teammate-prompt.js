#!/usr/bin/env node
/**
 * CLI wrapper for Knowledge Enricher
 * SD-LEO-INFRA-DATABASE-DRIVEN-DYNAMIC-001
 *
 * Usage:
 *   node scripts/enrich-teammate-prompt.js --agent database-agent --task "connection pooling issue"
 *   node scripts/enrich-teammate-prompt.js --agent DATABASE --task "timeout investigation" --sd SD-PERF-001
 */

import { enrichTeammatePrompt } from '../lib/team/knowledge-enricher.js';

async function main() {
  const args = process.argv.slice(2);
  const agentIdx = args.indexOf('--agent');
  const taskIdx = args.indexOf('--task');
  const sdIdx = args.indexOf('--sd');

  if (agentIdx === -1 || taskIdx === -1) {
    console.error('Usage: node scripts/enrich-teammate-prompt.js --agent <agent-type> --task "<description>" [--sd <SD-ID>]');
    process.exit(1);
  }

  const agentType = args[agentIdx + 1];
  const taskDescription = args[taskIdx + 1];
  const sdId = sdIdx !== -1 ? args[sdIdx + 1] : null;

  console.log(`🧠 Enriching prompt for ${agentType}...`);
  console.log(`   Task: ${taskDescription}`);
  if (sdId) console.log(`   SD: ${sdId}`);

  const result = await enrichTeammatePrompt({ agentType, taskDescription, sdId });

  console.log(`\n📊 Summary: ${result.summary}`);
  console.log(`   AEF tokens: ${result.metadata.aefTokens}`);
  console.log(`   Semantic matches: ${result.metadata.semanticMatches}`);
  if (result.metadata.topPattern) {
    console.log(`   Top pattern: ${result.metadata.topPattern}`);
  }

  if (result.knowledgeBlock) {
    console.log(`\n--- Knowledge Block (${result.knowledgeBlock.length} chars) ---`);
    console.log(result.knowledgeBlock);
    console.log('--- End ---');
  } else {
    console.log('\n   No knowledge available for this task/agent combination.');
  }
}

const normalizedArgv = process.argv[1]?.replace(/\\/g, '/');
if (import.meta.url === `file:///${normalizedArgv}`) {
  main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}

export { main };
