import fs from 'fs';
const d=JSON.parse(fs.readFileSync('C:/Users/rickf/AppData/Local/Temp/claude/C--Users-rickf-Projects--EHG-EHG-Engineer/689a1237-33b7-406f-9772-668958b289d6/scratchpad/prd-fresh.json','utf8'))[0];
const keys=process.argv.slice(2);
for (const k of keys){
  console.log('\n================ '+k+' ================');
  const v=d[k];
  if (typeof v==='string') console.log(v);
  else console.log(JSON.stringify(v,null,2));
}
