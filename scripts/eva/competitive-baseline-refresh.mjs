#!/usr/bin/env node
/**
 * Recurring competitive-baseline refresh.
 * SD: SD-LEO-INFRA-COMPETITIVE-BASELINES-RECURRING-001
 *
 * Per eligible active venture (isEligibleForBaselineResearch -- fail-closed, excludes 91 of 92
 * status=active ventures that are test/e2e fixtures), refreshes the venture's competitive
 * baseline if none exists or the existing one is stale/missing (getFreshOrNull returns null).
 * Reuses lib/eva/utils/web-search.js for the research fetch; no new scheduler daemon -- this
 * script is invoked on the repo's existing per-purpose cron workflow convention (matches the
 * dozens of scripts/*.mjs + .github/workflows/*-cron.yml pairs already in this repo).
 *
 * Usage: node scripts/eva/competitive-baseline-refresh.mjs [--dry-run]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { CompetitiveBaselineService } from '../../lib/discovery/competitive-baseline-service.js';
import { isEligibleForBaselineResearch } from '../../lib/discovery/venture-eligibility.js';

/**
 * @param {Object} supabase
 * @param {{dryRun?: boolean, now?: () => Date}} [opts]
 * @returns {Promise<{eligible: number, refreshed: string[], skippedFresh: string[]}>}
 */
export async function runRefresh(supabase, opts = {}) {
  const service = new CompetitiveBaselineService(supabase);
  // Bounded per count-truncation-diff-lint: 92 active ventures at authoring time, well under
  // this cap. A future breach would silently drop ventures from the daily refresh rather than
  // erroring, so the cap is set far above current volume as an early-warning margin, not a
  // tight fit.
  const { data: ventures, error } = await supabase
    .from('ventures')
    .select('id, name, status, is_demo')
    .eq('status', 'active')
    .limit(500);
  if (error) throw new Error(`Failed to list ventures: ${error.message}`);

  const eligible = (ventures || []).filter(isEligibleForBaselineResearch);
  const refreshed = [];
  const skippedFresh = [];

  for (const v of eligible) {
    const fresh = await service.getFreshOrNull(v.id, { now: opts.now });
    if (fresh) {
      skippedFresh.push(v.id);
      continue;
    }
    if (opts.dryRun) {
      refreshed.push(v.id);
      continue;
    }
    await service.researchAndCreate(v.id, `${v.name} competitor`, { now: opts.now });
    refreshed.push(v.id);
  }

  return { eligible: eligible.length, refreshed, skippedFresh };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  // VALIDATION finding (EXEC-TO-PLAN): the cron workflow exports only SUPABASE_URL, not
  // NEXT_PUBLIC_SUPABASE_URL -- the script silently exited 1 (swallowed by `|| true` in the
  // workflow step) and the daily refresh never ran. Repo convention (lib/supabase-client.cjs).
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const result = await runRefresh(supabase, { dryRun });
  console.log(JSON.stringify(result, null, 2));
}

import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
