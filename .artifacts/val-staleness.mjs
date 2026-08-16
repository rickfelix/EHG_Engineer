import fs from 'fs'; import path from 'path';
const B={A:['fn_enforce_stage_advancement_artifact_gate','fn_quick_fixes_validate_target_application','fn_stage_artifact_precondition','fn_user_has_company_access','fn_verify_and_consume_stepup_token','fn_write_kill_audit_trail'],
B:['advance_venture_stage','advance_venture_to_stage','approve_chairman_decision','bootstrap_venture_workflow','can_auto_advance','check_feedback_duplicate','claim_sd','create_eva_conversation','delete_venture','eva_circuit_allows_request','export_blueprint_review','fn_is_service_role','fn_list_chairman_webauthn_credentials','fn_user_has_venture_access','get_gate_decision_status','is_chairman_role','kill_venture','log_stage_advance_override','park_venture_decision','record_eva_failure','record_eva_success','reject_chairman_decision','rescan_stage_20','reset_eva_circuit','set_global_auto_proceed','set_stage_override','upsert_operator_cash_burn'],
C:['check_feedback_rate_limit','fn_advance_pipeline_stage','fn_is_chairman','fn_relay_insert_sms_candidate','is_leo_admin','lhe_pending_migration_applied','record_venture_error','set_session_working_context','venture_exists_and_active']};
const all=new Set([...B.A,...B.B,...B.C]);
console.log('Bucket totals: A=%d B=%d C=%d TOTAL=%d (SD claims 6/27/9=42)',B.A.length,B.B.length,B.C.length,all.size);

const dirs=['database/migrations','database/chairman-gated'];
const files=[];
for(const d of dirs){ if(!fs.existsSync(d))continue; for(const f of fs.readdirSync(d)) if(f.endsWith('.sql')) files.push(path.join(d,f)); }
const reFn=/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi;
// map fn -> {latestFile, secdef}
const seen=new Map();
for(const f of files){
  const txt=fs.readFileSync(f,'utf8');
  const base=path.basename(f); const m=base.match(/^(\d{8})/); const date=m?m[1]:'00000000';
  let mm; reFn.lastIndex=0;
  while((mm=reFn.exec(txt))!==null){
    const name=mm[1];
    // crude: is this create block SECURITY DEFINER? look ahead 3000 chars for SECURITY DEFINER before next CREATE FUNCTION
    const seg=txt.slice(mm.index, mm.index+3000);
    const nxt=seg.slice(10).search(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
    const body=nxt>0?seg.slice(0,nxt+10):seg;
    const secdef=/SECURITY\s+DEFINER/i.test(body);
    const cur=seen.get(name);
    if(!cur||date>cur.date) seen.set(name,{date,file:base,secdef});
    else if(secdef&&cur&&!cur.secdef) cur.secdef=true;
  }
}
console.log('\n=== A) Bucket functions whose LATEST create/replace is AFTER 20260603 (re-exposure corroboration) ===');
let after=0, notFound=[];
for(const n of [...all].sort()){
  const s=seen.get(n);
  if(!s){notFound.push(n);continue;}
  if(s.date>'20260603'){after++;console.log('  %s  %s  (%s)',s.date,n,s.file);}
}
console.log('  -> %d of 42 redefined after 20260603_03 applied', after);
console.log('  -> %d of 42 have NO create stmt in repo migrations: %s', notFound.length, notFound.join(', '));

console.log('\n=== B) SECDEF functions CREATEd in migrations dated AFTER 20260728 scan, NOT in the 42 buckets (candidate NEW exposure) ===');
const newOnes=[...seen.entries()].filter(([n,s])=>s.date>'20260728'&&s.secdef&&!all.has(n)).sort((a,b)=>a[1].date.localeCompare(b[1].date));
for(const [n,s] of newOnes) console.log('  %s  %s  (%s)',s.date,n,s.file);
console.log('  -> %d SECDEF function(s) created after the scan and absent from all three buckets', newOnes.length);
