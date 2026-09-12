import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ADDENDUM = " SECURITY-FIX CORRECTION (post-security-agent, sub_agent_execution_results 3ed447ec-de8c-4798-9fdc-5a0c814623a5, 2026-09-12): the DB trigger's first draft honored the chairman override by checking `consumed_at IS NOT NULL AND undo_deadline > now()` -- the OPPOSITE of hasActiveOverride()'s one-shot `consumed_at IS NULL` atomic-claim semantics. Inverted this way, a single already-spent override would have licensed UNLIMITED direct INSERTs for its (venture_id, override_key) pair until undo_deadline expired -- a standing bypass of exactly the manual-insert threat the trigger exists to close (SEC-H2). FIXED: the override arm was removed from the trigger entirely -- the application layer (assertOutreachAuthorized, via checkStageGate's hasActiveOverride) remains the sole one-shot-override touchpoint; the DB trigger is now deliberately absolute with no escape hatch of its own. Also removed SECURITY DEFINER (fail-closed behavior does not require it) and corrected search_path to `pg_catalog, public` (explicit-first ordering). Dry-run proof updated to 4 scenarios: positive, negative, a SEC-H2 regression control (a chairman_decisions row present for the below-go-live venture still does NOT bypass the trigger), and unresolvable-venture -- re-confirmed PASS 2026-09-12.";

const { data, error } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements')
  .eq('id', 'PRD-SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001')
  .single();

if (error) { console.error(error); process.exit(1); }

const frs = data.functional_requirements;
const fr5 = frs.find((f) => f.id === 'FR-5');
if (!fr5) { console.error('FR-5 not found'); process.exit(1); }
fr5.description = fr5.description + ADDENDUM;

const { error: updErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements: frs })
  .eq('id', 'PRD-SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001');

if (updErr) { console.error(updErr); process.exit(1); }
console.log('FR-5 description updated with SEC-H2 correction.');
