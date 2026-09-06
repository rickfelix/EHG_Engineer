import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const mechanism_verifications = [
  {
    verified_by: 'Golf-3',
    verified_at: 'lib/prd-grounding-validator.js:270',
    claim: 'sd_text_similarity is a factor name inside a synthetic, templated confidence-scoring blob (never contains authored prose verbatim)',
  },
  {
    verified_by: 'Golf-3',
    verified_at: 'scripts/prd/index.js:630',
    claim: 'grounding_validation results are persisted verbatim into product_requirements_v2.metadata without re-sync on later PRD edits',
  },
  {
    verified_by: 'Golf-3',
    verified_at: 'scripts/modules/implementation-fidelity/preflight/index.js:161',
    claim: 'checkAmbiguityResolution scans a git diff for the SD commit via addedLinesForAmbiguityScan, the shared chokepoint fixed by this SD',
  },
  {
    verified_by: 'Golf-3',
    verified_at: 'scripts/modules/implementation-fidelity/preflight/index.js:350',
    claim: 'checkStubbedCode\'s prior inline counting logic deduped to unique rendered line text, undercounting distinct occurrences sharing identical text',
  },
].map((v) => ({ verified_by: v.verified_by, verified_at: v.verified_at }));

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', 'SD-LEO-FIX-GATE2-IMPLEMENTATION-FIDELITY-001')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const metadata = {
  ...sd.metadata,
  mechanism_verifications,
};

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('mechanism_verifications written.');
