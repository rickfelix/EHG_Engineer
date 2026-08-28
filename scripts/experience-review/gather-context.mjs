#!/usr/bin/env node
/**
 * Stage-20 experience-design review, standalone adapter -- context gathering.
 * SD-LEO-FEAT-STAGE-EXPERIENCE-DESIGN-001 (FR-3), Unit B.
 *
 * INLINE MODE (same convention as add-prd-to-database.js and
 * record-explore-evidence.js): this script fetches the Stage-15 artifacts
 * and prints a review prompt. A Claude Code session (interactive or fleet
 * worker) reads the printed prompt, performs the review, and persists
 * findings via record-review.mjs. This script does NOT call an LLM itself --
 * see lib/eva/experience-review/context.js's module doc for why.
 *
 * Usage:
 *   node scripts/experience-review/gather-context.mjs --venture-id <uuid> \
 *     --deployment-url https://... [--venture-name "AltifyAI"]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  fetchExperienceReviewArtifacts,
  buildExperienceReviewPrompt,
} from '../../lib/eva/experience-review/context.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2).replace(/-/g, '_');
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    out[key] = val;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.venture_id || !args.deployment_url) {
    console.error('Usage: node scripts/experience-review/gather-context.mjs --venture-id <uuid> --deployment-url <url> [--venture-name <name>]');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { journey, wireframes, missing } = await fetchExperienceReviewArtifacts(supabase, args.venture_id);

  if (missing.length) {
    console.error(`[gather-context] missing artifact type(s) for venture ${args.venture_id}: ${missing.join(', ')} -- proceeding, prompt will instruct INCONCLUSIVE handling`);
  }

  const prompt = buildExperienceReviewPrompt({
    ventureName: args.venture_name,
    ventureId: args.venture_id,
    deploymentUrl: args.deployment_url,
    journey,
    wireframes,
    missing,
  });

  console.log(prompt);
}

main().catch((err) => {
  console.error('[gather-context] FATAL:', err.message);
  process.exit(1);
});
