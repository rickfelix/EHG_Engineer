const d = require('./val-prd-full.json');
const dump = (label, v) => {
  console.log('\n===== ' + label + ' =====');
  if (v == null) { console.log('(null)'); return; }
  if (typeof v === 'string') { console.log(v); return; }
  console.log(JSON.stringify(v, null, 2));
};
dump('FUNCTIONAL_REQUIREMENTS', d.functional_requirements);
