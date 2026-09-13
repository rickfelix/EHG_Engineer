import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.from('product_requirements_v2').select('functional_requirements, acceptance_criteria, test_scenarios, risks, updated_at').eq('id','PRD-SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I').maybeSingle();
const fr5 = data.functional_requirements.find(f=>f.id==='FR-5');
const fr6 = data.functional_requirements.find(f=>f.id==='FR-6');
const ts7 = data.test_scenarios.find(t=>t.id==='TS-7');
// Assert the STALE text is gone and the CORRECTED text is present, per item.
const checks = [
  ['FR-5 AC-1 stale "zero entries with artifactType: null" removed', !/zero entries with artifactType: null/i.test(fr5.acceptance_criteria[0])],
  ['FR-5 AC-1 names the screenId binding',                            /screenId/i.test(fr5.acceptance_criteria[0])],
  ['FR-5 AC-3 no longer demands all 6 stops',                        !/for all 6 tour stops/i.test(fr5.acceptance_criteria[2])],
  ['FR-6 AC-1 states NOT YET DONE',                                   /NOT YET DONE/i.test(fr6.acceptance_criteria[0])],
  ['FR-6 desc carries POST-MERGE FOLLOW-UP for the workflow',         /POST-MERGE FOLLOW-UP/i.test(fr6.description) && /stack-scan\.yml/i.test(fr6.description)],
  ['top AC[3] stale "zero tour stops with artifactType null" gone',  !/^(?!.*CORRECTED).*zero tour stops with artifactType null/i.test(data.acceptance_criteria[3])],
  ['top AC[4] no longer claims "zero factory-side code changes"',    !/zero factory-side code changes/i.test(data.acceptance_criteria[4])],
  ['top AC[4] carries the FR-6 AC-1 not-complete caveat',             /not yet complete|post-merge follow-up/i.test(data.acceptance_criteria[4])],
  ['TS-7 then names venture_resources as PRIMARY',                    /venture_resources.*PRIMARY/is.test(ts7.then)],
  ['TS-7 no longer says "resolves the repo from metadata.synthetic"',!/resolves the repo from metadata\.synthetic_actor/i.test(ts7.then)],
  ['risks[3].mitigation names venture_resources as PRIMARY',          /venture_resources.*PRIMARY/is.test(data.risks[3].mitigation)],
  ['risks[3].mitigation no longer says "must read metadata.synth"',  !/must read metadata\.synthetic_actor/i.test(data.risks[3].mitigation)],
];
let fail = 0;
for (const [label, ok] of checks) { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); }
console.log(`\nupdated_at: ${data.updated_at}`);
console.log(`RESULT: ${checks.length - fail}/${checks.length} assertions passed`);
process.exit(fail ? 1 : 0);
