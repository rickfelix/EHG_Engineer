import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FIX-CLIENT-FACTORY-FALLBACK-001';

const { data: sd, error: fetchErr } = await sb.from('strategic_directives_v2').select('id, metadata').eq('sd_key', SD_KEY).single();
if (fetchErr) throw fetchErr;

const mechanism_verifications = [
  {
    claim: 'lib/supabase-client.js has a default export aliased to the anon-client factory',
    verified_by: 'Golf (autonomous fleet worker), direct file read + git grep',
    verified_at: 'lib/supabase-client.js:185-186',
  },
  {
    claim: 'lib/supabase-client.js:89 defines createSupabaseServiceClient, the real service-role factory (never the default export)',
    verified_by: 'Golf (autonomous fleet worker), direct file read',
    verified_at: 'lib/supabase-client.js:89',
  },
  {
    claim: 'Zero current call sites use a bare default import of lib/supabase-client.js (the exploit shape) -- census via git grep -nE "^import [A-Za-z_][A-Za-z0-9_]* from [\'\\"].*supabase-client\\.js[\'\\"]" across all tracked *.js/*.cjs/*.mjs',
    verified_by: 'Golf (autonomous fleet worker), git grep census (774 total import lines checked)',
    verified_at: 'repo-wide git grep, no single file:line (absence claim)',
  },
  {
    claim: 'lib/supabase-client.cjs has no default export (module.exports is a named object: createSupabaseClient, createSupabaseServiceClient, isGovernanceTable, wrapAnonClientWithGovernanceGuard, GOVERNANCE_TABLES) -- the CJS sibling is not affected by this defect class',
    verified_by: 'Golf (autonomous fleet worker), direct file read',
    verified_at: 'lib/supabase-client.cjs:132-139',
  },
];

const newMetadata = { ...sd.metadata, mechanism_verifications };

const { error: updateErr } = await sb.from('strategic_directives_v2').update({ metadata: newMetadata }).eq('id', sd.id);
if (updateErr) throw updateErr;

console.log('Stamped mechanism_verifications (4 entries).');
