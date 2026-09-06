const before = JSON.parse(require('fs').readFileSync('.artifacts/classguard-before.json','utf8'));
const after = JSON.parse(require('fs').readFileSync('.artifacts/classguard-all.json','utf8'));
const norm = (p) => p.split('\\').join('/');
const key = (v) => norm(v.filePath) + ':' + v.line;
const beforeKeys = new Set(before.violations.map(key));
const afterKeys = new Set(after.violations.map(key));
console.log('NEW in after (not in before):');
for (const v of after.violations) {
  if (!beforeKeys.has(key(v))) console.log(' +', key(v));
}
console.log('REMOVED (in before, not in after):');
for (const v of before.violations) {
  if (!afterKeys.has(key(v))) console.log(' -', key(v));
}
