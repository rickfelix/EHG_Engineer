import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const supabase = createSupabaseServiceClient();
const sdId = '346eaa99-8d8a-4233-b593-50b21149c958';
const { data: sd } = await supabase.from('strategic_directives_v2').select('success_criteria').eq('id', sdId).maybeSingle();
const measures = [
  'NOT YET MEASURABLE LIVE (2026-09-11): the trigger half is staged chairman-gated at database/chairman-gated/20260906_retrospectives_published_guard.sql (CHAIRMAN_APPLY_VERIFICATION=CEREMONY_PENDING). Pre-apply proof: six UPDATE sites wired through lib/retro/write-with-token.js in PR #8653 (merge 50b076a414b); the helper retries without the token on PGRST204/42703 so every writer succeeds today; 91/91 scoped unit tests green (TESTING run 735b102c). Live verification is the post-ceremony readback.',
  'NOT YET MEASURABLE LIVE (2026-09-11): same ceremony dependency as #1. Proven only against an ephemeral PG16 stub schema in tests/ddl/retrospectives-published-guard-ddl.db.test.js (green in the 91/91 scoped run).',
  'MEASURED (2026-09-11): zero UPDATE sites dropped. The two INSERT-only sites carry FR-2 reasons in code — scripts/modules/handoff/executors/plan-to-lead/state-transitions.js:385 and scripts/modules/handoff/orchestrator-completion-guardian.js:664 — because enforce_retrospectives_published_guard() evaluates only its TG_OP=UPDATE branch.',
  'PENDING FR-4 (2026-09-11): chairman ceremony not yet performed. The LEAD-FINAL-APPROVAL gate recorded a pending chairman_decisions migration_apply row for the file; readback of retro_write_token, retro_canonical_writer_policy(), enforce_retrospectives_published_guard() and zzz_retrospectives_published_guard happens after the apply.',
  'NOT DONE (2026-09-11): SD-LEO-INFRA-RETRO-PUBLISHED-GUARD-001 still reads status=completed. Restamping another SD is routed to the coordinator via signal rather than hand-written by this worker.',
];
const success_criteria = (sd.success_criteria || []).map((c, i) => ({ ...c, measure: measures[i] || c.measure }));
const { error } = await supabase.from('strategic_directives_v2').update({ success_criteria }).eq('id', sdId);
console.log(error ? 'ERR ' + error.message : 'OK ' + success_criteria.length + ' criteria measured');
