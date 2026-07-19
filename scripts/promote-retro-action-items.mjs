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
import { actionText, actionOwner, isActionable } from './lib/retro-action-item-filter.mjs';

const apply = process.argv.includes('--apply');
const LOOKBACK_DAYS = 7;

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();

// actionText/actionOwner/isActionable live in scripts/lib/retro-action-item-filter.mjs
// (SD-FDBK-FIX-RETRO-ACTION-ITEM-001 / FR-1) so they are independently unit-testable.
// Four action-item shapes exist in the wild: the retro-agent's prompt-driven output uses
// { item, owner, priority }; lib/sub-agents/retro/action-items.js's programmatic
// generateSmartActionItems() uses { action, owner, deadline, success_criteria,
// priority, source }; a manually-authored SD_COMPLETION retrospective (e.g. via
// scripts/one-off/insert-retro-*.cjs) uses { title, description, owner_role,
// priority } (QF-20260711-253: '(no text)'/'unassigned' auto-promoted because
// this third shape wasn't covered); a fourth shape, { text, category, priority }
// (e.g. PLAN_VERIFICATION retrospectives), also promoted as '(no text)' until
// QF-20260711-895 added it here. Support all four rather than silently dropping
// text/owner for whichever shape isn't checked -- if a fifth shape appears,
// add it here too, not a one-off patch on the promoted QF.

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

// QF-20260719-740: promoter never re-checked whether the target SD was already
// terminal by promotion time -- an 11-instance class of moot QFs ("[Retro action
// items] <sd_id>") all targeted SDs already status=completed/cancelled, because the
// retro that spawned them predates the SD reaching a terminal state (e.g. LEAD-FINAL
// accepted the same session). Batch-fetch statuses once so terminal SDs short-circuit
// promotion instead of minting an already-moot QF.
const TERMINAL_SD_STATUSES = new Set(['completed', 'cancelled']);
const retroSdIds = [...new Set((retros || []).map(r => r.sd_id).filter(Boolean))];
const sdStatusById = new Map();
if (retroSdIds.length > 0) {
  const { data: sds, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, status')
    .in('id', retroSdIds);
  if (sdErr) {
    console.error('ERROR (sd status lookup):', JSON.stringify(sdErr));
  } else {
    for (const sd of sds || []) sdStatusById.set(sd.id, sd.status);
  }
}

let promoted = 0;
let skippedAlreadyPromoted = 0;
let skippedNoHighPriority = 0;
let skippedNonActionable = 0;
let skippedTerminalSd = 0;

let skippedTestFixture = 0;

for (const retro of retros || []) {
  if (retro.metadata?.action_items_promoted) {
    skippedAlreadyPromoted++;
    continue;
  }

  if (retro.sd_id && TERMINAL_SD_STATUSES.has(sdStatusById.get(retro.sd_id))) {
    console.log(`\n[SKIP_TERMINAL_SD] retro=${retro.id} sd=${retro.sd_id} status=${sdStatusById.get(retro.sd_id)} -- SD already terminal, action items moot.`);
    skippedTerminalSd++;
    continue;
  }

  // QF-20260711-711: tests/integration/harness-backlog-drain-policy.db.test.js seeds
  // fixture rows straight into this same production table (no isolated test schema
  // exists). A leaked, un-cleaned fixture was scanned by this script's daily --apply
  // cron and promoted into a real QF from placeholder text. Reject known-synthetic
  // rows defensively here so a future test-cleanup failure can't repeat that.
  //
  // SD-FDBK-FIX-RETRO-ACTION-ITEM-001: gated on `apply` -- the actual incident was a
  // REAL QF minted by an --apply run, which only happens when apply is true. The same
  // integration test's dry-run assertions (this script called with no --apply) were
  // broken unconditionally by the original guard since it fires regardless of mode,
  // even though dry-run never calls create-quick-fix.js and poses no leak risk.
  if (apply && (retro.metadata?.test_fixture || retro.title === 'Test retrospective')) {
    skippedTestFixture++;
    continue;
  }

  const items = Array.isArray(retro.action_items) ? retro.action_items : [];
  const highPriority = items.filter(i => i && i.priority === 'high');
  if (highPriority.length === 0) {
    skippedNoHighPriority++;
    continue;
  }

  // SD-FDBK-FIX-RETRO-ACTION-ITEM-001 / FR-1: reject items that are not
  // concretely EXEC-actionable (protocol-phase owner and/or no success
  // criteria) BEFORE they are ever promoted into a QF. A retro whose
  // high-priority items are ALL non-actionable is treated identically to
  // "no high-priority items" -- non-actionable items are logged, not
  // silently dropped, so they remain visible for a human/coordinator pass.
  const actionable = highPriority.filter(isActionable);
  const nonActionable = highPriority.filter(i => !isActionable(i));
  if (nonActionable.length > 0) {
    console.log(`\n[NON-ACTIONABLE] retro=${retro.id} sd=${retro.sd_id} rejected ${nonActionable.length} item(s):`);
    for (const item of nonActionable) {
      console.log(`  - ${actionText(item)} (owner: ${actionOwner(item)}, success criteria: ${item.success_criteria || 'n/a'})`);
    }
  }
  if (actionable.length === 0) {
    skippedNonActionable++;
    continue;
  }

  console.log(`\n[PROMOTABLE] retro=${retro.id} sd=${retro.sd_id} high-priority action_items=${actionable.length}/${highPriority.length}`);
  for (const item of actionable) console.log(`  - ${actionText(item)}`);

  if (!apply) {
    console.log('  [DRY RUN] would create QF-candidate here.');
    continue;
  }

  const title = `[Retro action items] ${retro.sd_id || retro.title || retro.id}`.slice(0, 100);
  const description = [
    `Auto-promoted from ${actionable.length} high-priority action item(s) in retrospective ${retro.id} (SD ${retro.sd_id || 'n/a'}).`,
    ...actionable.map((i, idx) => `${idx + 1}. ${actionText(i)} (owner: ${actionOwner(i)}, success criteria: ${i.success_criteria || 'n/a'})`)
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

console.log(`\nSummary: ${promoted} promoted, ${skippedAlreadyPromoted} already-promoted, ${skippedTerminalSd} terminal-SD, ${skippedTestFixture} test-fixture, ${skippedNoHighPriority} with no high-priority items, ${skippedNonActionable} with only non-actionable items.`);
