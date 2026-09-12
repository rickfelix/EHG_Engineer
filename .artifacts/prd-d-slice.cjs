const fs=require('fs');
const raw=fs.readFileSync('.artifacts/prd-d-risk.json','utf8');
const i=raw.indexOf('{');
const p=JSON.parse(raw.slice(i));
const fr=p.functional_requirements||[];
console.log('FR count:', fr.length);
for(const f of fr.slice(4)){
  console.log('\n=== '+f.id+' ['+f.priority+'] '+(f.requirement||'')+'\n'+f.description);
  console.log('AC: '+JSON.stringify(f.acceptance_criteria,null,1));
}
