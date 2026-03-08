#!/usr/bin/env node
/**
 * roadmap-okr-proposal.js — OKR-wave linkage and Chairman approval CLI
 * SD: SD-LEO-FEAT-STRATEGIC-ROADMAP-ARTIFACT-001-E
 *
 * Subcommands:
 *   link     --wave-item-id <uuid> --okr-id <id> [--rationale "reason"]
 *   unlink   --wave-item-id <uuid> --okr-id <id>
 *   status   --roadmap-id <uuid>
 *   propose  --roadmap-id <uuid> [--rationale "reason"]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {
  linkOkrToWaveItem,
  unlinkOkrFromWaveItem,
  calculateAlignment,
  createProposal,
} from '../lib/integrations/okr-wave-linker.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function parseArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
}

async function handleLink(args) {
  const waveItemId = parseArg(args, '--wave-item-id');
  const okrId = parseArg(args, '--okr-id');
  const rationale = parseArg(args, '--rationale');

  if (!waveItemId || !okrId) {
    console.log('Usage: node scripts/roadmap-okr-proposal.js link --wave-item-id <uuid> --okr-id <id> [--rationale "reason"]');
    process.exit(0);
  }

  const result = await linkOkrToWaveItem(supabase, waveItemId, okrId, rationale);

  if (result.success) {
    console.log('OKR-Wave Linkage');
    console.log('═'.repeat(50));
    console.log(`  ✓ Linked wave item to ${okrId}`);
    if (rationale) console.log(`  Rationale: ${rationale}`);
  } else {
    console.error(`  ✗ ${result.error}`);
    process.exit(1);
  }
}

async function handleUnlink(args) {
  const waveItemId = parseArg(args, '--wave-item-id');
  const okrId = parseArg(args, '--okr-id');

  if (!waveItemId || !okrId) {
    console.log('Usage: node scripts/roadmap-okr-proposal.js unlink --wave-item-id <uuid> --okr-id <id>');
    process.exit(0);
  }

  const result = await unlinkOkrFromWaveItem(supabase, waveItemId, okrId);

  if (result.success) {
    console.log('OKR-Wave Unlink');
    console.log('═'.repeat(50));
    console.log(`  ✓ Removed linkage to ${okrId}`);
  } else {
    console.error(`  ✗ ${result.error}`);
    process.exit(1);
  }
}

async function handleStatus(args) {
  const roadmapId = parseArg(args, '--roadmap-id');

  if (!roadmapId) {
    console.log('Usage: node scripts/roadmap-okr-proposal.js status --roadmap-id <uuid>');
    process.exit(0);
  }

  const { data: roadmap } = await supabase
    .from('strategic_roadmaps')
    .select('title, status')
    .eq('id', roadmapId)
    .single();

  if (!roadmap) {
    console.error(`Roadmap not found: ${roadmapId}`);
    process.exit(1);
  }

  const alignment = await calculateAlignment(supabase, roadmapId);

  console.log('OKR Alignment Status');
  console.log('═'.repeat(60));
  console.log(`  Roadmap: ${roadmap.title} [${roadmap.status}]`);
  console.log(`  Overall Alignment: ${alignment.overall_alignment_pct}%`);
  console.log('');

  if (alignment.waves.length === 0) {
    console.log('  No waves found.');
    return;
  }

  console.log('  ' + '─'.repeat(56));
  for (const wave of alignment.waves) {
    const bar = alignment.overall_alignment_pct > 0
      ? '█'.repeat(Math.round(wave.alignment_pct / 10)) + '░'.repeat(10 - Math.round(wave.alignment_pct / 10))
      : '░'.repeat(10);

    console.log(`  [${wave.sequence_rank}] ${wave.title}`);
    console.log(`      Items: ${wave.total_items} | Linked: ${wave.linked_items} | ${bar} ${wave.alignment_pct}%`);
    if (wave.okr_ids.length > 0) {
      console.log(`      OKRs: ${wave.okr_ids.join(', ')}`);
    }
    console.log('');
  }
}

async function handlePropose(args) {
  const roadmapId = parseArg(args, '--roadmap-id');
  const rationale = parseArg(args, '--rationale');

  if (!roadmapId) {
    console.log('Usage: node scripts/roadmap-okr-proposal.js propose --roadmap-id <uuid> [--rationale "reason"]');
    process.exit(0);
  }

  console.log('Chairman Approval Proposal');
  console.log('═'.repeat(60));

  const { decisionId, alignment } = await createProposal(supabase, roadmapId, { rationale });

  console.log(`  ✓ Proposal created`);
  console.log(`  Decision ID: ${decisionId}`);
  console.log(`  Overall OKR Alignment: ${alignment.overall_alignment_pct}%`);
  console.log(`  Waves: ${alignment.waves.length}`);
  if (rationale) console.log(`  Rationale: ${rationale}`);
  console.log('');
  console.log('  The Chairman will review this proposal in the decision queue.');
  console.log('  Once approved, run `node scripts/roadmap-baseline.js create` to lock the baseline.');
}

async function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  if (!subcommand || !['link', 'unlink', 'status', 'propose'].includes(subcommand)) {
    console.log('Usage: node scripts/roadmap-okr-proposal.js <link|unlink|status|propose> [options]');
    console.log('');
    console.log('Subcommands:');
    console.log('  link     --wave-item-id <uuid> --okr-id <id> [--rationale "reason"]  Link item to OKR');
    console.log('  unlink   --wave-item-id <uuid> --okr-id <id>                         Remove linkage');
    console.log('  status   --roadmap-id <uuid>                                         Show alignment');
    console.log('  propose  --roadmap-id <uuid> [--rationale "reason"]                  Submit for approval');
    process.exit(0);
  }

  switch (subcommand) {
    case 'link': await handleLink(args); break;
    case 'unlink': await handleUnlink(args); break;
    case 'status': await handleStatus(args); break;
    case 'propose': await handlePropose(args); break;
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
