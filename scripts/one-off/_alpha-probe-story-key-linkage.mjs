/**
 * Verify the POSITIONAL story_key <-> FR linkage claim against DATA, not code.
 *
 * Explore reported (from reading the three generators) that every story is minted as
 * story_key = `${sdKey}:US-${String(i+1).padStart(3,'0')}` while iterating
 * prd.functional_requirements IN ARRAY ORDER, so US-00n corresponds to FR index n-1.
 * That claim is the entire foundation of the proposed fix, and it was derived by reading
 * writers rather than by measuring rows. Measure it.
 *
 * Checks, per completed SD with a PRD:
 *   - do story_keys actually match the US-NNN shape?
 *   - does the story COUNT equal the FR count (required for a positional map to be total)?
 *   - are the ordinals contiguous 1..N with no gaps/dupes?
 * Read-only.
 */
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const LIMIT = Number(process.argv[2] || 60);

const { data: sds } = await s
  .from('strategic_directives_v2')
  .select('id, sd_key')
  .eq('status', 'completed')
  .order('updated_at', { ascending: false })
  .limit(LIMIT);

const tally = {
  scanned: 0, shapeOk: 0, shapeBad: 0, countMatch: 0, countMismatch: 0,
  contiguous: 0, nonContiguous: 0, noStories: 0,
};
const shapes = new Map();
const examples = [];

for (const sd of sds || []) {
  const { data: prd } = await s.from('product_requirements_v2')
    .select('functional_requirements').eq('directive_id', sd.sd_key).maybeSingle();
  const frs = (prd && prd.functional_requirements) || [];
  if (!frs.length) continue;

  const { data: stories } = await s.from('user_stories')
    .select('story_key, status, validation_status').eq('sd_id', sd.id);
  tally.scanned++;
  if (!stories || !stories.length) { tally.noStories++; continue; }

  const keys = stories.map((x) => x.story_key || '');
  // record observed shape (mask digits) to see if US-NNN is really universal
  for (const k of keys) {
    const shape = k.replace(/\d+/g, 'N');
    shapes.set(shape, (shapes.get(shape) || 0) + 1);
  }
  const ords = keys
    .map((k) => { const m = /US-(\d+)\s*$/.exec(k); return m ? Number(m[1]) : null; })
    .filter((n) => n != null)
    .sort((a, b) => a - b);

  const allShaped = ords.length === keys.length;
  allShaped ? tally.shapeOk++ : tally.shapeBad++;

  const countsEqual = keys.length === frs.length;
  countsEqual ? tally.countMatch++ : tally.countMismatch++;

  const contiguous = ords.length > 0 && ords.every((n, i) => n === i + 1);
  contiguous ? tally.contiguous++ : tally.nonContiguous++;

  if (examples.length < 8) {
    examples.push({ key: sd.sd_key, frs: frs.length, stories: keys.length, ords: ords.join(','), sample: keys[0] });
  }
}

console.log('=== POSITIONAL LINKAGE, MEASURED ===');
console.log(`SDs with a PRD carrying >=1 FR : ${tally.scanned}`);
console.log(`  no stories at all            : ${tally.noStories}`);
console.log(`  ALL story_keys match US-NNN  : ${tally.shapeOk}   (some/none: ${tally.shapeBad})`);
console.log(`  story COUNT == FR COUNT      : ${tally.countMatch}   (mismatch: ${tally.countMismatch})`);
console.log(`  ordinals contiguous 1..N     : ${tally.contiguous}   (gapped/dupe: ${tally.nonContiguous})`);

console.log('\nOBSERVED story_key SHAPES (digits masked as N):');
for (const [shape, n] of [...shapes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(5)}  ${shape}`);
}

console.log('\nEXAMPLES:');
for (const e of examples) {
  console.log(`  ${e.key}\n     FRs=${e.frs} stories=${e.stories} ords=[${e.ords}] sample_key=${e.sample}`);
}
