import fs from 'fs';
const files = fs.readFileSync('.artifacts/tf.txt','utf8').trim().split('\n').filter(f=>/\.(ts|tsx|js|cjs|mjs)$/.test(f));
const inserters = [];
for (const f of files) {
  let src; try { src = fs.readFileSync(f,'utf8'); } catch { continue; }
  const jsIns = /from\(\s*['"`]ventures['"`]\s*\)[\s\S]{0,300}?\.insert\s*\(/.test(src)
             || /\.insert\s*\([\s\S]{0,300}?\)\s*[\s\S]{0,80}?from\(\s*['"`]ventures['"`]/.test(src);
  const sqlIns = /INSERT\s+INTO\s+(public\.)?ventures\b/i.test(src);
  if (!jsIns && !sqlIns) continue;
  const setsDemo = /is_demo\s*:/.test(src) || /INSERT\s+INTO\s+(public\.)?ventures\s*\([^)]*is_demo/is.test(src);
  const kind = f.includes('/e2e/')?'e2e': f.includes('/integration/')?'integration': f.includes('/ddl/')?'ddl': f.includes('/unit/')?'unit':'other';
  inserters.push({f,setsDemo,kind});
}
const yes = inserters.filter(i=>i.setsDemo), no = inserters.filter(i=>!i.setsDemo);
console.log(`INSERTERS: ${inserters.length} | sets is_demo: ${yes.length} | omits: ${no.length}`);
console.log('\nSETS is_demo:'); yes.forEach(i=>console.log(`  [${i.kind}] ${i.f}`));
const byKind={}; no.forEach(i=>byKind[i.kind]=(byKind[i.kind]||0)+1);
console.log('\nOMITTERS by kind:', JSON.stringify(byKind));
console.log('\nALL OMITTERS:'); no.forEach(i=>console.log(`  [${i.kind}] ${i.f}`));
