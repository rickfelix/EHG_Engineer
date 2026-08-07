#!/usr/bin/env node
/**
 * STEP 0 (evidence stay, snapshot half) for SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001.
 * Coordinator ruling 797bec7a part (2).
 *
 * WHY THIS EXISTS. The SD's acceptance evidence is a live population that DELETES ITSELF.
 * All ~2,646 rows carrying payload.dead_letter_reason='target_dead' have read_at set and
 * expires_at already past, so they match cleanup_expired_coordination()'s predicate; ~2,554 are
 * projected to be archived and deleted on 2026-08-12 by a sweep running every 5 minutes. If the
 * corrected re-route ships after that, FR-2's acceptance criteria pass VACUOUSLY against an empty
 * set — the checks go green because there is nothing left to re-route, which is the worst possible
 * way for this SD to "succeed".
 *
 * WHY A SNAPSHOT RATHER THAN EXTENDING expires_at. The coordinator offered "extend expires_at OR
 * snapshot into SD evidence" and deliberately declined to mass-edit expires_at from its own seat.
 * This takes the snapshot half because it is READ-ONLY: it cannot corrupt the population it is
 * trying to preserve, and it has no reversal delta to get wrong. Extending expires_at on 2,646
 * live rows is a mass mutation whose failure mode — per the same ruling — is "strictly worse than
 * the purge". A snapshot buys the evidence without touching the lane.
 *
 * WHAT IT DOES AND DOES NOT PRESERVE. The purge ARCHIVES before deleting (into retention_archive,
 * with a count-mismatch guard), so row bodies are not destroyed — they become unqueryable from
 * session_coordination. This snapshot therefore captures what acceptance actually needs: the row
 * IDs (the key to retention_archive.row_data), the target session, the kind, and the timestamps
 * that establish each row's purge eligibility. It is a MANIFEST, not a backup; recovering bodies
 * post-purge is a retention_archive lookup keyed on these ids.
 *
 * READ-ONLY. This script performs no writes to session_coordination. It only reads and emits a
 * file. Run it before 2026-08-12.
 *
 * Usage: node scripts/one-off/snapshot-dead-letter-population-lane-drain-001.mjs [--out <path>]
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const OUT = (() => {
  const i = process.argv.indexOf('--out');
  return i !== -1 && process.argv[i + 1]
    ? process.argv[i + 1]
    : path.join('docs', 'evidence', 'SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001-dead-letter-manifest.json');
})();

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PAGE = 1000;

/**
 * Keyset pagination on the uuid PK, NOT offset .range().
 * Offset silently skips rows when the table is written concurrently, and this table demonstrably
 * is — it moved 3711 -> 3725 across four runs in ~15 minutes during measurement, with a peer
 * actioning rows mid-scan. The existing CLI paginates by offset under a "count-integrity" docblock;
 * that is the bug this deliberately does not copy.
 */
async function scanAll() {
  const rows = [];
  let cursor = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const { data, error } = await db
      .from('session_coordination')
      .select('id,target_session,payload,created_at,expires_at,read_at,acknowledged_at,message_type,subject')
      .gt('id', cursor)
      .order('id', { ascending: true })
      .limit(PAGE);
    if (error) throw new Error(`scan failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    cursor = data[data.length - 1].id;
    if (data.length < PAGE) break;
  }
  return rows;
}

const all = await scanAll();
const dead = all.filter((r) => r.payload && r.payload.dead_letter_reason === 'target_dead');

const byKind = {};
const byTarget = {};
for (const r of dead) {
  const kind = (r.payload && r.payload.kind) || r.message_type || '(no kind)';
  byKind[kind] = (byKind[kind] || 0) + 1;
  byTarget[r.target_session || '(null)'] = (byTarget[r.target_session || '(null)'] || 0) + 1;
}

// Purge eligibility, evaluated the same way cleanup_expired_coordination() does:
// expires_at < now AND (acknowledged_at IS NOT NULL OR read_at <= now-7d).
const now = Date.now();
const SEVEN_DAYS = 7 * 24 * 3600 * 1000;
let alreadyEligible = 0;
let immortal = 0;
for (const r of dead) {
  const expired = r.expires_at && new Date(r.expires_at).getTime() < now;
  const ackArm = r.acknowledged_at != null;
  const readArm = r.read_at && new Date(r.read_at).getTime() <= now - SEVEN_DAYS;
  if (expired && (ackArm || readArm)) alreadyEligible += 1;
  if (r.acknowledged_at == null && r.read_at == null) immortal += 1;
}

const manifest = {
  sd_key: 'SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001',
  purpose: 'STEP 0 evidence stay (snapshot half) per coordinator ruling 797bec7a part (2). Preserves the acceptance population against the 2026-08-12 purge. MANIFEST, not a backup — row bodies survive in retention_archive and are recoverable by these ids.',
  captured_at: new Date().toISOString(),
  method: 'keyset pagination on the uuid PK (never offset .range(), which skips rows under concurrent insert)',
  live_table_total_at_capture: all.length,
  dead_letter_total: dead.length,
  distinct_target_sessions: Object.keys(byTarget).length,
  already_purge_eligible: alreadyEligible,
  immortal_both_null: immortal,
  by_kind: byKind,
  by_target_session: byTarget,
  drift_warning: 'Totals are a point-in-time reading of an actively-written table. Acceptance criteria must bind to bounds/ratios, never to these exact numbers.',
  row_ids: dead.map((r) => r.id).sort()
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));

console.log(`live table total          : ${all.length}`);
console.log(`dead-letter (target_dead) : ${dead.length}`);
console.log(`distinct target sessions  : ${manifest.distinct_target_sessions}`);
console.log(`already purge-eligible    : ${alreadyEligible}`);
console.log(`immortal (both NULL)      : ${immortal}`);
console.log(`top targets               : ${Object.entries(byTarget).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k.slice(0, 8)}=${v}`).join(' ')}`);
console.log(`\nmanifest written -> ${OUT} (${dead.length} row ids)`);
console.log('READ-ONLY: no writes were made to session_coordination.');
