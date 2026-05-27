#!/usr/bin/env node
/**
 * promote-user-stories.js
 *
 * SD-LEO-INFRA-AUTO-STORY-QUALITY-GATE-001 (Option B): canonical workflow for
 * moving auto-generated user stories from status=draft to status=ready after
 * human/sub-agent enrichment.
 *
 * Auto-generated stories with all-boilerplate acceptance criteria default to
 * status=draft (invisible to USER_STORY_QUALITY gate). This script promotes
 * them to status=ready (scoreable) after their ACs have been enriched.
 *
 * Usage:
 *   node scripts/promote-user-stories.js --sd-id SD-XXX-001 --all-non-boilerplate
 *   node scripts/promote-user-stories.js --sd-id SD-XXX-001 --story-keys US-001,US-002
 *   node scripts/promote-user-stories.js --sd-id SD-XXX-001 --all --dry-run
 *   node scripts/promote-user-stories.js --sd-id SD-XXX-001 --story-keys US-003 --force
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseArgs(argv) {
  const args = { sdId: null, storyKeys: null, all: false, allNonBoilerplate: false, dryRun: false, force: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--sd-id' && argv[i + 1]) args.sdId = argv[++i];
    else if (argv[i] === '--story-keys' && argv[i + 1]) args.storyKeys = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (argv[i] === '--all') args.all = true;
    else if (argv[i] === '--all-non-boilerplate') args.allNonBoilerplate = true;
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--force') args.force = true;
  }
  return args;
}

function isStoryAllBoilerplate(story) {
  const acs = story.acceptance_criteria;
  if (!Array.isArray(acs) || acs.length === 0) return false;
  return acs.every(ac => ac && typeof ac === 'object' && ac.is_boilerplate === true);
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.sdId) {
    console.error('❌ --sd-id is required');
    process.exit(1);
  }
  const modeCount = [args.all, args.allNonBoilerplate, !!args.storyKeys].filter(Boolean).length;
  if (modeCount !== 1) {
    console.error('❌ Exactly one of --all, --all-non-boilerplate, --story-keys is required');
    process.exit(1);
  }

  // Resolve SD UUID from sd_key
  let sdUuid = args.sdId;
  if (args.sdId.startsWith('SD-') || args.sdId.startsWith('QF-')) {
    const { data: sd, error } = await supabase
      .from('strategic_directives_v2')
      .select('id,sd_key')
      .eq('sd_key', args.sdId)
      .single();
    if (error || !sd) {
      console.error(`❌ SD not found: ${args.sdId}`);
      process.exit(1);
    }
    sdUuid = sd.id;
  }

  // Fetch draft stories
  const { data: drafts, error: fetchErr } = await supabase
    .from('user_stories')
    .select('id, story_key, title, status, acceptance_criteria')
    .eq('sd_id', sdUuid)
    .eq('status', 'draft');
  if (fetchErr) {
    console.error('❌ Fetch error:', fetchErr.message);
    process.exit(1);
  }
  if (!drafts || drafts.length === 0) {
    console.log(`ℹ️  No user_stories at status=draft for ${args.sdId}. Nothing to promote.`);
    return;
  }

  // Decide which to promote
  let toPromote;
  if (args.storyKeys) {
    const keySet = new Set(args.storyKeys);
    toPromote = drafts.filter(s => keySet.has(s.story_key) || keySet.has(s.story_key.split(':').pop()));
    if (toPromote.length !== args.storyKeys.length) {
      const found = toPromote.map(s => s.story_key.split(':').pop());
      const missing = args.storyKeys.filter(k => !found.includes(k));
      console.warn(`⚠️  ${missing.length} story-key(s) not found at status=draft: ${missing.join(', ')}`);
    }
  } else if (args.all) {
    toPromote = drafts;
  } else if (args.allNonBoilerplate) {
    toPromote = drafts.filter(s => !isStoryAllBoilerplate(s));
    const skippedBoilerplate = drafts.length - toPromote.length;
    if (skippedBoilerplate > 0) {
      console.log(`ℹ️  Skipping ${skippedBoilerplate} story(ies) still flagged all-boilerplate (enrich ACs first or use --force).`);
    }
  }

  if (toPromote.length === 0) {
    console.log('ℹ️  Nothing to promote after filtering.');
    return;
  }

  // Re-check boilerplate (unless --force) for the chosen set; refuse to promote all-boilerplate without --force
  if (!args.force) {
    const stillBoilerplate = toPromote.filter(isStoryAllBoilerplate);
    if (stillBoilerplate.length > 0) {
      console.error(`❌ Refusing to promote ${stillBoilerplate.length} story(ies) still flagged all-boilerplate:`);
      stillBoilerplate.forEach(s => console.error('   - ' + s.story_key + ': ' + s.title));
      console.error('   Enrich their acceptance_criteria first (clear is_boilerplate=true on each AC), OR re-run with --force to override.');
      process.exit(1);
    }
  }

  // Show plan
  console.log(`Planned promotion: ${toPromote.length} story(ies) draft → ready for ${args.sdId}`);
  toPromote.forEach(s => console.log('   • ' + s.story_key + ': ' + (s.title || '').substring(0, 80)));

  if (args.dryRun) {
    console.log('\n--dry-run: no UPDATE performed.');
    return;
  }

  // Execute UPDATE
  const ids = toPromote.map(s => s.id);
  const { error: updErr } = await supabase
    .from('user_stories')
    .update({ status: 'ready', updated_at: new Date().toISOString() })
    .in('id', ids);
  if (updErr) {
    console.error('❌ UPDATE error:', updErr.message);
    process.exit(1);
  }
  console.log(`\n✅ Promoted ${ids.length} story(ies) draft → ready.`);
  console.log(`   Next: re-run handoff PLAN-TO-EXEC on ${args.sdId} — USER_STORY_QUALITY gate will score the promoted stories.`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
