import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-PRE-TOOL-ENFORCE-001';

async function main() {
  const { data: sd, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (readErr) throw new Error(readErr.message);

  const metadata = { ...(sd.metadata || {}) };
  metadata.mechanism_verifications = [
    { verified_by: 'LEAD worker (this session, git grep + Read, end-to-end hook smoke test)', verified_at: 'scripts/hooks/pre-tool-enforce.cjs:1786' },
    { verified_by: 'LEAD worker (this session, wrote + unit-tested)', verified_at: 'scripts/hooks/lib/shallow-fetch-guard.cjs:1' },
    { verified_by: 'LEAD worker (this session, git log of the incident scripts/audits/wip-reclaim-denylist-audit.mjs write path, already fixed by QF-20260912-147)', verified_at: 'scripts/audits/wip-reclaim-denylist-audit.mjs:1' },
  ];

  const { error: writeErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata })
    .eq('sd_key', SD_KEY);
  if (writeErr) throw new Error(writeErr.message);

  const { data: after, error: verifyErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (verifyErr) throw new Error(verifyErr.message);
  if (!Array.isArray(after.metadata?.mechanism_verifications) || after.metadata.mechanism_verifications.length !== 3) {
    throw new Error('VERIFY FAILED: mechanism_verifications did not persist as expected');
  }
  console.log('OK: mechanism_verifications written and verified,', after.metadata.mechanism_verifications.length, 'entries');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
}
