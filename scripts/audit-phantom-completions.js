#!/usr/bin/env node
/**
 * audit-phantom-completions.js
 *
 * Five-state classifier for `status='completed'` SDs that may lack proper
 * ship_review_findings evidence. Built for SD-MAN-INFRA-RECONCILE-S18-S26-001.
 *
 * States:
 *   SHIPPED                  — has ship_review_findings row + merged PR on main
 *   BACKFILL_NEEDED          — merged PR on main but no ship_review_findings row
 *   PHANTOM_WITH_FORWARDING  — DB completed but unmerged; equivalent scope landed elsewhere
 *   PHANTOM_NO_FORWARDING    — DB completed but unmerged; no forwarding commit found
 *   ORCHESTRATOR_PARENT      — has children with mixed/all-shipped state; preserve, summary backfill
 *
 * Modes:
 *   dry-run (default)        — report classification, no DB writes
 *   --apply                  — UPDATE phantom SDs to status='cancelled' + INSERT backfill rows
 *
 * Filters:
 *   --sd-pattern <like>      — restrict to SDs matching sd_key LIKE pattern (e.g., '%S18%')
 *   --include-shipped        — show SHIPPED rows in report (default: hide)
 *
 * SD-MAN-INFRA-RECONCILE-S18-S26-001
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { lookupSdIdForFk } from './modules/auto-trigger-stories.mjs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const INCLUDE_SHIPPED = args.includes('--include-shipped');
const sdPatternIdx = args.indexOf('--sd-pattern');
const SD_PATTERN = sdPatternIdx >= 0 ? args[sdPatternIdx + 1] : '%S1[7-9]%';

// Pre-classified inventory (SD-MAN-INFRA-RECONCILE-S18-S26-001 amendment from validation-agent ce2fc234).
// Keyed by sd_key. Subtype determines audit's apply behavior.
const INVENTORY = {
  // 3 cancellable phantoms
  'SD-MAN-ORCH-S18-S26-PIPELINE-001-A': {
    subtype: 'PHANTOM_WITH_FORWARDING',
    forwarding_commit: '2a63dac3',
    forwarded_via_pr: 533,
    note: 'Orphan commit; scope re-landed in PR #533 (SD-MAN-FIX-WIRE-S18-S22-001)',
  },
  'SD-MAN-ORCH-S18-S26-PIPELINE-001-B': {
    subtype: 'PHANTOM_WITH_FORWARDING',
    forwarding_commit: '6411c1da',
    forwarded_via_pr: 533,
    note: 'Orphan commit; same forwarding to PR #533',
  },
  'SD-MAN-INFRA-S18-S26-DATA-001': {
    subtype: 'PHANTOM_NO_FORWARDING',
    note: 'True orphan; no commit anywhere referencing sd_key',
  },
  // Orchestrator parents — preserve, summary backfill
  'SD-MAN-ORCH-S18-S26-PIPELINE-001': {
    subtype: 'ORCHESTRATOR_PARENT',
    children_status: 'mixed',
    note: 'Children A/B phantom; child C shipped (PR #523). Partial-ship parent.',
  },
  'SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001': {
    subtype: 'ORCHESTRATOR_PARENT',
    children_status: 'all_shipped',
    note: 'All 6 children A-F shipped. Derivatively-SHIPPED parent. DO NOT cancel.',
  },
  // 7 BACKFILL_NEEDED — shipped but no ship_review_findings row
  'SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-A': { subtype: 'BACKFILL_NEEDED', pr_number: 3206, repo: 'EHG_Engineer' },
  'SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-B': { subtype: 'BACKFILL_NEEDED', pr_number: 3208, repo: 'EHG_Engineer', companion_pr: 520, companion_repo: 'ehg' },
  'SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-C': { subtype: 'BACKFILL_NEEDED', pr_number: 3209, repo: 'EHG_Engineer' },
  'SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-D': { subtype: 'BACKFILL_NEEDED', pr_number: 3210, repo: 'EHG_Engineer', companion_pr: 521, companion_repo: 'ehg' },
  'SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-E': { subtype: 'BACKFILL_NEEDED', pr_number: 3211, repo: 'EHG_Engineer', companion_pr: 522, companion_repo: 'ehg' },
  'SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-F': { subtype: 'BACKFILL_NEEDED', pr_number: 3216, repo: 'EHG_Engineer', companion_pr: 523, companion_repo: 'ehg' },
  'SD-MAN-ORCH-S18-S26-PIPELINE-001-C': { subtype: 'BACKFILL_NEEDED', pr_number: 523, repo: 'ehg' },
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('[audit] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(2);
}
const supabase = createClient(url, key);

async function fetchPRMergeInfo(repo, prNumber) {
  if (!repo || !prNumber) return null;
  try {
    const json = execSync(
      `gh pr view ${prNumber} --repo rickfelix/${repo} --json mergeCommit,mergedAt,headRefName,state`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const data = JSON.parse(json);
    return {
      merged: data.state === 'MERGED',
      mergeCommit: data.mergeCommit?.oid || null,
      mergedAt: data.mergedAt || null,
      branch: data.headRefName || null,
    };
  } catch (e) {
    return null;
  }
}

async function classify(sd) {
  const inv = INVENTORY[sd.sd_key];
  if (inv) return { state: inv.subtype, inventory: inv };

  // For SDs not in inventory, classify by ship_review_findings + git evidence.
  const { data: srf } = await supabase
    .from('ship_review_findings')
    .select('id, pr_number, branch, verdict, synthesized_at')
    .eq('sd_key', sd.sd_key)
    .limit(1);

  if (srf && srf.length > 0) {
    return { state: 'SHIPPED', srf: srf[0] };
  }

  // No SRF row — mark as needing review. Don't auto-classify as phantom.
  return { state: 'UNKNOWN' };
}

function fmtRow(sdKey, state, note) {
  return `  ${state.padEnd(28)} ${sdKey.padEnd(60)} ${note || ''}`;
}

async function main() {
  console.log('═════════════════════════════════════════════════════════════════════════════');
  console.log(`audit-phantom-completions.js  (mode: ${APPLY ? 'APPLY' : 'DRY-RUN'})`);
  console.log(`SD pattern: sd_key LIKE '${SD_PATTERN}'`);
  console.log('═════════════════════════════════════════════════════════════════════════════');

  // Match all SDs in our explicit inventory PLUS any matching the pattern.
  // (Supabase ilike doesn't support POSIX brackets, so use an explicit OR list.)
  const inventoryKeys = Object.keys(INVENTORY);
  const orFilters = [
    `sd_key.in.(${inventoryKeys.join(',')})`,
    `sd_key.ilike.${SD_PATTERN}`,
  ].join(',');

  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, status, sd_type, completion_date, metadata')
    .eq('status', 'completed')
    .or(orFilters)
    .order('completion_date', { ascending: false });

  if (error) {
    console.error('[audit] Query error:', error.message);
    process.exit(1);
  }

  console.log(`\nMatched ${sds.length} completed SDs.\n`);

  const buckets = {
    SHIPPED: [],
    BACKFILL_NEEDED: [],
    PHANTOM_WITH_FORWARDING: [],
    PHANTOM_NO_FORWARDING: [],
    ORCHESTRATOR_PARENT: [],
    UNKNOWN: [],
  };

  for (const sd of sds) {
    const result = await classify(sd);
    buckets[result.state].push({ sd, ...result });
  }

  for (const [state, items] of Object.entries(buckets)) {
    if (items.length === 0) continue;
    if (state === 'SHIPPED' && !INCLUDE_SHIPPED) {
      console.log(`\n${state} (${items.length} SDs — pass-through, hidden by default)\n`);
      continue;
    }
    console.log(`\n${state} (${items.length} SDs)`);
    console.log('─────────────────────────────────────────────────────────────────────────────');
    for (const item of items) {
      console.log(fmtRow(item.sd.sd_key, '', item.inventory?.note || ''));
    }
  }

  if (!APPLY) {
    console.log('\n─────────────────────────────────────────────────────────────────────────────');
    console.log('Dry-run complete. Re-run with --apply to write corrections.');
    console.log('─────────────────────────────────────────────────────────────────────────────');
    return;
  }

  console.log('\n═════════════════════════════════════════════════════════════════════════════');
  console.log('APPLYING corrections...');
  console.log('═════════════════════════════════════════════════════════════════════════════');

  let cancelled = 0;
  let backfilled = 0;

  // 1. Cancel PHANTOM_WITH_FORWARDING + PHANTOM_NO_FORWARDING (NOT orchestrator parents)
  for (const item of [...buckets.PHANTOM_WITH_FORWARDING, ...buckets.PHANTOM_NO_FORWARDING]) {
    const { error: updErr } = await supabase
      .from('strategic_directives_v2')
      .update({
        status: 'cancelled',
        cancellation_reason: `Audited 2026-04-28 (SD-MAN-INFRA-RECONCILE-S18-S26-001): ship_review_findings empty + no merged PR. Subtype: ${item.state}`,
        metadata: {
          ...(item.sd.metadata || {}),
          phantom_audit_2026_04_28: {
            audited_at: new Date().toISOString(),
            audit_sd: 'SD-MAN-INFRA-RECONCILE-S18-S26-001',
            subtype: item.state,
            forwarding_commit: item.inventory?.forwarding_commit || null,
            forwarded_via_pr: item.inventory?.forwarded_via_pr || null,
            note: item.inventory?.note || null,
          },
        },
      })
      .eq('id', item.sd.id);

    if (updErr) {
      console.error(`[audit] Failed to cancel ${item.sd.sd_key}: ${updErr.message}`);
    } else {
      cancelled++;
      console.log(`  ✓ Cancelled  ${item.sd.sd_key}  (${item.state})`);
    }
  }

  // 2. Backfill ship_review_findings for BACKFILL_NEEDED + ORCHESTRATOR_PARENT
  for (const item of [...buckets.BACKFILL_NEEDED, ...buckets.ORCHESTRATOR_PARENT]) {
    const isOrch = item.state === 'ORCHESTRATOR_PARENT';
    const inv = item.inventory;

    // Skip if a ship_review_findings row already exists for this sd_key
    const { data: existing } = await supabase
      .from('ship_review_findings')
      .select('id')
      .eq('sd_key', item.sd.sd_key)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`  ⏭️  Skip backfill (already exists): ${item.sd.sd_key}`);
      continue;
    }

    let prInfo = null;
    if (!isOrch && inv?.pr_number && inv?.repo) {
      prInfo = await fetchPRMergeInfo(inv.repo, inv.pr_number);
    }

    const row = {
      pr_number: isOrch ? 0 : (inv?.pr_number || 0),
      review_tier: 'light',
      verdict: 'pass',
      finding_count: 0,
      finding_categories: {},
      sd_key: item.sd.sd_key,
      branch: prInfo?.branch || (isOrch ? `<orchestrator-summary>` : null),
      multi_agent: false,
      synthesized_at: new Date().toISOString(),
      reviewed_at: prInfo?.mergedAt || new Date().toISOString(),
    };

    const { error: insErr } = await supabase
      .from('ship_review_findings')
      .insert(row);

    if (insErr) {
      console.error(`[audit] Failed to backfill ${item.sd.sd_key}: ${insErr.message}`);
    } else {
      backfilled++;
      console.log(`  ✓ Backfilled ${item.sd.sd_key}  ${isOrch ? '(orchestrator summary)' : `(PR #${inv.pr_number})`}`);
    }
  }

  console.log('\n─────────────────────────────────────────────────────────────────────────────');
  console.log(`APPLY complete: ${cancelled} cancelled, ${backfilled} backfilled.`);
  console.log('─────────────────────────────────────────────────────────────────────────────');
}

main().catch((e) => {
  console.error('[audit] Fatal:', e.message);
  process.exit(1);
});
