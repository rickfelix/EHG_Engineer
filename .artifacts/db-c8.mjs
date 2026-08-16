import { q } from './db-exec.mjs';
const TARGETS = [
 // Bucket A
 'fn_enforce_stage_advancement_artifact_gate','fn_quick_fixes_validate_target_application',
 'fn_stage_artifact_precondition','fn_user_has_company_access','fn_verify_and_consume_stepup_token','fn_write_kill_audit_trail',
 // Bucket B live residual
 'approve_chairman_decision','check_feedback_duplicate','claim_sd','fn_is_service_role',
 'fn_list_chairman_webauthn_credentials','fn_user_has_venture_access','get_gate_decision_status',
 'is_chairman_role','reject_chairman_decision','upsert_operator_cash_burn',
 // new unbucketed
 'fn_anon_ingress_prior_hour_count','log_sd_mutation_audit'];
const list = TARGETS.map(t=>`'${t}'`).join(',');
console.log('=== C8: policies referencing target fns, split by anon-reachability ===');
const r = await q(`WITH pol AS (
  SELECT schemaname, tablename, policyname, cmd, roles::text[] AS roles,
         coalesce(qual,'')||' '||coalesce(with_check,'') AS body
  FROM pg_policies)
SELECT t.fn,
  count(*) FILTER (WHERE 'anon' = ANY(p.roles)) AS pol_roles_anon,
  count(*) FILTER (WHERE p.roles @> ARRAY['public'] OR p.roles IS NULL OR cardinality(p.roles)=0) AS pol_roles_public_default,
  count(*) AS pol_total,
  string_agg(DISTINCT p.schemaname||'.'||p.tablename||':'||p.policyname||'{'||array_to_string(p.roles,',')||'}', ' ; ') AS refs
FROM (SELECT unnest(ARRAY[${list}]) AS fn) t
JOIN pol p ON p.body ~ ('\m'||t.fn||'\M')
GROUP BY t.fn ORDER BY t.fn`);
console.table((r[0].result||[]).map(x=>({fn:x.fn, anon_roles:x.pol_roles_anon, public_default:x.pol_roles_public_default, total:x.pol_total})));
console.log('\n--- detail ---');
for (const x of (r[0].result||[])) console.log(`${x.fn}: anon=${x.pol_roles_anon} publicDefault=${x.pol_roles_public_default}\n   ${String(x.refs).slice(0,700)}\n`);
console.log('\n=== policies with roles = {public} count (C8 denominator) ===');
const r2 = await q(`SELECT count(*) FILTER (WHERE roles::text[] @> ARRAY['public']) AS public_role_policies,
       count(*) FILTER (WHERE roles::text[] @> ARRAY['anon']) AS anon_role_policies,
       count(*) AS total FROM pg_policies WHERE schemaname='public'`);
console.table(r2[0].result);
