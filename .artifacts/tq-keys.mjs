import fs from 'fs';
const d=JSON.parse(fs.readFileSync('C:/Users/rickf/AppData/Local/Temp/claude/C--Users-rickf-Projects--EHG-EHG-Engineer/689a1237-33b7-406f-9772-668958b289d6/scratchpad/prd-fresh.json','utf8'))[0];
for (const k of ['metadata','content']){
  const v = typeof d[k]==='string'? (()=>{try{return JSON.parse(d[k])}catch(e){return d[k]}})() : d[k];
  console.log('=====',k,'type=',typeof v, Array.isArray(v)?'(array)':'');
  if (typeof v==='object'&&v){ for(const [kk,vv] of Object.entries(v)) console.log('   ',kk,'=>',Array.isArray(vv)?`array(${vv.length})`:typeof vv, JSON.stringify(vv).length,'chars'); }
  else console.log(String(v).slice(0,500));
}
