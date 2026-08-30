/**
 * QF-20260830-628 — bounded, counted cleanup of feedback rows the pre-fix bare-insert writer
 * duplicated on every detector sweep cycle (categories: ratification_capture_candidate,
 * ratification_capture_miss). Keeps the EARLIEST row per natural key
 * (`${category}::${metadata.item_source}:${metadata.item_id}`), folds max(last_seen) and the
 * group's row count into occurrence_count on the survivor, and stamps the survivor's source_id
 * so future writer-fix upserts (QF-20260830-628) match against it.
 *
 * HARD CONSTRAINT: never issue an unbounded delete/update against feedback. Every delete here is
 * scoped to an explicit, printed list of ids collected in this run.
 *
 * Usage:
 *   node scripts/one-off/dedup-ratification-capture-feedback-qf-628.mjs           # dry run (default)
 *   node scripts/one-off/dedup-ratification-capture-feedback-qf-628.mjs --apply   # execute
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const CATEGORIES = ['ratification_capture_candidate', 'ratification_capture_miss'];
const PAGE_SIZE = 1000;

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchAllRows(category) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('feedback')
      .select('id, source_id, category, metadata, occurrence_count, last_seen, created_at')
      .eq('category', category)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`fetch ${category} failed: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function naturalKey(row) {
  const itemSource = row.metadata?.item_source ?? row.metadata?.ratification_id ?? 'unknown';
  const itemId = row.metadata?.item_id ?? row.metadata?.ratification_id ?? row.id;
  return `${row.category}::${itemSource}:${itemId}`;
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN (pass --apply to execute)'}`);

  let totalPreCount = 0;
  for (const category of CATEGORIES) {
    const { count } = await supabase
      .from('feedback')
      .select('*', { count: 'exact', head: true })
      .eq('category', category);
    console.log(`PRE-COUNT  ${category}: ${count}`);
    totalPreCount += count;
  }
  console.log(`PRE-COUNT  total (both categories): ${totalPreCount}`);

  const toDeleteIds = [];
  const survivorUpdates = []; // { id, occurrence_count, last_seen, source_id }

  for (const category of CATEGORIES) {
    const rows = await fetchAllRows(category);
    const groups = new Map();
    for (const row of rows) {
      const key = naturalKey(row);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    let dupGroups = 0;
    for (const [key, group] of groups) {
      if (group.length < 2) continue; // no duplication for this key
      dupGroups++;
      // group is ordered by created_at ascending (fetchAllRows sorted it) -> survivor = earliest
      const [survivor, ...rest] = group;
      const maxLastSeen = group.reduce((max, r) => {
        const candidate = r.last_seen || r.created_at;
        return !max || candidate > max ? candidate : max;
      }, null);
      survivorUpdates.push({
        id: survivor.id,
        occurrence_count: group.length,
        last_seen: maxLastSeen,
        source_id: survivor.source_id || key.split('::')[1],
      });
      toDeleteIds.push(...rest.map((r) => r.id));
    }
    console.log(`${category}: ${rows.length} rows, ${groups.size} distinct natural keys, ${dupGroups} keys had duplicates`);
  }

  console.log(`\nSample of rows scheduled for deletion (first 10 of ${toDeleteIds.length}):`);
  console.log(toDeleteIds.slice(0, 10));
  console.log(`Sample of survivor updates (first 5 of ${survivorUpdates.length}):`);
  console.log(survivorUpdates.slice(0, 5));

  if (!APPLY) {
    console.log('\nDRY RUN complete — no rows modified. Re-run with --apply to execute.');
    return;
  }

  // Bounded, chunked survivor updates (fold counts/last_seen/source_id) BEFORE deleting the rest.
  for (const upd of survivorUpdates) {
    const { error } = await supabase
      .from('feedback')
      .update({ occurrence_count: upd.occurrence_count, last_seen: upd.last_seen, source_id: upd.source_id })
      .eq('id', upd.id);
    if (error) console.error(`survivor update failed for ${upd.id}: ${error.message}`);
  }

  // Bounded, chunked deletes scoped to the exact printed id list — never a blanket category delete.
  const CHUNK = 500;
  let deleted = 0;
  for (let i = 0; i < toDeleteIds.length; i += CHUNK) {
    const chunk = toDeleteIds.slice(i, i + CHUNK);
    const { error, count } = await supabase.from('feedback').delete({ count: 'exact' }).in('id', chunk);
    if (error) {
      console.error(`delete chunk failed at offset ${i}: ${error.message}`);
      continue;
    }
    deleted += count ?? chunk.length;
  }
  console.log(`\nDeleted ${deleted} duplicate rows (bounded to the ${toDeleteIds.length} ids collected above).`);

  let totalPostCount = 0;
  for (const category of CATEGORIES) {
    const { count } = await supabase
      .from('feedback')
      .select('*', { count: 'exact', head: true })
      .eq('category', category);
    console.log(`POST-COUNT ${category}: ${count}`);
    totalPostCount += count;
  }
  console.log(`POST-COUNT total (both categories): ${totalPostCount}`);
  console.log(`Net change: ${totalPostCount - totalPreCount} (expected: -${toDeleteIds.length})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
