// US-007 AC #3/#4: actually INVOKE searchExistingInfrastructure (lib/utils/validation-automation.js:105)
// for SD-LEO-FEAT-PROVEN-BETTER-NEW-001 and record the real result, rather than only referencing the
// function in scope prose (lead-polish-pbn-001.mjs wrote scope text naming it but never called it —
// gap found during US-007 acceptance-criteria verification).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { searchExistingInfrastructure } from '../../lib/utils/validation-automation.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FEAT-PROVEN-BETTER-NEW-001';

const { data: sd, error } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key, title, scope, category, target_application')
  .eq('sd_key', SD_KEY)
  .maybeSingle();
if (error) throw error;
if (!sd) throw new Error(`SD not found: ${SD_KEY}`);

const sdMetadata = {
  title: sd.title,
  scope: 'PBN scoring skill at venture_nursery -> Stage-0 promotion boundary: proven/better/new bucket scoring, per-bucket citations, hard gate rules (empty-proven=reject, new>1=trim-or-reject)',
  category: sd.category || null,
  target_application: sd.target_application || null,
};

console.log('Invoking searchExistingInfrastructure for', SD_KEY, '...');
const result = await searchExistingInfrastructure(sdMetadata, {});

console.log('\n=== RESULT ===');
console.log('search_performed:', result.search_performed);
console.log('queries:', result.search_queries?.map((q) => q.text?.slice(0, 60)));
console.log('existing_infrastructure count:', result.existing_infrastructure?.length ?? 0);
console.log('potential_duplicates count:', result.potential_duplicates?.length ?? 0);
console.log('related_components count:', result.related_components?.length ?? 0);
if (result.failure_reasons) console.log('failure_reasons:', result.failure_reasons);
console.log('\nFULL:', JSON.stringify(result, null, 2));
