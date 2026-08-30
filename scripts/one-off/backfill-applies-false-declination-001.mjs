/**
 * SD-FDBK-ENH-APPLIES-FALSE-DECLINATION-001 FR-4: correct the two live venture_artifacts
 * rows that were mislabeled quality_score=70/validation_status='validated' despite carrying
 * a {applies:false, satisfied:true} declination payload (venture 50763b6a-1fad-4e1e-b2fc-296a1d66ebf9,
 * S23 launch_uat_report — the venture opted out of the UAT robustness gate).
 *
 * These two specimens predate the FR-2 writeArtifact() fix and were never re-written by it
 * (the fix only changes behavior for FUTURE writes), so they need a direct one-time correction.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isDeclinationPayload } from '../../lib/eva/artifact-persistence-service.js';

export const SPECIMEN_IDS = [
  '487f5253-3cff-477d-b204-20841e231213',
  '656be1f1-4d99-44a7-9d01-dc9d7a89c73f',
];

export async function runBackfill(supabase, { dryRun = false } = {}) {
  const results = [];
  for (const id of SPECIMEN_IDS) {
    const { data: row, error: readErr } = await supabase
      .from('venture_artifacts')
      .select('id, artifact_data, quality_score, validation_status')
      .eq('id', id)
      .single();

    if (readErr || !row) {
      results.push({ id, action: 'SKIP_NOT_FOUND', error: readErr?.message });
      continue;
    }

    if (!isDeclinationPayload(row.artifact_data)) {
      results.push({ id, action: 'SKIP_NOT_A_DECLINATION' });
      continue;
    }

    if (row.quality_score === 0 && row.validation_status === 'rejected') {
      results.push({ id, action: 'SKIP_ALREADY_CORRECTED' });
      continue;
    }

    if (dryRun) {
      results.push({ id, action: 'WOULD_CORRECT', from: { quality_score: row.quality_score, validation_status: row.validation_status } });
      continue;
    }

    const { error: updateErr } = await supabase
      .from('venture_artifacts')
      .update({ quality_score: 0, validation_status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', id);

    results.push({ id, action: updateErr ? 'ERROR' : 'CORRECTED', error: updateErr?.message });
  }
  return results;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const results = await runBackfill(supabase, { dryRun });
  console.log(JSON.stringify(results, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith('backfill-applies-false-declination-001.mjs')) {
  main();
}
