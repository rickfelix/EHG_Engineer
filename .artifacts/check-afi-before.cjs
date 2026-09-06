const before = JSON.parse(require('fs').readFileSync('.artifacts/classguard-before.json','utf8'));
const norm = (p) => p.split('\\').join('/');
before.violations.filter(v => norm(v.filePath).includes('assign-fleet-identities')).forEach(v => console.log('afi before:', v.filePath, v.line));
before.violations.filter(v => norm(v.filePath).includes('fleet-dashboard')).forEach(v => console.log('dash before:', v.filePath, v.line));
