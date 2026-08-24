// Record Adam's ratification of the re-scoped SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001
// (advisory 20e9dde7, 2026-08-24T01:48:25.759Z, relayed via coordinator directive
// f4d869cf) so the boundary he affirmed -- stage the DDL for the chairman ceremony,
// don't apply directly -- survives into PLAN/EXEC without depending on session memory.

import { pathToFileURL } from 'node:url';

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}

async function run() {
  const dotenv = await import('dotenv');
  dotenv.config();
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const SD_KEY = 'SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001';

  const { data: before, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .maybeSingle();
  if (readErr) throw readErr;

  const newMetadata = {
    ...before.metadata,
    ratification: {
      ratified_by: 'Adam',
      ratified_at: '2026-08-24T01:48:25.759Z',
      advisory_id: '20e9dde7',
      relayed_via_directive_id: 'f4d869cf-91e4-4f61-a84b-7abb762ec950',
      recorded_at: new Date().toISOString(),
      boundary_affirmed:
        'The policy DDL pieces (authenticated_read_ventures SELECT narrowing, new public.ventures UPDATE policy, portfolio.ventures decoy DROP) are permission changes -- STAGE them for the accumulating chairman ceremony sitting, do not apply directly. Build, proofs, and all non-DDL work proceed normally.',
    },
  };

  const { error: updErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: newMetadata })
    .eq('sd_key', SD_KEY);
  if (updErr) throw updErr;

  console.log('Recorded ratification for', SD_KEY);
}
