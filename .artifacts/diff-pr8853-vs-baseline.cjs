const fs = require('fs');
const { execSync } = require('child_process');
const baseline = execSync('git show HEAD:database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql', { encoding: 'utf8', cwd: process.cwd() });
const pr8853 = fs.readFileSync('.artifacts/pr8853.sql', 'utf8');

function extractFunc(sql) {
  const startIdx = sql.indexOf('CREATE OR REPLACE FUNCTION');
  const endMarker = '$function$;';
  const endIdx = sql.indexOf(endMarker, startIdx) + endMarker.length;
  return sql.slice(startIdx, endIdx);
}

const baseFunc = extractFunc(baseline);
const pr8853Func = extractFunc(pr8853);

fs.writeFileSync('.artifacts/baseline-func.sql', baseFunc);
fs.writeFileSync('.artifacts/pr8853-func.sql', pr8853Func);
console.log('baseline len', baseFunc.length, 'pr8853 len', pr8853Func.length);
