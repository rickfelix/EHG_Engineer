const fs=require('fs');
const raw=fs.readFileSync('.artifacts/prd-d-risk.json','utf8');
const p=JSON.parse(raw.slice(raw.indexOf('{')));
for(const k of ['risks','constraints','assumptions','dependencies','non_functional_requirements','technical_requirements','acceptance_criteria','test_scenarios','performance_requirements','implementation_approach','system_architecture']){
  console.log('\n########## '+k+' ##########');
  const v=p[k];
  console.log(typeof v==='string'? v : JSON.stringify(v,null,1));
}
