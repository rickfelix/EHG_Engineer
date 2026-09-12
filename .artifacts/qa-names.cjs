const fs = require('fs');
const path = require('path');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = [];
for (const s of r.testResults) {
  const rel = path.relative(process.cwd(), s.name).split(path.sep).join('/');
  out.push('### ' + rel);
  for (const a of s.assertionResults) {
    out.push('  [' + a.status + '] ' + a.fullName);
  }
}
const text = out.join('\n');
fs.writeFileSync(process.argv[3], text);
console.log('wrote', process.argv[3], 'lines=', out.length);
