import enc from '../lib/security/encryption.cjs';
console.log('default export type:', typeof enc, '| ctor name:', enc.constructor.name);
console.log('named CredentialEncryption on exports?', typeof enc.CredentialEncryption);
// Can we get the class via the instance prototype (no source change)?
const Klass = Object.getPrototypeOf(enc).constructor;
console.log('via prototype.constructor:', Klass.name);
const sub = new Klass();
let calls = 0;
sub.getMasterKey = async () => { calls++; return Buffer.alloc(32, 7); };
const blob = await sub.encrypt({ refresh_token: 'x' }, 'google-chairman-oauth');
console.log('encrypt ok, meta:', JSON.stringify(blob.metadata));
const back = await sub.decrypt(blob.encrypted, blob.metadata);
console.log('roundtrip:', JSON.stringify(back), '| getMasterKey overridden calls:', calls);
// wrong key must fail
const sub2 = new Klass(); sub2.getMasterKey = async () => Buffer.alloc(32, 9);
try { await sub2.decrypt(blob.encrypted, blob.metadata); console.log('WRONG-KEY DECRYPT SUCCEEDED (bad)'); }
catch (e) { console.log('wrong-key decrypt refused:', e.message.slice(0,60)); }
// did anything write .leo-keys into the worktree?
import fs from 'fs';
console.log('.leo-keys created in worktree?', fs.existsSync('.leo-keys'));
