import fs from 'fs';
const d=JSON.parse(fs.readFileSync('C:/Users/rickf/AppData/Local/Temp/claude/C--Users-rickf-Projects--EHG-EHG-Engineer/689a1237-33b7-406f-9772-668958b289d6/scratchpad/prd-fresh.json','utf8'))[0];
const c=d.content;
console.log('HEADINGS:');
for (const line of c.split('\n')) if (/^#{1,4} /.test(line)) console.log('  ',line);
