#!/usr/bin/env node
/**
 * save-research-session.mjs
 * Saves an /eva research session to brainstorm_sessions table with vision linkage.
 *
 * Usage:
 *   node scripts/eva/save-research-session.mjs \
 *     --topic "<question>" \
 *     --tier <L1|L2|L3> \
 *     --summary "<one-sentence summary>" \
 *     [--vision-key <key>]
 *
 * Part of: SD-MAN-INFRA-EVA-RESEARCH-COMMAND-001
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1] ?? true;
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const { topic, tier, summary, 'vision-key': visionKey } = args;

  if (!topic || !tier) {
    console.error('Usage: save-research-session.mjs --topic "<question>" --tier <L1|L2|L3> --summary "<summary>" [--vision-key <key>]');
    process.exit(1);
  }

  const validTiers = ['L1', 'L2', 'L3'];
  if (!validTiers.includes(tier)) {
    console.error(`Invalid tier: ${tier}. Must be L1, L2, or L3.`);
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const metadata = {
    research_tier: tier,
    source: 'eva_research_command',
    ...(visionKey && { vision_key: visionKey }),
    ...(summary && { summary }),
  };

  const { data, error } = await supabase
    .from('brainstorm_sessions')
    .insert({
      domain: 'protocol',
      topic: topic.slice(0, 500), // cap at 500 chars
      mode: 'structured',
      capabilities_status: 'not_checked',
      retrospective_status: 'pending',
      metadata,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to save research session:', error.message);
    process.exit(1);
  }

  console.log(`SESSION_ID=${data.id}`);
  if (visionKey) {
    console.log(`VISION_LINKED=${visionKey}`);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
