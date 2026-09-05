#!/usr/bin/env node
/**
 * Sanctioned disposition path for a user story that must never be implemented (a generator
 * artefact -- a review finding, a scope estimate -- not a real piece of work).
 * QF-20260903-222.
 *
 * Before this script, the only routes were an ad-hoc write (denied by the permission
 * classifier, correctly -- there was no sanctioned path) or promoting the story to
 * 'completed'/'ready', which asserts work that was never done. Neither is acceptable.
 *
 * Reuses status='blocked' + validation_status='skipped', the exclusion signal
 * lib/sub-agents/testing/phases/phase4-evidence.js's verifyUserStories() and the
 * EXEC-TO-PLAN USER_STORY_COVERAGE gate already treat as "excluded from completeness
 * checks, distinguishable from completed" -- no new status value, no schema migration.
 * Records who/when/why in metadata.disposition, which no gate reads today, so this is
 * additive audit data, not a change to gate semantics.
 *
 * Usage:
 *   node scripts/dispose-user-story.js <story_key> --reason-code <code> --reason "<text>" --actor <name> [--dry-run]
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

export function parseArgs(argv) {
  const storyKey = argv[0];
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i !== -1 ? argv[i + 1] : null;
  };
  return {
    storyKey,
    reasonCode: flag('--reason-code'),
    reason: flag('--reason'),
    actor: flag('--actor'),
    dryRun: argv.includes('--dry-run')
  };
}

export async function disposeUserStory(supabase, { storyKey, reasonCode, reason, actor, dryRun = false }) {
  if (!storyKey) throw new Error('story_key is required');
  if (!reasonCode) throw new Error('--reason-code is required');
  if (!reason) throw new Error('--reason is required');
  if (!actor) throw new Error('--actor is required');

  const { data: existing, error: fetchError } = await supabase
    .from('user_stories')
    .select('story_key, status, metadata')
    .eq('story_key', storyKey)
    .single();
  if (fetchError) throw new Error(`story not found: ${storyKey} (${fetchError.message})`);
  if (existing.status === 'completed') {
    throw new Error(
      `refusing to disposition ${storyKey}: status is already 'completed' -- disposition is ` +
      'for stories that must never be implemented, not for undoing recorded completed work'
    );
  }

  const metadata = {
    ...(existing.metadata || {}),
    disposition: { reason_code: reasonCode, reason, disposed_by: actor, disposed_at: new Date().toISOString() }
  };

  if (dryRun) {
    return { story_key: storyKey, dry_run: true, would_set: { status: 'blocked', validation_status: 'skipped', metadata } };
  }

  const { data, error } = await supabase
    .from('user_stories')
    .update({ status: 'blocked', validation_status: 'skipped', metadata })
    .eq('story_key', storyKey)
    .select('story_key, status, validation_status, metadata')
    .single();
  if (error) throw new Error(`disposition write failed for ${storyKey}: ${error.message}`);
  return data;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const supabase = createSupabaseServiceClient();
  const result = await disposeUserStory(supabase, args);
  console.log(JSON.stringify(result, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
