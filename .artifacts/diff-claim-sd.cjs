const fs = require('fs');
const live = fs.readFileSync('.artifacts/claim_sd.live.current.sql', 'utf8');
const mig = fs.readFileSync('database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql', 'utf8');
const startIdx = mig.indexOf('CREATE OR REPLACE FUNCTION');
const endMarker = '$function$;';
const endIdx = mig.indexOf(endMarker, startIdx) + endMarker.length;
const migFunc = mig.slice(startIdx, endIdx);
const norm = s => s.replace(/\s+/g, ' ').trim().replace(/;\s*$/, '');
const normLive = norm(live);
const normMig = norm(migFunc);
console.log('live len', normLive.length, 'mig len', normMig.length);
console.log('EQUAL:', normLive === normMig);
if (normLive !== normMig) {
  let i = 0;
  while (i < Math.min(normLive.length, normMig.length) && normLive[i] === normMig[i]) i++;
  console.log('first diff at', i);
  console.log('LIVE around:', JSON.stringify(normLive.slice(Math.max(0, i - 100), i + 100)));
  console.log('MIG  around:', JSON.stringify(normMig.slice(Math.max(0, i - 100), i + 100)));
}
