/**
 * One-time backfill: add review_by to every tests/quarantine-manifest.json entry.
 * SD-LEO-FIX-TESTS-QUARANTINE-MANIFEST-001 FR-1.
 *
 * review_by = that entry's OWN quarantined_at + 90 days -- never a fixed reference to the
 * 2026-06-11 bulk date. PLAN research measured that only 133 of the 150 entries are genuinely
 * dated 2026-06-11; the other 13 (later-June 2026) would be misclassified by a bulk-anchored
 * default once the current 90-day-cutoff coincidence lapses.
 */
import fs from 'node:fs';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const MANIFEST_PATH = 'tests/quarantine-manifest.json';
const REVIEW_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export function computeReviewBy(quarantinedAt) {
  const ms = Date.parse(quarantinedAt);
  if (!Number.isFinite(ms)) {
    throw new Error(`Unparseable quarantined_at: ${quarantinedAt}`);
  }
  return new Date(ms + REVIEW_WINDOW_MS).toISOString();
}

function main() {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  const manifest = JSON.parse(raw);
  let changed = 0;
  for (const entry of manifest.quarantined) {
    if (entry.review_by) continue;
    entry.review_by = computeReviewBy(entry.quarantined_at);
    changed++;
  }
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Backfilled review_by on ${changed} entries (${manifest.quarantined.length} total).`);
}

if (isMainModule(import.meta.url)) {
  main();
}
