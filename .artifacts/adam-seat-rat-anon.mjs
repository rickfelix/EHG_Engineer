import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { recordChairmanRatification, buildRatificationPayload } from '../lib/chairman/ratification-writer.mjs';
const s = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const payload = buildRatificationPayload({
  quote: 'apply the strategic directives read-policy migration.',
  source: 'Chairman in-terminal at the Adam seat 2026-09-07 ~01:32Z, answering the single-item ask (he had said "Let\'s do one thing at a time"): verbal approval under the 3c scribe ceremony for database/chairman-gated/20260906_drop_anon_read_strategic_directives_v2.sql (SD-LEO-FIX-CLOSE-ANON-KEY-001 FR-3, PR #8389 merged). PRE-APPLY MEASURED by Adam: anon key read 6,177 rows of strategic_directives_v2 with no session on dedlbzhpgkmetvhbkyzq; live pg_policies showed anon_read_strategic_directives_v2 (anon, SELECT, qual true) plus six siblings. Scribed by Adam session bc762fa4 on branch chore/anon-policy-approved-20260907, commit f9dec611a9e, marker "-- @approved-by: codestreetlabs@gmail.com" matching git user.email. Applied from that worktree with a single-use token, --prod-deploy --allow-any-path, plan sha256 68ed8757d6aa74888b5453f3e50375f703b7af24770204ed6a1afc286ab97e49, 13 statements, [MIGRATION_APPLY_PROD_PASS]. READBACK 01:33:45Z: anon-key SELECT on strategic_directives_v2 returns count 0 and 0 rows with no error; pg_policies shows 6 policies remaining and anon_read_strategic_directives_v2 absent; service_role still reads 6,177. Rollback is one CREATE POLICY, captured in the file.',
  targetContracts: ['adam'],
  scribeSeat: 'adam:bc762fa4-4761-4013-9270-da0a75c6c290',
  utteredAt: '2026-09-07T01:32:00Z',
});
const r = await recordChairmanRatification(s, payload);
console.log('RATIFICATION', JSON.stringify(r).slice(0, 300));
const { data: sd } = await s.from('strategic_directives_v2').select('id,metadata').eq('sd_key','SD-LEO-FIX-CLOSE-ANON-KEY-001').maybeSingle();
const meta = { ...(sd.metadata||{}) };
delete meta.chairman_apply_pending;
meta.chairman_only_apply_done = { at: '2026-09-07T01:33Z', file: 'database/chairman-gated/20260906_drop_anon_read_strategic_directives_v2.sql', plan_sha256: '68ed8757d6aa74888b5453f3e50375f703b7af24770204ed6a1afc286ab97e49', commit: 'f9dec611a9e', producer: 'adam bc762fa4', readback: 'anon count 0 / 0 rows at 2026-09-07T01:33:45Z; pg_policies 6 remaining, anon_read absent; service_role 6177' };
meta.acceptance_state = 'FR-3 APPLIED and read back 2026-09-07 01:33Z (anon count 0). Remaining: FR-1 consumer migration audit and FR-2 the CI allow-list test, which are the preventive half.';
const { error } = await s.from('strategic_directives_v2').update({ metadata: meta }).eq('id', sd.id);
console.log('SD STAMP', error ? error.message : 'ok');
