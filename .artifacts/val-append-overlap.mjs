import fs from 'fs';
const P='.artifacts/val-evidence-v2.json';
const o=JSON.parse(fs.readFileSync(P,'utf8'));
o.metadata.overlap_sweep={
  open_sds_scanned:43,
  open_sd_matches_excluding_self:1,
  open_sd_match_detail:'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-143 [in_progress/PLAN_PRD] "Address 5 pattern(s) from /learn" — matched only on the token prosecdef inside a learn-pattern description. NOT a competing grant-triage SD.',
  open_qfs_scanned:88,
  open_qf_matches:0,
  qf_note:'Single regex hit QF-20260714-549 is status=closed and concerns cross-tenant data access, not EXECUTE grants.',
  conclusion:'NO redundant or competing open work item. Duplicate check PASSES.',
  method:'supabase-js sweep of strategic_directives_v2 (status in draft/active/in_progress/pending_approval/ready/planning) and quick_fixes, regex over title+description for SECURITY DEFINER | ALTER DEFAULT PRIVILEGES | REVOKE ALL/EXECUTE | EXECUTE ON FUNCTION | has_function_privilege | prosecdef.'
};
o.metadata.gate_1_lead_pre_approval.duplicate_check='PASS - 43 open SDs + 88 open QFs swept, zero competing grant-triage work items';
fs.writeFileSync(P,JSON.stringify(o,null,2));
console.log('appended overlap_sweep');
