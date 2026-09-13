import fs from 'fs';
const d=JSON.parse(fs.readFileSync('C:/Users/rickf/AppData/Local/Temp/claude/C--Users-rickf-Projects--EHG-EHG-Engineer/689a1237-33b7-406f-9772-668958b289d6/scratchpad/prd-fresh.json','utf8'))[0];
console.log(JSON.stringify(d.metadata.risk_analysis,null,1));
console.log('--- design_analysis ---');
console.log(JSON.stringify(d.metadata.design_analysis).slice(0,2500));
