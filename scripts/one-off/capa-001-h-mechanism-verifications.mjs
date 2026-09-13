import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H';

const { data: row, error } = await s.from('strategic_directives_v2').select('id,metadata').eq('sd_key', SD_KEY).single();
if (error) throw error;

const mechanism_verifications = [
  {
    claim: "Worker product-review choke point reads lifecycle_stage=23 (stale); the live producer already mints product_review decisions at stage 24, so the gate can never pass where it queries and never fires where it must.",
    verified_at: "lib/eva/stage-execution-worker.js:2999,3016",
    verified_by: "LEAD session 45924f8d (direct read + live DB query confirming product_review decisions exist only at lifecycle_stage=24, zero at 23)",
  },
  {
    claim: "Writer B (_writeHealthScore) unconditionally upserts stage_status='completed' regardless of the actual exit outcome (blocked/held/failed/killed), and is called from 8 non-advancing exit paths.",
    verified_at: "lib/eva/stage-execution-worker.js:2907-2933",
    verified_by: "LEAD session 45924f8d (direct read, confirmed against VALIDATION sub-agent evidence 619ece9a)",
  },
  {
    claim: "The refusing trigger for ventures.current_lifecycle_stage (aaa_enforce_canonical_stage_write / zzz_enforce_canonical_stage_write_final) is LIVE and ENABLED on public.ventures, and actively REJECTS an unstamped stage-changing UPDATE with error code SVCW1 -- verified directly against the live database (pg_trigger + pg_proc introspection, plus a BEGIN/ROLLBACK write attempt), not inferred from the migration file's presence (whose own header reads @approved-by: PENDING).",
    verified_at: "database/chairman-gated/20260825_ventures_stage_rpcs_self_stamp.sql (function enforce_canonical_stage_write)",
    verified_by: "LEAD session 45924f8d (live pg_trigger/pg_proc introspection + a rolled-back UPDATE proving rejection, scripts/one-off/capa-001-h-check-stage-write-trigger-live.mjs and capa-001-h-check-trigger-rejects-unstamped.mjs)",
  },
];

const metadata = { ...row.metadata, mechanism_verifications };
const { error: updErr } = await s.from('strategic_directives_v2').update({ metadata }).eq('id', row.id);
if (updErr) throw updErr;
console.log('Updated mechanism_verifications:', mechanism_verifications.length, 'entries');
