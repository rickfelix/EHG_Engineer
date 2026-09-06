const d = JSON.parse(require('fs').readFileSync('.artifacts/classguard-all.json','utf8'));
const touched = ['scripts/assign-fleet-identities.cjs','scripts/worker-signal.cjs','scripts/stale-session-sweep.cjs','scripts/periodic-liveness-watcher.mjs','lib/npm-install-lock.cjs','scripts/fleet-dashboard.cjs'];
const norm = (p) => p.split('\\').join('/');
const rel = (d.violations||[]).filter(v => touched.some(t => norm(v.filePath).endsWith(t)));
console.log('total violations:', (d.violations||[]).length, 'blocking:', d.blocking);
console.log('touched-file violations:');
rel.forEach(v=>console.log(' ', v.filePath, v.line));
