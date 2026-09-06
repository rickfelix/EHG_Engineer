const before = JSON.parse(require('fs').readFileSync('.artifacts/classguard-before.json','utf8'));
const norm = (p) => p.split('\\').join('/');
console.log('BEFORE total:', before.violations.length);
before.violations.filter(v => norm(v.filePath).includes('periodic-liveness-watcher')).forEach(v => console.log(' before:', v.filePath, v.line));
