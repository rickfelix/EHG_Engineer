import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { verifyQFMergeWitness } from '../modules/complete-quick-fix/merge-witness.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const QF_ID = 'QF-20260905-634';

async function main() {
  const testDir = process.cwd();
  const witness = verifyQFMergeWitness({
    qfId: QF_ID,
    prUrl: 'https://github.com/rickfelix/EHG_Engineer/pull/8501',
    branchName: 'qf/QF-20260905-634',
    testDir,
  });
  console.log('Freshly computed witness:', JSON.stringify(witness, null, 2));

  if (!witness.verified) {
    console.error('Witness still unverified -- not patching.');
    process.exit(1);
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: current, error: readErr } = await supabase.from('quick_fixes').select('verification_notes').eq('id', QF_ID).single();
  if (readErr) throw readErr;
  const notes = JSON.parse(current.verification_notes);
  notes.merge_witness = { verified: true, pr_url: witness.prUrl, merge_sha: witness.mergeSha };
  notes.merge_witness_reconciled_at = new Date().toISOString();
  notes.merge_witness_reconciled_by = 'bc70bff7-546d-4d6f-b9ea-3cca9b85964d (post-hoc reconciliation after the CI-blocking test-framework bug was fixed on a follow-up commit and the PR was actually merged)';

  const { error: updateErr } = await supabase.from('quick_fixes').update({ verification_notes: JSON.stringify(notes) }).eq('id', QF_ID);
  if (updateErr) throw updateErr;
  console.log('merge_witness reconciled to verified:true');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
