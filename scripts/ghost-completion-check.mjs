#!/usr/bin/env node
/**
 * SD-FDBK-FIX-LFA-ACCEPT-CANONICAL-001 (FR-4) — ghost-completion surfacing.
 *
 * Reports completed SDs with no accepted canonical LEAD-FINAL-APPROVAL row
 * (v_sd_completion_integrity.is_ghost_completed). The writer fix (PR #4674)
 * makes new ghosts impossible via the recorder path; this check catches any
 * other writer regressing the contract. Intended call sites: the fleet
 * stale-session-sweep QA pass and `npm run check:ghosts`.
 *
 * Exit codes: 0 = no fresh ghosts; 1 = fresh ghost(s) found (completed after
 * --since, default 2026-06-12T22:00Z — the backfill watermark); 2 = query error.
 * Legacy pre-watermark ghosts (265 no-source rows left flagged by the FR-2
 * backfill) are reported as info, never exit-1.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: the ORDER BY updated_at DESC keeps
// fresh-regression detection correct even if truncated (freshest rows sort first), but the
// informational "legacy" backlog count below would silently under-report once ghost-completed
// rows exceed the cap. warnIfCapTruncated flags that possibility without changing exit-code logic.
import { warnIfCapTruncated } from '../lib/db/fetch-all-paginated.mjs';

const sinceIdx = process.argv.indexOf('--since');
const WATERMARK = sinceIdx > -1 ? process.argv[sinceIdx + 1] : '2026-06-12T22:00:00Z';

const db = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await db
  .from('v_sd_completion_integrity')
  .select('sd_key, status, updated_at')
  .eq('is_ghost_completed', true)
  .order('updated_at', { ascending: false })
  .limit(1000);
if (error) { console.error('[check-ghosts] query failed:', error.message); process.exit(2); }

const rows = warnIfCapTruncated(data, 'v_sd_completion_integrity (ghost-completed)');
const fresh = rows.filter((r) => new Date(`${r.updated_at}Z`.replace('ZZ', 'Z')) > new Date(WATERMARK));
const legacy = rows.length - fresh.length;

console.log(`[check-ghosts] legacy (pre-${WATERMARK}, no-source backlog): ${legacy}`);
if (fresh.length === 0) {
  console.log('[check-ghosts] OK — no fresh ghost completions.');
  process.exit(0);
}
console.error(`[check-ghosts] ${fresh.length} FRESH ghost completion(s) — a writer is skipping the canonical LFA row again:`);
for (const r of fresh.slice(0, 20)) console.error(`  ${r.updated_at} ${r.sd_key}`);
process.exit(1);
