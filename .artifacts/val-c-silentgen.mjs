import enc from '../lib/security/encryption.cjs';
import fs from 'fs'; import path from 'path'; import os from 'os';
const Klass = Object.getPrototypeOf(enc).constructor;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'leokeytest-'));
const inst = new Klass();
inst.keyPath = path.join(tmp, '.leo-keys');
console.log('key file before:', fs.existsSync(inst.keyPath));
const blob = await inst.encrypt({ a: 1 }, 'probe');
console.log('key file AFTER encrypt (silent generation?):', fs.existsSync(inst.keyPath));
const k1 = JSON.parse(fs.readFileSync(inst.keyPath,'utf8')).key.slice(0,12);
fs.rmSync(inst.keyPath);
const inst2 = new Klass(); inst2.keyPath = path.join(tmp,'.leo-keys');
try { await inst2.decrypt(blob.encrypted, blob.metadata); console.log('decrypt after key loss: SUCCEEDED (impossible)'); }
catch(e){ console.log('decrypt after key loss:', e.message.slice(0,50)); }
const k2 = JSON.parse(fs.readFileSync(inst2.keyPath,'utf8')).key.slice(0,12);
console.log('key1', k1, 'key2', k2, '| regenerated silently and differs:', k1!==k2);
fs.rmSync(tmp,{recursive:true,force:true});
