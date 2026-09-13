import fs from 'fs';
const d = JSON.parse(fs.readFileSync('.artifacts/valv-prd.json','utf8'))[0];
const show = (k) => {
  const v = d[k];
  console.log('\n=============== ' + k + ' ===============');
  if (v == null) { console.log('(null)'); return; }
  console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
};
for (const k of (process.argv.slice(2))) show(k);
