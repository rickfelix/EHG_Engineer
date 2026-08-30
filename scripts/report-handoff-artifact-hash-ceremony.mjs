#!/usr/bin/env node
/**
 * QF-20260830-904 — read-only report, follow-up to QF-20260830-312's artifact_hash
 * instrumentation (metadata.artifact_hash={sd,prd,computed_at} stamped on every
 * sd_phase_handoffs row by HandoffRecorder.recordFailure/createArtifact).
 *
 * For each (sd_id, handoff_type) group, walks rows chronologically and classifies
 * every rejected -> next-accepted pair:
 *   - SAME-HASH: sd (and prd, when both sides have one) hash unchanged -> bare
 *     re-run, i.e. ceremony (the gate re-ran on an unedited artifact and passed).
 *   - CHANGED: sd or prd hash differs -> a real edit preceded the acceptance.
 *   - UNMEASURED: either row predates the instrumentation (no artifact_hash) ->
 *     excluded from the ceremony-share denominator, not counted as either class.
 *
 * No behavior change, no new table. Groups results per handoff_type and per
 * rejection_reason so the chairman's gate-retirement question (#4) can be answered
 * once enough instrumented rows accumulate (~14 days from 2026-08-30).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function classifyPair(rejected, accepted) {
  const rHash = rejected.metadata?.artifact_hash;
  const aHash = accepted.metadata?.artifact_hash;
  if (!rHash || !aHash) return 'UNMEASURED';
  const sdChanged = rHash.sd !== aHash.sd;
  const prdChanged = rHash.prd != null && aHash.prd != null && rHash.prd !== aHash.prd;
  return (sdChanged || prdChanged) ? 'CHANGED' : 'SAME-HASH';
}

async function main() {
  // Ceremony-share math needs the FULL rejection/acceptance population -- a capped
  // read would silently undercount and misreport the ratio, so this is a genuine
  // bulk-processing read (fetchAllPaginated), not a gauge (SD-LEO-INFRA-COUNT-
  // TRUNCATION-DISCIPLINE-001 FR-2/FR-3/FR-4).
  const rows = await fetchAllPaginated(() =>
    supabase
      .from('sd_phase_handoffs')
      .select('sd_id, handoff_type, status, rejection_reason, metadata, created_at')
      .in('status', ['accepted', 'rejected'])
      .order('sd_id', { ascending: true })
      .order('handoff_type', { ascending: true })
      .order('created_at', { ascending: true })
  );

  const groups = new Map();
  for (const row of rows) {
    const key = `${row.sd_id}::${row.handoff_type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const results = [];
  for (const seq of groups.values()) {
    for (let i = 0; i < seq.length - 1; i++) {
      if (seq[i].status !== 'rejected') continue;
      // Next row chronologically that is 'accepted' -- the first acceptance
      // following this rejection in the same (sd_id, handoff_type) lane.
      const next = seq.slice(i + 1).find((r) => r.status === 'accepted');
      if (!next) continue;
      results.push({
        handoff_type: seq[i].handoff_type,
        rejection_reason: seq[i].rejection_reason || 'UNSPECIFIED',
        classification: classifyPair(seq[i], next),
      });
    }
  }

  const byType = {};
  for (const r of results) {
    byType[r.handoff_type] ??= { 'SAME-HASH': 0, CHANGED: 0, UNMEASURED: 0 };
    byType[r.handoff_type][r.classification]++;
  }

  console.log(`Rejection->acceptance pairs found: ${results.length}`);
  console.log(JSON.stringify(byType, null, 2));

  const measured = results.filter((r) => r.classification !== 'UNMEASURED');
  if (measured.length === 0) {
    console.log('\nNo instrumented pairs yet -- artifact_hash instrumentation shipped 2026-08-30 (QF-20260830-312); re-run after handoffs accumulate.');
    return;
  }
  const ceremonyShare = measured.filter((r) => r.classification === 'SAME-HASH').length / measured.length;
  console.log(`\nOverall ceremony share (SAME-HASH / measured): ${(ceremonyShare * 100).toFixed(1)}% of ${measured.length} measured pairs`);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
