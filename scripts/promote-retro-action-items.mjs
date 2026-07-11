#!/usr/bin/env node
/**
 * SD-LEO-INFRA-HARNESS-BACKLOG-DRAIN-POLICY-001 / FR-8
 *
 * Audit finding: no code path in this repo promotes retrospectives.action_items into
 * the feedback table (grepped scripts/modules/learning, lib/sub-agents/retro,
 * scripts/modules/handoff -- none write action_items into feedback). The closure-map's
 * "retro action items are promoted into the same table and die there" describes the
 * WORKFLOW-level failure mode: high-priority action_items sit in the retrospectives
 * JSONB column with no automated promotion to actionable work AT ALL, which is the
 * same terminal outcome (dies unactioned) even though no feedback-table insert is
 * literally involved. This script closes that gap directly -- retro action items with
 * priority='high' are promoted straight to a QF via the existing QF-creation path
 * (scripts/create-quick-fix.js), never through an intermediate feedback-table insert.
 *
 * Idempotent per retro: once a retrospective's high-priority action items are
 * promoted, metadata.action_items_promoted is stamped on that retrospectives row so
 * re-runs skip it.
 *
 * Usage:
 *   node scripts/promote-retro-action-items.mjs           # dry run (default)
 *   node scripts/promote-retro-action-items.mjs --apply    # actually create QFs
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const apply = process.argv.includes('--apply');
const LOOKBACK_DAYS = 7;

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();

// Two shapes exist in the wild: the retro-agent's prompt-driven output uses
// { item, owner, priority }; the real retrospectives.action_items schema (both
// lib/sub-agents/retro/action-items.js's generateSmartActionItems() and hand-authored
// retro rows) uses { title, description, owner_role, priority }. Support all three
// rather than picking one and silently dropping the other's text.
function actionText(item) {
  return item.title || item.item || item.action || item.description || '(no text)';
}

const { data: retros, error } = await supabase
  .from('retrospectives')
  .select('id, sd_id, title, action_items, target_application, metadata, created_at')
  .gte('created_at', cutoff)
  .not('action_items', 'is', null);

if (error) {
  console.error('ERROR (select):', JSON.stringify(error));
  process.exitCode = 1;
  process.exit();
}

let promoted = 0;
let skippedAlreadyPromoted = 0;
let skippedNoHighPriority = 0;

for (const retro of retros || []) {
  if (retro.metadata?.action_items_promoted) {
    skippedAlreadyPromoted++;
    continue;
  }

  const items = Array.isArray(retro.action_items) ? retro.action_items : [];
  const highPriority = items.filter(i => i && i.priority === 'high');
  if (highPriority.length === 0) {
    skippedNoHighPriority++;
    continue;
  }

  console.log(`\n[PROMOTABLE] retro=${retro.id} sd=${retro.sd_id} high-priority action_items=${highPriority.length}`);
  for (const item of highPriority) console.log(`  - ${actionText(item)}`);

  if (!apply) {
    console.log('  [DRY RUN] would create QF-candidate here.');
    continue;
  }

  const title = `[Retro action items] ${retro.sd_id || retro.title || retro.id}`.slice(0, 100);
  const description = [
    `Auto-promoted from ${highPriority.length} high-priority action item(s) in retrospective ${retro.id} (SD ${retro.sd_id || 'n/a'}).`,
    ...highPriority.map((i, idx) => `${idx + 1}. ${actionText(i)} (owner: ${i.owner_role || i.owner || 'unassigned'}, success criteria: ${i.success_criteria || 'n/a'})`)
  ].join('\n');

  try {
    const cliArgs = [
      'scripts/create-quick-fix.js',
      '--title', title,
      '--type', 'bug',
      '--severity', 'medium',
      '--description', description,
    ];
    if (retro.target_application) cliArgs.push('--target-application', retro.target_application);
    execFileSync('node', cliArgs, { stdio: 'inherit' });

    await supabase
      .from('retrospectives')
      .update({ metadata: { ...(retro.metadata || {}), action_items_promoted: true, action_items_promoted_at: new Date().toISOString() } })
      .eq('id', retro.id);
    promoted++;
  } catch (e) {
    console.error(`  [PROMOTE_FAILED] create-quick-fix.js exited non-zero for retro ${retro.id}: ${e.message}`);
  }
}

console.log(`\nSummary: ${promoted} promoted, ${skippedAlreadyPromoted} already-promoted, ${skippedNoHighPriority} with no high-priority items.`);
